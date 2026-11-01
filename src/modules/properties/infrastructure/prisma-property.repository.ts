import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../../infrastructure/persistence/prisma.service";
import type { CreatePropertyData, Property, PropertyRepository } from "../domain/property";

const propertyInclude = Prisma.validator<Prisma.PropertyInclude>()({
  location: true,
  details: true,
  amenities: true,
  media: { orderBy: { position: "asc" } },
});
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

    const property = await this.prisma.property.create({
      data: {
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
            constructionYear: data.details.constructionYear,
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

    return this.toDomain(property);
  }

  async findAll(): Promise<Property[]> {
    const properties = await this.prisma.property.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      include: propertyInclude,
    });
    return properties.map((property) => this.toDomain(property));
  }

  private toDomain(record: PropertyRecord): Property {
    const location = record.location;
    const details = record.details;

    return {
      id: record.id,
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
        constructionYear: details?.constructionYear ?? undefined,
        conservationStatus: details?.conservationStatus as Property["details"]["conservationStatus"],
        specificDetails: details?.specificDetails ? JSON.parse(details.specificDetails) : {},
      },
      amenityCodes: record.amenities.map((amenity) => amenity.code),
      media: record.media.map((item) => ({
        url: item.url,
        publicId: item.publicId ?? undefined,
        position: item.position,
        isCover: item.isCover,
      })),
      status: "PUBLISHED",
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
