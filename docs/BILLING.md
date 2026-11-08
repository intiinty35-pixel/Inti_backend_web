# Planes, pagos manuales y suscripciones

Se integra con el backend NestJS, Prisma y la base PostgreSQL de Supabase existentes. No hay pasarela ni cobro automático.

## Configuración comercial

1. Entrar como administrador en `/admin/planes`.
2. Configurar BOB por USD y el plazo de las órdenes pendientes (1–168 horas).
3. Editar los cuatro planes: nombre, descripción, precio en BOB o USD, cupos de propiedades y proyectos, beneficios y orden. Cada período dura 30 días. El máximo técnico actual es 12 fotos por propiedad; los planes pueden permitir entre 1 y 12.
4. Completar los datos reales de Yape, QR BCP y transferencia. Seleccionar explícitamente las monedas aceptadas y activar únicamente los métodos configurados. El QR puede subirse o configurarse con una URL HTTPS.
5. Publicar o despublicar los planes desde sus botones administrativos. Eliminar un plan lo retira del catálogo mediante archivo lógico; se conserva el historial y puede restaurarse sin publicarlo automáticamente. Un reinicio no repone planes eliminados.

Los precios definitivos configurados son:

| Plan | Precio original | Propiedades | Proyectos | Duración |
| --- | --- | --- | --- | --- |
| Gratis | 0 BOB | 1 | 0 | 30 días |
| Básico | 10 USD | 2 | 0 | 30 días |
| Profesional | 30 BOB | 5 | 0 | 30 días |
| Empresarial | 50 USD | 3 | 2 | 30 días |

Son datos del backend y pueden modificarse desde administración. El precio original en USD se conserva exacto; el equivalente BOB se obtiene con el tipo de cambio configurado. Para contratar planes pagados deben estar configurados el tipo de cambio y un método compatible. El plan Gratis se activa sin orden de pago, comprobante ni tipo de cambio; registra una suscripción de origen `FREE` y auditoría. No se registra ningún ingreso ficticio ni aprobación de pago de importe cero.

Los usuarios contratan desde `/planes` y gestionan órdenes, comprobantes e historial desde `/mi-cuenta/plan`. El administrador revisa pagos en `/admin/pagos`.

## Flujo y reglas

- El backend calcula importes con `Prisma.Decimal`, redondea a dos decimales y congela importe BOB, equivalente USD, importe a transferir, moneda y tipo de cambio. También guarda copias del plan y del método.
- Una orden nueva está `PENDING`. Subir un comprobante válido la cambia a `UNDER_REVIEW`; no activa beneficios.
- Solo un administrador puede aprobar o rechazar. Rechazar requiere un motivo. El propietario puede reenviar un comprobante rechazado mientras la orden siga vigente. Se conserva el historial.
- La aprobación bloquea la fila de usuario y de orden en una transacción. Es idempotente para una orden ya aprobada. La orden tiene una sola suscripción y un índice parcial impide dos suscripciones `ACTIVE` del mismo usuario.
- El período inicial comienza al aprobar. Una renovación del mismo plan comienza en el vencimiento del último período vigente o programado. Permanece `PENDING` hasta su inicio; no se pierden días.
- Los cambios de plan pagado durante períodos incompatibles vigentes se rechazan. Pasar del plan Gratis a uno pagado se permite: al aprobar el pago comienza el período pagado inmediatamente, se cancela el período gratuito y se conservan las publicaciones que entren en los nuevos cupos. Las modificaciones posteriores del catálogo no cambian órdenes ni beneficios contratados anteriormente.
- Los borradores no necesitan suscripción. Para publicar, el propietario pulsa Solicitar publicación o Solicitar destacada. Se comprueban cuenta, vigencia, cupos y cantidad de fotos; pasa a `PENDING_REVIEW`.
- La aprobación inmobiliaria sigue siendo administrativa y vuelve a comprobar los beneficios dentro de una transacción. La ruta antigua de aprobación también pasa por esta política.
- Los proyectos guardan su suscripción de cobertura. El administrador solo puede publicarlos si hay cupo de proyectos en un plan activo. Los planes con cero proyectos no permiten publicarlos; Empresarial permite dos. Vencimiento, renovación y suspensión también se aplican a los proyectos, sin borrarlos.
- El listado público verifica la suscripción y la cuenta al consultar, además del mantenimiento periódico. No muestra publicaciones sin cobertura vigente.
- Al vencer un período, se activa la renovación programada, si existe. Se conservan las publicaciones que entren en sus límites. Sin cobertura, se pausan. No se borran propiedades ni fotos.
- Suspender, bloquear o desactivar una cuenta invalida su acceso, suspende sus suscripciones y pausa sus publicaciones. Reactivar no añade días ni publica automáticamente propiedades pausadas.

