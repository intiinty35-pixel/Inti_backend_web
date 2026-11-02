import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../infrastructure/persistence/prisma.service";
import {
  DEFAULT_PAGE_SIZE,
  type Project,
  type ProjectComment,
  type ProjectFilters,
  type ProjectInput,
  type ProjectPage,
  type ProjectRepository,
  type ProjectStatus,
  type ProjectUnit,
  type ProjectUnitData,
} from "../domain/project";
import {
  projectInclude,
  projectScalars,
  relationCreates,
  slugify,
  summaryInclude,
  toProject,
  toSummary,
  toUnit,
  unitScalars,
} from "./project.mapper";

/** Convierte los filtros públicos en una condición de Prisma; el precio se compara contra las unidades del proyecto. */
function buildWhere(filters: ProjectFilters, includeUnpublished: boolean): Prisma.ProjectWhereInput {
  const and: Prisma.ProjectWhereInput[] = [];
  if (filters.location) {
    and.push({
      OR: [
        { district: { contains: filters.location } },
        { province: { contains: filters.location } },
        { department: { contains: filters.location } },
        { address: { contains: filters.location } },
      ],
    });
  }
  if (filters.search) and.push({ OR: [{ name: { contains: filters.search } }, { description: { contains: filters.search } }] });
  if (filters.priceMin != null) and.push({ units: { some: { price: { gte: filters.priceMin } } } });
  if (filters.priceMax != null) and.push({ units: { some: { price: { lte: filters.priceMax } } } });

  return {
    ...(includeUnpublished ? {} : { status: "PUBLISHED" }),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.phase ? { phase: filters.phase } : {}),
    ...(filters.currency ? { currency: filters.currency } : {}),
    AND: and,
  };
}

@Injectable()
export class PrismaProjectRepository implements ProjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: ProjectInput): Promise<Project> {
    const relations = relationCreates(data);
    const record = await this.prisma.project.create({
      data: {
        ...projectScalars(data),
        slug: slugify(data.name),
        units: { create: relations.units },
        media: { create: relations.media },
        amenities: { create: relations.amenities },
        timeline: { create: relations.timeline },
      },
      include: projectInclude,
    });
    return toProject(record);
  }

  async update(id: string, data: ProjectInput): Promise<{ project: Project; removedPublicIds: string[] } | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.project.findUnique({ where: { id }, include: { media: true, units: { select: { id: true } } } });
      if (!existing) return null;

      const relations = relationCreates(data);
      const existingUnitIds = new Set(existing.units.map((unit) => unit.id));
      const keptUnitIds = new Set(data.units.flatMap((unit) => (unit.id && existingUnitIds.has(unit.id) ? [unit.id] : [])));

      await tx.project.update({ where: { id }, data: projectScalars(data) });
      await tx.projectUnit.deleteMany({ where: { projectId: id, id: { notIn: [...keptUnitIds] } } });
      for (const [index, unit] of data.units.entries()) {
        if (unit.id && keptUnitIds.has(unit.id)) {
          await tx.projectUnit.update({ where: { id: unit.id }, data: unitScalars(unit, index) });
        } else {
          await tx.projectUnit.create({ data: { ...unitScalars(unit, index), projectId: id } });
        }
      }

      await tx.projectMedia.deleteMany({ where: { projectId: id } });
      await tx.projectMedia.createMany({ data: relations.media.map((item) => ({ ...item, projectId: id })) });
      await tx.projectAmenity.deleteMany({ where: { projectId: id } });
      await tx.projectAmenity.createMany({ data: relations.amenities.map((item) => ({ ...item, projectId: id })) });
      await tx.projectTimeline.deleteMany({ where: { projectId: id } });
      await tx.projectTimeline.createMany({ data: relations.timeline.map((item) => ({ ...item, projectId: id })) });

      const keptPublicIds = new Set(data.media.flatMap((item) => (item.publicId ? [item.publicId] : [])));
      const removedPublicIds = existing.media.flatMap((item) => (item.publicId && !keptPublicIds.has(item.publicId) ? [item.publicId] : []));
      const record = await tx.project.findUniqueOrThrow({ where: { id }, include: projectInclude });
      return { project: toProject(record), removedPublicIds };
    });
  }

  async delete(id: string): Promise<{ publicIds: string[] } | null> {
    const existing = await this.prisma.project.findUnique({ where: { id }, select: { media: { select: { publicId: true } } } });
    if (!existing) return null;
    await this.prisma.project.delete({ where: { id } });
    return { publicIds: existing.media.flatMap((item) => (item.publicId ? [item.publicId] : [])) };
  }

  async setStatus(id: string, status: ProjectStatus): Promise<Project | null> {
    const exists = await this.prisma.project.count({ where: { id } });
    if (!exists) return null;
    const record = await this.prisma.project.update({ where: { id }, data: { status }, include: projectInclude });
    return toProject(record);
  }

  async findById(id: string): Promise<Project | null> {
    const record = await this.prisma.project.findUnique({ where: { id }, include: projectInclude });
    return record ? toProject(record) : null;
  }

  async findBySlug(slug: string): Promise<Project | null> {
    const record = await this.prisma.project.findUnique({ where: { slug }, include: projectInclude });
    return record ? toProject(record) : null;
  }

  async findMany(filters: ProjectFilters, includeUnpublished: boolean): Promise<ProjectPage> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
    const where = buildWhere(filters, includeUnpublished);

    const [total, records] = await this.prisma.$transaction([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: summaryInclude,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: records.map(toSummary), total, page, pageSize };
  }

  async incrementViews(id: string): Promise<void> {
    await this.prisma.project.update({ where: { id }, data: { viewsCount: { increment: 1 } } }).catch(() => undefined);
  }

  async addUnit(projectId: string, unit: ProjectUnitData): Promise<ProjectUnit | null> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { _count: { select: { units: true } } } });
    if (!project) return null;
    const record = await this.prisma.projectUnit.create({ data: { ...unitScalars(unit, project._count.units), projectId } });
    return toUnit(record);
  }

  async updateUnit(unitId: string, unit: Partial<ProjectUnitData>): Promise<ProjectUnit | null> {
    const exists = await this.prisma.projectUnit.count({ where: { id: unitId } });
    if (!exists) return null;
    const { id: _ignored, ...fields } = unit;
    const record = await this.prisma.projectUnit.update({
      where: { id: unitId },
      data: Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)),
    });
    return toUnit(record);
  }

  async deleteUnit(unitId: string): Promise<boolean> {
    const { count } = await this.prisma.projectUnit.deleteMany({ where: { id: unitId } });
    return count > 0;
  }

  async listComments(projectId: string): Promise<ProjectComment[]> {
    const records = await this.prisma.projectComment.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
    return records.map((record) => ({ ...record, createdAt: record.createdAt.toISOString() }));
  }

  async addComment(projectId: string, authorName: string, content: string): Promise<ProjectComment> {
    const record = await this.prisma.projectComment.create({ data: { projectId, authorName, content } });
    return { ...record, createdAt: record.createdAt.toISOString() };
  }

  async deleteComment(commentId: string): Promise<boolean> {
    const { count } = await this.prisma.projectComment.deleteMany({ where: { id: commentId } });
    return count > 0;
  }
}
