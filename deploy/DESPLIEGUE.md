# Despliegue en el servidor — paso a paso

Un solo dominio, `intinmobiliaria.com`, atendido por dos contenedores detrás de Nginx:

```
                    ┌─ /      → 127.0.0.1:3100  contenedor inti_frontend (Next.js)
Internet → Nginx ───┤
   (HTTPS)          └─ /api/  → 127.0.0.1:3101  contenedor inti_backend  (NestJS)
                                                  ├─ PostgreSQL externo (p. ej. Supabase)
                                                  └─ Cloudinary (imágenes)
```

Los contenedores no guardan archivos ni se exponen a internet: solo Nginx es público. Cada repositorio se despliega por separado con `sh deploy/deploy.sh`.

## 1. Requisitos del servidor (una sola vez)

- Linux con **Docker** y el plugin **Docker Compose**, **Nginx**, **Certbot** y **git**.
- El DNS de `intinmobiliaria.com` apuntando a la IP del servidor, y los puertos 80 y 443 abiertos.
- Una base **PostgreSQL** accesible desde el servidor (Supabase u otra) y una cuenta de **Cloudinary**.

## 2. Backend

```bash
git clone <repositorio-backend> Inti_backend_web && cd Inti_backend_web
cp deploy/.env.production.example .env && chmod 600 .env
nano .env
sh deploy/deploy.sh
```

Completa en `.env`: `DATABASE_URL` y `DIRECT_URL` (ver los comentarios del archivo), `FRONTEND_ORIGIN=https://intinmobiliaria.com`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (12 caracteres o más), `AUTH_SECRET` (32 o más, aleatorio) y las credenciales de Cloudinary.

Al arrancar, la API **valida la configuración** y **aplica las migraciones** automáticamente. Si falta algo, el contenedor se detiene y `deploy.sh` muestra el motivo exacto.

## 3. Frontend

```bash
git clone <repositorio-frontend> Inti_frontend_web && cd Inti_frontend_web
sh deploy/deploy.sh
```

No necesita `.env`: usa `https://intinmobiliaria.com/api` por defecto. Si quieres mostrar las redes sociales en el pie de página, copia `.env.example` a `.env`, completa las URL y repite el comando.

## 4. Nginx y HTTPS (una sola vez)

```bash
sudo cp Inti_frontend_web/deploy/nginx/intinmobiliaria.com.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/intinmobiliaria.com.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d intinmobiliaria.com
```

## 5. Verificación

```bash
curl -s https://intinmobiliaria.com/api/health      # {"status":"ok","service":"inti-backend",...}
curl -sI https://intinmobiliaria.com/ | head -1      # HTTP/2 200
```

Entra a `https://intinmobiliaria.com/iniciar-sesion` con `ADMIN_EMAIL` y `ADMIN_PASSWORD`. Para cargar datos de demostración (opcional):

```bash
docker compose -f deploy/docker-compose.yml exec backend node prisma/seed-projects.cjs
```

## 6. Actualizar

En cada repositorio, en el servidor: `sh deploy/deploy.sh`. Si cambias el backend y el frontend a la vez, despliega primero el backend.

## Problemas comunes

| Síntoma | Causa y solución |
|---|---|
| `deploy.sh` dice "Configuración inválida" | Falta o es incorrecta una variable de `.env`; el mensaje las lista todas. Corrige y repite. |
| `P1001: Can't reach database server` | El servidor no llega a PostgreSQL: revisa host, puerto y que la base acepte la IP del servidor. |
| `P3005: database schema is not empty` | La base ya tenía tablas que Prisma no creó. Usa una base vacía o crea un baseline con `prisma migrate resolve`. |
| Errores `prepared statement ... already exists` | `DATABASE_URL` usa el pooler (puerto 6543) sin `?pgbouncer=true&connection_limit=1`. |
| Subir imágenes devuelve 413 | Nginx no tiene `client_max_body_size 100m` (viene en el archivo de ejemplo). |
| Todos los visitantes comparten el límite de intentos | Falta `TRUST_PROXY_HOPS=1`; el `docker-compose.yml` ya lo define. |
| Las imágenes subidas no se ven | Revisa las credenciales de Cloudinary y los registros: `docker compose -f deploy/docker-compose.yml logs backend`. |

## Volver a una versión anterior

```bash
git log --oneline -5          # elige el commit anterior
git checkout <commit> && sh deploy/deploy.sh
```
Las migraciones de la base de datos no se revierten solas; para cambios de esquema, restaura un respaldo de la base.
