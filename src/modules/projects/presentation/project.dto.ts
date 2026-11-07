import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import {
  MAX_PAGE_SIZE,
  MEDIA_KINDS,
  PROJECT_CURRENCIES,
  PROJECT_PHASES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  UNIT_STATUSES,
  UNIT_TYPES,
  type MediaKind,
  type ProjectCurrency,
  type ProjectFilters,
  type ProjectInput,
  type ProjectMediaData,
  type ProjectPhase,
  type ProjectStatus,
  type ProjectTimelineData,
  type ProjectType,
  type ProjectUnitData,
  type UnitStatus,
  type UnitType,
} from "../domain/project";

export class ProjectUnitDto implements ProjectUnitData {
  @IsOptional() @IsString() id?: string;
  @IsString() @MaxLength(50) unitNumber!: string;
  @IsIn(UNIT_TYPES) type!: UnitType;
  @IsOptional() @Type(() => Number) @IsInt() floor?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) area?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) bedrooms?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) bathrooms?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) parkingSpots?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) price?: number;
  @IsIn(UNIT_STATUSES) status: UnitStatus = "AVAILABLE";
  @IsOptional() @IsString() @MaxLength(50) view?: string;
  @IsOptional() @IsString() @MaxLength(50) block?: string;
  @IsOptional() @IsString() @MaxLength(50) lotNumber?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) frontWidth?: number;
}

export class UpdateProjectUnitDto implements Partial<Omit<ProjectUnitData, "id" | "type">> {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(50) unitNumber?: string;
  @IsOptional() @Type(() => Number) @IsInt() floor?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) area?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) bedrooms?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) bathrooms?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) parkingSpots?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsIn(UNIT_STATUSES) status?: UnitStatus;
  @IsOptional() @IsString() @MaxLength(50) view?: string;
  @IsOptional() @IsString() @MaxLength(50) block?: string;
  @IsOptional() @IsString() @MaxLength(50) lotNumber?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) frontWidth?: number;
}

export class ProjectMediaDto implements ProjectMediaData {
  @IsString() @IsNotEmpty() @MaxLength(500) url!: string;
  @IsOptional() @IsString() @MaxLength(100) publicId?: string;
  @IsIn(MEDIA_KINDS) kind: MediaKind = "IMAGE";
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
  @IsOptional() @IsBoolean() isCover?: boolean;
}

export class ProjectTimelineDto implements ProjectTimelineData {
  @IsString() @IsNotEmpty() @MaxLength(100) phase!: string;
  @IsString() @IsNotEmpty() date!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsBoolean() completed?: boolean;
}

export class ProjectDto implements ProjectInput {
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @IsString() @MinLength(30) @MaxLength(5000) description!: string;
  @IsIn(PROJECT_TYPES) type!: ProjectType;
  @IsIn(PROJECT_PHASES) phase!: ProjectPhase;
  @IsIn(PROJECT_CURRENCIES) currency!: ProjectCurrency;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) floors?: number;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() estimatedDelivery?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) constructionProgress?: number;

  @IsString() @IsNotEmpty() @MaxLength(100) department!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) province!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) district!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) address!: string;
  @IsOptional() @IsString() @MaxLength(200) urbanization?: string;
  @IsOptional() @IsString() @MaxLength(300) reference?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @IsBoolean() showExactAddress?: boolean;

  @IsOptional() @IsString() @MaxLength(100) contactName?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(30) contactPhone?: string;
  @IsOptional() @IsString() @MaxLength(30) contactWhatsapp?: string;
  @IsOptional() @IsString() @MaxLength(255) websiteUrl?: string;

  @IsOptional() @IsString() @MaxLength(20) ruc?: string;
  @IsOptional() @IsString() @MaxLength(200) socialReason?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) initialFee?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) monthlyPayment?: number;
  @IsOptional() @IsString() @MaxLength(500) financingInfo?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) totalBlocks?: number;
  @IsOptional() @IsBoolean() hasUrbanization?: boolean;
  @IsOptional() @IsBoolean() hasPropertyTitle?: boolean;

  @IsArray() @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => ProjectUnitDto) units!: ProjectUnitDto[];
  @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => ProjectMediaDto) media!: ProjectMediaDto[];
  @IsArray() @ArrayMaxSize(60) @IsString({ each: true }) @MaxLength(100, { each: true }) amenities!: string[];
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => ProjectTimelineDto) timeline!: ProjectTimelineDto[];
}

export class ChangeProjectStatusDto {
  @IsIn(PROJECT_STATUSES) status!: ProjectStatus;
}

export class CreateProjectCommentDto {
  @IsString() @MinLength(2) @MaxLength(60) authorName!: string;
  @IsString() @MinLength(3) @MaxLength(1000) content!: string;
}

export class ListProjectsQuery implements ProjectFilters {
  @IsOptional() @IsIn(PROJECT_TYPES) type?: ProjectType;
  @IsOptional() @IsIn(PROJECT_PHASES) phase?: ProjectPhase;
  @IsOptional() @IsIn(PROJECT_CURRENCIES) currency?: ProjectCurrency;
  @IsOptional() @IsString() @MaxLength(100) location?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(PROJECT_STATUSES) status?: ProjectStatus;
  @IsOptional() @IsIn(["AGENT", "USER"]) ownerRole?: "AGENT" | "USER";
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) priceMin?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) priceMax?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE_SIZE) pageSize?: number;
}

export class DeleteProjectQuery {
  @IsOptional() @IsIn(["true", "false"]) force?: string;
}
