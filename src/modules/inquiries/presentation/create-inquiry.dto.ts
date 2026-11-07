import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

export const INQUIRY_LISTING_TYPES = ["PROPERTY", "PROJECT"] as const;
export type InquiryListingType = (typeof INQUIRY_LISTING_TYPES)[number];

export class CreateInquiryDto {
  @IsIn(INQUIRY_LISTING_TYPES)
  listingType!: InquiryListingType;

  @IsString()
  @IsNotEmpty()
  listingId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(7)
  @MaxLength(16)
  phone!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  message!: string;
}
