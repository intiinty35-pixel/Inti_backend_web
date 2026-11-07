# Inti Backend

API REST del sistema Inti, construida con NestJS y TypeScript. Usa PostgreSQL mediante Prisma y guarda las imágenes en Cloudinary. El frontend está en el repositorio `Inti_frontend_web`.

## Arquitectura

El proyecto sigue un **Modular Monolith**: cada capacidad se incorpora como módulo NestJS independiente bajo `src/modules/`. Dentro de cada módulo, `presentation` recibe las solicitudes HTTP, `application` contiene los casos de uso, `domain` define los contratos y `infrastructure` conecta con Prisma.

- `src/modules/`: módulos verticales autocontenidos (`auth`, `users`, `dashboard`, `properties`, `projects`, `health`, `profiles`).
- `src/common/`: preocupaciones transversales de la API.
- `src/config/`: configuración y validación de las variables de entorno. En producción la API no arranca si falta algo obligatorio y lista todo lo que falta.
- `src/infrastructure/`: adaptadores técnicos: conexión Prisma y almacenamiento de imágenes en Cloudinary.
- `src/shared/`: utilidades pequeñas realmente compartidas.

`GET /api/health` informa que el proceso está activo. `GET /api/properties` y las rutas de consulta pública de proyectos no requieren sesión; crear o gestionar publicaciones sí. `POST /api/auth/login` autentica cuentas persistidas de Usuario, Agente y Administrador, y conserva el acceso de administrador configurado en el entorno; devuelve un token firmado (JWT, 12 horas) que se envía como `Authorization: Bearer <token>`. El login limita los intentos y las sesiones comprueban que la cuenta siga activa.

Los miembros (Usuario y Agente) crean y gestionan solo sus propias propiedades y proyectos. El administrador puede consultar todo, eliminar publicaciones, crear usuarios y ver métricas. El panel del administrador se alimenta con `GET /api/dashboard/metrics`; `GET /api/users`, `POST /api/users` y `PATCH /api/users/:id/status` son rutas exclusivas del administrador.

### Proyectos

El módulo `projects/` gestiona proyectos de obra nueva y lotizaciones (unidades o lotes, amenidades, cronograma, imágenes y comentarios). Lectura pública: `GET /api/projects` (filtros `type`, `phase`, `location`, `currency`, `priceMin`, `priceMax`, `search`, y paginación con `page` y `pageSize`), `GET /api/projects/:slug` y `GET /api/projects/:id/comments`; `POST /api/projects/:id/comments` es público, sin cuenta y con límite de 5 por minuto. Crear, editar, cambiar estado y gestionar unidades requiere sesión de miembro; eliminar también lo permite al administrador. Borrar un proyecto con unidades vendidas requiere `?force=true`.

### Imágenes

Las imágenes **no se guardan en el servidor**: `POST /api/projects/media` y `POST /api/properties/media` las validan por su contenido real (JPG, PNG o WEBP, hasta 8 MB y 12 por subida) y las suben a Cloudinary, en `inti/projects` o `inti/properties`. Las respuestas traen la URL pública y el identificador. Al editar o eliminar un registro, las imágenes que ya nadie usa se borran de Cloudinary.

## Desarrollo

Requiere Node.js 22 y pnpm. Necesitas una base PostgreSQL; elige una:

- **Supabase o cualquier PostgreSQL ya existente:** pon sus cadenas en `DATABASE_URL` y `DIRECT_URL`.
- **PostgreSQL instalado en tu equipo:** crea una base `inti` y usa `postgresql://USUARIO:CLAVE@localhost:5432/inti` en ambas variables.
- **Con Docker (opcional):** `docker compose up -d db` levanta una base en el puerto 5433, que ya es el valor de `.env.example`. Consume memoria; no es obligatorio.

```bash
pnpm install
cp .env.example .env        # en PowerShell: Copy-Item .env.example .env
# completa .env: base de datos, AUTH_SECRET, ADMIN_PASSWORD y Cloudinary
pnpm db:generate
pnpm db:deploy              # aplica las migraciones
pnpm db:seed                # propiedades de demostración (opcional)
pnpm start:dev
```

La API escucha en `http://localhost:3001`. `DATABASE_URL` es la conexión de la aplicación y `DIRECT_URL` la que Prisma usa para migrar; con una base normal son la misma. Con Supabase en modo transacción (puerto 6543) añade `?pgbouncer=true&connection_limit=1` a `DATABASE_URL` y usa la conexión directa o de sesión (puerto 5432) en `DIRECT_URL`.

**Cloudinary:** completa `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET`. Si prefieres una sola variable, `CLOUDINARY_URL` debe valer exactamente `cloudinary://API_KEY:API_SECRET@CLOUD_NAME`; no repitas el nombre de la variable dentro del valor.

Datos de demostración (todos repetibles, no duplican):

