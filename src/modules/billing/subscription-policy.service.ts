import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { audit, lockBillingUser, queueEmail } from "./billing.store";

@Injectable()
export class SubscriptionPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async active(tx: Prisma.TransactionClient, userId: string) {
    const now = new Date();
    const subscription = await tx.subscription.findFirst({ where: { userId, status: "ACTIVE", startsAt: { lte: now }, expiresAt: { gt: now } } });
    if (!subscription) throw new ForbiddenException("Necesitas una suscripción activa. Contrata o renueva un plan desde Plan y pagos.");
    return subscription;
  }

  async account(userId: string) {
    const subscriptions = await this.prisma.subscription.findMany({ where: { userId }, orderBy: { startsAt: "desc" } });
    const now = new Date();
    const current = subscriptions.find((item) => item.status === "ACTIVE" && item.startsAt <= now && item.expiresAt > now) ?? null;
    const usedProperties = await this.prisma.property.count({ where: { ownerId: userId, status: { in: ["PUBLISHED", "PENDING_REVIEW"] } } });
    const featuredProperties = await this.prisma.property.count({ where: { ownerId: userId, status: { in: ["PUBLISHED", "PENDING_REVIEW"] }, isFeatured: true } });
    const usedProjects = await this.prisma.project.count({ where: { ownerId: userId, status: "PUBLISHED" } });
    return { current, subscriptions, usedProperties, usedProjects, featuredProperties, daysRemaining: current ? Math.max(0, Math.ceil((current.expiresAt.getTime() - now.getTime()) / 86400000)) : 0 };
  }

  async request(propertyId: string, userId: string, featured: boolean) {
    return this.prisma.$transaction(async (tx) => {
      await lockBillingUser(tx, userId);
      const property = await tx.property.findFirst({ where: { id: propertyId, ownerId: userId }, include: { _count: { select: { media: true } } } });
      if (!property) throw new NotFoundException("Propiedad no encontrada.");
      if (!["DRAFT", "PAUSED", "EXPIRED", "REJECTED"].includes(property.status)) throw new ConflictException("La propiedad ya está publicada o pendiente de revisión.");
      const subscription = await this.active(tx, userId);
      await this.checkLimits(tx, propertyId, userId, property._count.media, featured, subscription);
      const result = await tx.property.update({ where: { id: propertyId }, data: { status: "PENDING_REVIEW", subscriptionId: subscription.id, isFeatured: featured } });
      await audit(tx, userId, propertyId, "PUBLICATION_REQUESTED", userId, { status: property.status }, { status: result.status });
      return result;
    }, { timeout: 30000 });
  }

  private async checkLimits(tx: Prisma.TransactionClient, propertyId: string, userId: string, photos: number, featured: boolean, subscription: { maxPhotos: number; maxProperties: number; featuredLimit: number }) {
    if (photos < 1 || photos > subscription.maxPhotos) throw new BadRequestException(`Tu plan permite entre 1 y ${subscription.maxPhotos} fotos por propiedad.`);
    const used = await tx.property.count({ where: { ownerId: userId, id: { not: propertyId }, status: { in: ["PUBLISHED", "PENDING_REVIEW"] } } });
    if (used >= subscription.maxProperties) throw new ForbiddenException(`Alcanzaste el límite de ${subscription.maxProperties} propiedades de tu plan.`);
    if (featured) {
      const count = await tx.property.count({ where: { ownerId: userId, id: { not: propertyId }, status: { in: ["PUBLISHED", "PENDING_REVIEW"] }, isFeatured: true } });
      if (count >= subscription.featuredLimit) throw new ForbiddenException("Tu plan no tiene cupos de publicaciones destacadas disponibles.");
    }
  }

  async approve(propertyId: string, actor: string) {
    return this.prisma.$transaction(async (tx) => {
      const initial = await tx.property.findUnique({ where: { id: propertyId }, select: { ownerId: true } });
      if (!initial?.ownerId) throw new NotFoundException("Propiedad no encontrada.");
      const user = await lockBillingUser(tx, initial.ownerId);
      const property = await tx.property.findUniqueOrThrow({ where: { id: propertyId }, include: { _count: { select: { media: true } } } });
      if (property.status === "PUBLISHED") return property;
      if (property.status !== "PENDING_REVIEW") throw new ConflictException("La propiedad no está pendiente de revisión.");
      const subscription = await this.active(tx, user.id);
      await this.checkLimits(tx, propertyId, user.id, property._count.media, property.isFeatured, subscription);
      const result = await tx.property.update({ where: { id: propertyId }, data: { status: "PUBLISHED", subscriptionId: subscription.id } });
      await audit(tx, actor, propertyId, "PUBLICATION_APPROVED", user.id, { status: property.status }, { status: result.status });
      await queueEmail(tx, `property:${propertyId}:approved:${result.updatedAt.getTime()}`, user.email, "Propiedad publicada", `Tu propiedad «${property.title}» fue aprobada y ya está publicada.`);
      return result;
    }, { timeout: 30000 });
  }

  async reject(propertyId: string, actor: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const property = await tx.property.findUnique({ where: { id: propertyId } });
      if (!property?.ownerId) throw new NotFoundException("Propiedad no encontrada.");
      await lockBillingUser(tx, property.ownerId);
      if (property.status !== "PENDING_REVIEW") throw new ConflictException("Solo puedes rechazar una solicitud pendiente.");
      await tx.property.update({ where: { id: propertyId }, data: { status: "REJECTED" } });
      await audit(tx, actor, propertyId, "PUBLICATION_REJECTED", property.ownerId, { status: property.status }, { status: "REJECTED" }, reason);
      return { status: "REJECTED" };
    });
  }

  async validateEdit(userId: string, propertyId: string, photoCount: number) {
    const property = await this.prisma.property.findFirst({ where: { id: propertyId, ownerId: userId }, select: { status: true } });
    if (property && ["PUBLISHED", "PENDING_REVIEW"].includes(property.status)) {
      const subscription = await this.active(this.prisma, userId);
      if (photoCount > subscription.maxPhotos) throw new ForbiddenException(`Tu plan permite ${subscription.maxPhotos} fotos por propiedad.`);
    }
  }

  async approveProject(projectId: string, actor: string) {
    return this.prisma.$transaction(async (tx) => {
      const initial = await tx.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
      if (!initial?.ownerId) throw new NotFoundException("Proyecto no encontrado.");
      const user = await lockBillingUser(tx, initial.ownerId);
      const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
      if (!["DRAFT", "PAUSED"].includes(project.status)) throw new ConflictException("El proyecto ya está publicado.");
      const subscription = await this.active(tx, user.id);
      const count = await tx.project.count({ where: { ownerId: user.id, status: "PUBLISHED", id: { not: projectId } } });
      if (count >= subscription.maxProjects) throw new ForbiddenException(`Tu plan permite ${subscription.maxProjects} proyectos publicados.`);
      await tx.project.update({ where: { id: projectId }, data: { status: "PUBLISHED", subscriptionId: subscription.id } });
      await audit(tx, actor, projectId, "PROJECT_PUBLICATION_APPROVED", user.id, { status: project.status }, { status: "PUBLISHED", subscriptionId: subscription.id });
    }, { timeout: 30000 });
  }
}
