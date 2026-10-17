#!/usr/bin/env bash
# scripts/backup.sh — copia de segurança do MongoDB do HouseWorks.
#
#   ./scripts/backup.sh
#
# O QUE ELE FAZ, nesta ordem:
#   1. dump comprimido, escrito num arquivo temporário;
#   2. confere que o arquivo é um gzip íntegro e que não está vazio;
#   3. só então renomeia para o nome final  ->  um backup pela metade nunca "existe";
#   4. apaga as cópias mais velhas que KEEP_DAYS;
#   5. manda a cópia para fora, se RCLONE_REMOTE estiver configurado;
#   6. avisa o monitor externo. Se qualquer passo acima falhar, avisa que FALHOU.
#
# O passo 6 é o que separa "tenho backup" de "acho que tenho backup": sem ele, um dump
# que passa a falhar todo dia é indistinguível de um que funciona, até o dia em que
# alguém precisa dele.
#
# VARIÁVEIS (todas com padrão sensato):
#   BACKUP_DIR        onde guardar                /var/backups/houseworks
#   KEEP_DAYS         quantos dias manter local   14
#   KEEP_REMOTE_DAYS  quantos dias manter no remoto 60
#   MONGO_CONTAINER   container do MongoDB        houseworks-mongodb-1
#   HOUSEWORKS_ENV    de onde ler as credenciais  /etc/komodo/stacks/houseworks/.env
#   RCLONE_REMOTE     destino remoto (vazio = sem cópia externa)
#   HEALTHCHECK_URL   URL do monitor (vazio = sem aviso)

set -euo pipefail

