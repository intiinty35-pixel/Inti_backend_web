import { Type } from "class-transformer";
import { IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class CreateComplaintDto {
  @IsString() @MinLength(2) @MaxLength(80) claimantFirstName!: string;
  @IsString() @MinLength(2) @MaxLength(100) claimantLastName!: string;
  @IsEmail() @MaxLength(254) claimantEmail!: string;
  @IsString() @MinLength(3) @MaxLength(30) claimantPhone!: string;
  @IsIn(["CI", "NIT", "PASSPORT", "OTHER"]) documentType!: "CI" | "NIT" | "PASSPORT" | "OTHER";
  @IsString() @MinLength(2) @MaxLength(40) documentNumber!: string;
  @IsIn(["Chuquisaca", "La Paz", "Cochabamba", "Oruro", "Potosí", "Tarija", "Santa Cruz", "Beni", "Pando"]) department!: string;
  @IsString() @MinLength(2) @MaxLength(100) municipality!: string;
  @IsString() @MinLength(3) @MaxLength(240) address!: string;
  @IsIn(["COMPLAINT", "GRIEVANCE"]) entryType!: "COMPLAINT" | "GRIEVANCE";
  @IsString() @MinLength(2) @MaxLength(200) serviceDescription!: string;
  @IsOptional() @IsString() @MaxLength(100) transactionNumber?: string;
  @IsDateString() incidentDate!: string;
  @IsString() @MinLength(10) @MaxLength(5000) detail!: string;
  @IsString() @MinLength(2) @MaxLength(2000) desiredResolution!: string;
}

export class ComplaintListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 20;
}
