// Apoyo común de los seeders de demostración (seed-demo y seed-projects).
// Deja todo listo para que los datos se vean en el sitio con un solo comando: crea la cuenta demo si falta,
// le activa una suscripción gratuita vigente y devuelve su identificador para enlazar las publicaciones.
const { randomBytes, scryptSync } = require("node:crypto");

const DEMO_PLAN_DAYS = 365;

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}

/**
 * Contraseña de las cuentas demo que se crean:
 *  - la de DEMO_USERS_PASSWORD, si se definió;
 *  - fuera de producción, la de siempre (IntiDemo2026!);
 *  - en producción, una aleatoria que se muestra una sola vez: nunca queda una clave pública conocida.
 */
function demoPassword() {
  if (process.env.DEMO_USERS_PASSWORD) return { password: process.env.DEMO_USERS_PASSWORD, shown: false };
  if (process.env.NODE_ENV === "production") return { password: randomBytes(9).toString("base64url"), shown: true };
  return { password: "IntiDemo2026!", shown: false };
}

/** Devuelve la cuenta si existe (sin tocar su contraseña) o la crea. */
async function ensureAccount(prisma, { name, email, role }) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) return existing;
  const { password, shown } = demoPassword();
  const created = await prisma.user.create({ data: { name, email: normalizedEmail, role, passwordHash: hashPassword(password) } });
  console.log(`Cuenta demo creada: ${normalizedEmail} (${role}).`);
  if (shown) console.log(`  Contraseña generada (guárdala, no se vuelve a mostrar): ${password}`);
  return created;
}

async function ensureDemoAccounts(prisma) {
  const agent = await ensureAccount(prisma, { name: "Agente Demo", email: process.env.DEMO_AGENT_EMAIL || "agente@inti.local", role: "AGENT" });
  const user = await ensureAccount(prisma, { name: "Usuario Demo", email: process.env.DEMO_USER_EMAIL || "usuario@inti.local", role: "USER" });
  return { agent, user };
}

/**
 * Suscripción gratuita vigente para el dueño. Sin ella, la plataforma no muestra sus publicaciones.
 * Es repetible: vuelve a activarla y renueva su vigencia. Devuelve el id, o null si no existe un plan gratuito.
 */
async function ensureDemoSubscription(prisma, userId) {
  const plan = await prisma.commercialPlan.findFirst({ where: { priceAmount: 0, isActive: true, archivedAt: null }, orderBy: { slot: "asc" } });
  if (!plan) {
    console.warn("Aviso: no hay un plan gratuito activo. Las publicaciones demo no serán visibles hasta que su dueño tenga un plan.");
    return null;
  }
  const limits = {
    maxProperties: Math.max(plan.maxProperties, 10),
    maxProjects: Math.max(plan.maxProjects, 10),
    maxPhotos: Math.max(plan.maxPhotos, 12),
    featuredLimit: Math.max(plan.featuredLimit, 1),
  };
  const startsAt = new Date();
  const expiresAt = new Date(startsAt.getTime() + DEMO_PLAN_DAYS * 86_400_000);
  const planSnapshot = {
    id: plan.id, name: plan.name, description: plan.description, priceBOB: "0.00", priceAmount: "0.00",
    priceCurrency: plan.priceCurrency, durationDays: DEMO_PLAN_DAYS, ...limits, benefits: [],
  };
  const id = `demo-sub-${userId}`;
  const subscription = await prisma.subscription.upsert({
    where: { id },
    update: { status: "ACTIVE", expiresAt },
    create: { id, userId, planId: plan.id, source: "FREE", status: "ACTIVE", startsAt, expiresAt, planName: plan.name, ...limits, planSnapshot },
  });
  return subscription.id;
}

module.exports = { ensureDemoAccounts, ensureDemoSubscription };
