import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { audit, movePublications, queueEmail } from "./billing.store";
import { DAY_MS } from "./billing.rules";
import { createTransport } from "nodemailer";

@Injectable()
export class BillingMaintenanceService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(BillingMaintenanceService.name);
  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    if (process.env.BILLING_JOBS_DISABLED === "true") return;
    this.timer = setInterval(() => void this.run(), 60000);
    this.timer.unref();
    void this.run();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async run() {
    if (this.running) return;
    this.running = true;
    try {
      await this.expire();
      await this.deliver();
    } catch (error) { this.logger.error(error instanceof Error ? error.message : "Error en mantenimiento de pagos"); }
    finally { this.running = false; }
  }

  async expire() {
    return this.prisma.$transaction(async (tx) => {
      const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(830122) AS locked`;
      if (!lock.locked) return;
      const now = new Date();
      const expiredOrders = await tx.paymentOrder.findMany({ where: { status: { in: ["PENDING", "REJECTED"] }, expiresAt: { lte: now } }, take: 100 });
      for (const order of expiredOrders) {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${order.userId} FOR UPDATE`;
        const result = await tx.paymentOrder.updateMany({ where: { id: order.id, status: { in: ["PENDING", "REJECTED"] }, expiresAt: { lte: now } }, data: { status: "EXPIRED" } });
        if (result.count) await audit(tx, "SYSTEM", order.id, "ORDER_EXPIRED", order.userId);
      }
      const expired = await tx.subscription.findMany({ where: { status: { in: ["ACTIVE", "PENDING"] }, expiresAt: { lte: now } }, include: { user: { select: { email: true } } }, take: 100 });
      for (const item of expired) {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${item.userId} FOR UPDATE`;
        const changed = await tx.subscription.updateMany({ where: { id: item.id, status: { in: ["ACTIVE", "PENDING"] } }, data: { status: "EXPIRED" } });
        if (!changed.count) continue;
        await audit(tx, "SYSTEM", item.id, "SUBSCRIPTION_EXPIRED", item.userId);
        await queueEmail(tx, `subscription:${item.id}:expired`, item.user.email, "Tu suscripción venció", `El período de ${item.planName} terminó. Las propiedades y fotos se conservan; si no hay renovación vigente, las publicaciones se pausarán.`);
      }
      const starting = await tx.subscription.findMany({ where: { status: "PENDING", startsAt: { lte: now }, expiresAt: { gt: now }, user: { isActive: true, accountStatus: "ACTIVE" } }, include: { user: { select: { email: true } } }, take: 100 });
      for (const item of starting) {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${item.userId} FOR UPDATE`;
        const competing = await tx.subscription.findFirst({ where: { userId: item.userId, status: "ACTIVE", expiresAt: { gt: now } } });
        if (competing) continue;
        const activated = await tx.subscription.updateMany({ where: { id: item.id, status: "PENDING" }, data: { status: "ACTIVE" } });
        if (activated.count) {
          await audit(tx, "SYSTEM", item.id, "SUBSCRIPTION_ACTIVATED", item.userId);
          await queueEmail(tx, `subscription:${item.id}:activated`, item.user.email, "Suscripción activada", `${item.planName} está activo hasta ${item.expiresAt.toISOString()}.`);
          await movePublications(tx, item.userId, item);
        }
      }
      const expiredLinks = await tx.property.findMany({ where: { status: { in: ["PUBLISHED", "PENDING_REVIEW"] }, subscriptionId: { not: null }, subscription: { OR: [{ status: { not: "ACTIVE" } }, { expiresAt: { lte: now } }] } }, select: { id: true, ownerId: true }, take: 200 });
      for (const property of expiredLinks) {
        await tx.property.update({ where: { id: property.id }, data: { status: "PAUSED" } });
        await audit(tx, "SYSTEM", property.id, "PUBLICATION_PAUSED_EXPIRED", property.ownerId ?? undefined);
      }
      const reminders = await tx.subscription.findMany({ where: { status: "ACTIVE", expiresAt: { gt: now, lte: new Date(now.getTime() + 3 * DAY_MS) } }, include: { user: { select: { email: true } } }, take: 200 });
      const expiredProjects = await tx.project.findMany({ where: { status: "PUBLISHED", subscriptionId: { not: null }, subscription: { OR: [{ status: { not: "ACTIVE" } }, { expiresAt: { lte: now } }] } }, select: { id: true, ownerId: true }, take: 200 });
      for (const project of expiredProjects) {
        await tx.project.update({ where: { id: project.id }, data: { status: "PAUSED" } });
        await audit(tx, "SYSTEM", project.id, "PROJECT_PAUSED_EXPIRED", project.ownerId ?? undefined);
      }
      for (const item of reminders) await queueEmail(tx, `subscription:${item.id}:reminder`, item.user.email, "Tu plan está por vencer", `${item.planName} vence el ${item.expiresAt.toISOString()}. Puedes renovar desde Plan y pagos para extender la vigencia sin perder días.`);
    }, { timeout: 60000, maxWait: 10000 });
  }

  async deliver() {
    if (!process.env.SMTP_URL || !process.env.SMTP_FROM) return;
    const now = new Date();
    await this.prisma.notificationOutbox.updateMany({ where: { status: "SENDING", lockedAt: { lt: new Date(now.getTime() - 5 * 60000) } }, data: { status: "PENDING", lockedAt: null } });
    const messages = await this.prisma.notificationOutbox.findMany({ where: { status: "PENDING", nextAttemptAt: { lte: now } }, take: 10, orderBy: { createdAt: "asc" } });
    const smtp = new URL(process.env.SMTP_URL);
    smtp.searchParams.set("connectionTimeout", "10000");
    smtp.searchParams.set("greetingTimeout", "10000");
    smtp.searchParams.set("socketTimeout", "15000");
    if (process.env.NODE_ENV === "production") smtp.searchParams.set("requireTLS", "true");
    const transport = createTransport(smtp.toString(), { from: process.env.SMTP_FROM, disableFileAccess: true, disableUrlAccess: true });
    for (const message of messages) {
      const claim = await this.prisma.notificationOutbox.updateMany({ where: { id: message.id, status: "PENDING" }, data: { status: "SENDING", lockedAt: new Date(), attempts: { increment: 1 } } });
      if (!claim.count) continue;
      try {
        await transport.sendMail({ to: message.recipient, subject: message.subject, text: message.text, messageId: `<${message.id}@inti-notifications>` });
        await this.prisma.notificationOutbox.update({ where: { id: message.id }, data: { status: "SENT", sentAt: new Date(), lockedAt: null, lastError: null } });
      } catch {
        await this.prisma.notificationOutbox.update({ where: { id: message.id }, data: { status: "PENDING", lockedAt: null, lastError: "No se pudo entregar el correo. Revisa la configuración SMTP.", nextAttemptAt: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(message.attempts, 6))) } });
      }
    }
    transport.close();
  }
}
