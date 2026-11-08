import { BadRequestException, Injectable } from "@nestjs/common";
import type { ManualPaymentMethod } from "@prisma/client";

export interface PaymentProvider {
  validate(method: ManualPaymentMethod, currency: string): void;
}

class ManualPaymentStrategy implements PaymentProvider {
  constructor(private readonly required: Array<keyof ManualPaymentMethod>) {}
  validate(method: ManualPaymentMethod, currency: string) {
    if (!method.isActive || !method.currencies.includes(currency)) throw new BadRequestException("El método no admite la moneda elegida. Selecciona un método compatible o cambia a BOB.");
    if (this.required.some((field) => typeof method[field] === "string" ? !(method[field] as string).trim() : !method[field])) throw new BadRequestException("El administrador debe completar los datos de este método de pago.");
  }
}

@Injectable()
export class ManualPaymentProviders {
  private readonly providers: Record<string, PaymentProvider> = {
    YAPE: new ManualPaymentStrategy(["holder", "phone"]),
    QR_BCP: new ManualPaymentStrategy(["holder", "qrImageUrl"]),
    BANK_TRANSFER: new ManualPaymentStrategy(["provider", "holder", "accountNumber"]),
  };
  validate(method: ManualPaymentMethod, currency: string) {
    const provider = this.providers[method.type];
    if (!provider) throw new BadRequestException("Proveedor de pago no disponible.");
    provider.validate(method, currency);
  }
}
