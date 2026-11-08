import { Type } from "class-transformer";
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export const AUDIT_CATEGORIES = ["PROPERTY", "PROJECT", "USER", "AUTH", "PAYMENT", "PLAN", "SUBSCRIPTION", "PAYMENT_METHOD", "INQUIRY", "CONFIG", "SYSTEM"];

export class AuditQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @IsOptional() @IsString() @MaxLength(100) userId?: string;
  @IsOptional() @IsString() @MaxLength(100) actorId?: string;
  @IsOptional() @IsIn(["USER", "AGENT", "ADMINISTRATOR", "SYSTEM", "ANONYMOUS"]) role?: string;
  @IsOptional() @IsIn(AUDIT_CATEGORIES) category?: string;
  @IsOptional() @IsString() @MaxLength(100) action?: string;
  @IsOptional() @IsIn(["true", "false"]) success?: string;
  @IsOptional() @IsString() @MaxLength(150) search?: string;
  @IsOptional() @IsDateString({ strict: true }) from?: string;
  @IsOptional() @IsDateString({ strict: true }) to?: string;
  @IsOptional() @IsDateString({ strict: true }) asOf?: string;
}
