#!/usr/bin/env sh
# Respaldo de la base de datos:  sh deploy/backup-db.sh
# Guarda un volcado COMPLETO de la base, comprimido, en ~/inti/backups (o en BACKUP_DIR).
# Conserva los últimos 30 días (BACKUP_KEEP_DAYS): cada noche se borra el más antiguo, así que el 1 de diciembre
# desaparece el del 1 de noviembre, y así sucesivamente. Nunca borra los 7 más recientes, pase lo que pase.
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

# Rotación: borra los respaldos con más de BACKUP_KEEP_DAYS días (por la fecha del nombre del archivo).
# Con 30, el respaldo de hoy es el día 1 y se conservan 30 en total; el de hace 30 días se elimina.
# Se salta siempre los 7 más recientes: si los respaldos fallaran durante semanas, no se vacía la carpeta.
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
CUTOFF="$(date -d "-$KEEP_DAYS days" +%Y%m%d)"
ls -1 "$DIR"/inti-*.sql.gz | sort -r | tail -n +8 | while read -r old; do
  day="${old##*/inti-}"; day="${day%%-*}"
  if [ "$day" -le "$CUTOFF" ]; then rm -f "$old"; echo "  (rotación) eliminado: ${old##*/}"; fi
done
echo "✔ Respaldo guardado: $FILE ($(du -h "$FILE" | cut -f1))"
