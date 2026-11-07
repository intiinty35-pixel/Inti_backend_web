import { IsBoolean } from "class-validator";

export class MarkInquiryReadDto {
  @IsBoolean()
  read!: boolean;
}
