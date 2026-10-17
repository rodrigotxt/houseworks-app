#!/usr/bin/env bash
# scripts/install-backup.sh — instala o backup e o ensaio de restauração nesta máquina.
#
#   sudo ./scripts/install-backup.sh
#
# POR QUE COPIAR EM VEZ DE APONTAR PARA O CLONE: em produção o repositório é clonado
# pelo Komodo dentro de /etc/komodo/stacks/<stack>, num caminho que pertence a ele e
# acompanha a branch configurada. Um cron apontando para lá quebra silenciosamente no
# dia em que o caminho mudar — e cron que quebra não avisa ninguém.
#
# O que fica instalado:
#   /opt/houseworks-backup/backup.sh     o dump
#   /opt/houseworks-backup/restore.sh    o ensaio de restauração
#   /etc/default/houseworks-backup       configuração (destino remoto, monitor)
#   /etc/cron.d/houseworks-backup        o agendamento
#
# Rodar de novo atualiza os scripts e preserva a configuração existente.

set -euo pipefail

DESTINO="${DESTINO:-/opt/houseworks-backup}"
CONFIG="/etc/default/houseworks-backup"
CRON="/etc/cron.d/houseworks-backup"
HORARIO="${HORARIO:-30 3 * * *}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Precisa de root: sudo $0" >&2
  exit 1
fi

origem="$(cd "$(dirname "$0")" && pwd)"

install -d -m 755 "$DESTINO"
install -m 755 "$origem/backup.sh" "$DESTINO/backup.sh"
install -m 755 "$origem/restore.sh" "$DESTINO/restore.sh"
echo "Scripts instalados em $DESTINO."

# A configuração NÃO é sobrescrita: quem já apontou o rclone e o monitor não perde
# isso numa atualização.
if [ ! -f "$CONFIG" ]; then
  cat > "$CONFIG" <<'CONFIG_EOF'
# /etc/default/houseworks-backup
# Lido pelo /opt/houseworks-backup/backup.sh. Variável passada na chamada vence este arquivo.

# Onde as cópias ficam nesta máquina.
BACKUP_DIR=/var/backups/houseworks

# Quantos dias manter. 14 cobre "estragou ontem" e "estragou semana passada".
KEEP_DAYS=14

# Quantos dias manter no destino remoto. Mais folgado que o local: o disco da VPS é
# caro e pequeno, o bucket é barato.
KEEP_REMOTE_DAYS=60

# Container do MongoDB (o nome que o Komodo cria para a stack).
MONGO_CONTAINER=houseworks-mongodb-1

# De onde saem as credenciais. O Komodo reescreve este arquivo a cada deploy.
HOUSEWORKS_ENV=/etc/komodo/stacks/houseworks/.env

# Cópia fora da máquina. Vazio = só local (protege contra apagar o volume, não contra
# perder o servidor). Para ligar: instale o rclone, configure o remote e aponte aqui,
# por exemplo RCLONE_REMOTE=r2:houseworks-backups
RCLONE_REMOTE=

# Monitor externo. O script avisa esta URL quando dá certo; se parar de avisar, o
# serviço te alerta. Vazio = sem aviso.
# No healthchecks.io, use a URL de ping do check, sem barra final.
HEALTHCHECK_URL=
CONFIG_EOF
  chmod 644 "$CONFIG"
  echo "Configuração criada em $CONFIG (edite para ligar a cópia externa e o monitor)."
else
  echo "Configuração preservada em $CONFIG."
fi

cat > "$CRON" <<CRON_EOF
# /etc/cron.d/houseworks-backup — gerado por scripts/install-backup.sh
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Backup diário do MongoDB do HouseWorks.
$HORARIO root $DESTINO/backup.sh >> /var/log/houseworks-backup.log 2>&1

# Ensaio de restauração semanal, no domingo: restaura a última cópia num banco
# descartável e confere. Sem isto, "o backup está rodando" é uma suposição.
0 5 * * 0 root $DESTINO/restore.sh >> /var/log/houseworks-restore.log 2>&1
CRON_EOF
chmod 644 "$CRON"
echo "Agendamento instalado em $CRON."
echo ""
echo "Conferir:  systemctl status cron --no-pager | head -3"
echo "Rodar agora: sudo $DESTINO/backup.sh && sudo $DESTINO/restore.sh"
