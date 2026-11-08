import { Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, Patch, Post, Put, Req, UseGuards } from "@nestjs/common";
import { PrismaService } from "../../../infrastructure/persistence/prisma.service";
import { PROFILE_ROLES, type ProfileRole } from "../../../shared/profile-role";
import { AdminGuard } from "../../auth/admin.guard";
import { MemberGuard } from "../../auth/member.guard";
import { AuthenticatedRequest, SessionGuard } from "../../auth/session.guard";
import { CreatePropertyUseCase } from "../application/create-property.use-case";
import { ListPropertiesUseCase } from "../application/list-properties.use-case";
import { CreatePropertyDto } from "./create-property.dto";

function normalizeBoliviaLongitude<T extends { latitude?: number; longitude?: number }>(location: T): T {
  const { latitude, longitude } = location;
  if (latitude != null && longitude != null && latitude >= -23 && latitude <= -9 && longitude >= 57 && longitude <= 70) {
    return { ...location, longitude: -longitude };
  }
  return location;
}

@Controller("properties")
export class PropertiesController {
  constructor(
    private readonly createProperty: CreatePropertyUseCase,
    private readonly listProperties: ListPropertiesUseCase,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list() {
    const properties = await this.listProperties.execute();
    return properties.map(({ ownerId: _ownerId, ownerName: _ownerName, ownerEmail: _ownerEmail, ...property }) => property);
  }

  @Get("mine")
  @UseGuards(SessionGuard)
  mine(@Req() request: AuthenticatedRequest) {
    return this.listProperties.executeManaged(request.auth.id);
  }

  @Get("admin/all")
  @UseGuards(SessionGuard, AdminGuard)
  allForAdmin() {
    return this.listProperties.executeManaged();
  }

  @Get("publishers/:id")
  async publisher(@Param("id") id: string) {
    const owner = await this.prisma.user.findFirst({ where: { id, isActive: true, accountStatus: "ACTIVE" }, select: { id: true, name: true, role: true, createdAt: true } });
    if (!owner) throw new NotFoundException("Este anunciante no está disponible.");
    const properties = (await this.listProperties.execute()).filter((item) => item.ownerId === id && item.status === "PUBLISHED");
    const projects = await this.prisma.project.findMany({
      where: { ownerId: id, status: "PUBLISHED", subscription: { status: "ACTIVE", startsAt: { lte: new Date() }, expiresAt: { gt: new Date() } } },
      select: { id: true, slug: true, name: true, currency: true, district: true, department: true, createdAt: true, contactPhone: true, contactEmail: true,
        media: { select: { url: true }, orderBy: [{ isCover: "desc" }, { position: "asc" }], take: 1 }, units: { where: { status: "AVAILABLE", price: { not: null } }, select: { price: true }, orderBy: { price: "asc" }, take: 1 } },
    });
    if (!properties.length && !projects.length) throw new NotFoundException("Este anunciante no tiene publicaciones disponibles.");
    const ids = [...properties.map((item) => item.id), ...projects.map((item) => item.id)];
    const publications = await this.prisma.billingAudit.findMany({ where: { resourceId: { in: ids }, action: { in: ["PUBLICATION_APPROVED", "PROJECT_PUBLICATION_APPROVED"] } }, select: { resourceId: true, createdAt: true }, orderBy: { createdAt: "asc" } });
    const dates = new Map<string, string>();
    for (const event of publications) if (!dates.has(event.resourceId)) dates.set(event.resourceId, event.createdAt.toISOString());
    const listings = [
      ...properties.map((item) => ({ id: item.id, kind: "PROPERTY", title: item.title, href: `/propiedades/${encodeURIComponent(item.slug)}`, cover: (item.media.find((photo) => photo.isCover) ?? item.media[0])?.url ?? null, price: item.price, currency: item.currency, location: `${item.location.district}, ${item.location.department}`, createdAt: item.createdAt, publishedAt: dates.get(item.id) ?? null })),
      ...projects.map((item) => ({ id: item.id, kind: "PROJECT", title: item.name, href: `/proyectos/${encodeURIComponent(item.slug)}`, cover: item.media[0]?.url ?? null, price: item.units[0]?.price ?? null, currency: item.currency, location: `${item.district}, ${item.department}`, createdAt: item.createdAt.toISOString(), publishedAt: dates.get(item.id) ?? null })),
    ].sort((a, b) => Date.parse(b.publishedAt ?? b.createdAt) - Date.parse(a.publishedAt ?? a.createdAt));
    return { id: owner.id, name: owner.name, role: owner.role, memberSince: owner.createdAt.toISOString(), areas: [...new Set(listings.map((item) => item.location))], contactPhone: properties.find((item) => item.contactPhone)?.contactPhone ?? projects.find((item) => item.contactPhone)?.contactPhone ?? null, contactEmail: properties.find((item) => item.contactEmail)?.contactEmail ?? projects.find((item) => item.contactEmail)?.contactEmail ?? null, listings };
  }

  @Get(":slug")
  async detail(@Param("slug") slug: string) {
    const properties = await this.listProperties.execute();
    const found = properties.find((item) => item.status === "PUBLISHED" && (item.slug === slug || item.id === slug));
    if (!found) throw new NotFoundException("Esta propiedad no está disponible.");
    const owner = found.ownerId ? await this.prisma.user.findUnique({ where: { id: found.ownerId }, select: { name: true, role: true, createdAt: true } }) : null;
    const { ownerId, ownerName, ownerEmail: _ownerEmail, ...property } = found;
    const listings = ownerId ? properties.filter((item) => item.ownerId === ownerId) : [found];
    return { ...property, publisher: {
      id: ownerId ?? null,
      name: owner?.name ?? ownerName ?? found.contactName ?? "Anunciante de Inti",
      role: owner?.role ?? found.createdByRole,
      memberSince: owner?.createdAt.toISOString() ?? null,
      publishedProperties: listings.length,
      areas: [...new Set(listings.map((item) => `${item.location.district}, ${item.location.department}`))],
    } };
  }

  @Patch("admin/:id/publish")
  @UseGuards(SessionGuard, AdminGuard)
  publishForAdmin(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.listProperties.publishManaged(id, request.auth.id);
  }

  @Post()
  @UseGuards(SessionGuard, MemberGuard)
  create(@Body() input: CreatePropertyDto, @Req() request: AuthenticatedRequest) {
    return this.createProperty.execute({
      ...input,
      location: normalizeBoliviaLongitude(input.location),
      createdByRole: request.auth.role as ProfileRole,
      ownerId: request.auth.id,
    });
  }

  @Put(":id")
  @UseGuards(SessionGuard, MemberGuard)
  update(@Param("id") id: string, @Body() input: CreatePropertyDto, @Req() request: AuthenticatedRequest) {
    return this.listProperties.updateManaged(id, {
      ...input,
      location: normalizeBoliviaLongitude(input.location),
      createdByRole: request.auth.role as ProfileRole,
      ownerId: request.auth.id,
    }, request.auth.id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  async remove(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    const ownerId = request.auth.role === PROFILE_ROLES.ADMINISTRATOR ? undefined : request.auth.id;
    await this.listProperties.deleteManaged(id, ownerId);
  }
}
