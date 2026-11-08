import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export const DAY_MS = 86_400_000;

export function paymentAmounts(price: Prisma.Decimal, rate: Prisma.Decimal, currency: string) {
  if (price.lte(0) || rate.lte(0)) throw new BadRequestException("Configura un precio y tipo de cambio mayores que cero.");
  const amountBOB = price.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const amountUSD = price.div(rate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const amount = currency === "USD" ? amountUSD : amountBOB;
  if (amountUSD.gt("9999999999.99") || amountBOB.gt("9999999999.99")) throw new BadRequestException("El importe convertido supera el máximo permitido. Revisa el precio y tipo de cambio.");
  if (amount.lte(0)) throw new BadRequestException("El importe convertido debe ser mayor que cero.");
  return { amountBOB, amountUSD, amount, exchangeRate: rate };
}

export interface PlanSnapshot {
  id: string; name: string; description: string; priceBOB: string; durationDays: number;
  maxProperties: number; maxPhotos: number; featuredLimit: number; benefits: string[];
  maxProjects?: number; priceAmount?: string; priceCurrency?: string;
}

export function planPrices(amount: Prisma.Decimal | null, currency: string, rate: Prisma.Decimal | null) {
  if (!amount) return { priceBOB: null, priceUSD: null };
  if (amount.isZero()) return { priceBOB: new Prisma.Decimal(0), priceUSD: new Prisma.Decimal(0) };
  return {
    priceBOB: currency === "BOB" ? amount : rate?.gt(0) ? amount.mul(rate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) : null,
    priceUSD: currency === "USD" ? amount : rate?.gt(0) ? amount.div(rate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) : null,
  };
}

export function subscriptionPeriod(now: Date, previousExpiry?: Date) {
  const startsAt = previousExpiry && previousExpiry > now ? previousExpiry : now;
  return { startsAt, expiresAt: new Date(startsAt.getTime() + 30 * DAY_MS), status: startsAt > now ? "PENDING" as const : "ACTIVE" as const };
}
