import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type {
  Project,
  ProjectInput,
  ProjectStats,
  ProjectStatus,
  ProjectSummary,
  ProjectUnit,
  ProjectUnitData,
} from "../domain/project";

/** Datos mínimos para listar proyectos: solo lo necesario para calcular estadísticas y mostrar la portada. */
export const summaryInclude = Prisma.validator<Prisma.ProjectInclude>()({
  units: { select: { status: true, price: true, area: true } },
  media: { where: { isCover: true }, take: 1 },
  _count: { select: { comments: true } },
});
export type SummaryRecord = Prisma.ProjectGetPayload<{ include: typeof summaryInclude }>;

export const projectInclude = Prisma.validator<Prisma.ProjectInclude>()({
  units: { orderBy: { position: "asc" } },
  media: { orderBy: { position: "asc" } },
  amenities: { orderBy: { id: "asc" } },
  timeline: { orderBy: { date: "asc" } },
  _count: { select: { comments: true } },
});
export type ProjectRecord = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;
type UnitRecord = ProjectRecord["units"][number];

const toDate = (value: string | undefined) => (value ? new Date(value) : null);
const toDay = (value: Date | null) => value?.toISOString().slice(0, 10);

export function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
  return `${base || "proyecto"}-${randomUUID().slice(0, 8)}`;
}

// ─── Dominio → Prisma ───

export function projectScalars(data: ProjectInput) {
  return {
    name: data.name,
    description: data.description,
    type: data.type,
    phase: data.phase,
    currency: data.currency,
    floors: data.floors ?? null,
    startDate: toDate(data.startDate),
    estimatedDelivery: toDate(data.estimatedDelivery),
    constructionProgress: data.constructionProgress ?? 0,
    department: data.department,
    province: data.province,
    district: data.district,
    address: data.address,
    urbanization: data.urbanization ?? null,
    reference: data.reference ?? null,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    showExactAddress: data.showExactAddress ?? true,
    contactName: data.contactName ?? null,
    contactEmail: data.contactEmail ?? null,
    contactPhone: data.contactPhone ?? null,
    contactWhatsapp: data.contactWhatsapp ?? null,
    websiteUrl: data.websiteUrl ?? null,
    ruc: data.ruc ?? null,
    socialReason: data.socialReason ?? null,
    initialFee: data.initialFee ?? null,
    monthlyPayment: data.monthlyPayment ?? null,
    financingInfo: data.financingInfo ?? null,
    totalBlocks: data.totalBlocks ?? null,
    hasUrbanization: data.hasUrbanization ?? false,
    hasPropertyTitle: data.hasPropertyTitle ?? false,
  };
}

export function unitScalars(unit: ProjectUnitData, position: number) {
  return {
    unitNumber: unit.unitNumber,
    type: unit.type,
    floor: unit.floor ?? null,
    area: unit.area ?? null,
    bedrooms: unit.bedrooms ?? null,
    bathrooms: unit.bathrooms ?? null,
    parkingSpots: unit.parkingSpots ?? null,
    price: unit.price ?? null,
    status: unit.status,
    view: unit.view ?? null,
    block: unit.block ?? null,
    lotNumber: unit.lotNumber ?? null,
    frontWidth: unit.frontWidth ?? null,
    position,
  };
}

export function relationCreates(data: ProjectInput) {
  return {
    units: data.units.map((unit, index) => unitScalars(unit, index)),
    media: data.media.map((item, index) => ({
      url: item.url,
      publicId: item.publicId ?? null,
      kind: item.kind,
      position: item.position ?? index,
      isCover: item.isCover ?? index === 0,
    })),
    amenities: data.amenities.map((name) => ({ name })),
    timeline: data.timeline.map((entry) => ({
      phase: entry.phase,
      date: new Date(entry.date),
      description: entry.description ?? null,
      completed: entry.completed ?? false,
    })),
  };
}

// ─── Prisma → dominio ───

