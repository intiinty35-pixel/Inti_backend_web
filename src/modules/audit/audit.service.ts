import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { AuthTokenService } from "../auth/auth-token.service";
import { readBearerToken } from "../auth/admin.guard";
import { auditAttributes, auditContext, AuditContext, AuditRequest, resourceLabel, sanitizeAudit } from "./audit-context";
import { AUDIT_CATEGORIES, AuditQueryDto } from "./audit.dto";

export function classifyRequest(request: AuditRequest) {
  const path = (request.originalUrl ?? request.path ?? "").split("?")[0].replace(/^\/api(?=\/|$)/, "");
  let category = "SYSTEM";
  if (/^\/properties/.test(path) || /\/publications\//.test(path)) category = "PROPERTY";
  else if (/^\/projects/.test(path)) category = "PROJECT";
  else if (/^\/users/.test(path) || /\/admin\/users/.test(path)) category = "USER";
  else if (/^\/auth/.test(path)) category = "AUTH";
  else if (/\/plans\/[^/]+\/activate-free/.test(path)) category = "SUBSCRIPTION";
  else if (/\/plans/.test(path)) category = "PLAN";
  else if (/\/methods/.test(path)) category = "PAYMENT_METHOD";
  else if (/\/settings/.test(path)) category = "CONFIG";
  else if (/^\/billing/.test(path)) category = "PAYMENT";
  else if (/^\/inquiries/.test(path)) category = "INQUIRY";
  const verb = ({ GET: "VIEWED", POST: "CREATED", PUT: "UPDATED", PATCH: "UPDATED", DELETE: "DELETED" } as Record<string, string>)[request.method] ?? request.method;
  let action = `${category}_${verb}`;
  if (path === "/auth/login") action = "AUTH_LOGIN";
  if (path === "/auth/logout") action = "AUTH_LOGOUT";
  if (path === "/auth/register") { category = "USER"; action = "USER_REGISTERED"; }
  if (path === "/properties/media") action = "PROPERTY_MEDIA_UPLOADED";
  if (path.includes("/reviews")) action = "PROPERTY_REVIEW_SAVED";
  if (category === "PROJECT" && path.includes("/units")) action = `PROJECT_UNIT_${verb}`;
  if (category === "PROJECT" && path.includes("/comments")) action = `PROJECT_COMMENT_${verb}`;
  if (path.startsWith("/audit")) action = "AUDIT_VIEWED";
  if (category === "PAYMENT" && /\/receipts\//.test(path) && request.method === "GET") action = "PAYMENT_RECEIPT_VIEWED";
  const tracked = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) ||
    (request.method === "GET" && /^\/(users(?:\/|$)|billing\/admin(?:\/|$)|billing\/receipts\/|audit(?:\/[^/]+)?$)/.test(path) && path !== "/audit/options");
  return { category, action, path, tracked };
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  const cleaned = sanitizeAudit(value);
  const text = JSON.stringify(cleaned ?? {});
  return text.length > 64000 ? { truncated: true, preview: text.slice(0, 60000) } : JSON.parse(text) as Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(private readonly prisma: PrismaService, private readonly tokens: AuthTokenService) {}

  async prepare(context: AuditContext, capture = true) {
    const request = context.request;
    if (!classifyRequest(request).tracked) return;
    if (request.auth) context.actor = request.auth;
    else {
      const authorization = request.headers.authorization;
      const payload = await this.tokens.verify(readBearerToken({ headers: { authorization: typeof authorization === "string" ? authorization : undefined } }));
      if (payload) {
        const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, name: true, email: true, role: true } });
        if (user) context.actor = user;
      }
    }
    if (!capture) return;
    const { category, path } = classifyRequest(request);
    const id = request.params?.id ?? request.params?.propertyId;
    let snapshot: Record<string, unknown> | null = null;
    try {
      if (id && category === "PROPERTY") snapshot = await this.prisma.property.findUnique({ where: { id }, include: { location: true, details: true, owner: { select: { name: true, email: true } }, _count: { select: { media: true } } } });
      else if (id && category === "PROJECT") snapshot = await this.prisma.project.findUnique({ where: { id }, include: { owner: { select: { name: true, email: true } }, _count: { select: { units: true, media: true } } } });
      else if (request.params?.unitId) snapshot = await this.prisma.projectUnit.findUnique({ where: { id: request.params.unitId }, include: { project: { select: { name: true, ownerId: true } } } });
      else if (request.params?.commentId) snapshot = await this.prisma.projectComment.findUnique({ where: { id: request.params.commentId }, include: { project: { select: { name: true, ownerId: true } } } });
      else if (id && category === "USER") snapshot = await this.prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, role: true, isActive: true, accountStatus: true } });
      else if (id && (category === "PLAN" || path.includes("/activate-free"))) snapshot = await this.prisma.commercialPlan.findUnique({ where: { id } });
      else if (id && category === "PAYMENT" && path.includes("/orders/")) snapshot = await this.prisma.paymentOrder.findUnique({ where: { id }, include: { user: { select: { name: true, email: true } } } });
      else if (id && category === "PAYMENT_METHOD") snapshot = await this.prisma.manualPaymentMethod.findUnique({ where: { id } });
    } catch { this.logger.warn("No se pudo recuperar el estado anterior para auditoría."); }
    if (snapshot) {
      context.before = snapshot;
      context.resourceName = resourceLabel(snapshot) ?? resourceLabel(snapshot.project);
      context.resourceId = String(snapshot.id);
      context.subjectId = String(snapshot.ownerId ?? snapshot.userId ?? (category === "USER" ? snapshot.id : "")) || undefined;
      context.subjectName = resourceLabel(snapshot.owner ?? snapshot.user) ?? (category === "USER" ? resourceLabel(snapshot) : undefined);
    }
  }

  async record(context: AuditContext, result: unknown, statusCode: number, failed = false, message?: unknown) {
    const request = context.request;
    const route = classifyRequest(request);
    if (!route.tracked) return;
    try {
      const data = result && typeof result === "object" ? result as Record<string, unknown> : {};
      if (route.action === "AUTH_LOGIN" && !failed && typeof data.id === "string") context.actor = { id: data.id, name: String(data.name), email: String(data.email), role: String(data.role) };
      if (route.action === "USER_REGISTERED" && !request.auth && !context.actor && typeof data.id === "string") context.actor = { id: data.id, name: String(data.name), email: String(data.email), role: String(data.role) };
      if (!failed && await this.prisma.billingAudit.count({ where: { requestId: context.requestId } })) {
        await this.prisma.billingAudit.updateMany({ where: { requestId: context.requestId }, data: { statusCode } });
        return;
      }
      const actor = request.auth ?? context.actor;
      const actorId = actor?.id ?? "ANONYMOUS";
      const isRead = request.method === "GET";
      const subjectId = context.subjectId ?? (route.category === "USER" && typeof data.id === "string" ? data.id : typeof data.ownerId === "string" ? data.ownerId : typeof data.userId === "string" ? data.userId : undefined);
      const resourceId = context.resourceId ?? request.params?.id ?? request.params?.propertyId ?? request.params?.unitId ?? request.params?.commentId ?? (typeof data.id === "string" ? data.id : route.path);
      const after = route.category === "AUTH" ? { authenticated: data.authenticated, id: data.id, role: data.role } : result;
      await this.prisma.billingAudit.create({ data: {
        actorId, actorName: actor?.name ?? "Visitante", actorEmail: actor?.email, actorRole: actor?.role ?? "ANONYMOUS",
        ...auditAttributes(actorId), requestId: context.requestId, category: route.category,
        action: `${route.action}${failed ? "_FAILED" : ""}`, resourceId: resourceId.slice(0, 500),
        resourceName: context.resourceName ?? resourceLabel(data), userId: subjectId,
        subjectName: context.subjectName ?? (subjectId === actorId ? actor?.name : route.category === "USER" ? resourceLabel(data) : undefined),
        httpMethod: request.method, path: route.path.slice(0, 500), statusCode, success: !failed && statusCode < 400,
        ...(context.before ? { before: jsonValue(context.before) } : {}), ...(!isRead && !failed && result ? { after: jsonValue(after) } : {}),
        metadata: jsonValue({ parameters: request.params, query: request.query, ...(isRead ? {} : { submitted: request.body }), ...(failed ? { error: message ?? "Acceso u operación rechazados" } : {}) }),
      } });
    } catch { this.logger.error("No se pudo persistir un evento de auditoría del sistema."); }
  }

  async list(query: AuditQueryDto) {
    const asOf = query.asOf && new Date(query.asOf) < new Date() ? new Date(query.asOf) : new Date();
    const end = query.to && new Date(query.to) < asOf ? new Date(query.to) : asOf;
    const and: Prisma.BillingAuditWhereInput[] = [];
    if (query.userId) and.push({ OR: [{ actorId: query.userId }, { userId: query.userId }] });
    if (query.search) and.push({ OR: ["actorName", "actorEmail", "subjectName", "resourceName", "resourceId", "action", "ipAddress", "requestId"].map((field) => ({ [field]: { contains: query.search, mode: "insensitive" } })) });
    const where: Prisma.BillingAuditWhereInput = {
      ...(and.length ? { AND: and } : {}), ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.role ? { actorRole: query.role } : {}), ...(query.category ? { category: query.category } : {}),
      ...(query.action ? { action: query.action } : {}), ...(query.success ? { success: query.success === "true" } : {}),
      createdAt: { lte: end, ...(query.from ? { gte: new Date(query.from) } : {}) },
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.billingAudit.count({ where }),
      this.prisma.billingAudit.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        select: { id: true, actorId: true, actorName: true, actorEmail: true, actorRole: true, userId: true, subjectName: true, category: true, resourceId: true, resourceName: true, action: true, reason: true, ipAddress: true, userAgent: true, device: true, requestId: true, httpMethod: true, path: true, statusCode: true, success: true, createdAt: true } }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize, asOf: asOf.toISOString() };
  }

  async detail(id: string) {
    const event = await this.prisma.billingAudit.findUnique({ where: { id } });
    if (!event) throw new NotFoundException("Evento de auditoría no encontrado.");
    return event;
  }

  async options() {
    const users = await this.prisma.user.findMany({ select: { id: true, name: true, role: true, email: true }, orderBy: { name: "asc" }, take: 500 });
    const actors = await this.prisma.billingAudit.findMany({ distinct: ["actorId"], select: { actorId: true, actorName: true, actorRole: true, actorEmail: true }, orderBy: { createdAt: "desc" }, take: 500 });
    const actions = await this.prisma.billingAudit.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" }, take: 200 });
    const accounts = new Map(users.map((user) => [user.id, user]));
    for (const actor of actors) if (!accounts.has(actor.actorId)) accounts.set(actor.actorId, { id: actor.actorId, name: actor.actorName ?? actor.actorId, role: actor.actorRole ?? "UNKNOWN", email: actor.actorEmail ?? "" });
    return { users: [...accounts.values()], actions: actions.map((item) => item.action), categories: AUDIT_CATEGORIES };
  }
}
