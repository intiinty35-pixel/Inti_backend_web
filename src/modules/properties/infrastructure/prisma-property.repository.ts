import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../../infrastructure/persistence/prisma.service";
import type { CreatePropertyData, Property, PropertyRepository, PropertyStatus } from "../domain/property";
import { compareProperties } from "../domain/property-ranking";
import { audit } from "../../billing/billing.store";
import { auditContext } from "../../audit/audit-context";

const propertyInclude = {
  owner: { select: { name: true, email: true } },
  location: true,
  details: true,
  amenities: true,
  reviews: { select: { rating: true, comment: true } },
  media: { orderBy: { position: "asc" } },
} satisfies Prisma.PropertyInclude;

function parseSpecificDetails(value: string | null | undefined): Record<string, string | number | boolean> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, string | number | boolean>)
      : {};
  } catch {
    return {};
  }
}
type PropertyRecord = Prisma.PropertyGetPayload<{ include: typeof propertyInclude }>;

@Injectable()
export class PrismaPropertyRepository implements PropertyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreatePropertyData): Promise<Property> {
    const slugBase = data.title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 70);

    const property = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.property.create({
      data: {
        ownerId: data.ownerId,
        status: "DRAFT",
        slug: `${slugBase}-${randomUUID().slice(0, 8)}`,
        createdByRole: data.createdByRole,
        operationType: data.operationType,
        propertyType: data.propertyType,
        title: data.title,
        description: data.description,
        price: data.price,
        currency: data.currency,
        negotiable: data.negotiable ?? false,
        maintenanceFee: data.maintenanceFee,
        contactName: data.contactName,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        contactWhatsapp: data.contactWhatsapp,
        location: { create: data.location },
        details: {
          create: {
            totalArea: data.details.totalArea,
            constructedArea: data.details.constructedArea,
            bedrooms: data.details.bedrooms,
            bathrooms: data.details.bathrooms,
            halfBathrooms: data.details.halfBathrooms,
            parkingSpaces: data.details.parkingSpaces,
            floor: data.details.floor,
            floors: data.details.floors,
            constructionDate: data.details.constructionDate ? new Date(data.details.constructionDate) : undefined,
            conservationStatus: data.details.conservationStatus,
            specificDetails: JSON.stringify(data.details.specificDetails ?? {}),
          },
        },
        amenities: { create: (data.amenityCodes ?? []).map((code) => ({ code })) },
        media: {
          create: data.media.map((media, index) => ({
            url: media.url,
            publicId: media.publicId,
            position: media.position ?? index,
            isCover: media.isCover ?? index === 0,
          })),
        },
      },
      include: propertyInclude,
      });
      const actor = auditContext.getStore()?.request.auth?.id ?? 'SYSTEM';
      await audit(tx, actor, saved.id, 'PROPERTY_CREATED', saved.ownerId ?? undefined, undefined, saved);
      return saved;
    }, { timeout: 30000 });

    return this.toDomain(property);
  }

  async updateManaged(id: string, data: CreatePropertyData, ownerId?: string): Promise<Property | null> {
    const existing = await this.prisma.property.findFirst({
      where: { id, ...(ownerId ? { ownerId } : {}) },
      select: { id: true },
    });
    if (!existing) return null;

    const details = {
      totalArea: data.details.totalArea ?? null,
      constructedArea: data.details.constructedArea ?? null,
      bedrooms: data.details.bedrooms ?? null,
      bathrooms: data.details.bathrooms ?? null,
      halfBathrooms: data.details.halfBathrooms ?? null,
      parkingSpaces: data.details.parkingSpaces ?? null,
      floor: data.details.floor ?? null,
      floors: data.details.floors ?? null,
      constructionDate: data.details.constructionDate ? new Date(data.details.constructionDate) : null,
      conservationStatus: data.details.conservationStatus ?? null,
      specificDetails: JSON.stringify(data.details.specificDetails ?? {}),
    };
    const location = {
      ...data.location,
      number: data.location.number ?? null,
      sector: data.location.sector ?? null,
      reference: data.location.reference ?? null,
      latitude: data.location.latitude ?? null,
      longitude: data.location.longitude ?? null,
    };

    const property = await this.prisma.$transaction(async (tx) => {
      const previous = await tx.property.findUnique({ where: { id }, include: propertyInclude });
      const saved = await tx.property.update({
      where: { id },
      data: {
        operationType: data.operationType,
        propertyType: data.propertyType,
        title: data.title,
        description: data.description,
        price: data.price,
        currency: data.currency,
        negotiable: data.negotiable ?? false,
        maintenanceFee: data.maintenanceFee ?? null,
        contactName: data.contactName ?? null,
        contactEmail: data.contactEmail ?? null,
        contactPhone: data.contactPhone ?? null,
        contactWhatsapp: data.contactWhatsapp ?? null,
        location: { upsert: { create: location, update: location } },
        details: { upsert: { create: details, update: details } },
        amenities: {
          deleteMany: {},
          create: (data.amenityCodes ?? []).map((code) => ({ code })),
        },
        media: {
          deleteMany: {},
          create: data.media.map((media, index) => ({
            url: media.url,
            publicId: media.publicId,
            position: media.position ?? index,
            isCover: media.isCover ?? index === 0,
          })),
        },
      },
      include: propertyInclude,
      });
      const actor = auditContext.getStore()?.request.auth?.id ?? 'SYSTEM';
      await audit(tx, actor, saved.id, 'PROPERTY_UPDATED', saved.ownerId ?? undefined, previous, saved);
      return saved;
    }, { timeout: 30000 });

    return this.toDomain(property);
  }

  async setStatusManaged(id: string, status: PropertyStatus): Promise<Property | null> {
    const { count } = await this.prisma.property.updateMany({ where: { id, status: "DRAFT" }, data: { status } });
    if (!count) return null;
    const property = await this.prisma.property.findUnique({ where: { id }, include: propertyInclude });
    return property ? this.toDomain(property) : null;
  }

  async findAll(): Promise<Property[]> {
    const properties = await this.prisma.property.findMany({
      where: { status: "PUBLISHED", owner: { isActive: true, accountStatus: "ACTIVE" }, subscription: { status: "ACTIVE", startsAt: { lte: new Date() }, expiresAt: { gt: new Date() } } },
      orderBy: { createdAt: "desc" },
      include: propertyInclude,
    });
    return properties.map((property) => this.toDomain(property)).sort(compareProperties);
  }

  async findManaged(ownerId?: string): Promise<Property[]> {
    const properties = await this.prisma.property.findMany({
      ...(ownerId ? { where: { ownerId } } : {}),
      orderBy: { createdAt: "desc" },
      include: propertyInclude,
    });
    return properties.map((property) => this.toDomain(property));
  }

  async deleteManaged(id: string, ownerId?: string): Promise<{ publicIds: string[] } | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.property.findFirst({ where: { id, ...(ownerId ? { ownerId } : {}) }, include: { media: { select: { publicId: true } } } });
      if (!existing) return null;
      const removed = await tx.property.deleteMany({ where: { id, ...(ownerId ? { ownerId } : {}) } });
      if (!removed.count) return null;
      const actorId = auditContext.getStore()?.request.auth?.id ?? ownerId ?? "SYSTEM";
      await audit(tx, actorId, id, "PROPERTY_DELETED", existing.ownerId ?? undefined, existing, { deleted: true });
      return { publicIds: existing.media.flatMap((item) => (item.publicId ? [item.publicId] : [])) };
    }, { timeout: 30000 });
  }

  private toDomain(record: PropertyRecord): Property {
    const location = record.location;
    const details = record.details;

    return {
      id: record.id,
      ownerId: record.ownerId ?? undefined,
      ownerName: record.owner?.name,
      ownerEmail: record.owner?.email,
      slug: record.slug,
      createdByRole: record.createdByRole as Property["createdByRole"],
      operationType: record.operationType as Property["operationType"],
      propertyType: record.propertyType as Property["propertyType"],
      title: record.title,
      description: record.description,
      price: record.price,
      currency: record.currency as Property["currency"],
      negotiable: record.negotiable,
      maintenanceFee: record.maintenanceFee ?? undefined,
      contactName: record.contactName ?? undefined,
      contactEmail: record.contactEmail ?? undefined,
      contactPhone: record.contactPhone ?? undefined,
      contactWhatsapp: record.contactWhatsapp ?? undefined,
      location: {
        department: location?.department ?? "",
        province: location?.province ?? "",
        district: location?.district ?? "",
        address: location?.address ?? "",
        number: location?.number ?? undefined,
        sector: location?.sector ?? undefined,
        reference: location?.reference ?? undefined,
        latitude: location?.latitude ?? undefined,
        longitude: location?.longitude ?? undefined,
        approximateLocation: location?.approximateLocation ?? true,
      },
      details: {
        totalArea: details?.totalArea ?? undefined,
        constructedArea: details?.constructedArea ?? undefined,
        bedrooms: details?.bedrooms ?? undefined,
        bathrooms: details?.bathrooms ?? undefined,
        halfBathrooms: details?.halfBathrooms ?? undefined,
        parkingSpaces: details?.parkingSpaces ?? undefined,
        floor: details?.floor ?? undefined,
        floors: details?.floors ?? undefined,
        constructionDate: details?.constructionDate?.toISOString().slice(0, 10),
        conservationStatus: details?.conservationStatus as Property["details"]["conservationStatus"],
        specificDetails: parseSpecificDetails(details?.specificDetails),
      },
      amenityCodes: record.amenities.map((amenity) => amenity.code),
      media: record.media.map((item) => ({
        url: item.url,
        publicId: item.publicId ?? undefined,
        position: item.position,
        isCover: item.isCover,
      })),
      status: record.status as PropertyStatus,
      isFeatured: record.isFeatured,
      averageRating: record.reviews.length ? record.reviews.reduce((sum, review) => sum + review.rating, 0) / record.reviews.length : 0,
      reviewsCount: record.reviews.length,
      commentsCount: record.reviews.filter((review) => review.comment.trim().length > 0).length,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
