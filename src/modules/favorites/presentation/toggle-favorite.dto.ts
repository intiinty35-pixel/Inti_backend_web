import { IsIn, IsNotEmpty, IsString, MaxLength } from "class-validator";

export const FAVORITE_LISTING_TYPES = ["PROPERTY", "PROJECT"] as const;
export type FavoriteListingType = (typeof FAVORITE_LISTING_TYPES)[number];

export class ToggleFavoriteDto {
  @IsIn(FAVORITE_LISTING_TYPES)
  listingType!: FavoriteListingType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  listingId!: string;
}