## Archivos privados y despliegue

`PAYMENT_RECEIPTS_DIR` es un directorio privado fuera de `public/`, por defecto `data/private/payment-receipts`. Los comprobantes se guardan con identificadores aleatorios y permisos restrictivos. PostgreSQL solo almacena metadatos y referencias. Se validan tamaño (8 MB), extensión y firma JPG/PNG/PDF. Las rutas de lectura requieren al propietario o al administrador, sirven como adjunto y no permiten caché.

El Dockerfile prepara `/app/data` para el usuario del contenedor. El compose de backend incorpora `private_receipts:/app/data`. El compose raíz ya dispone de un volumen en esa ruta. Respaldar ese volumen junto con la base; no usar `docker compose down -v`. No exponer el directorio con Nginx ni publicarlo como ruta estática.

La base sigue siendo la configurada en `DATABASE_URL`. Para Supabase: conexión de aplicación por pooler de transacciones con `pgbouncer=true&connection_limit=1`; `DIRECT_URL` debe ser una conexión directa o de sesión válida para Prisma Migrate. No ejecutar herramientas que reemplacen la configuración real de Supabase por una base local. No se ha desplegado este cambio al VPS.

## Correo y mantenimiento

Variables nuevas:

| Variable | Uso |
| --- | --- |
| `PAYMENT_RECEIPTS_DIR` | Directorio privado persistente de comprobantes |
| `SMTP_URL` | URL SMTP autenticada o SMTPS del proveedor |
| `SMTP_FROM` | Remitente autorizado por el proveedor |
| `BILLING_ADMIN_EMAIL` | Destinatario administrativo; usa `ADMIN_EMAIL` si no se define |

También se reutiliza `FRONTEND_PUBLIC_URL` para enlazar al panel. No configurar secretos con prefijo `NEXT_PUBLIC_`.

Los eventos se guardan en `notification_outbox` dentro de la misma transacción comercial. Sin SMTP, quedan pendientes. Se envían con Nodemailer, con límites de tiempo, claves de evento únicas y reclamación exclusiva de mensajes. Los fallos se reintentan con espera creciente sin revertir pagos aprobados. Los correos administrativos no adjuntan comprobantes: enlazan al panel autenticado. En producción se exige TLS.

El mantenimiento se ejecuta al arrancar y cada minuto. Usa bloqueo asesor transaccional de PostgreSQL para no duplicar vencimientos entre procesos. Vence órdenes pendientes o rechazadas, procesa períodos vencidos y renovaciones, pausa publicaciones sin cobertura y encola recordatorios a tres días. El estado persistente permite reejecución. Una entrega interrumpida después de la aceptación SMTP puede repetirse al recuperarse; `Message-ID` es estable, pero SMTP no garantiza entrega exactamente una vez.

`BILLING_JOBS_DISABLED=true` se utiliza únicamente para pruebas o mantenimiento controlado. No debe habilitarse en producción normal.

## API

Todas las rutas tienen prefijo `/api`.

