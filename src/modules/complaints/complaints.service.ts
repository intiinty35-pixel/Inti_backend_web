import { Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { ComplaintBookEntry } from "@prisma/client";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import type { CreateComplaintDto, ComplaintListQueryDto } from "./complaints.dto";

@Injectable()
export class ComplaintsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateComplaintDto) {
    const entry = await this.prisma.complaintBookEntry.create({
      data: {
        ticketNumber: `INTI-${new Date().getFullYear()}-${randomBytes(5).toString("hex").toUpperCase()}`,
        claimantName: input.claimantName.trim(),
        claimantEmail: input.claimantEmail.trim().toLowerCase(),
        claimantPhone: input.claimantPhone.trim(),
        documentNumber: input.documentNumber?.trim() || null,
        entryType: input.entryType,
        serviceDescription: input.serviceDescription.trim(),
        detail: input.detail.trim(),
        desiredResolution: input.desiredResolution?.trim() || null,
      },
    });
    return this.toResponse(entry);
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
      }),
    ]);
    return { items: entries.map((entry) => this.toResponse(entry)), total, page, pageSize };
  }

  async detail(id: string) {
    const entry = await this.prisma.complaintBookEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException("No se encontró el reclamo.");
    return this.toResponse(entry);
  }

  private toResponse(entry: ComplaintBookEntry) {
    return {
      id: entry.id,
      ticketNumber: entry.ticketNumber,
      claimantName: entry.claimantName,
      claimantEmail: entry.claimantEmail,
      claimantPhone: entry.claimantPhone,
      documentNumber: entry.documentNumber,
      entryType: entry.entryType,
      serviceDescription: entry.serviceDescription,
      detail: entry.detail,
      desiredResolution: entry.desiredResolution,
      createdAt: entry.createdAt.toISOString(),
    };
  }
}
