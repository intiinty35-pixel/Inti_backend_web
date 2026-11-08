import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { audit, lockBillingUser, queueEmail } from "./billing.store";

export interface ReceiptUpload { originalname: string; mimetype: string; buffer: Buffer; size: number }

export function receiptMime(file: ReceiptUpload) {
  const ext = extname(file.originalname).toLowerCase();
  const mime = file.buffer.subarray(0, 5).toString() === "%PDF-" ? "application/pdf"
    : file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png"
    : file.buffer[0] === 255 && file.buffer[1] === 216 && file.buffer[2] === 255 ? "image/jpeg" : null;
  if (!mime || mime !== file.mimetype || !(mime === "application/pdf" ? ext === ".pdf" : mime === "image/png" ? ext === ".png" : [".jpg", ".jpeg"].includes(ext))) {
    throw new BadRequestException("El comprobante debe ser un JPG, PNG o PDF válido, con extensión y contenido coincidentes.");
  }
  if (!file.size || file.size > 8 * 1024 * 1024) throw new BadRequestException("El comprobante debe pesar entre 1 byte y 8 MB.");
  return mime;
}

@Injectable()
export class PaymentReceiptsService {
  private readonly directory = resolve(process.env.PAYMENT_RECEIPTS_DIR?.trim() || "data/private/payment-receipts");
  constructor(private readonly prisma: PrismaService) {}

  async save(orderId: string, userId: string, file?: ReceiptUpload) {
    if (!file) throw new BadRequestException("Selecciona un comprobante.");
    const mimeType = receiptMime(file);
    const fileKey = randomUUID();
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = resolve(this.directory, fileKey);
    await writeFile(path, file.buffer, { flag: "wx", mode: 0o600 });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await lockBillingUser(tx, userId);
        const order = await tx.paymentOrder.findFirst({ where: { id: orderId, userId } });
        if (!order) throw new NotFoundException("Orden no encontrada.");
        if (!["PENDING", "REJECTED"].includes(order.status) || order.expiresAt <= new Date()) throw new ConflictException("La orden no admite comprobantes o ya venció. Revisa su estado o crea una nueva.");
        if (await tx.paymentReceipt.count({ where: { orderId } }) >= 20) throw new BadRequestException("Alcanzaste el límite de reenvíos de esta orden. Consulta al administrador.");
        const receipt = await tx.paymentReceipt.create({ data: { orderId, fileKey, originalName: file.originalname.slice(0, 200), mimeType, size: file.size } });
        await tx.paymentOrder.update({ where: { id: orderId }, data: { status: "UNDER_REVIEW", rejectionReason: null } });
        await audit(tx, userId, orderId, "RECEIPT_RECEIVED", userId, { status: order.status }, { status: "UNDER_REVIEW", receiptId: receipt.id });
        const plan = order.planSnapshot as { name?: string };
        await queueEmail(tx, `receipt:${receipt.id}:user`, user.email, "Comprobante recibido", `Recibimos tu comprobante de la orden ${order.number}. El pago está en revisión; tu plan todavía no está activado.`);
        await queueEmail(tx, `receipt:${receipt.id}:admin`, process.env.BILLING_ADMIN_EMAIL?.trim() || process.env.ADMIN_EMAIL || "", "Pago pendiente de revisión", `Usuario: ${user.name}\nCorreo: ${user.email}\nPlan: ${plan.name}\nImporte: ${order.amount} ${order.currency}\nOrden: ${order.number}\nMétodo: ${(order.methodSnapshot as { name?: string }).name}\nRevisa el comprobante en ${process.env.FRONTEND_PUBLIC_URL?.trim() || "http://localhost:3000"}/admin/pagos. Debes iniciar sesión como administrador.`);
        return { id: receipt.id, originalName: receipt.originalName, mimeType, size: receipt.size, status: "UNDER_REVIEW" };
      }, { timeout: 30000 });
    } catch (error) { await unlink(path).catch(() => undefined); throw error; }
  }

  async read(id: string, userId?: string) {
    const receipt = await this.prisma.paymentReceipt.findFirst({ where: { id, ...(userId ? { order: { userId } } : {}) } });
    if (!receipt || !/^[a-f0-9-]{36}$/.test(receipt.fileKey)) throw new NotFoundException("Comprobante no encontrado.");
    try { return { buffer: await readFile(resolve(this.directory, receipt.fileKey)), mimeType: receipt.mimeType, originalName: receipt.originalName }; }
    catch { throw new NotFoundException("El archivo del comprobante no está disponible. Contacta al administrador."); }
  }
}