| Método y ruta | Permiso / función |
| --- | --- |
| `GET /billing/catalog` | Público: planes y métodos activos, monedas y tipo de cambio |
| `GET /billing/account` | Usuario: plan, cupos, días restantes y renovaciones |
| `POST /billing/orders` | Usuario: crear orden calculada en servidor |
| `GET /billing/orders` | Usuario: historial paginado propio |
| `GET /billing/orders/:id` | Propietario: detalle, comprobantes e historial |
| `PATCH /billing/orders/:id/cancel` | Propietario: cancelar pendiente o rechazada |
| `POST /billing/orders/:id/receipts` | Propietario: comprobante multipart `file` |
| `GET /billing/receipts/:id` | Propietario: archivo privado |
| `POST /billing/publications/:id/request` | Propietario: solicitar publicación; `featured` opcional |
| `GET /billing/admin/catalog` | Administrador: configuración completa |
| `PUT /billing/admin/settings` | Administrador: tipo de cambio y vigencia de órdenes |
| `PUT /billing/admin/plans/:id` | Administrador: configurar uno de los cuatro planes |
| `PATCH /billing/admin/plans/:id/visibility` | Administrador: publicar o despublicar un plan |
| `DELETE /billing/admin/plans/:id` | Administrador: retirar del catálogo sin borrar historial |
| `POST /billing/admin/plans/:id/restore` | Administrador: restaurar un plan archivado |
| `POST /billing/plans/:id/activate-free` | Usuario: activar un plan de precio cero sin pago |
| `PUT /billing/admin/methods/:id` | Administrador: configurar método manual |
| `POST /billing/admin/methods/:id/qr` | Administrador: subir imagen QR, multipart `file` |
| `GET /billing/admin/dashboard` | Administrador: conteos e ingresos separados por moneda |
| `GET /billing/admin/orders` | Administrador: órdenes paginadas y filtros |
| `GET /billing/admin/orders/:id` | Administrador: detalle e historial de orden |
| `PATCH /billing/admin/orders/:id/review` | Administrador: `APPROVE` o `REJECT`, motivo para rechazar |
| `GET /billing/admin/receipts/:id` | Administrador: archivo privado |
| `GET /billing/admin/users/:id` | Administrador: cuenta, propiedades, suscripciones y auditoría |
| `PATCH /billing/admin/users/:id/status` | Administrador: estado y motivo obligatorio |
| `PATCH /billing/admin/publications/:id/reject` | Administrador: rechazar publicación con motivo |
| `GET /billing/admin/notifications` | Administrador: estado de cola de correo |
| `PATCH /properties/admin/:id/publish` | Administrador: moderación con suscripción y cupos |

Filtros de órdenes: `status`, `userId`, `planId`, `methodId`, `currency`, `search`, `from`, `to`, `page`, `pageSize`. Una cuenta no administrativa siempre queda limitada a sus propias órdenes aunque manipule `userId`.

## Migración y archivos

Migraciones: `prisma/migrations/20261108010000_manual_billing_subscriptions/migration.sql` y `prisma/migrations/20261108020000_definitive_commercial_plans/migration.sql`. Añaden el catálogo, configuración, métodos, órdenes, comprobantes, suscripciones, auditoría y outbox; precios originales BOB/USD, archivo de planes, suscripciones gratuitas y cupos de proyectos. Se integran cuenta, propiedad y proyecto sin eliminar modelos ni datos anteriores.

Backend nuevo: `src/modules/billing/` (DTOs, catálogo, órdenes, políticas, almacenamiento privado, cuentas, proveedores manuales, mantenimiento y controladores). Integraciones: `app.module`, autenticación, usuarios, propiedades, almacenamiento de QR, Docker y ejemplos de entorno.

Frontend nuevo: `features/billing/`, `/planes`, `/mi-cuenta/plan`, `/admin/planes`, `/admin/pagos`. Integraciones: navegación existente, gestión de propiedades, consulta de borradores y estilos institucionales.

## Validación reproducible

```text
pnpm db:generate
pnpm exec prisma validate
pnpm db:deploy
pnpm build
pnpm test -- --runInBand
pnpm test:billing:integration
```

El script de integración crea un esquema `inti_billing_test_<uuid>` en la misma instancia PostgreSQL, aplica allí todas las migraciones y arranca una API real en puerto efímero. Prueba autorización, importes, manipulación de órdenes, moneda incompatible, congelamiento, archivos privados y MIME, rechazos y reenvíos, doble aprobación concurrente, activación, renovación, vencimientos, cupos, suspensión y correo pendiente. Al terminar retira únicamente su esquema y archivos privados temporales. Los importes y datos ficticios utilizados por el script pertenecen exclusivamente a ese esquema descartable.

En el frontend: `pnpm build` y `pnpm test`.

Resultado de la validación del 7 de noviembre de 2026: esquema Prisma válido, migraciones aplicadas en Supabase, compilación backend correcta, 101 pruebas backend correctas, compilación frontend correcta, 16 pruebas frontend correctas y 72 comprobaciones de integración correctas. Se verificaron los cuatro precios definitivos, activación gratuita sin pago ficticio, cambio de Gratis a pagado, cupos de proyectos y eliminación/restauración de planes conservando el historial. También se probó un fallo SMTP controlado: el mensaje quedó pendiente para reintento y el pago aprobado se conservó. El esquema y los archivos temporales de las pruebas se retiraron al finalizar.

Antes de producción: configurar y verificar los datos comerciales reales, comprobar un envío real con el proveedor SMTP elegido, confirmar el volumen y su respaldo, y revisar el recorrido visual con una cuenta administrativa y otra de agente. La compilación y las pruebas de API no sustituyen esa configuración operativa.
