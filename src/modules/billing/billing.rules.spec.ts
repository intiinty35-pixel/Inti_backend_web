import { Prisma } from "@prisma/client";
import { paymentAmounts, planPrices, subscriptionPeriod } from "./billing.rules";
import { ManualPaymentProviders } from "./manual-payment.provider";
import { receiptMime } from "./payment-receipts.service";

describe("billing rules", () => {
  it("keeps native USD prices exact and allows free pricing without exchange-rate configuration", () => {
    expect(planPrices(new Prisma.Decimal(10), "USD", null).priceUSD?.toFixed(2)).toBe("10.00");
    expect(planPrices(new Prisma.Decimal(50), "USD", new Prisma.Decimal("6.96")).priceBOB?.toFixed(2)).toBe("348.00");
    expect(planPrices(new Prisma.Decimal(0), "BOB", null).priceUSD?.toFixed(2)).toBe("0.00");
  });
  it("uses decimal arithmetic and rounds only the final currency amount", () => {
    const result = paymentAmounts(new Prisma.Decimal("100"), new Prisma.Decimal("6.96"), "USD");
    expect(result.amount.toFixed(2)).toBe("14.37");
    expect(result.amountBOB.toFixed(2)).toBe("100.00");
    expect(() => paymentAmounts(new Prisma.Decimal("100"), new Prisma.Decimal("0"), "BOB")).toThrow();
  });
  it("extends an early renewal from the current expiration without losing days", () => {
    const now = new Date("2026-11-07T12:00:00Z");
    const period = subscriptionPeriod(now, new Date("2026-11-20T12:00:00Z"));
    expect(period.startsAt.toISOString()).toBe("2026-11-20T12:00:00.000Z");
    expect(period.expiresAt.toISOString()).toBe("2026-12-20T12:00:00.000Z");
    expect(period.status).toBe("PENDING");
  });
  it("starts an expired plan's next period at approval time", () => {
    const now = new Date("2026-11-07T12:00:00Z");
    expect(subscriptionPeriod(now, new Date("2026-10-01")).startsAt).toEqual(now);
    expect(subscriptionPeriod(now).status).toBe("ACTIVE");
  });
  it("rejects incompatible payment currencies and incomplete manual methods", () => {
    const providers = new ManualPaymentProviders();
    const method = { type: "YAPE", isActive: true, currencies: ["BOB"], holder: "Test", phone: "test" } as Parameters<typeof providers.validate>[0];
    expect(() => providers.validate(method, "USD")).toThrow("moneda");
    expect(() => providers.validate({ ...method, phone: "" }, "BOB")).toThrow("completar");
  });
  it("validates receipt extension, real MIME signature and size together", () => {
    const buffer = Buffer.from("%PDF-1.4\n%%EOF");
    expect(receiptMime({ buffer, originalname: "receipt.pdf", mimetype: "application/pdf", size: buffer.length })).toBe("application/pdf");
    expect(() => receiptMime({ buffer, originalname: "receipt.jpg", mimetype: "image/jpeg", size: buffer.length })).toThrow();
    expect(() => receiptMime({ buffer, originalname: "receipt.pdf", mimetype: "application/pdf", size: 9 * 1024 * 1024 })).toThrow();
  });
});
