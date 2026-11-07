#!/usr/bin/env sh
# Respaldo de la base de datos:  sh deploy/backup-db.sh
# Guarda un volcado comprimido en ~/inti/backups (o en BACKUP_DIR) y conserva los 14 más recientes.
# Para automatizarlo cada noche a las 3:00:   crontab -e   y agrega
#   0 3 * * * sh /home/USUARIO/inti/Inti_backend_web/deploy/backup-db.sh >> /home/USUARIO/inti/backups/backup.log 2>&1
set -e
cd "$(dirname "$0")"

DIR="${BACKUP_DIR:-$HOME/inti/backups}"
mkdir -p "$DIR"
FILE="$DIR/inti-$(date +%Y%m%d-%H%M%S).sql.gz"

# pg_dump se ejecuta dentro del contenedor; POSTGRES_USER y POSTGRES_DB ya están en su entorno.
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$FILE"

# Un archivo casi vacío indica que el volcado falló.
if [ "$(wc -c < "$FILE")" -lt 200 ]; then
  rm -f "$FILE"
  echo "✖ El respaldo salió vacío; revisa que el contenedor inti_db esté en marcha." >&2
  exit 1
fi

ls -1t "$DIR"/inti-*.sql.gz | tail -n +15 | xargs -r rm -f
echo "✔ Respaldo guardado: $FILE ($(du -h "$FILE" | cut -f1))"
