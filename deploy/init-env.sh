#!/usr/bin/env sh
# Prepara el .env del servidor:  sh deploy/init-env.sh
# Crea el .env si no existe, genera las claves y arma las URLs de la base de datos.
# Se puede repetir sin riesgo: nunca cambia una contraseña ya generada ni los valores que completaste tú.
# deploy.sh lo ejecuta solo, así que normalmente no hace falta llamarlo a mano.
set -e
cd "$(dirname "$0")/.."

ENV_FILE=.env

if [ ! -f "$ENV_FILE" ]; then
  cp deploy/.env.production.example "$ENV_FILE"
  echo "→ Creado $ENV_FILE a partir de la plantilla."
fi
chmod 600 "$ENV_FILE"
# Si el archivo no termina en salto de línea, lo que se agregue quedaría pegado a la última variable.
[ -z "$(tail -c 1 "$ENV_FILE")" ] || echo >> "$ENV_FILE"

# Valor actual de una variable, sin comillas; vacío si no existe.
get() {
  grep -E "^$1=" "$ENV_FILE" | head -n 1 | cut -d= -f2- | tr -d '"'
}

# Fija una variable: reemplaza su línea o la agrega al final. Solo se usa con valores generados (sin '|' ni '&').
set_var() {
  if grep -qE "^$1=" "$ENV_FILE"; then
    sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE"
  fi
}

[ -n "$(get POSTGRES_USER)" ] || set_var POSTGRES_USER inti
[ -n "$(get POSTGRES_DB)" ] || set_var POSTGRES_DB inti

# La contraseña de la base se genera una sola vez: PostgreSQL la fija al crear el volumen y cambiarla después impide entrar.
if [ -z "$(get POSTGRES_PASSWORD)" ]; then
  set_var POSTGRES_PASSWORD "$(openssl rand -hex 24)"
  echo "→ Generada la contraseña de la base de datos."
fi

# El host "db" es el contenedor de PostgreSQL dentro de la red de Docker. Para migrar y para operar se usa la misma conexión.
database_url="postgresql://$(get POSTGRES_USER):$(get POSTGRES_PASSWORD)@db:5432/$(get POSTGRES_DB)"
set_var DATABASE_URL "$database_url"
set_var DIRECT_URL "$database_url"

if [ "$(get AUTH_SECRET | wc -c)" -lt 33 ]; then
  set_var AUTH_SECRET "$(openssl rand -hex 48)"
  echo "→ Generado AUTH_SECRET."
fi

pending=""
for name in ADMIN_EMAIL ADMIN_PASSWORD CLOUDINARY_CLOUD_NAME CLOUDINARY_API_KEY CLOUDINARY_API_SECRET; do
  [ -n "$(get "$name")" ] || pending="$pending $name"
done
if [ -n "$pending" ]; then
  echo "✖ Falta completar en $(pwd)/.env:$pending" >&2
  echo "  Edítalo con: nano .env   y vuelve a ejecutar: sh deploy/deploy.sh" >&2
  exit 2
fi
if [ "$(get ADMIN_PASSWORD | wc -c)" -lt 13 ]; then
  echo "✖ ADMIN_PASSWORD debe tener al menos 12 caracteres." >&2
  exit 2
fi

echo "✔ .env listo."
