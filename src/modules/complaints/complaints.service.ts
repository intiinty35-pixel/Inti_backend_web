import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { ComplaintAttachment, ComplaintBookEntry } from "@prisma/client";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import type { CreateComplaintDto, ComplaintListQueryDto } from "./complaints.dto";

export interface ComplaintUpload { originalname: string; mimetype: string; buffer: Buffer; size: number }
type ComplaintWithAttachments = ComplaintBookEntry & { attachments: ComplaintAttachment[] };

export function complaintAttachmentMime(file: ComplaintUpload) {
  const extension = extname(file.originalname).toLowerCase();
  const mimeType = file.buffer.subarray(0, 5).toString() === "%PDF-"
    ? "application/pdf"
    : file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? "image/png"
      : file.buffer[0] === 255 && file.buffer[1] === 216 && file.buffer[2] === 255
        ? "image/jpeg"
        : file.buffer.toString("ascii", 0, 4) === "RIFF" && file.buffer.toString("ascii", 8, 12) === "WEBP"
          ? "image/webp"
          : null;
  const allowedExtension = mimeType === "application/pdf" ? extension === ".pdf"
    : mimeType === "image/png" ? extension === ".png"
      : mimeType === "image/jpeg" ? [".jpg", ".jpeg"].includes(extension)
        : mimeType === "image/webp" ? extension === ".webp" : false;
  if (!mimeType || mimeType !== file.mimetype || !allowedExtension) {
    throw new BadRequestException("Cada adjunto debe ser un JPG, PNG, WEBP o PDF válido, con extensión y contenido coincidentes.");
  }
  if (!file.size || file.size > 5 * 1024 * 1024) throw new BadRequestException("Cada adjunto debe pesar entre 1 byte y 5 MB.");
  return mimeType;
}

@Injectable()
export class ComplaintsService {
  private readonly logger = new Logger(ComplaintsService.name);
  private readonly attachmentsDirectory = resolve(process.env.COMPLAINT_ATTACHMENTS_DIR?.trim() || "data/private/complaint-attachments");

  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateComplaintDto, uploads: ComplaintUpload[] = []) {
    if (uploads.length > 5) throw new BadRequestException("Puedes adjuntar hasta 5 archivos.");
    const storedFiles = uploads.map((file) => ({ file, mimeType: complaintAttachmentMime(file), fileKey: randomUUID() }));
    await mkdir(this.attachmentsDirectory, { recursive: true, mode: 0o700 });
    const writtenPaths: string[] = [];
    try {
      for (const { file, fileKey } of storedFiles) {
        const path = resolve(this.attachmentsDirectory, fileKey);
        await writeFile(path, file.buffer, { flag: "wx", mode: 0o600 });
        writtenPaths.push(path);
      }
      const entry = await this.prisma.complaintBookEntry.create({
        data: {
          ticketNumber: `INTI-${new Date().getFullYear()}-${randomBytes(5).toString("hex").toUpperCase()}`,
          claimantFirstName: input.claimantFirstName.trim(),
          claimantLastName: input.claimantLastName.trim(),
          claimantEmail: input.claimantEmail.trim().toLowerCase(),
          claimantPhone: input.claimantPhone.trim(),
          documentType: input.documentType,
          documentNumber: input.documentNumber?.trim() || null,
          department: input.department,
          municipality: input.municipality.trim(),
          address: input.address.trim(),
          entryType: input.entryType,
          serviceDescription: input.serviceDescription.trim(),
          transactionNumber: input.transactionNumber?.trim() || null,
          incidentDate: new Date(`${input.incidentDate}T00:00:00.000Z`),
          detail: input.detail.trim(),
          desiredResolution: input.desiredResolution?.trim() || null,
          attachments: {
            create: storedFiles.map(({ file, mimeType, fileKey }) => ({
              fileKey,
              originalName: basename(file.originalname).slice(0, 200),
              mimeType,
              size: file.size,
            })),
          },
        },
        include: { attachments: true },
      });
      return this.toResponse(entry);
    } catch (error) {
      await Promise.all(writtenPaths.map(async (path) => {
        try { await unlink(path); }
        catch (cleanupError) { this.logger.warn(`No se pudo limpiar un adjunto temporal del reclamo: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`); }
      }));
      throw error;
    }
  }

  async list(query: ComplaintListQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [total, entries] = await Promise.all([
      this.prisma.complaintBookEntry.count(),
      this.prisma.complaintBookEntry.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { attachments: true },
      }),
    ]);
    return { items: entries.map((entry) => this.toResponse(entry)), total, page, pageSize };
  }

  async detail(id: string) {
    const entry = await this.prisma.complaintBookEntry.findUnique({ where: { id }, include: { attachments: true } });
    if (!entry) throw new NotFoundException("No se encontró el reclamo.");
    return this.toResponse(entry);
  }

  async readAttachment(complaintId: string, id: string) {
    const attachment = await this.prisma.complaintAttachment.findFirst({ where: { id, complaintId } });
    if (!attachment || !/^[0-9a-f-]{36}$/i.test(attachment.fileKey)) throw new NotFoundException("No se encontró el documento adjunto.");
    try {
      return { buffer: await readFile(resolve(this.attachmentsDirectory, attachment.fileKey)), mimeType: attachment.mimeType, originalName: attachment.originalName };
    } catch (error) {
      this.logger.error(`No se pudo leer el adjunto ${id}: ${error instanceof Error ? error.message : String(error)}`);
      throw new NotFoundException("El documento adjunto no está disponible. Contacta al administrador.");
    }
  }

  private toResponse(entry: ComplaintWithAttachments) {
    return {
      id: entry.id,
      ticketNumber: entry.ticketNumber,
      claimantFirstName: entry.claimantFirstName,
      claimantLastName: entry.claimantLastName,
      claimantEmail: entry.claimantEmail,
      claimantPhone: entry.claimantPhone,
      documentType: entry.documentType,
      documentNumber: entry.documentNumber,
      department: entry.department,
      municipality: entry.municipality,
      address: entry.address,
      entryType: entry.entryType,
      serviceDescription: entry.serviceDescription,
      transactionNumber: entry.transactionNumber,
      incidentDate: entry.incidentDate?.toISOString().slice(0, 10) ?? null,
      detail: entry.detail,
      desiredResolution: entry.desiredResolution,
      createdAt: entry.createdAt.toISOString(),
      attachments: entry.attachments.map(({ id, originalName, mimeType, size }) => ({ id, originalName, mimeType, size })),
    };
  }
}
