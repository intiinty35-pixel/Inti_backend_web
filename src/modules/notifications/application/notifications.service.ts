import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../infrastructure/persistence/prisma.service";
import { NOTIFICATION_TTL_DAYS, type NotifyInput } from "../notifications.types";

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea un aviso para una persona. Nunca lanza error: un fallo al avisar no debe
   * romper la acción que lo originó (guardar un favorito, enviar una consulta, etc.).
   */
  async notify(input: NotifyInput): Promise<void> {
    const { userId, actorId, type, title, message, actionUrl, entityType, entityId, dedupeHours } = input;
    if (!userId || userId === actorId) return;
    try {
      if (dedupeHours && dedupeHours > 0 && entityId) {
        const since = new Date(Date.now() - dedupeHours * 3_600_000);
        const repeated = await this.prisma.notification.findFirst({
          where: { userId, type, entityId, createdAt: { gte: since } },
          select: { id: true },
        });
        if (repeated) return;
      }
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) return;
      await this.prisma.notification.create({
        data: {
          userId,
          type,
          title: title.slice(0, 200),
          message: message.slice(0, 500),
          actionUrl,
          entityType,
          entityId,
          expiresAt: new Date(Date.now() + NOTIFICATION_TTL_DAYS * 86_400_000),
        },
      });
    } catch (error) {
      this.logger.warn(`No se pudo crear el aviso para ${userId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  list(userId: string, options: { limit?: number; unreadOnly?: boolean } = {}) {
    return this.prisma.notification.findMany({
      where: { userId, ...this.active(), ...(options.unreadOnly ? { isRead: false } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: Math.min(Math.max(options.limit ?? 30, 1), 100),
    });
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({ where: { userId, isRead: false, ...this.active() } });
    return { count };
  }

  async markRead(userId: string, id: string) {
    const { count } = await this.prisma.notification.updateMany({ where: { id, userId, isRead: false }, data: { isRead: true, readAt: new Date() } });
    if (count === 0) {
      const exists = await this.prisma.notification.findFirst({ where: { id, userId }, select: { id: true } });
      if (!exists) throw new NotFoundException("No se encontró este aviso.");
    }
    return this.unreadCount(userId);
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true, readAt: new Date() } });
    return { count: 0 };
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.notification.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException("No se encontró este aviso.");
    return this.unreadCount(userId);
  }

  /** Los avisos vencidos dejan de mostrarse y de contarse. */
  private active() {
    return { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };
  }
}
