import { validateEnvironment } from "./env.validation";

const development = { NODE_ENV: "development", DATABASE_URL: "postgresql://inti:inti@localhost:5432/inti" };

const production = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://inti:inti@db.example.com:6543/postgres?pgbouncer=true",
  DIRECT_URL: "postgresql://inti:inti@db.example.com:5432/postgres",
  AUTH_SECRET: "s".repeat(40),
  ADMIN_EMAIL: "admin@intinmobiliaria.com",
  ADMIN_PASSWORD: "una-clave-larga-123",
  FRONTEND_ORIGIN: "https://intinmobiliaria.com",
  CLOUDINARY_CLOUD_NAME: "demo",
  CLOUDINARY_API_KEY: "key",
  CLOUDINARY_API_SECRET: "secret",
};

describe("validateEnvironment", () => {
  it("en desarrollo solo exige la base PostgreSQL", () => {
    expect(validateEnvironment(development)).toBe(development);
  });

  it.each(["", "file:./dev.db", "mysql://x@localhost/db"])("rechaza DATABASE_URL = %p", (value) => {
    expect(() => validateEnvironment({ ...development, DATABASE_URL: value })).toThrow(/DATABASE_URL/);
  });

  it("acepta una configuración de producción completa", () => {
    expect(() => validateEnvironment(production)).not.toThrow();
  });

  it("en producción exige pgbouncer=true cuando se usa el pooler de Supabase (puerto 6543)", () => {
    const pooled = "postgresql://inti:inti@aws-0.pooler.supabase.com:6543/postgres";
    expect(() => validateEnvironment({ ...production, DATABASE_URL: pooled })).toThrow(/pgbouncer=true/);
    expect(() => validateEnvironment({ ...production, DATABASE_URL: `${pooled}?pgbouncer=true&connection_limit=1` })).not.toThrow();
    expect(() => validateEnvironment({ ...production, DATABASE_URL: "postgresql://inti:inti@db.example.com:5432/postgres" })).not.toThrow();
  });

  it("acepta Cloudinary con una sola variable CLOUDINARY_URL", () => {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, ...rest } = production;
    void [CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET];
    expect(() => validateEnvironment({ ...rest, CLOUDINARY_URL: "cloudinary://key:secret@demo" })).not.toThrow();
  });

  it.each([
    ["DIRECT_URL", { DIRECT_URL: "" }, /DIRECT_URL/],
    ["AUTH_SECRET corto", { AUTH_SECRET: "corto" }, /AUTH_SECRET/],
    ["ADMIN_EMAIL inválido", { ADMIN_EMAIL: "admin" }, /ADMIN_EMAIL/],
    ["ADMIN_PASSWORD corta", { ADMIN_PASSWORD: "123" }, /ADMIN_PASSWORD/],
    ["FRONTEND_ORIGIN sin https", { FRONTEND_ORIGIN: "http://intinmobiliaria.com" }, /FRONTEND_ORIGIN/],
    ["FRONTEND_ORIGIN con ruta", { FRONTEND_ORIGIN: "https://intinmobiliaria.com/app" }, /FRONTEND_ORIGIN/],
    ["Cloudinary sin secreto", { CLOUDINARY_API_SECRET: "" }, /Cloudinary/],
  ])("en producción rechaza %s", (_name, override, message) => {
    expect(() => validateEnvironment({ ...production, ...override })).toThrow(message);
  });

  it("informa todos los problemas juntos", () => {
    expect(() => validateEnvironment({ NODE_ENV: "production" })).toThrow(/DATABASE_URL[\s\S]*DIRECT_URL[\s\S]*AUTH_SECRET[\s\S]*Cloudinary/);
  });

  it.each([
    ["con el nombre de la variable repetido", "CLOUDINARY_URL=cloudinary://key:secret@demo"],
    ["con otro protocolo", "https://key:secret@demo"],
  ])("rechaza CLOUDINARY_URL %s, incluso en desarrollo", (_name, value) => {
    expect(() => validateEnvironment({ ...development, CLOUDINARY_URL: value })).toThrow(/CLOUDINARY_URL/);
  });

  it("en producción admite varios orígenes separados por comas", () => {
    expect(() => validateEnvironment({ ...production, FRONTEND_ORIGIN: "https://intinmobiliaria.com, https://www.intinmobiliaria.com" })).not.toThrow();
  });
});
