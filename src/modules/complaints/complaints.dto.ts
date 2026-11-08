import { Type } from "class-transformer";
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class CreateComplaintDto {
  @IsString() @MinLength(2) @MaxLength(100) claimantName!: string;
  @IsEmail() @MaxLength(254) claimantEmail!: string;
  @IsString() @MinLength(3) @MaxLength(30) claimantPhone!: string;
  @IsOptional() @IsString() @MaxLength(40) documentNumber?: string;
  @IsIn(["COMPLAINT", "GRIEVANCE"]) entryType!: "COMPLAINT" | "GRIEVANCE";
  @IsString() @MinLength(2) @MaxLength(200) serviceDescription!: string;
  @IsString() @MinLength(10) @MaxLength(5000) detail!: string;
  @IsOptional() @IsString() @MaxLength(2000) desiredResolution?: string;
}

export class ComplaintListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 20;
}
