#!/usr/bin/env bash
# scripts/restore.sh — ENSAIO de restauração, num banco descartável.
#
#   ./scripts/restore.sh                          # usa a cópia mais recente
#   ./scripts/restore.sh caminho/para/copia.gz    # usa uma cópia específica
#
# POR QUE ISTO EXISTE: backup que nunca foi restaurado não é backup, é esperança. Um
# dump pode estar íntegro como arquivo e ainda assim ser inútil — arquivo truncado no
# meio de uma coleção, formato de versão incompatível, índice que não recria.
#
# O ensaio restaura num container NOVO, com volume próprio, que é destruído no fim.
# A produção não é tocada em momento nenhum: nem para ler.
#
# Sai com 0 só se a restauração funcionar E as verificações passarem.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/houseworks}"
MONGO_CONTAINER="${MONGO_CONTAINER:-houseworks-mongodb-1}"
HOUSEWORKS_ENV="${HOUSEWORKS_ENV:-/etc/komodo/stacks/houseworks/.env}"
TEST_CONTAINER="hw-restore-test-$$"
IMAGEM="mongo:8.2"

registrar() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
erro() { registrar "FALHOU: $*"; exit 1; }

limpar() { docker rm -f "$TEST_CONTAINER" >/dev/null 2>&1 || true; }
trap limpar EXIT

# ---------------------------------------------------------------- arquivo

arquivo="${1:-}"

if [ -z "$arquivo" ]; then
  arquivo="$(find "$BACKUP_DIR" -maxdepth 1 -name 'houseworks-*.archive.gz' -type f | sort | tail -1)"
  [ -n "$arquivo" ] || erro "nenhuma cópia em $BACKUP_DIR."
fi

[ -f "$arquivo" ] || erro "arquivo não encontrado: $arquivo"
gzip -t "$arquivo" 2>/dev/null || erro "o arquivo não é um gzip íntegro: $arquivo"

tamanho=$(stat -c %s "$arquivo" 2>/dev/null || stat -f %z "$arquivo")
registrar "Ensaio com $arquivo ($((tamanho / 1024)) KB)."

# O nome do banco dentro do dump precisamos saber para conferir depois. Vem do mesmo
# .env que o backup usou; se não der para ler, seguimos e conferimos só as coleções.
DB_NAME="${MONGO_DB_NAME:-}"
if [ -z "$DB_NAME" ] && [ -f "$HOUSEWORKS_ENV" ]; then
  DB_NAME="$(grep -E '^MONGO_DB_NAME=' "$HOUSEWORKS_ENV" | cut -d= -f2- || true)"
fi
[ -n "$DB_NAME" ] || erro "não descobri MONGO_DB_NAME para conferir a restauração."

# ---------------------------------------------------------------- container novo

registrar "Subindo um MongoDB descartável ($TEST_CONTAINER)."
docker run -d --rm --name "$TEST_CONTAINER" -v "$(cd "$(dirname "$arquivo")" && pwd):/backup:ro" "$IMAGEM" >/dev/null

pronto=0
for _ in $(seq 1 60); do
  if docker exec "$TEST_CONTAINER" mongosh --quiet --eval "db.adminCommand('ping').ok" >/dev/null 2>&1; then
    pronto=1
    break
  fi
  sleep 1
done
[ "$pronto" = 1 ] || erro "o MongoDB descartável não subiu."

# ---------------------------------------------------------------- restore

registrar "Restaurando."
docker exec "$TEST_CONTAINER" mongorestore --archive="/backup/$(basename "$arquivo")" --gzip --quiet \
  || erro "o mongorestore não conseguiu restaurar."

# ---------------------------------------------------------------- verificações

# 1. As coleções centrais têm que existir. Se alguma faltar, o dump não serve.
centrais="users households memberships tasks taskoccurrences"
faltando=""
for colecao in $centrais; do
  existe=$(docker exec "$TEST_CONTAINER" mongosh "$DB_NAME" --quiet --eval "db.getCollectionNames().includes('$colecao')")
  [ "$existe" = "true" ] || faltando="$faltando $colecao"
done
[ -z "$faltando" ] || erro "coleções ausentes no dump:$faltando"

# 2. Contagens por coleção — o que uma pessoa confere a olho para dizer "é isto mesmo".
registrar "Documentos restaurados:"
docker exec "$TEST_CONTAINER" mongosh "$DB_NAME" --quiet --eval '
  db.getCollectionNames().sort().forEach(function (n) {
    print("    " + n.padEnd(20) + db.getCollection(n).countDocuments());
  });
' || erro "não consegui contar os documentos."

# 3. As coleções centrais não podem estar vazias — um banco "restaurado" sem usuários
#    passaria nas verificações anteriores e não serviria para nada.
for colecao in users households memberships; do
  total=$(docker exec "$TEST_CONTAINER" mongosh "$DB_NAME" --quiet --eval "db.getCollection('$colecao').countDocuments()")
  [ "$total" -gt 0 ] || erro "'$colecao' restaurou vazia."
done

# 4. Os índices precisam voltar: sem o índice único de membership, a casa volta a
#    aceitar o mesmo usuário duas vezes, e o estrago só aparece meses depois.
indice=$(docker exec "$TEST_CONTAINER" mongosh "$DB_NAME" --quiet --eval '
  db.getCollection("memberships").getIndexes()
    .some(function (i) { return i.unique === true; })
')
[ "$indice" = "true" ] || erro "o índice único de memberships não foi restaurado."

# 5. Uma consulta de verdade, do jeito que o app faz.
amostra=$(docker exec "$TEST_CONTAINER" mongosh "$DB_NAME" --quiet --eval '
  const h = db.households.findOne();
  h ? h.name : "(vazio)"
')

registrar "Consulta de amostra: casa => $amostra"
registrar "ENSAIO PASSOU. A cópia é restaurável."
