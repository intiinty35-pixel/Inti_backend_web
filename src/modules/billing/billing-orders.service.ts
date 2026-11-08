import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { BillingQueryDto, CreateOrderDto, ReviewPaymentDto } from "./billing.dto";
import { paymentAmounts, planPrices, PlanSnapshot, subscriptionPeriod } from "./billing.rules";
import { audit, json, lockBillingUser, movePublications, queueEmail } from "./billing.store";
import { ManualPaymentProviders } from "./manual-payment.provider";

const orderInclude = {
  user: { select: { id: true, name: true, email: true } },
  receipts: { select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true }, orderBy: { createdAt: "desc" as const } },
  subscription: true,
} satisfies Prisma.PaymentOrderInclude;

@Injectable()
export class BillingOrdersService {
  constructor(private readonly prisma: PrismaService, private readonly providers: ManualPaymentProviders) {}

  async create(userId: string, input: CreateOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const user = await lockBillingUser(tx, userId);
      const plan = await tx.commercialPlan.findFirst({ where: { id: input.planId, isActive: true, archivedAt: null } });
      const method = await tx.manualPaymentMethod.findUnique({ where: { id: input.methodId } });
      const settings = await tx.billingSettings.findUniqueOrThrow({ where: { id: "billing" } });
      if (!plan?.priceAmount || !method) throw new BadRequestException("Selecciona un plan y método de pago activos.");
      if (plan.priceAmount.isZero()) throw new BadRequestException("Este plan es gratuito. Actívalo sin crear una orden de pago.");
      if (!settings.bobPerUsd) throw new BadRequestException("El administrador debe configurar el tipo de cambio.");
      this.providers.validate(method, input.currency);
      const incompatible = await tx.subscription.findFirst({ where: { userId, source: { not: "FREE" }, status: { in: ["ACTIVE", "PENDING"] }, expiresAt: { gt: new Date() }, planId: { not: plan.id } } });
      if (incompatible) throw new ConflictException("Tienes un plan vigente distinto. Puedes renovarlo o esperar su vencimiento para cambiarlo.");
      const pending = await tx.paymentOrder.findFirst({ where: { userId, OR: [{ status: "UNDER_REVIEW" }, { status: "PENDING", expiresAt: { gt: new Date() } }] } });
      if (pending) throw new ConflictException(`Ya tienes una orden pendiente: ${pending.number}. Revísala o cancélala antes de crear otra.`);
      const prices = planPrices(plan.priceAmount, plan.priceCurrency, settings.bobPerUsd);
      const amounts = paymentAmounts(prices.priceBOB!, settings.bobPerUsd, input.currency);
      if (plan.priceCurrency === "USD") { amounts.amountUSD = plan.priceAmount; amounts.amount = input.currency === "USD" ? plan.priceAmount : amounts.amountBOB; }
      const snapshot: PlanSnapshot = { id: plan.id, name: plan.name, description: plan.description, priceBOB: prices.priceBOB!.toFixed(2), priceAmount: plan.priceAmount.toFixed(2), priceCurrency: plan.priceCurrency, durationDays: 30, maxProperties: plan.maxProperties, maxProjects: plan.maxProjects, maxPhotos: plan.maxPhotos, featuredLimit: plan.featuredLimit, benefits: plan.benefits };
      const order = await tx.paymentOrder.create({ data: {
        number: `INTI-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`,
        userId, planId: plan.id, methodId: method.id, currency: input.currency,
        ...amounts,
        planSnapshot: json(snapshot), methodSnapshot: json(method),
        expiresAt: new Date(Date.now() + settings.orderExpiryHours * 3600000),
      } });
      await audit(tx, userId, order.id, "ORDER_CREATED", userId, undefined, order);
      await queueEmail(tx, `order:${order.id}:created`, user.email, "Orden de pago creada", `Orden ${order.number}: ${plan.name}. Transfiere exactamente ${order.amount} ${order.currency}. Consulta las instrucciones y adjunta el comprobante en tu cuenta.`);
      return order;
    }, { timeout: 30000 });
  }

  async list(query: BillingQueryDto, userId?: string) {
    const where: Prisma.PaymentOrderWhereInput = {
      ...(userId || query.userId ? { userId: userId ?? query.userId } : {}),
      ...(query.status ? { status: query.status } : {}), ...(query.currency ? { currency: query.currency } : {}),
      ...(query.planId ? { planId: query.planId } : {}), ...(query.methodId ? { methodId: query.methodId } : {}),
      ...(query.search ? { number: { contains: query.search, mode: "insensitive" } } : {}),
      ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: new Date(`${query.from}T00:00:00Z`) } : {}), ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}) } } : {}),
    };
    const total = await this.prisma.paymentOrder.count({ where });
    const items = await this.prisma.paymentOrder.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: orderInclude });
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async detail(id: string, userId?: string) {
    const order = await this.prisma.paymentOrder.findFirst({ where: { id, ...(userId ? { userId } : {}) }, include: orderInclude });
    if (!order) throw new NotFoundException("Orden no encontrada.");
    const history = await this.prisma.billingAudit.findMany({ where: { resourceId: id }, orderBy: { createdAt: "asc" } });
    return { ...order, history: history.map(({ id, action, reason, createdAt }) => ({ id, action, reason, createdAt })) };
  }

  async cancel(id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockBillingUser(tx, userId);
      const changed = await tx.paymentOrder.updateMany({ where: { id, userId, status: { in: ["PENDING", "REJECTED"] } }, data: { status: "CANCELLED" } });
      if (!changed.count) throw new ConflictException("Solo puedes cancelar órdenes pendientes o rechazadas.");
      await audit(tx, userId, id, "ORDER_CANCELLED", userId);
      return { status: "CANCELLED" };
    });
  }

  async review(id: string, actor: string, input: ReviewPaymentDto) {
    return this.prisma.$transaction(async (tx) => {
      const initial = await tx.paymentOrder.findUnique({ where: { id } });
      if (!initial) throw new NotFoundException("Orden no encontrada.");
      const user = await lockBillingUser(tx, initial.userId);
      await tx.$queryRaw`SELECT id FROM payment_orders WHERE id = ${id} FOR UPDATE`;
      const order = await tx.paymentOrder.findUniqueOrThrow({ where: { id }, include: { subscription: true, receipts: { select: { id: true } } } });
      if (order.status === "APPROVED" && input.action === "APPROVE") return order;
      if (order.status !== "UNDER_REVIEW" || !order.receipts.length) throw new ConflictException("La orden debe tener un comprobante y estar en revisión.");
      if (input.action === "REJECT") {
        if (!input.reason?.trim() || input.reason.trim().length < 3) throw new BadRequestException("Indica el motivo del rechazo.");
        const result = await tx.paymentOrder.update({ where: { id }, data: { status: "REJECTED", rejectionReason: input.reason.trim(), reviewedAt: new Date(), reviewedBy: actor } });
        await audit(tx, actor, id, "PAYMENT_REJECTED", user.id, { status: order.status }, { status: result.status }, input.reason.trim());
        await queueEmail(tx, `order:${id}:rejected:${result.updatedAt.getTime()}`, user.email, "Pago rechazado", `Orden ${order.number}: ${input.reason.trim()}. Puedes revisar y reenviar tu comprobante desde tu cuenta mientras la orden esté vigente.`);
        return result;
      }
      const existing = await tx.subscription.findFirst({ where: { userId: user.id, status: { in: ["ACTIVE", "PENDING"] }, expiresAt: { gt: new Date() } }, orderBy: { expiresAt: "desc" } });
      if (existing && existing.source !== "FREE" && existing.planId !== order.planId) throw new ConflictException("El usuario tiene una suscripción incompatible vigente.");
      if (existing?.source === "FREE") await tx.subscription.updateMany({ where: { userId: user.id, source: "FREE", status: { in: ["ACTIVE", "PENDING"] } }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      const snapshot = order.planSnapshot as unknown as PlanSnapshot;
      await tx.subscription.updateMany({ where: { userId: user.id, status: "ACTIVE", expiresAt: { lte: new Date() } }, data: { status: "EXPIRED" } });
      const period = subscriptionPeriod(new Date(), existing?.source === "FREE" ? undefined : existing?.expiresAt);
      const subscription = await tx.subscription.create({ data: {
        userId: user.id, planId: order.planId, orderId: id, ...period,
        planName: snapshot.name, maxProperties: snapshot.maxProperties, maxPhotos: snapshot.maxPhotos,
        featuredLimit: snapshot.featuredLimit, planSnapshot: json(snapshot),
        maxProjects: snapshot.maxProjects ?? 0,
      } });
      if (existing?.source === "FREE") await movePublications(tx, user.id, subscription);
      const result = await tx.paymentOrder.update({ where: { id }, data: { status: "APPROVED", reviewedAt: new Date(), reviewedBy: actor, rejectionReason: null } });
      await audit(tx, actor, id, "PAYMENT_APPROVED", user.id, { status: order.status }, { status: result.status, subscriptionId: subscription.id, subscriptionPeriod: period });
      await queueEmail(tx, `order:${id}:approved`, user.email, "Pago aprobado y suscripción confirmada", `Orden ${order.number}: ${snapshot.name}. Vigencia: ${period.startsAt.toISOString()} hasta ${period.expiresAt.toISOString()}. ${period.status === "PENDING" ? "La renovación comenzará al vencer tu período actual." : "Tu suscripción está activa; ya puedes solicitar la publicación de tus propiedades."}`);
      return { ...result, subscription };
    }, { timeout: 30000 });
  }

  async activateFree(userId: string, planId: string) {
    return this.prisma.$transaction(async (tx) => {
      const user = await lockBillingUser(tx, userId);
      const plan = await tx.commercialPlan.findFirst({ where: { id: planId, isActive: true, archivedAt: null, priceAmount: 0 } });
      if (!plan) throw new BadRequestException("Este plan gratuito no está disponible.");
      const existing = await tx.subscription.findFirst({ where: { userId, status: { in: ["ACTIVE", "PENDING"] }, expiresAt: { gt: new Date() } } });
      if (existing) throw new ConflictException("Ya tienes un plan vigente o una renovación programada.");
      await tx.subscription.updateMany({ where: { userId, status: "ACTIVE", expiresAt: { lte: new Date() } }, data: { status: "EXPIRED" } });
      const snapshot: PlanSnapshot = { id: plan.id, name: plan.name, description: plan.description, priceBOB: "0.00", priceAmount: "0.00", priceCurrency: plan.priceCurrency, durationDays: 30, maxProperties: plan.maxProperties, maxProjects: plan.maxProjects, maxPhotos: plan.maxPhotos, featuredLimit: plan.featuredLimit, benefits: plan.benefits };
      const period = subscriptionPeriod(new Date());
      const settings = await tx.billingSettings.findUniqueOrThrow({ where: { id: "billing" } });
      const method = await tx.manualPaymentMethod.findFirst({ orderBy: { createdAt: "asc" } });
      if (!method) throw new BadRequestException("No hay métodos de pago configurados para registrar la orden.");
      const order = await tx.paymentOrder.create({ data: {
        number: `INTI-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`,
        userId, planId: plan.id, methodId: method.id, status: "APPROVED", currency: "BOB",
        amountBOB: 0, amountUSD: 0, amount: 0, exchangeRate: settings.bobPerUsd ?? 0,
        planSnapshot: json(snapshot),
        methodSnapshot: json({ name: "Plan gratuito", type: "FREE", provider: "", holder: "", phone: "", accountNumber: "", bankCode: "", qrImageUrl: "", currencies: ["BOB"], instructions: "Este plan se activó sin costo. No se requiere pago ni comprobante." }),
        reviewedAt: new Date(), reviewedBy: "system",
        expiresAt: period.expiresAt,
      } });
      await audit(tx, userId, order.id, "ORDER_CREATED", userId, undefined, order);
      const result = await tx.subscription.create({ data: { userId, planId, orderId: order.id, source: "FREE", ...period, planName: plan.name, maxProperties: plan.maxProperties, maxProjects: plan.maxProjects, maxPhotos: plan.maxPhotos, featuredLimit: plan.featuredLimit, planSnapshot: json(snapshot) } });
      await audit(tx, userId, result.id, "FREE_PLAN_ACTIVATED", userId, undefined, result);
      await queueEmail(tx, `subscription:${result.id}:free`, user.email, "Plan gratuito activado", `${plan.name} está activo durante 30 días, hasta ${result.expiresAt.toISOString()}. Puedes solicitar la publicación de tu propiedad para revisión.`);
      return result;
    }, { timeout: 30000 });
  }

  async dashboard(query: BillingQueryDto) {
    const where: Prisma.PaymentOrderWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}), ...(query.planId ? { planId: query.planId } : {}),
      ...(query.methodId ? { methodId: query.methodId } : {}), ...(query.currency ? { currency: query.currency } : {}),
      ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: new Date(`${query.from}T00:00:00Z`) } : {}), ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}) } } : {}),
    };
    const statuses = await this.prisma.paymentOrder.groupBy({ by: ["status"], where, _count: { _all: true } });
    const income = await this.prisma.paymentOrder.groupBy({ by: ["currency"], where: { ...where, status: "APPROVED" }, _sum: { amount: true, amountBOB: true } });
    return { statuses, income };
  }
}
