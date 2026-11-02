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
import { ProjectConflictError } from "../domain/project.errors";
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

type CommentRecord = {
  id: string;
  projectId: string;
  authorName: string;
  content: string;
  createdAt: Date;
};

/** Convierte los filtros públicos en una condición de Prisma; el precio se compara contra las unidades del proyecto. */
function buildWhere(filters: ProjectFilters, includeUnpublished: boolean, ownerId?: string): Prisma.ProjectWhereInput {
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
  if (filters.priceMin != null || filters.priceMax != null) {
    and.push({
      units: {
        some: {
          price: {
            ...(filters.priceMin != null ? { gte: filters.priceMin } : {}),
            ...(filters.priceMax != null ? { lte: filters.priceMax } : {}),
          },
        },
      },
    });
  }

  return {
    ...(ownerId ? { ownerId } : {}),
    ...(includeUnpublished ? {} : { status: "PUBLISHED" }),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.phase ? { phase: filters.phase } : {}),
    ...(filters.currency ? { currency: filters.currency } : {}),
    AND: and,
  };
}

function toComment(record: CommentRecord): ProjectComment {
  return { ...record, createdAt: record.createdAt.toISOString() };
}

@Injectable()
export class PrismaProjectRepository implements ProjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: ProjectInput, ownerId?: string): Promise<Project> {
    const relations = relationCreates(data);
    const record = await this.prisma.project.create({
      data: {
        ownerId,
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

  async update(id: string, data: ProjectInput, ownerId?: string): Promise<{ project: Project; removedPublicIds: string[] } | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.project.findFirst({
        where: { id, ...(ownerId ? { ownerId } : {}) },
        include: { media: true, units: { select: { id: true, status: true } } },
      });
      if (!existing) return null;

      const relations = relationCreates(data);
      const existingUnitIds = new Set(existing.units.map((unit) => unit.id));
      const keptUnitIds = new Set(data.units.flatMap((unit) => (unit.id && existingUnitIds.has(unit.id) ? [unit.id] : [])));
      if (existing.units.some((unit) => unit.status === "SOLD" && !keptUnitIds.has(unit.id))) {
        throw new ProjectConflictError("No se puede eliminar una unidad vendida.");
      }

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

  async delete(id: string, ownerId?: string): Promise<{ publicIds: string[] } | null> {
    const existing = await this.prisma.project.findFirst({
      where: { id, ...(ownerId ? { ownerId } : {}) },
      select: { media: { select: { publicId: true } } },
    });
    if (!existing) return null;
    await this.prisma.project.deleteMany({ where: { id, ...(ownerId ? { ownerId } : {}) } });
    return { publicIds: existing.media.flatMap((item) => (item.publicId ? [item.publicId] : [])) };
  }

  async setStatus(id: string, status: ProjectStatus, ownerId?: string): Promise<Project | null> {
    const { count } = await this.prisma.project.updateMany({ where: { id, ...(ownerId ? { ownerId } : {}) }, data: { status } });
    if (!count) return null;

    const record = await this.prisma.project.findUnique({ where: { id }, include: projectInclude });
    return record ? toProject(record) : null;
  }

  async findById(id: string, ownerId?: string): Promise<Project | null> {
    const record = await this.prisma.project.findFirst({ where: { id, ...(ownerId ? { ownerId } : {}) }, include: projectInclude });
    return record ? toProject(record) : null;
  }

  async findBySlug(slug: string): Promise<Project | null> {
    const record = await this.prisma.project.findUnique({ where: { slug }, include: projectInclude });
    return record ? toProject(record) : null;
  }

  async findMany(filters: ProjectFilters, includeUnpublished: boolean, ownerId?: string): Promise<ProjectPage> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
    const where = buildWhere(filters, includeUnpublished, ownerId);

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

  async findUnitWithProject(unitId: string, ownerId?: string): Promise<{ project: Project; unit: ProjectUnit } | null> {
    const record = await this.prisma.project.findFirst({
      where: { units: { some: { id: unitId } }, ...(ownerId ? { ownerId } : {}) },
      include: projectInclude,
    });
    if (!record) return null;
    const project = toProject(record);
    const unit = project.units.find((item) => item.id === unitId);
    return unit ? { project, unit } : null;
  }

  async addUnit(projectId: string, unit: ProjectUnitData, ownerId?: string): Promise<ProjectUnit | null> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ...(ownerId ? { ownerId } : {}) },
      select: { _count: { select: { units: true } } },
    });
    if (!project) return null;
    const record = await this.prisma.projectUnit.create({ data: { ...unitScalars(unit, project._count.units), projectId } });
    return toUnit(record);
  }

  async updateUnit(unitId: string, unit: Partial<ProjectUnitData>, ownerId?: string): Promise<ProjectUnit | null> {
    const { id: _ignored, ...fields } = unit;
    const data = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
    const where: Prisma.ProjectUnitWhereInput = { id: unitId, ...(ownerId ? { project: { is: { ownerId } } } : {}) };
    const { count } = await this.prisma.projectUnit.updateMany({
      where,
      data,
    });
    if (!count) return null;

    const record = await this.prisma.projectUnit.findUnique({
      where: { id: unitId },
    });
    return record ? toUnit(record) : null;
  }

  async deleteUnit(unitId: string, ownerId?: string): Promise<boolean> {
    const where: Prisma.ProjectUnitWhereInput = { id: unitId, ...(ownerId ? { project: { is: { ownerId } } } : {}) };
    const { count } = await this.prisma.projectUnit.deleteMany({ where });
    return count > 0;
  }

  async listComments(projectId: string): Promise<ProjectComment[]> {
    const records = await this.prisma.projectComment.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
    return records.map(toComment);
  }

  async addComment(projectId: string, authorName: string, content: string): Promise<ProjectComment> {
    const record = await this.prisma.projectComment.create({ data: { projectId, authorName, content } });
    return toComment(record);
  }

  async deleteComment(commentId: string, ownerId?: string): Promise<boolean> {
    const where: Prisma.ProjectCommentWhereInput = { id: commentId, ...(ownerId ? { project: { is: { ownerId } } } : {}) };
    const { count } = await this.prisma.projectComment.deleteMany({ where });
    return count > 0;
  }
}
