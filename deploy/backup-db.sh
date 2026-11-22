#!/bin/sh
# Daily PostgreSQL backup for the VPS stack.
#
#   ./deploy/backup-db.sh [backup-dir]      # default: ./backups
#
# Keeps 14 days of dumps. Put it in cron, e.g.:
#   15 3 * * * /srv/yalla-lohan/deploy/backup-db.sh /srv/backups >> /var/log/yalla-backup.log 2>&1
set -eu

cd "$(dirname "$0")/.."
OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"

STAMP=$(date -u +%Y%m%d-%H%M%S)
TARGET="$OUT_DIR/db-$STAMP.sql.gz"

docker compose --env-file deploy/.env -f docker-compose.prod.yml exec -T db \
  sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "$TARGET"

find "$OUT_DIR" -name 'db-*.sql.gz' -mtime +14 -delete
echo "backup written: $TARGET"
