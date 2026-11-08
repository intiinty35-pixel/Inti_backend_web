import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Optional, Param, Put, Query, Req, UseGuards } from "@nestjs/common";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from "class-validator";
import { Transform, Type } from "class-transformer";
import { PrismaService } from "../../../infrastructure/persistence/prisma.service";
import { SessionGuard, type AuthenticatedRequest } from "../../auth/session.guard";
import { NotificationsService } from "../../notifications/application/notifications.service";

class ReviewDto {
  @IsInt() @Min(1) @Max(5)
  rating!: number;

  @Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value)
  @IsOptional() @ValidateIf((_object, value) => value !== "")
  @IsString() @MinLength(3) @MaxLength(2000)
  comment?: string;
}

class ReviewListQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize?: number;
  @IsOptional() @IsIn(["true", "false"]) commentsOnly?: string;
}

@Controller("properties/:propertyId/reviews")
export class PropertyReviewsController {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  private async publishedProperty(id: string) {
    const property = await this.prisma.property.findFirst({ where: { id, status: "PUBLISHED" }, select: { id: true, ownerId: true, title: true, slug: true } });
    if (!property) throw new NotFoundException("No se encontró la propiedad publicada.");
    return property;
  }

  @Get()
  async list(@Param("propertyId") propertyId: string, @Query() query: ReviewListQuery = {}) {
    await this.publishedProperty(propertyId);
    const summary = await this.prisma.propertyReview.aggregate({ where: { propertyId }, _avg: { rating: true }, _count: { _all: true } });
    const commentsCount = await this.prisma.propertyReview.count({ where: { propertyId, comment: { not: "" } } });
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const items = await this.prisma.propertyReview.findMany({
      where: { propertyId, ...(query.commentsOnly === "true" ? { comment: { not: "" } } : {}) }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: pageSize, skip: (page - 1) * pageSize,
      select: { id: true, userId: true, rating: true, comment: true, updatedAt: true, user: { select: { name: true } } },
    });
    return { averageRating: summary._avg.rating ?? 0, reviewsCount: summary._count._all, commentsCount, page, pageSize, total: query.commentsOnly === "true" ? commentsCount : summary._count._all, items: items.map(({ user, ...review }) => ({ ...review, authorName: user.name })) };
  }

  @Put()
  @UseGuards(SessionGuard)
  async save(@Param("propertyId") propertyId: string, @Body() body: ReviewDto, @Req() request: AuthenticatedRequest) {
    const property = await this.publishedProperty(propertyId);
    if (property.ownerId === request.auth.id) throw new ForbiddenException("No puedes valorar tu propia propiedad.");
    const user = await this.prisma.user.findUnique({ where: { id: request.auth.id }, select: { id: true } });
    if (!user) throw new BadRequestException("Necesitas una cuenta de usuario para dejar una reseña.");
    await this.prisma.propertyReview.upsert({
      where: { propertyId_userId: { propertyId, userId: user.id } },
      create: { propertyId, userId: user.id, rating: body.rating, comment: body.comment ?? "" },
      update: { rating: body.rating, comment: body.comment },
    });
    await this.notifications?.notify({
      userId: property.ownerId,
      actorId: request.auth.id,
      type: "PROPERTY_REVIEW",
      title: "Nueva valoración",
      message: `Valoraron «${property.title ?? "tu propiedad"}» con ${body.rating} de 5 estrellas.`,
      actionUrl: property.slug ? `/propiedades/${property.slug}` : "/",
      entityType: "PROPERTY",
      entityId: propertyId,
      dedupeHours: 6,
    });
    return this.list(propertyId);
  }
}
