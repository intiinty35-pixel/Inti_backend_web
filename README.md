# Inti Backend

API REST independiente para el sistema Inti, construida con NestJS y TypeScript. El frontend se mantiene en `../inti_fronted`. La persistencia local usa SQLite mediante Prisma; aún no se agrega una base de datos de producción.

## Arquitectura

El proyecto sigue un **Modular Monolith**: cada capacidad futura se incorpora como módulo NestJS independiente bajo `src/modules/`. Dentro de cada módulo, `presentation` recibe las solicitudes HTTP, `application` contiene los casos de uso, `domain` define los contratos y `infrastructure` conecta con Prisma y SQLite.

- `src/modules/`: módulos verticales autocontenidos. `properties/` crea y lista propiedades; `health/` y `profiles/` son módulos independientes.
- `src/common/`: preocupaciones transversales de la API.
- `src/config/`: configuración de aplicación y lectura de variables de entorno.
- `src/infrastructure/`: adaptadores e integraciones técnicas, incluida la conexión Prisma.
- `src/shared/`: utilidades pequeñas realmente compartidas.

El endpoint `GET /api/health` informa que el proceso está activo. `GET /api/properties` y las rutas de consulta pública de proyectos no requieren sesión; crear o gestionar publicaciones sí. `POST /api/auth/login` autentica cuentas persistidas de Usuario, Agente y Administrador, y conserva el acceso de administrador configurado en el `.env`; devuelve un token firmado (HMAC, 12 horas) que se envía como `Authorization: Bearer <token>`. El login limita los intentos y las sesiones comprueban que la cuenta siga activa.

Las cuentas autenticadas gestionan solo sus propiedades y proyectos. El administrador puede consultar y gestionar los registros de todas las cuentas, crear usuarios y consultar métricas. El panel del administrador se alimenta con `GET /api/dashboard/metrics`; `GET /api/users`, `POST /api/users` y `PATCH /api/users/:id/status` son rutas exclusivas del administrador.

### Proyectos

El módulo `projects/` gestiona proyectos de obra nueva y lotizaciones (unidades o lotes, amenidades, cronograma, imágenes y comentarios). Lectura pública: `GET /api/projects` (filtros `type`, `phase`, `location`, `currency`, `priceMin`, `priceMax`, `search`), `GET /api/projects/:slug` y `GET /api/projects/:id/comments`; `POST /api/projects/:id/comments` es público, sin cuenta y con límite de 5 por minuto. Crear, editar, borrar, cambiar estado, gestionar unidades y subir imágenes (`POST /api/projects/media`) requieren sesión; los usuarios gestionan sus propios proyectos y el administrador puede listar todos (`GET /api/projects/admin/all`). `GET /api/projects/mine` lista los propios. Borrar un proyecto con unidades vendidas requiere `?force=true`. Las imágenes se validan por su contenido real y se guardan en `uploads/projects/`.

## Desarrollo

Requiere Node.js 20.19 o posterior y pnpm.

```bash
pnpm install
Copy-Item .env.example .env
pnpm db:generate
pnpm exec prisma migrate deploy
pnpm db:seed
pnpm start:dev
```

La API escucha en `http://localhost:3001` por defecto. La base queda en `prisma/dev.db`; puedes cambiar `DATABASE_URL` en `.env`. `pnpm db:seed` crea cuatro propiedades de demostración de forma repetible. Las imágenes subidas se guardan en `uploads/properties/`. Cambia `API_PORT`, `API_PUBLIC_URL`, `FRONTEND_ORIGIN` o `FRONTEND_PUBLIC_URL` en `.env` según el entorno. Configura `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `AUTH_SECRET` (cadena aleatoria de 32 caracteres o más) solo en el `.env` local; sin `AUTH_SECRET` las sesiones se invalidan al reiniciar.

`pnpm db:seed:projects` carga 6 proyectos de demostración (obra nueva, comercial, lotizaciones y un borrador); se puede repetir sin duplicar.

`pnpm db:seed:users` crea las cuentas demo `agente@inti.local` y `usuario@inti.local` (contraseña inicial `IntiDemo2026!`; se puede cambiar definiendo `DEMO_USERS_PASSWORD` antes de sembrar). El script también sincroniza la cuenta administradora con `ADMIN_EMAIL` y `ADMIN_PASSWORD` si ambas variables están configuradas; no se ejecuta en producción.

Al actualizar el backend, ejecuta `pnpm db:generate` y `pnpm exec prisma migrate deploy` para sincronizar el cliente y la base local con los cambios del esquema. Mantén `pnpm start:dev` ejecutándose en esta terminal mientras uses el frontend.

### Pruebas

```bash
pnpm test        # unitarias: reglas de negocio, casos de uso, token, límite de intentos y validación de imágenes
pnpm test:e2e    # extremo a extremo: levanta la API con una base SQLite temporal y no toca prisma/dev.db ni uploads/
```

```bash
pnpm build
pnpm start:prod
```
# Inti_backend_web
