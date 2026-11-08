import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../infrastructure/persistence/prisma.service";
import { NotificationsService } from "../../notifications/application/notifications.service";
import type { FavoriteListingType } from "../presentation/toggle-favorite.dto";

export interface FavoriteItem {
  id: string;
  listingType: FavoriteListingType;
  listingId: string;
  savedAt: Date;
  /** false cuando la publicación se despublicó o se eliminó: se sigue mostrando, pero sin enlace. */
  available: boolean;
  title: string;
  subtitle: string;
  price: number | null;
  currency: string | null;
  badge: string;
  coverUrl: string | null;
  href: string | null;
}

@Injectable()
export class FavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async toggle(userId: string, listingType: FavoriteListingType, listingId: string) {
    const existing = await this.prisma.favorite.findUnique({ where: { userId_listingType_listingId: { userId, listingType, listingId } } });
    if (existing) {
      await this.prisma.favorite.delete({ where: { id: existing.id } });
      return { isFavorite: false, count: await this.count(userId) };
    }

    const listing = await this.publishedListing(listingType, listingId);
    try {
      await this.prisma.favorite.create({ data: { userId, listingType, listingId } });
    } catch (error) {
      // Dos clics seguidos pueden chocar con la restricción única: el favorito ya existe y está bien.
      if (!(error instanceof Error) || !/Unique constraint/i.test(error.message)) throw error;
    }

    await this.notifications.notify({
      userId: listing.ownerId,
      actorId: userId,
      type: "FAVORITE_ADDED",
      title: "Alguien guardó tu publicación",
      message: `«${listing.title}» se guardó en favoritos. Es una buena señal de interés.`,
      actionUrl: listing.href,
      entityType: listingType,
      entityId: listingId,
      dedupeHours: 24,
    });
    return { isFavorite: true, count: await this.count(userId) };
  }

  /** Identificadores guardados, para pintar los corazones de golpe sin una consulta por tarjeta. */
  async ids(userId: string) {
    const favorites = await this.prisma.favorite.findMany({ where: { userId }, select: { listingType: true, listingId: true } });
    return {
      properties: favorites.filter((item) => item.listingType === "PROPERTY").map((item) => item.listingId),
      projects: favorites.filter((item) => item.listingType === "PROJECT").map((item) => item.listingId),
    };
  }

  async count(userId: string): Promise<number> {
    return this.prisma.favorite.count({ where: { userId } });
  }

  async list(userId: string): Promise<FavoriteItem[]> {
    const favorites = await this.prisma.favorite.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 200 });
    const propertyIds = favorites.filter((item) => item.listingType === "PROPERTY").map((item) => item.listingId);
    const projectIds = favorites.filter((item) => item.listingType === "PROJECT").map((item) => item.listingId);

    const [properties, projects] = await Promise.all([
      this.prisma.property.findMany({
        where: { id: { in: propertyIds } },
        include: { location: true, media: { orderBy: [{ isCover: "desc" }, { position: "asc" }], take: 1 } },
      }),
      this.prisma.project.findMany({
        where: { id: { in: projectIds } },
        include: { media: { orderBy: [{ isCover: "desc" }, { position: "asc" }], take: 1 }, units: { where: { price: { not: null } }, select: { price: true } } },
      }),
    ]);
    const propertyById = new Map(properties.map((item) => [item.id, item]));
    const projectById = new Map(projects.map((item) => [item.id, item]));

    return favorites.map((favorite): FavoriteItem => {
      const base = { id: favorite.id, listingType: favorite.listingType as FavoriteListingType, listingId: favorite.listingId, savedAt: favorite.createdAt };
      if (favorite.listingType === "PROPERTY") {
        const property = propertyById.get(favorite.listingId);
        if (!property) return { ...base, available: false, title: "Publicación eliminada", subtitle: "Ya no está en Inti", price: null, currency: null, badge: "Propiedad", coverUrl: null, href: null };
        const available = property.status === "PUBLISHED";
        return {
          ...base,
          available,
          title: property.title,
          subtitle: [property.location?.district, property.location?.department].filter(Boolean).join(", "),
          price: property.price,
          currency: property.currency,
          badge: OPERATION_LABELS[property.operationType] ?? "Propiedad",
          coverUrl: property.media[0]?.url ?? null,
          href: available ? `/propiedades/${property.slug}` : null,
        };
      }
      const project = projectById.get(favorite.listingId);
      if (!project) return { ...base, available: false, title: "Proyecto eliminado", subtitle: "Ya no está en Inti", price: null, currency: null, badge: "Proyecto", coverUrl: null, href: null };
      const available = project.status === "PUBLISHED";
      const prices = project.units.map((unit) => unit.price).filter((value): value is number => value !== null);
      return {
        ...base,
        available,
        title: project.name,
        subtitle: [project.district, project.department].filter(Boolean).join(", "),
        price: prices.length ? Math.min(...prices) : null,
        currency: project.currency,
        badge: "Proyecto",
        coverUrl: project.media[0]?.url ?? null,
        href: available ? `/proyectos/${project.slug}` : null,
      };
    });
  }

  private async publishedListing(listingType: FavoriteListingType, listingId: string) {
    if (listingType === "PROPERTY") {
      const property = await this.prisma.property.findUnique({ where: { id: listingId }, select: { id: true, slug: true, ownerId: true, title: true, status: true } });
      if (!property || property.status !== "PUBLISHED") throw new NotFoundException("La propiedad no está disponible.");
      return { ownerId: property.ownerId, title: property.title, href: `/propiedades/${property.slug}` };
    }
    if (listingType === "PROJECT") {
      const project = await this.prisma.project.findUnique({ where: { id: listingId }, select: { slug: true, ownerId: true, name: true, status: true } });
      if (!project || project.status !== "PUBLISHED") throw new NotFoundException("El proyecto no está disponible.");
      return { ownerId: project.ownerId, title: project.name, href: `/proyectos/${project.slug}` };
    }
    throw new BadRequestException("Tipo de publicación inválido.");
  }
}

const OPERATION_LABELS: Record<string, string> = { SALE: "Venta", RENT: "Alquiler", TEMPORARY_RENT: "Alquiler temporal", TRANSFER: "Traspaso" };
