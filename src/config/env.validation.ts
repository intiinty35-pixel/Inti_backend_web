type Environment = Record<string, unknown>;

const MIN_SECRET_LENGTH = 32;
const MIN_ADMIN_PASSWORD_LENGTH = 12;

const text = (env: Environment, name: string) => (typeof env[name] === "string" ? (env[name] as string).trim() : "");

/** Cadena de conexión de PostgreSQL; con comillas o sin ellas, ya que depende de cómo se cargue el archivo .env. */
const isPostgresUrl = (value: string) => /^postgres(ql)?:\/\/\S+$/.test(value);

/** El pooler de Supabase en modo transacción (puerto 6543) exige pgbouncer=true; sin él fallan las consultas de forma intermitente. */
const usesPoolerWithoutFlag = (value: string) => /:6543\b/.test(value) && !/[?&]pgbouncer=true\b/.test(value);

/**
 * Revisa la configuración al arrancar. En cualquier entorno exige una base PostgreSQL; en producción exige además
 * todo lo que, si faltara, dejaría la API insegura o sin poder guardar imágenes, para fallar al iniciar y no más tarde.
 */
export function validateEnvironment(env: Environment): Environment {
  const problems: string[] = [];

  if (!isPostgresUrl(text(env, "DATABASE_URL"))) problems.push("DATABASE_URL debe ser una URL de PostgreSQL (postgresql://…).");

  const cloudinaryUrl = text(env, "CLOUDINARY_URL");
  if (cloudinaryUrl && !cloudinaryUrl.startsWith("cloudinary://")) {
    problems.push("CLOUDINARY_URL debe empezar por cloudinary:// (revisa que el valor no repita el nombre de la variable).");
  }

  if (text(env, "NODE_ENV") === "production") {
    if (usesPoolerWithoutFlag(text(env, "DATABASE_URL"))) {
      problems.push("DATABASE_URL usa el pooler de Supabase (puerto 6543): agrega ?pgbouncer=true&connection_limit=1 al final.");
    }
    if (!isPostgresUrl(text(env, "DIRECT_URL"))) problems.push("DIRECT_URL debe ser una URL de PostgreSQL directa o de sesión, para las migraciones.");
    if (text(env, "AUTH_SECRET").length < MIN_SECRET_LENGTH) problems.push(`AUTH_SECRET debe tener al menos ${MIN_SECRET_LENGTH} caracteres.`);
    if (!/^\S+@\S+\.\S+$/.test(text(env, "ADMIN_EMAIL"))) problems.push("ADMIN_EMAIL debe ser un correo válido.");
    if (text(env, "ADMIN_PASSWORD").length < MIN_ADMIN_PASSWORD_LENGTH) {
      problems.push(`ADMIN_PASSWORD debe tener al menos ${MIN_ADMIN_PASSWORD_LENGTH} caracteres.`);
    }

    const origins = text(env, "FRONTEND_ORIGIN").split(",").map((origin) => origin.trim());
    if (origins.some((origin) => !/^https:\/\/[^/\s]+$/.test(origin))) {
      problems.push("FRONTEND_ORIGIN debe ser una o más URL https sin ruta final, separadas por comas (https://intinmobiliaria.com).");
    }

    const hasCloudinaryParts = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].every((name) => text(env, name));
    if (!hasCloudinaryParts && !cloudinaryUrl.startsWith("cloudinary://")) {
      problems.push("Configura Cloudinary con CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET (o CLOUDINARY_URL).");
    }
  }

  if (problems.length > 0) throw new Error(`Configuración inválida:\n- ${problems.join("\n- ")}`);
  return env;
}
