# Despliegue en el servidor — paso a paso

Un solo dominio, `intinmobiliaria.com`, atendido por contenedores detrás de Nginx:

```
                    ┌─ /      → 127.0.0.1:3100  contenedor inti_frontend (Next.js)
Internet → Nginx ───┤
   (HTTPS)          └─ /api/  → 127.0.0.1:3101  contenedor inti_backend  (NestJS)
                                                  ├─ contenedor inti_db (PostgreSQL, sin puertos públicos)
                                                  └─ Cloudinary (imágenes)
```

La base de datos corre en este mismo servidor, en un contenedor, y solo el backend puede llegar a ella. Los datos viven en el volumen `pgdata`. Cada repositorio se despliega por separado con `sh deploy/deploy.sh`.

## 1. Requisitos del servidor (una sola vez)

- Linux con **Docker** y el plugin **Docker Compose**, **Nginx**, **Certbot** y **git**.
- El DNS de `intinmobiliaria.com` apuntando a la IP del servidor, y los puertos 80 y 443 abiertos.
- Una cuenta de **Cloudinary** para las imágenes.

```bash
curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker $USER   # cierra y abre la sesión después
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx git
```

## 2. Backend y base de datos

```bash
mkdir -p ~/inti && cd ~/inti
git clone https://github.com/intiinty35-pixel/Inti_backend_web.git
cd Inti_backend_web
sh deploy/init-env.sh        # crea .env, genera las claves y las URLs de la base de datos
nano .env                    # completa lo que indique el mensaje
sh deploy/deploy.sh
```

`init-env.sh` genera solo la contraseña de la base (`POSTGRES_PASSWORD`), `DATABASE_URL`, `DIRECT_URL` y `AUTH_SECRET`. **Tú completas**: `ADMIN_EMAIL`, `ADMIN_PASSWORD` (12 caracteres o más) y las tres credenciales de Cloudinary. Puedes repetirlo cuando quieras: nunca cambia una contraseña ya generada ni lo que escribiste.

> No cambies `POSTGRES_PASSWORD` después del primer despliegue: PostgreSQL la fija al crear el volumen y la API dejaría de poder entrar.

Al arrancar, la API **valida la configuración** y **crea o actualiza las tablas** automáticamente. Si falta algo, el contenedor se detiene y `deploy.sh` muestra el motivo exacto.

## 3. Frontend

```bash
cd ~/inti
git clone https://github.com/intiinty35-pixel/Inti_frontend_web.git
cd Inti_frontend_web
sh deploy/deploy.sh
```

No necesita `.env`: usa `https://intinmobiliaria.com/api` por defecto. Si quieres mostrar las redes sociales en el pie de página, copia `.env.example` a `.env`, completa las URL y repite el comando.

## 4. Nginx y HTTPS (una sola vez)

```bash
sudo cp ~/inti/Inti_frontend_web/deploy/nginx/intinmobiliaria.com.conf /etc/nginx/sites-available/
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
docker exec inti_backend node prisma/seed-demo.cjs        # 4 propiedades
docker exec inti_backend node prisma/seed-projects.cjs    # 6 proyectos
```

## 6. Actualizar

En cada repositorio, en el servidor: `sh deploy/deploy.sh`. Si cambias el backend y el frontend a la vez, despliega primero el backend.

## 7. Respaldos de la base de datos

Como la base vive en este servidor, **haz respaldos**: si el servidor se pierde, se pierden los datos.

```bash
sh ~/inti/Inti_backend_web/deploy/backup-db.sh      # guarda ~/inti/backups/inti-AAAAMMDD-HHMMSS.sql.gz (conserva 30 días)
```

Es un respaldo completo de la base. Se conservan los últimos 30 días: cada noche se borra el más antiguo (el 1 de diciembre se elimina el del 1 de noviembre) y nunca se borran los 7 más recientes. El plazo se cambia con `BACKUP_KEEP_DAYS`.

Para hacerlo cada noche a las 3:00, ejecuta `crontab -e` y agrega (cambia `rodrigo` por tu usuario):
```
0 3 * * * sh /home/rodrigo/inti/Inti_backend_web/deploy/backup-db.sh >> /home/rodrigo/inti/backups/backup.log 2>&1
```
Copia de vez en cuando los respaldos fuera del servidor (tu PC o un almacenamiento externo).

**Restaurar** un respaldo (reemplaza los datos actuales):
```bash
cd ~/inti/Inti_backend_web/deploy
gunzip -c ~/inti/backups/inti-AAAAMMDD-HHMMSS.sql.gz | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
```

> **Nunca ejecutes `docker compose down -v`**: la opción `-v` borra el volumen con toda la base. `docker compose down` a secas es seguro.

## Problemas comunes

| Síntoma | Causa y solución |
|---|---|
| `deploy.sh` dice "Falta completar en .env" | Completa lo que lista (`nano .env`) y repite. |
| `deploy.sh` dice "Configuración inválida" | Falta o es incorrecta una variable; el mensaje las lista todas. |
| `P1001: Can't reach database server at db:5432` | El contenedor de la base no está sano: `docker compose ps` y `docker compose logs db`. |
| `password authentication failed` | Cambió `POSTGRES_PASSWORD` tras crear la base. Vuelve al valor original; si no lo tienes y los datos no importan, borra el volumen con `docker compose down -v` (destruye la base) y despliega de nuevo. |
| Subir imágenes devuelve 413 | Nginx no tiene `client_max_body_size 100m` (viene en el archivo de ejemplo). |
| Todos los visitantes comparten el límite de intentos | Falta `TRUST_PROXY_HOPS=1`; el `docker-compose.yml` ya lo define. |
| Las imágenes subidas no se ven | Revisa las credenciales de Cloudinary y los registros: `docker compose logs backend`. |

Los comandos `docker compose` se ejecutan dentro de `~/inti/Inti_backend_web/deploy`.

## Volver a una versión anterior

```bash
git log --oneline -5          # elige el commit anterior
git checkout <commit> && sh deploy/deploy.sh
```
Las migraciones de la base de datos no se revierten solas; para cambios de esquema, restaura un respaldo.
