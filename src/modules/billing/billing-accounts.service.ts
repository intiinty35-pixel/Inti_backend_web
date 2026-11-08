import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { AccountStateDto } from "./billing.dto";
import { audit, queueEmail } from "./billing.store";

@Injectable()
export class BillingAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async detail(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, role: true, isActive: true, accountStatus: true, createdAt: true, properties: { select: { id: true, title: true, status: true } }, subscriptions: { orderBy: { createdAt: "desc" }, take: 50 } } });
    if (!user) throw new NotFoundException("Usuario no encontrado.");
    const history = await this.prisma.billingAudit.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 100 });
    return { ...user, history };
  }

  async change(id: string, actor: string, input: AccountStateDto) {
    if (id === actor) throw new ConflictException("No puedes cambiar el estado de tu propia cuenta.");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
      const before = await tx.user.findUnique({ where: { id } });
      if (!before) throw new NotFoundException("Usuario no encontrado.");
      if (before.role === "ADMINISTRATOR") throw new ConflictException("Gestiona las cuentas administrativas desde el control de administradores.");
      const user = await tx.user.update({ where: { id }, data: { accountStatus: input.status, isActive: input.status === "ACTIVE" } });
      if (input.status !== "ACTIVE") {
        await tx.subscription.updateMany({ where: { userId: id, status: { in: ["ACTIVE", "PENDING"] } }, data: { status: "SUSPENDED" } });
        await tx.property.updateMany({ where: { ownerId: id, status: { in: ["PUBLISHED", "PENDING_REVIEW"] } }, data: { status: "PAUSED" } });
        await tx.project.updateMany({ where: { ownerId: id, status: "PUBLISHED" }, data: { status: "PAUSED" } });
      } else {
        const now = new Date();
        await tx.subscription.updateMany({ where: { userId: id, status: "SUSPENDED", expiresAt: { lte: now } }, data: { status: "EXPIRED" } });
        await tx.subscription.updateMany({ where: { userId: id, status: "SUSPENDED", startsAt: { lte: now }, expiresAt: { gt: now } }, data: { status: "ACTIVE" } });
        await tx.subscription.updateMany({ where: { userId: id, status: "SUSPENDED", startsAt: { gt: now } }, data: { status: "PENDING" } });
      }
      await audit(tx, actor, id, "ACCOUNT_STATUS_CHANGED", id, { status: before.accountStatus, isActive: before.isActive }, { status: user.accountStatus, isActive: user.isActive }, input.reason);
      await queueEmail(tx, `account:${id}:${user.updatedAt.getTime()}`, user.email, input.status === "ACTIVE" ? "Cuenta reactivada" : "Cambio de estado de tu cuenta", `Estado de tu cuenta: ${input.status}. Motivo: ${input.reason}. Tus propiedades y fotos se conservan.`);
      return { id: user.id, accountStatus: user.accountStatus, isActive: user.isActive };
    }, { timeout: 30000 });
  }
}
