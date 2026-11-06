#!/usr/bin/env sh
# Despliegue y actualización del backend:  sh deploy/deploy.sh
# Sirve igual para el primer despliegue y para cada actualización.
set -e
cd "$(dirname "$0")"

CONTAINER=inti_backend

if [ ! -f ../.env ]; then
  echo "Falta ../.env. Copia deploy/.env.production.example a .env, completa los valores y protégelo con chmod 600." >&2
  exit 1
fi

echo "→ Actualizando el código..."
git pull --ff-only

echo "→ Construyendo e iniciando el contenedor..."
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
