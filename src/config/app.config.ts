import { registerAs } from "@nestjs/config";

const text = (name: string) => process.env[name]?.trim() ?? "";

export default registerAs("app", () => ({
  port: Number.parseInt(process.env.API_PORT ?? "3001", 10),
  adminEmail: process.env.ADMIN_EMAIL ?? "admin@inti.local",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  authSecret: process.env.AUTH_SECRET ?? "",
  /** Orígenes del frontend permitidos por CORS, separados por comas. */
  allowedOrigins: (process.env.FRONTEND_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  /** Cantidad de proxies de confianza delante de la API (Nginx = 1); sin proxy debe ser 0. */
  trustProxyHops: Number.parseInt(process.env.TRUST_PROXY_HOPS ?? (process.env.NODE_ENV === "production" ? "1" : "0"), 10),
  cloudinary: {
    cloudName: text("CLOUDINARY_CLOUD_NAME"),
    apiKey: text("CLOUDINARY_API_KEY"),
    apiSecret: text("CLOUDINARY_API_SECRET"),
  },
}));
