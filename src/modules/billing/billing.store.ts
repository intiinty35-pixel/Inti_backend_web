import { ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { auditAttributes, auditCategory, auditContext, resourceLabel, sanitizeAudit } from "../audit/audit-context";

export function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function lockBillingUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive || user.accountStatus !== "ACTIVE") throw new ForbiddenException("La cuenta no está habilitada para realizar esta operación.");
  return user;
}

export async function audit(tx: Prisma.TransactionClient, actorId: string, resourceId: string, action: string, userId?: string, before?: unknown, after?: unknown, reason?: string) {
  const context = auditContext.getStore();
  const attributes = auditAttributes(actorId);
  if (!attributes.actorName && actorId !== "SYSTEM") {
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { name: true, email: true, role: true } });
    if (actor) Object.assign(attributes, { actorName: actor.name, actorEmail: actor.email, actorRole: actor.role });
  }
  const subjectName = userId === (context?.request.auth ?? context?.actor)?.id ? (context?.request.auth ?? context?.actor)?.name : context?.subjectId === userId ? context?.subjectName : undefined;
  await tx.billingAudit.create({ data: { actorId, resourceId, action, userId, reason, ...attributes, category: auditCategory(action), subjectName, resourceName: resourceLabel(after) ?? resourceLabel(before) ?? context?.resourceName, ...(before ? { before: json(sanitizeAudit(before)) } : {}), ...(after ? { after: json(sanitizeAudit(after)) } : {}) } });
}

export async function queueEmail(tx: Prisma.TransactionClient, eventKey: string, recipient: string, subject: string, text: string) {
  if (!recipient) return;
  await tx.notificationOutbox.upsert({ where: { eventKey }, create: { eventKey, recipient, subject, text }, update: {} });
}

export async function movePublications(tx: Prisma.TransactionClient, userId: string, subscription: { id: string; maxProperties: number; maxPhotos: number; featuredLimit: number; maxProjects: number }) {
  const properties = await tx.property.findMany({ where: { ownerId: userId, status: { in: ["PUBLISHED", "PENDING_REVIEW"] } }, include: { _count: { select: { media: true } } }, orderBy: { createdAt: "desc" } });
  let used = 0;
  let featured = 0;
  for (const property of properties) {
    if (used >= subscription.maxProperties || property._count.media > subscription.maxPhotos) await tx.property.update({ where: { id: property.id }, data: { status: "PAUSED" } });
    else {
      used++;
      const isFeatured = property.isFeatured && featured++ < subscription.featuredLimit;
      await tx.property.update({ where: { id: property.id }, data: { subscriptionId: subscription.id, isFeatured } });
    }
  }
  const projects = await tx.project.findMany({ where: { ownerId: userId, status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, select: { id: true } });
  for (let index = 0; index < projects.length; index++) await tx.project.update({ where: { id: projects[index].id }, data: index < subscription.maxProjects ? { subscriptionId: subscription.id } : { status: "PAUSED" } });
}
