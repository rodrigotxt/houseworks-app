#!/usr/bin/env bash
# scripts/restore.sh — ENSAIO de restauração, num banco descartável.
#
#   ./scripts/restore.sh                          # a cópia local mais recente
#   ./scripts/restore.sh caminho/para/copia.gz    # uma cópia específica
#   ./scripts/restore.sh --remoto                 # baixa a mais recente do R2 e ensaia

# O modo --remoto é o que o cron semanal usa, e é o mais forte dos três: prova que o
# dado existe FORA da máquina e que volta. Ensaio com a cópia local só prova que o
# dump foi bem escrito; não diz nada sobre a transferência.
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

# Mesma configuração do backup (destino remoto, caminhos).
CONFIG_FILE="${HOUSEWORKS_BACKUP_CONFIG:-/etc/default/houseworks-backup}"
if [ -f "$CONFIG_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$CONFIG_FILE"; set +a
fi

BACKUP_DIR="${BACKUP_DIR:-/var/backups/houseworks}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
TEMPORARIO=""
MONGO_CONTAINER="${MONGO_CONTAINER:-houseworks-mongodb-1}"
HOUSEWORKS_ENV="${HOUSEWORKS_ENV:-/etc/komodo/stacks/houseworks/.env}"
TEST_CONTAINER="hw-restore-test-$$"
IMAGEM="mongo:8.2"

registrar() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
erro() { registrar "FALHOU: $*"; exit 1; }

limpar() {
  docker rm -f "$TEST_CONTAINER" >/dev/null 2>&1 || true
  [ -n "$TEMPORARIO" ] && rm -rf "$TEMPORARIO"
  return 0
}
trap limpar EXIT

# ---------------------------------------------------------------- arquivo

usar_remoto=0
arquivo=""

for arg in "$@"; do
  case "$arg" in
    --remoto) usar_remoto=1 ;;
    -*) erro "opção desconhecida: $arg" ;;
    *) arquivo="$arg" ;;
  esac
done

if [ "$usar_remoto" = 1 ]; then
  [ -n "$RCLONE_REMOTE" ] || erro "--remoto pedido, mas RCLONE_REMOTE está vazio."
  command -v rclone >/dev/null || erro "o rclone não está instalado."

  TEMPORARIO="$(mktemp -d)"
  registrar "Buscando a cópia mais recente em $RCLONE_REMOTE."

  # O nome carrega a data (AAAA-MM-DD_HHMMSS), então ordem alfabética é ordem
  # cronológica — não é preciso confiar no mtime, que o copy não preserva.
  ultima="$(rclone lsf "$RCLONE_REMOTE" --files-only \
    | grep -E '^houseworks-.*\.archive\.gz$' | sort | tail -1)"
  [ -n "$ultima" ] || erro "não há cópia em $RCLONE_REMOTE."

  rclone copyto "$RCLONE_REMOTE/$ultima" "$TEMPORARIO/$ultima" --no-traverse \
    || erro "não consegui baixar $ultima."

  arquivo="$TEMPORARIO/$ultima"
  registrar "Baixada do destino: $ultima"
fi

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
