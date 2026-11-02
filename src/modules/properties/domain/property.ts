import type { ProfileRole } from "../../../shared/profile-role";

export type OperationType = "SALE" | "RENT" | "TEMPORARY_RENT" | "TRANSFER";
export type PropertyType = "APARTMENT" | "HOUSE" | "LAND" | "OFFICE" | "COMMERCIAL" | "ROOM" | "WAREHOUSE" | "PARKING";
export type Currency = "BOB" | "USD";
export type ConservationStatus = "NEW" | "EXCELLENT" | "GOOD" | "REMODELED" | "TO_REMODEL" | "UNDER_CONSTRUCTION";

export interface PropertyLocation {
  department: string;
  province: string;
  district: string;
  address: string;
  number?: string;
  sector?: string;
  reference?: string;
  latitude?: number;
  longitude?: number;
  approximateLocation: boolean;
}

export interface PropertyDetails {
  totalArea?: number;
  constructedArea?: number;
  bedrooms?: number;
  bathrooms?: number;
  halfBathrooms?: number;
  parkingSpaces?: number;
  floor?: number;
  floors?: number;
  constructionYear?: number;
  conservationStatus?: ConservationStatus;
  specificDetails?: Record<string, string | number | boolean>;
}

export interface PropertyMedia {
  url: string;
  publicId?: string;
  position?: number;
  isCover?: boolean;
}

export interface CreatePropertyData {
  createdByRole: ProfileRole;
  operationType: OperationType;
  propertyType: PropertyType;
  title: string;
  description: string;
  price: number;
  currency: Currency;
  negotiable?: boolean;
  maintenanceFee?: number;
  location: PropertyLocation;
  details: PropertyDetails;
  amenityCodes?: string[];
  media: PropertyMedia[];
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactWhatsapp?: string;
}

export interface Property extends Omit<CreatePropertyData, "createdByRole"> {
  id: string;
  slug: string;
  createdByRole: ProfileRole;
  status: "PUBLISHED";
  createdAt: string;
  updatedAt: string;
}

export const PROPERTY_REPOSITORY = Symbol("PROPERTY_REPOSITORY");

export interface PropertyRepository {
  create(data: CreatePropertyData): Promise<Property>;
  findAll(): Promise<Property[]>;
}
