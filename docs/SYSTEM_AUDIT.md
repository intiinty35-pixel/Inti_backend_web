# Auditoría del sistema

En `/admin`, el botón Auditoría aparece a la izquierda de la fecha. Solo los administradores pueden consultar el historial y sus detalles.

La tabla permite filtrar por cuenta involucrada, rol del actor, sección, acción, resultado, texto y fechas. Muestra fecha y hora de Lima, usuario que ejecutó la acción, cuenta afectada, recurso, IP, dispositivo y resultado. El detalle contiene los valores anteriores y posteriores disponibles y un identificador de solicitud.

Se registran las operaciones de escritura de la API y las consultas administrativas sensibles. Las acciones de facturación también se integran en el historial. Las altas, actualizaciones y eliminaciones de propiedades y proyectos registran el evento en su transacción para conservar la identidad del recurso eliminado. Contraseñas, tokens y secretos se ocultan antes de guardar los detalles.

La IP procede de Express y su configuración de proxy de confianza; no se confía directamente en una cabecera enviada por el visitante. El dispositivo se interpreta del User-Agent, que el cliente puede modificar. Las tareas automáticas aparecen como SYSTEM. Los cambios realizados directamente en la base de datos fuera de la aplicación no quedan capturados por este mecanismo.

Los eventos históricos no inventan IP ni dispositivo. Las identidades recuperadas de cuentas actuales durante la migración se identifican en los metadatos como `current_account_for_historical_event`.

Rutas protegidas de consulta: `GET /api/audit`, `GET /api/audit/options` y `GET /api/audit/:id`. No hay rutas para editar o eliminar el historial. Migraciones: `20261108030000_system_audit_context` y `20261108031000_audit_query_indexes`.
