/**
 * Se ejecuta antes que cada archivo e2e. Prisma carga el .env local al importarse y sin esto sus credenciales reales
 * (Cloudinary, administrador, etc.) llegarían a las pruebas: las variables ya definidas, aunque vacías, no se sobrescriben.
 */
for (const name of [
  "CLOUDINARY_URL",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "FRONTEND_ORIGIN",
  "TRUST_PROXY_HOPS",
  "API_PORT",
]) {
  process.env[name] = "";
}
