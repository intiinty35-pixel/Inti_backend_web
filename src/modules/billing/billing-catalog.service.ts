import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { BillingSettingsDto, PaymentMethodDto, PlanDto } from "./billing.dto";
import { audit } from "./billing.store";
import { ManualPaymentProviders } from "./manual-payment.provider";
import { ImageStorage, IMAGE_FOLDERS } from "../../shared/image-storage";
import { planPrices } from "./billing.rules";

@Injectable()
export class BillingCatalogService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService, private readonly providers: ManualPaymentProviders, private readonly images: ImageStorage) {}

  async onModuleInit() {
    await this.prisma.$transaction(async (tx) => {
      await tx.billingSettings.upsert({ where: { id: "billing" }, create: { id: "billing" }, update: {} });
      for (const method of [{ type: "YAPE" as const, name: "Yape Bolivia" }, { type: "QR_BCP" as const, name: "QR BCP" }, { type: "BANK_TRANSFER" as const, name: "Transferencia bancaria" }]) {
        await tx.manualPaymentMethod.upsert({ where: { type: method.type }, create: method, update: {} });
      }
    }, { timeout: 30000 });
  }

  async catalog(admin = false) {
    const settings = await this.prisma.billingSettings.findUniqueOrThrow({ where: { id: "billing" } });
    const plans = await this.prisma.commercialPlan.findMany({ where: admin ? {} : { isActive: true, archivedAt: null }, orderBy: [{ displayOrder: "asc" }, { slot: "asc" }] });
    const methods = await this.prisma.manualPaymentMethod.findMany({ where: admin ? {} : { isActive: true }, orderBy: { createdAt: "asc" } });
    return {
      settings,
      plans: plans.map((plan) => ({ ...plan, ...planPrices(plan.priceAmount ?? plan.priceBOB, plan.priceCurrency, settings.bobPerUsd) })),
      methods,
    };
  }

  async updatePlan(id: string, input: PlanDto, actor: string) {
    if (input.featuredLimit > input.maxProperties) throw new BadRequestException("Los destacados no pueden superar el límite de propiedades.");
    const amount = input.priceAmount ?? input.priceBOB;
    if (amount === undefined) throw new BadRequestException("Indica el precio del plan.");
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.commercialPlan.findUnique({ where: { id } });
      if (!before) throw new NotFoundException("Plan no encontrado.");
      if (before.archivedAt) throw new BadRequestException("Restaura el plan antes de editarlo.");
      const { priceBOB: _legacy, priceAmount: _amount, ...fields } = input;
      const result = await tx.commercialPlan.update({ where: { id }, data: { ...fields, priceAmount: new Prisma.Decimal(amount), priceBOB: input.priceCurrency === "BOB" ? new Prisma.Decimal(amount) : null } });
      await audit(tx, actor, id, "PLAN_UPDATED", undefined, before, result);
      return result;
    });
  }

  async visibility(id: string, actor: string, isActive: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.commercialPlan.findUnique({ where: { id } });
      if (!before || before.archivedAt) throw new NotFoundException("Plan no encontrado.");
      if (isActive && !before.priceAmount) throw new BadRequestException("Configura el precio antes de publicar el plan.");
      const result = await tx.commercialPlan.update({ where: { id }, data: { isActive } });
      await audit(tx, actor, id, isActive ? "PLAN_PUBLISHED" : "PLAN_UNPUBLISHED", undefined, before, result);
      return result;
    });
  }

  async archive(id: string, actor: string, restore = false) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.commercialPlan.findUnique({ where: { id } });
      if (!before) throw new NotFoundException("Plan no encontrado.");
      const result = await tx.commercialPlan.update({ where: { id }, data: { archivedAt: restore ? null : new Date(), isActive: false } });
      await audit(tx, actor, id, restore ? "PLAN_RESTORED" : "PLAN_ARCHIVED", undefined, before, result);
      return result;
    });
  }

  async updateSettings(input: BillingSettingsDto, actor: string) {
    if (new Prisma.Decimal(input.bobPerUsd).lte(0)) throw new BadRequestException("El tipo de cambio debe ser mayor que cero.");
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.billingSettings.findUnique({ where: { id: "billing" } });
      const result = await tx.billingSettings.update({ where: { id: "billing" }, data: { bobPerUsd: new Prisma.Decimal(input.bobPerUsd), orderExpiryHours: input.orderExpiryHours } });
      await audit(tx, actor, "billing", "SETTINGS_UPDATED", undefined, before, result);
      return result;
    });
  }

  async updateMethod(id: string, input: PaymentMethodDto, actor: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.manualPaymentMethod.findUnique({ where: { id } });
      if (!before) throw new NotFoundException("Método no encontrado.");
      const data = { ...input, qrImageUrl: input.qrImageUrl ?? "" };
      if (input.isActive) {
        if (!input.currencies.length) throw new BadRequestException("Selecciona al menos una moneda aceptada.");
        this.providers.validate({ ...before, ...data }, input.currencies[0]);
      }
      const result = await tx.manualPaymentMethod.update({ where: { id }, data });
      await audit(tx, actor, id, "PAYMENT_METHOD_UPDATED", undefined, before, result);
      return result;
    });
  }

  async uploadQr(id: string, buffer: Buffer, actor: string) {
    const method = await this.prisma.manualPaymentMethod.findUnique({ where: { id } });
    if (!method) throw new NotFoundException("Método no encontrado.");
    const image = await this.images.save(buffer, IMAGE_FOLDERS.paymentQr);
    if (!image) throw new BadRequestException("Selecciona una imagen JPG, PNG o WEBP válida para el QR.");
    await this.prisma.$transaction(async (tx) => {
      await tx.manualPaymentMethod.update({ where: { id }, data: { qrImageUrl: image.url } });
      await audit(tx, actor, id, "PAYMENT_QR_UPDATED", undefined, { qrImageUrl: method.qrImageUrl }, { qrImageUrl: image.url });
    });
    return { url: image.url };
  }
}
