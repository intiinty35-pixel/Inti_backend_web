const { PrismaClient } = require("@prisma/client");
const { randomBytes, scryptSync } = require("node:crypto");

if (process.env.NODE_ENV === "production") {
  throw new Error("Las cuentas demo solo se pueden crear fuera de producción.");
}

const prisma = new PrismaClient();
const demoPassword = process.env.DEMO_USERS_PASSWORD || "IntiDemo2026!";

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}

async function seedUser({ name, email, password, role }) {
  const normalizedEmail = email.trim().toLowerCase();
  await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: { name, role, isActive: true, passwordHash: hashPassword(password) },
    create: { name, email: normalizedEmail, role, passwordHash: hashPassword(password) },
  });
}

async function main() {
  await seedUser({
    name: "Agente Demo",
    email: process.env.DEMO_AGENT_EMAIL || "agente@inti.local",
    password: demoPassword,
    role: "AGENT",
  });
  await seedUser({
    name: "Usuario Demo",
    email: process.env.DEMO_USER_EMAIL || "usuario@inti.local",
    password: demoPassword,
    role: "USER",
  });

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    await seedUser({ name: "Administrador", email: adminEmail, password: adminPassword, role: "ADMINISTRATOR" });
    console.log(`Cuenta administradora sincronizada: ${adminEmail}`);
  } else {
    console.log("No se encontró ADMIN_EMAIL y ADMIN_PASSWORD; se conserva el inicio admin configurado por entorno.");
  }

  console.log("Cuentas demo creadas: agente@inti.local y usuario@inti.local.");
  console.log(process.env.DEMO_USERS_PASSWORD
    ? "La contraseña demo se definió mediante DEMO_USERS_PASSWORD."
    : "Contraseña demo para agente y usuario: IntiDemo2026! (cámbiala con DEMO_USERS_PASSWORD antes de sembrar).");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
