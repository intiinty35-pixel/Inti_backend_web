# Inti Backend

API REST independiente para el sistema Inti, construida con NestJS y TypeScript. El frontend se mantiene en su proyecto separado y no se incluye lógica de negocio inmobiliaria ni conexión a base de datos en esta etapa.

## Arquitectura

El proyecto sigue un **Modular Monolith**: cada capacidad futura se incorpora como módulo NestJS independiente bajo `src/modules/`. Dentro de cada módulo, las capas separan la entrada HTTP (`presentation`) de los casos de uso (`application`); las reglas y contratos propios del dominio se incorporarán dentro del mismo módulo cuando se definan.

- `src/modules/`: módulos verticales autocontenidos. `health/` es el ejemplo inicial.
- `src/common/`: preocupaciones transversales de la API.
- `src/config/`: configuración de aplicación y lectura de variables de entorno.
- `src/infrastructure/`: adaptadores e integraciones técnicas.
- `src/shared/`: utilidades pequeñas realmente compartidas.

El endpoint `GET /api/health` informa que el proceso de API está activo. No consulta dependencias externas ni base de datos.

## Desarrollo

Requiere Node.js 20.19 o posterior y pnpm.

```bash
pnpm install
Copy-Item .env.example .env
pnpm start:dev
```

La API escucha en `http://localhost:3001` por defecto. Cambia `API_PORT` en `.env` para usar otro puerto.

```bash
pnpm build
pnpm start:prod
```
# Inti_backend_web
