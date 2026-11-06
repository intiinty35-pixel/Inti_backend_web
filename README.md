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

### Pruebas

```bash
pnpm test        # unitarias: reglas de negocio, casos de uso, token, validación de entorno e imágenes
pnpm test:e2e    # extremo a extremo con la API completa y una base PostgreSQL
```

Las pruebas e2e usan un esquema propio y aleatorio dentro de una base PostgreSQL, y lo eliminan al terminar; las imágenes se simulan en memoria, sin llamar a Cloudinary. Por defecto usan `postgresql://inti:inti@localhost:5433/inti` (la base de `compose.yaml`); define `TEST_DATABASE_URL` para apuntar a otra. **Nunca la apuntes a la base de producción.**

## Despliegue

Pensado para un servidor con Docker y Nginx, igual que el resto de proyectos. El sitio completo vive en un solo dominio: `https://intinmobiliaria.com/` (frontend) y `https://intinmobiliaria.com/api/` (esta API). El contenedor no guarda archivos: la base es PostgreSQL externa y las imágenes van a Cloudinary, por eso no usa volúmenes.

Primer despliegue, en el servidor:

```bash
git clone <repositorio> Inti_backend_web && cd Inti_backend_web
cp deploy/.env.production.example .env && chmod 600 .env
nano .env                    # completa los valores (base de datos, AUTH_SECRET, ADMIN_*, FRONTEND_ORIGIN, Cloudinary)
sh deploy/deploy.sh
```

Cada actualización posterior es solo `sh deploy/deploy.sh`: trae el código, reconstruye la imagen, reinicia el contenedor, **aplica las migraciones pendientes al arrancar** y espera a que `/api/health` responda. Si algo falta o falla, el script se detiene y muestra los registros.

- El contenedor escucha solo en `127.0.0.1:3101`; Nginx lo publica en `/api/`. La configuración de Nginx del dominio está en `Inti_frontend_web/deploy/nginx/intinmobiliaria.com.conf`.
- Para cargar datos de demostración en el servidor: `docker compose -f deploy/docker-compose.yml exec backend node prisma/seed-projects.cjs`.
- Para ver los registros: `docker compose -f deploy/docker-compose.yml logs -f backend`.