# Configuração opcional da máquina (destino remoto, monitor, retenção). Fica num
# arquivo separado para o cron não precisar carregar variáveis na linha de comando.
# É lido ANTES dos padrões de propósito: variável passada na chamada vence o arquivo,
# que vence o padrão.
CONFIG_FILE="${HOUSEWORKS_BACKUP_CONFIG:-/etc/default/houseworks-backup}"
if [ -f "$CONFIG_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$CONFIG_FILE"; set +a
fi

BACKUP_DIR="${BACKUP_DIR:-/var/backups/houseworks}"
KEEP_DAYS="${KEEP_DAYS:-14}"
# A cópia externa guarda por mais tempo que a local: o disco da VPS é caro e pequeno,
# o bucket é barato. O local serve para restaurar rápido; o remoto, para o dia em que a
# máquina não existir mais.
KEEP_REMOTE_DAYS="${KEEP_REMOTE_DAYS:-60}"
MONGO_CONTAINER="${MONGO_CONTAINER:-houseworks-mongodb-1}"
HOUSEWORKS_ENV="${HOUSEWORKS_ENV:-/etc/komodo/stacks/houseworks/.env}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"

# Uma cópia menor que isto é assinatura de dump truncado, não de banco pequeno.
TAMANHO_MINIMO=1024

# Preenchido mais adiante; o trap usa para não deixar lixo para trás.
parcial=""

registrar() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

# O monitor só é avisado se estiver configurado; a ausência dele não é erro.
avisar_monitor() {
  [ -n "$HEALTHCHECK_URL" ] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "$HEALTHCHECK_URL$1" || true
}

falhou() {
  local codigo=$?
  # Sem isto, um dump que falha todo dia deixa um .parcial por dia até encher o disco.
  [ -n "$parcial" ] && rm -f "$parcial"
  registrar "ERRO: backup falhou (linha $1, código $codigo)."
  avisar_monitor '/fail'
  exit "$codigo"
}
trap 'falhou $LINENO' ERR

# ---------------------------------------------------------------- credenciais

# As credenciais de produção não vivem em arquivo versionado: o Komodo escreve os
# valores das Variables neste .env a cada deploy. No ambiente local, o .env da raiz
# serve — por isso o caminho é configurável.
if [ -f "$HOUSEWORKS_ENV" ]; then
  # shellcheck disable=SC1090
  set -a; . "$HOUSEWORKS_ENV"; set +a
elif [ -f "$(dirname "$0")/../.env" ]; then
  # shellcheck disable=SC1091
  set -a; . "$(dirname "$0")/../.env"; set +a
else
  registrar "ERRO: não achei as credenciais. Ajuste HOUSEWORKS_ENV."
  avisar_monitor '/fail'
  exit 1
fi

: "${MONGO_USER:?MONGO_USER não definido}"
: "${MONGO_PASSWORD:?MONGO_PASSWORD não definido}"
: "${MONGO_DB_NAME:?MONGO_DB_NAME não definido}"

# ---------------------------------------------------------------- dump

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

carimbo="$(date '+%Y-%m-%d_%H%M%S')"
final="$BACKUP_DIR/houseworks-$carimbo.archive.gz"
parcial="$final.parcial"

registrar "Iniciando dump de '$MONGO_DB_NAME'."

# O dump sai pelo stdout do mongodump dentro do container e é gravado no host: não é
# preciso volume compartilhado nem que o banco tenha porta publicada.
#
# As credenciais vão por variável de ambiente, não por argumento: argumento aparece
# no 'docker inspect' e no histórico do shell. Ainda ficam visíveis para quem é root
# na máquina — que já lê o .env de qualquer forma.
docker exec \
  -e "HW_USER=$MONGO_USER" \
  -e "HW_PASS=$MONGO_PASSWORD" \
  -e "HW_DB=$MONGO_DB_NAME" \
  "$MONGO_CONTAINER" \
  sh -c 'exec mongodump --host localhost --username "$HW_USER" --password "$HW_PASS" --authenticationDatabase admin --db "$HW_DB" --archive --gzip' \
  > "$parcial"

# ---------------------------------------------------------------- integridade

tamanho=$(stat -c %s "$parcial" 2>/dev/null || stat -f %z "$parcial")
if [ "$tamanho" -lt "$TAMANHO_MINIMO" ]; then
  registrar "ERRO: dump com $tamanho bytes — suspeito de truncado."
  rm -f "$parcial"
  false
fi

# gzip -t percorre o arquivo inteiro conferindo o CRC. É o teste mais barato que
# realmente prova que o arquivo abre.
if ! gzip -t "$parcial" 2>/dev/null; then
  registrar "ERRO: o dump não é um gzip íntegro."
  rm -f "$parcial"
  false
fi

mv "$parcial" "$final"
registrar "Dump gravado: $final ($((tamanho / 1024)) KB)."

# ---------------------------------------------------------------- retenção

apagadas=$(find "$BACKUP_DIR" -maxdepth 1 -name 'houseworks-*.archive.gz' -type f \
  -mtime "+$KEEP_DAYS" -print -delete | wc -l)
[ "$apagadas" -gt 0 ] && registrar "Retenção: $apagadas cópia(s) com mais de $KEEP_DAYS dias apagada(s)."

# ---------------------------------------------------------------- fora da VPS

if [ -n "$RCLONE_REMOTE" ]; then
  if ! command -v rclone >/dev/null; then
    registrar "ERRO: RCLONE_REMOTE configurado, mas o rclone não está instalado."
    false
  fi

  registrar "Enviando para $RCLONE_REMOTE."
  # 'copy' (não 'sync') de propósito: sync APAGARIA no destino o que não existe aqui.
  # Numa cópia de segurança, remover do destino é a última coisa que se quer.
  rclone copy "$final" "$RCLONE_REMOTE" --no-traverse

  # A retenção remota é EXPLÍCITA e separada: só apaga arquivo com mais de
  # KEEP_REMOTE_DAYS dias, e só o padrão de nome deste projeto. Sem isto o bucket
  # cresceria para sempre — o 'copy' nunca remove nada, que é justamente o desejado.
  removidos=$(rclone delete "$RCLONE_REMOTE" --min-age "${KEEP_REMOTE_DAYS}d" \
    --include 'houseworks-*.archive.gz' --verbose 2>&1 | grep -c 'Deleted' || true)
  [ "${removidos:-0}" -gt 0 ] && registrar "Retenção remota: $removidos cópia(s) com mais de $KEEP_REMOTE_DAYS dias apagada(s) do destino."

  registrar "Cópia externa concluída."
else
  registrar "RCLONE_REMOTE vazio: a cópia ficou só nesta máquina."
fi

# ---------------------------------------------------------------- aviso

avisar_monitor ''
registrar "OK."
