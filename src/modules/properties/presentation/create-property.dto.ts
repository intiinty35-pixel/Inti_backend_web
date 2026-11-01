import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { PROFILE_ROLES } from "../../../shared/profile-role";
import type { ConservationStatus, CreatePropertyData } from "../domain/property";

const OPERATION_TYPES = ["SALE", "RENT", "TEMPORARY_RENT", "TRANSFER"];
const PROPERTY_TYPES = ["APARTMENT", "HOUSE", "LAND", "OFFICE", "COMMERCIAL", "ROOM", "WAREHOUSE", "PARKING"];
const CURRENCIES = ["PEN", "USD"];
const CONSERVATION_STATUSES = ["NEW", "EXCELLENT", "GOOD", "REMODELED", "TO_REMODEL", "UNDER_CONSTRUCTION"];

export class PropertyLocationDto {
  @IsString() @IsNotEmpty() department!: string;
  @IsString() @IsNotEmpty() province!: string;
  @IsString() @IsNotEmpty() district!: string;
  @IsString() @IsNotEmpty() address!: string;
  @IsOptional() @IsString() number?: string;
  @IsOptional() @IsString() sector?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsBoolean() approximateLocation = true;
}

export class PropertyDetailsDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) totalArea?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) constructedArea?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) bedrooms?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) bathrooms?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) halfBathrooms?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) parkingSpaces?: number;
  @IsOptional() @Type(() => Number) @IsInt() floor?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) floors?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1800) constructionYear?: number;
  @IsOptional() @IsIn(CONSERVATION_STATUSES) conservationStatus?: ConservationStatus;
  @IsOptional() @IsObject() specificDetails?: Record<string, string | number | boolean>;
}

export class PropertyMediaDto {
  @IsString() @IsNotEmpty() url!: string;
  @IsOptional() @IsString() publicId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
  @IsOptional() @IsBoolean() isCover?: boolean;
}

export class CreatePropertyDto implements CreatePropertyData {
  @IsIn(Object.values(PROFILE_ROLES)) createdByRole!: CreatePropertyData["createdByRole"];
  @IsIn(OPERATION_TYPES) operationType!: CreatePropertyData["operationType"];
  @IsIn(PROPERTY_TYPES) propertyType!: CreatePropertyData["propertyType"];
  @IsString() @IsNotEmpty() @MaxLength(100) title!: string;
  @IsString() @IsNotEmpty() @MinLength(100) @MaxLength(5000) description!: string;
  @Type(() => Number) @IsNumber() @Min(1) price!: number;
  @IsIn(CURRENCIES) currency!: CreatePropertyData["currency"];
  @IsOptional() @IsBoolean() negotiable?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maintenanceFee?: number;
  @ValidateNested() @Type(() => PropertyLocationDto) location!: PropertyLocationDto;
  @ValidateNested() @Type(() => PropertyDetailsDto) details!: PropertyDetailsDto;
  @IsOptional() @IsArray() @IsString({ each: true }) amenityCodes?: string[];
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PropertyMediaDto) media!: PropertyMediaDto[];
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() contactWhatsapp?: string;
}