- `pnpm db:seed`: propiedades.
- `pnpm db:seed:projects`: 6 proyectos (obra nueva, comercial, lotizaciones y un borrador).
- `pnpm db:seed:users`: cuentas demo `agente@inti.local` y `usuario@inti.local` (contraseña inicial `IntiDemo2026!`, configurable con `DEMO_USERS_PASSWORD`). También sincroniza la cuenta administradora con `ADMIN_EMAIL` y `ADMIN_PASSWORD`. No se ejecuta en producción.

Al bajar cambios del repositorio, ejecuta `pnpm install`, `pnpm db:generate` y `pnpm db:deploy`.

### Ejecutar el backend en Docker desde Ubuntu (WSL)

Este flujo levanta **solo la API** en un contenedor Docker y usa la base de datos configurada en `.env`; no inicia un PostgreSQL local. Requiere Docker Desktop abierto y la integración WSL habilitada para Ubuntu. El `.env` no se sube a Git ni se copia dentro de la imagen: Docker lo lee al crear el contenedor.

En Ubuntu/WSL, desde la raíz del backend:

```bash
cd /mnt/c/Fronted/Empresa/Int/inti_backend
docker build -t inti-backend-dev .
docker rm -f inti-backend-dev 2>/dev/null || true
docker run -d --name inti-backend-dev --restart unless-stopped \
  --env-file .env \
  -e API_PORT=3001 \
  -e FRONTEND_ORIGIN=http://localhost:3000 \
  -p 127.0.0.1:3001:3001 \
  inti-backend-dev
docker logs -f inti-backend-dev
```

La imagen ejecuta `prisma migrate deploy` antes de iniciar la API. Comprueba el servicio en otra terminal WSL:

```bash
curl http://localhost:3001/api/health
docker ps --filter name=inti-backend-dev
```

Para ver los registros sin seguirlos, usa `docker logs --tail=100 inti-backend-dev`. Para detener o volver a iniciar el mismo contenedor, usa `docker stop inti-backend-dev` y `docker start inti-backend-dev`.

#### Cuando cambia `prisma/schema.prisma`

Primero, desde PowerShell en el backend, crea y aplica una migración a la base de desarrollo configurada en `.env`:

```powershell
cd C:\Fronted\Empresa\Int\inti_backend
pnpm exec prisma migrate dev --name nombre_del_cambio
```

Después, en Ubuntu/WSL, reconstruye y reemplaza el contenedor con los comandos anteriores. Al arrancar, este aplica las migraciones versionadas con `prisma migrate deploy`. No uses `migrate reset` ni ejecutes `migrate dev` en producción.

> Si `docker run` dice que el puerto 3001 está ocupado, identifica y detén el proceso/contenedor que lo usa antes de repetirlo; no cambies el puerto a ciegas porque el frontend local debe apuntar a `http://localhost:3001/api`.

### Pruebas

```bash
pnpm test        # unitarias: reglas de negocio, casos de uso, token, validación de entorno e imágenes
pnpm test:e2e    # extremo a extremo con la API completa y una base PostgreSQL
```

Las pruebas e2e usan un esquema propio y aleatorio dentro de una base PostgreSQL, y lo eliminan al terminar; las imágenes se simulan en memoria, sin llamar a Cloudinary. Por defecto usan `postgresql://inti:inti@localhost:5433/inti` (la base de `compose.yaml`); define `TEST_DATABASE_URL` para apuntar a otra. **Nunca la apuntes a la base de producción.**

## Despliegue

Pensado para un servidor con Docker y Nginx. El sitio completo vive en un solo dominio: `https://intinmobiliaria.com/` (frontend) y `https://intinmobiliaria.com/api/` (esta API). **La base de datos PostgreSQL corre en el mismo servidor**, en un contenedor sin puertos públicos y con un volumen persistente; las imágenes van a Cloudinary, no al disco del servidor.

Primer despliegue, en el servidor:

```bash
git clone https://github.com/intiinty35-pixel/Inti_backend_web.git && cd Inti_backend_web
sh deploy/init-env.sh        # crea .env y genera la contraseña de la base, las URLs y AUTH_SECRET
nano .env                    # completa ADMIN_EMAIL, ADMIN_PASSWORD y las credenciales de Cloudinary
sh deploy/deploy.sh
```

Cada actualización posterior es solo `sh deploy/deploy.sh`: trae el código, reconstruye la imagen, reinicia los contenedores, **aplica las migraciones pendientes al arrancar** y espera a que `/api/health` responda. Si algo falta o falla, el script se detiene y muestra los registros.

- La API escucha solo en `127.0.0.1:3101`; Nginx la publica en `/api/`. La configuración de Nginx está en `Inti_frontend_web/deploy/nginx/intinmobiliaria.com.conf`.
- **Respaldos:** `sh deploy/backup-db.sh` guarda un volcado comprimido y conserva los 14 más recientes; la guía explica cómo programarlo y cómo restaurar.
- Guía completa, con HTTPS, verificación y problemas comunes: `deploy/DESPLIEGUE.md`.
