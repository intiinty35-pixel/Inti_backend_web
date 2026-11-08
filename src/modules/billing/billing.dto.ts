import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min, MinLength } from "class-validator";
import { PaymentOrderStatus } from "@prisma/client";

export class PlanDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsString() @MaxLength(1000) description!: string;
  @IsOptional() @IsString() @Matches(/^\d{1,9}(\.\d{1,2})?$/) priceBOB?: string;
  @IsOptional() @IsString() @Matches(/^\d{1,9}(\.\d{1,2})?$/) priceAmount?: string;
  @IsOptional() @IsIn(["BOB", "USD"]) priceCurrency: "BOB" | "USD" = "BOB";
  @IsOptional() @IsInt() @Min(0) @Max(10000) maxProjects = 0;
  @IsInt() @Min(1) @Max(10000) maxProperties!: number;
  @IsInt() @Min(1) @Max(12) maxPhotos!: number;
  @IsInt() @Min(0) @Max(10000) featuredLimit!: number;
  @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(200, { each: true }) benefits!: string[];
  @IsInt() @Min(0) @Max(100) displayOrder!: number;
  @IsBoolean() isActive!: boolean;
}

export class BillingSettingsDto {
  @IsString() @Matches(/^\d{1,5}(\.\d{1,6})?$/) bobPerUsd!: string;
  @IsInt() @Min(1) @Max(168) orderExpiryHours!: number;
}

export class PaymentMethodDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsString() @MaxLength(100) provider!: string;
  @IsString() @MaxLength(120) holder!: string;
  @IsString() @MaxLength(40) phone!: string;
  @IsString() @MaxLength(80) accountNumber!: string;
  @IsString() @MaxLength(80) bankCode!: string;
  @IsOptional() @IsUrl({ protocols: ["https"], require_protocol: true }) qrImageUrl?: string;
  @IsArray() @ArrayUnique() @ArrayMaxSize(2) @IsIn(["BOB", "USD"], { each: true }) currencies!: string[];
  @IsString() @MaxLength(2000) instructions!: string;
  @IsBoolean() isActive!: boolean;
}

export class CreateOrderDto {
  @IsString() @MinLength(1) @MaxLength(100) planId!: string;
  @IsString() @MinLength(1) @MaxLength(100) methodId!: string;
  @IsIn(["BOB", "USD"]) currency!: "BOB" | "USD";
}

export class ReviewPaymentDto {
  @IsIn(["APPROVE", "REJECT"]) action!: "APPROVE" | "REJECT";
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

export class BillingQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 15;
  @IsOptional() @IsIn(Object.values(PaymentOrderStatus)) status?: PaymentOrderStatus;
  @IsOptional() @IsIn(["BOB", "USD"]) currency?: string;
  @IsOptional() @IsString() @MaxLength(100) userId?: string;
  @IsOptional() @IsString() @MaxLength(100) planId?: string;
  @IsOptional() @IsString() @MaxLength(100) methodId?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) to?: string;
}

export class AccountStateDto {
  @IsIn(["ACTIVE", "SUSPENDED", "BLOCKED", "INACTIVE"]) status!: string;
  @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}

export class PublicationDto {
  @IsOptional() @IsBoolean() featured = false;
}

export class PlanVisibilityDto {
  @IsBoolean() isActive!: boolean;
}

export class PublicationDecisionDto {
  @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}