function range(values: Array<number | null>): [number | undefined, number | undefined] {
  const numbers = values.filter((value): value is number => value != null);
  return numbers.length ? [Math.min(...numbers), Math.max(...numbers)] : [undefined, undefined];
}

export function computeStats(units: Array<Pick<UnitRecord, "status" | "price" | "area">>): ProjectStats {
  const [priceFrom, priceTo] = range(units.map((unit) => unit.price));
  const [areaFrom, areaTo] = range(units.map((unit) => unit.area));
  const count = (status: string) => units.filter((unit) => unit.status === status).length;
  return {
    totalUnits: units.length,
    availableUnits: count("AVAILABLE"),
    reservedUnits: count("RESERVED"),
    soldUnits: count("SOLD"),
    priceFrom,
    priceTo,
    areaFrom,
    areaTo,
  };
}

export function toUnit(record: UnitRecord): ProjectUnit {
  return {
    id: record.id,
    unitNumber: record.unitNumber,
    type: record.type as ProjectUnit["type"],
    floor: record.floor ?? undefined,
    area: record.area ?? undefined,
    bedrooms: record.bedrooms ?? undefined,
    bathrooms: record.bathrooms ?? undefined,
    parkingSpots: record.parkingSpots ?? undefined,
    price: record.price ?? undefined,
    status: record.status as ProjectUnit["status"],
    view: record.view ?? undefined,
    block: record.block ?? undefined,
    lotNumber: record.lotNumber ?? undefined,
    frontWidth: record.frontWidth ?? undefined,
  };
}

export function toSummary(record: SummaryRecord): ProjectSummary {
  const cover = record.media.find((item) => item.isCover) ?? record.media[0];
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    description: record.description,
    type: record.type as ProjectSummary["type"],
    phase: record.phase as ProjectSummary["phase"],
    status: record.status as ProjectStatus,
    currency: record.currency as ProjectSummary["currency"],
    floors: record.floors ?? undefined,
    startDate: toDay(record.startDate),
    estimatedDelivery: toDay(record.estimatedDelivery),
    constructionProgress: record.constructionProgress,
    department: record.department,
    province: record.province,
    district: record.district,
    address: record.address,
    urbanization: record.urbanization ?? undefined,
    reference: record.reference ?? undefined,
    latitude: record.latitude ?? undefined,
    longitude: record.longitude ?? undefined,
    showExactAddress: record.showExactAddress,
    contactName: record.contactName ?? undefined,
    contactEmail: record.contactEmail ?? undefined,
    contactPhone: record.contactPhone ?? undefined,
    contactWhatsapp: record.contactWhatsapp ?? undefined,
    websiteUrl: record.websiteUrl ?? undefined,
    ruc: record.ruc ?? undefined,
    socialReason: record.socialReason ?? undefined,
    initialFee: record.initialFee ?? undefined,
    monthlyPayment: record.monthlyPayment ?? undefined,
    financingInfo: record.financingInfo ?? undefined,
    totalBlocks: record.totalBlocks ?? undefined,
    hasUrbanization: record.hasUrbanization,
    hasPropertyTitle: record.hasPropertyTitle,
    viewsCount: record.viewsCount,
    commentsCount: record._count.comments,
    coverUrl: cover?.url,
    stats: computeStats(record.units),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toProject(record: ProjectRecord): Project {
  return {
    ...toSummary(record),
    units: record.units.map(toUnit),
    media: record.media.map((item) => ({
      id: item.id,
      url: item.url,
      publicId: item.publicId ?? undefined,
      kind: item.kind as Project["media"][number]["kind"],
      position: item.position,
      isCover: item.isCover,
    })),
    amenities: record.amenities.map((amenity) => amenity.name),
    timeline: record.timeline.map((entry) => ({
      id: entry.id,
      phase: entry.phase,
      date: entry.date.toISOString().slice(0, 10),
      description: entry.description ?? undefined,
      completed: entry.completed,
    })),
  };
}
