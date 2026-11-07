import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../infrastructure/persistence/prisma.service";
import type { CreateInquiryDto } from "../presentation/create-inquiry.dto";

@Injectable()
export class InquiriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateInquiryDto) {
    const ownerId = await this.resolveOwner(input.listingType, input.listingId);
    return this.prisma.inquiry.create({
      data: {
        listingType: input.listingType,
        listingId: input.listingId,
        ownerId,
        senderName: normalize(input.name),
        senderEmail: normalize(input.email).toLowerCase(),
        senderPhone: normalize(input.phone),
        message: normalize(input.message),
      },
    });
  }

  async listMine(userId: string) {
    const inquiries = await this.prisma.inquiry.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const propertyIds = inquiries.filter((item) => item.listingType === "PROPERTY").map((item) => item.listingId);
    const projectIds = inquiries.filter((item) => item.listingType === "PROJECT").map((item) => item.listingId);
    const properties = await this.prisma.property.findMany({ where: { id: { in: propertyIds } }, select: { id: true, title: true } });
    const projects = await this.prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } });
    const listingNames = new Map([
      ...properties.map((item) => [item.id, item.title] as const),
      ...projects.map((item) => [item.id, item.name] as const),
    ]);
    return inquiries.map((item) => ({ ...item, listingName: listingNames.get(item.listingId) ?? "Publicación eliminada" }));
  }

  async setReadStatus(id: string, userId: string, read: boolean) {
    await this.prisma.inquiry.updateMany({
      where: { id, ownerId: userId },
      data: { status: read ? "READ" : "NEW", readAt: read ? new Date() : null },
    });
    const inquiry = await this.prisma.inquiry.findFirst({ where: { id, ownerId: userId } });
    if (!inquiry) throw new NotFoundException("No se encontró esta consulta en tu bandeja.");
    return inquiry;
  }

  private async resolveOwner(listingType: "PROPERTY" | "PROJECT", listingId: string): Promise<string | null> {
    if (listingType === "PROPERTY") {
      const property = await this.prisma.property.findUnique({ where: { id: listingId }, select: { id: true, ownerId: true, status: true } });
      if (!property || property.status !== "PUBLISHED") throw new NotFoundException("La propiedad no está disponible.");
      return property.ownerId ?? null;
    }
    if (listingType === "PROJECT") {
      const project = await this.prisma.project.findUnique({ where: { id: listingId }, select: { id: true, ownerId: true, status: true } });
      if (!project || project.status !== "PUBLISHED") throw new NotFoundException("El proyecto no está disponible.");
      return project.ownerId ?? null;
    }
    throw new BadRequestException("Tipo de publicación inválido.");
  }
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
