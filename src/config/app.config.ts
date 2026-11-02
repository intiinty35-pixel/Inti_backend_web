import { registerAs } from "@nestjs/config";

export default registerAs("app", () => ({
  port: Number.parseInt(process.env.API_PORT ?? "3001", 10),
  publicUrl: process.env.API_PUBLIC_URL ?? "http://localhost:3001",
  adminEmail: process.env.ADMIN_EMAIL ?? "admin@inti.local",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  authSecret: process.env.AUTH_SECRET ?? "",
}));
