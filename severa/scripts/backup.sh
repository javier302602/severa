#!/usr/bin/env bash
# RF-96: respaldo de la base de datos vía pg_dump.
#
# Este script NO se ejecuta solo — no hay cron ni scheduler wireado todavía
# (ver README.md, sección "Respaldo automático (RF-96)", para cómo programarlo
# a diario en Linux/cron o en Windows Task Scheduler).
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL no está definido (copia .env.example a .env, o expórtalo antes de correr este script)" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENCION_DIAS="${BACKUP_RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ARCHIVO="$BACKUP_DIR/severa_${TIMESTAMP}.dump"

mkdir -p "$BACKUP_DIR"

# --format=custom permite restaurar con pg_restore (incluye tablas, datos y
# soporta restauración selectiva), a diferencia de un dump de texto plano.
pg_dump "$DATABASE_URL" --format=custom --file="$ARCHIVO"

echo "Backup creado en $ARCHIVO"

# Limpieza de respaldos antiguos para no acumular indefinidamente.
find "$BACKUP_DIR" -name 'severa_*.dump' -mtime +"$RETENCION_DIAS" -delete

echo "Restaurar con: pg_restore --clean --if-exists -d \$DATABASE_URL $ARCHIVO"
