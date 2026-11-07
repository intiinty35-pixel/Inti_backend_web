#!/usr/bin/env sh
# Despliegue y actualización del backend y su base de datos:  sh deploy/deploy.sh
# Sirve igual para el primer despliegue y para cada actualización.
set -e
cd "$(dirname "$0")"

CONTAINER=inti_backend

echo "→ Actualizando el código..."
git pull --ff-only

# Crea o completa el .env (claves y URLs de la base de datos). Se detiene si falta algo que debes escribir tú.
sh ./init-env.sh

echo "→ Construyendo e iniciando los contenedores (base de datos y API)..."
docker compose up -d --build

# Al arrancar, la API aplica las migraciones pendientes y valida la configuración; si algo falta, el contenedor se detiene.
echo "→ Esperando a que la API esté lista..."
tries=0
until [ "$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null)" = "healthy" ]; do
  tries=$((tries + 1))
  state=$(docker inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo "desconocido")
  if [ "$state" != "running" ] || [ "$tries" -gt 60 ]; then
    echo "✖ La API no quedó disponible (estado: $state). Últimos registros:" >&2
    docker compose logs --tail=60 backend >&2
    exit 1
  fi
  sleep 3
done

docker image prune -f >/dev/null
# Libera la caché de build con más de 24 h (mantiene la reciente para builds rápidos)
docker builder prune -f --filter "until=24h" >/dev/null

echo "✔ Backend desplegado."
docker compose ps
