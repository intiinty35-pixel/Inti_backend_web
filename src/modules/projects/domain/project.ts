export const PROJECT_TYPES = ["RESIDENTIAL", "COMMERCIAL", "MIXED_USE", "INDUSTRIAL", "LOTIZATION", "LAND_SUBDIVISION"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const BUILDING_PROJECT_PHASES = ["PRE_SALE", "CONSTRUCTION", "FINISHING", "READY", "DELIVERED", "SOLD_OUT"] as const;
export const LOT_PROJECT_PHASES = ["LAND_BANK", "PRE_LOTIZATION", "URBANIZATION", "PLOTTING", "REGISTRATION", "COMPLETED"] as const;
export const PROJECT_PHASES = [...BUILDING_PROJECT_PHASES, ...LOT_PROJECT_PHASES] as const;
export type ProjectPhase = (typeof PROJECT_PHASES)[number];

export const PROJECT_STATUSES = ["DRAFT", "PUBLISHED", "PAUSED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const UNIT_TYPES = ["APARTMENT", "FLAT", "DUPLEX", "PENTHOUSE", "OFFICE", "COMMERCIAL_SPACE", "WAREHOUSE", "LOT"] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export const UNIT_STATUSES = ["AVAILABLE", "RESERVED", "SOLD", "BLOCKED"] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const MEDIA_KINDS = ["IMAGE", "RENDER", "BLUEPRINT"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const PROJECT_CURRENCIES = ["BOB", "USD"] as const;
export type ProjectCurrency = (typeof PROJECT_CURRENCIES)[number];

const LOT_PROJECT_TYPES: readonly ProjectType[] = ["LOTIZATION", "LAND_SUBDIVISION"];

export function isLotProjectType(type: ProjectType): boolean {
  return LOT_PROJECT_TYPES.includes(type);
}

/** Los proyectos de lotización usan fases propias; el resto usa las de obra nueva. */
export function phaseBelongsToType(phase: ProjectPhase, type: ProjectType): boolean {
  const allowed: readonly ProjectPhase[] = isLotProjectType(type) ? LOT_PROJECT_PHASES : BUILDING_PROJECT_PHASES;
  return allowed.includes(phase);
}

export interface ProjectUnitData {
  id?: string;
  unitNumber: string;
  type: UnitType;
  floor?: number;
  area?: number;
  bedrooms?: number;
  bathrooms?: number;
  parkingSpots?: number;
  price?: number;
  status: UnitStatus;
  view?: string;
  block?: string;
  lotNumber?: string;
  frontWidth?: number;
}

export interface ProjectMediaData {
  url: string;
  publicId?: string;
  kind: MediaKind;
  position?: number;
  isCover?: boolean;
}

export interface ProjectTimelineData {
  phase: string;
  date: string;
  description?: string;
  completed?: boolean;
}

export interface ProjectInput {
  name: string;
  description: string;
  type: ProjectType;
  phase: ProjectPhase;
  currency: ProjectCurrency;
  floors?: number;
  startDate?: string;
  estimatedDelivery?: string;
  constructionProgress?: number;
  department: string;
  province: string;
  district: string;
  address: string;
  urbanization?: string;
  reference?: string;
  latitude?: number;
  longitude?: number;
  showExactAddress?: boolean;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactWhatsapp?: string;
  websiteUrl?: string;
  ruc?: string;
  socialReason?: string;
  initialFee?: number;
  monthlyPayment?: number;
  financingInfo?: string;
  totalBlocks?: number;
  hasUrbanization?: boolean;
  hasPropertyTitle?: boolean;
  units: ProjectUnitData[];
  media: ProjectMediaData[];
  amenities: string[];
  timeline: ProjectTimelineData[];
}

export interface ProjectStats {
  totalUnits: number;
  availableUnits: number;
  reservedUnits: number;
  soldUnits: number;
  priceFrom?: number;
  priceTo?: number;
  areaFrom?: number;
  areaTo?: number;
}

export interface ProjectUnit extends ProjectUnitData {
  id: string;
}

export interface ProjectMedia extends ProjectMediaData {
  id: string;
  position: number;
  isCover: boolean;
}

export interface ProjectTimelineEntry extends ProjectTimelineData {
  id: string;
  completed: boolean;
}

export interface ProjectSummary extends Omit<ProjectInput, "units" | "media" | "amenities" | "timeline"> {
  id: string;
  ownerId?: string;
  slug: string;
  status: ProjectStatus;
  constructionProgress: number;
  viewsCount: number;
  commentsCount: number;
  coverUrl?: string;
  stats: ProjectStats;
  createdAt: string;
  updatedAt: string;
}

export interface Project extends ProjectSummary {
  units: ProjectUnit[];
  media: ProjectMedia[];
  amenities: string[];
  timeline: ProjectTimelineEntry[];
}

export interface ProjectComment {
  id: string;
  projectId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

export interface ProjectFilters {
  type?: ProjectType;
  phase?: ProjectPhase;
  location?: string;
  currency?: ProjectCurrency;
  priceMin?: number;
  priceMax?: number;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface ProjectPage {
  items: ProjectSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 50;

export const PROJECT_REPOSITORY = Symbol("PROJECT_REPOSITORY");

export interface ProjectRepository {
  create(data: ProjectInput, ownerId?: string): Promise<Project>;
  /** Devuelve null si el proyecto no existe; `removedPublicIds` son las imágenes que dejaron de usarse. */
  update(id: string, data: ProjectInput, ownerId?: string): Promise<{ project: Project; removedPublicIds: string[] } | null>;
  /** Devuelve los archivos del proyecto eliminado, o null si no existía. */
  delete(id: string, ownerId?: string): Promise<{ publicIds: string[] } | null>;
  setStatus(id: string, status: ProjectStatus, ownerId?: string): Promise<Project | null>;
  findById(id: string, ownerId?: string): Promise<Project | null>;
  findBySlug(slug: string): Promise<Project | null>;
  findMany(filters: ProjectFilters, includeUnpublished: boolean, ownerId?: string): Promise<ProjectPage>;
  incrementViews(id: string): Promise<void>;

  addUnit(projectId: string, unit: ProjectUnitData, ownerId?: string): Promise<ProjectUnit | null>;
  updateUnit(unitId: string, unit: Partial<ProjectUnitData>, ownerId?: string): Promise<ProjectUnit | null>;
  deleteUnit(unitId: string, ownerId?: string): Promise<boolean>;

  listComments(projectId: string): Promise<ProjectComment[]>;
  addComment(projectId: string, authorName: string, content: string): Promise<ProjectComment>;
  deleteComment(commentId: string, ownerId?: string): Promise<boolean>;
}
