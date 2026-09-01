import type { AmenityGroup } from './roomContent.types';
export type { AmenityGroup };

export interface RoomGroupEntry {
  name: string;
  images: string[];
  roomAmenities: string[];   // raw ETG slugs, lowercase-hyphen
  beddingType?: string;      // name_struct.bedding_type, e.g. "double bed"
  bathroomType?: string;     // name_struct.bathroom, e.g. "private"
  roomGroupId?: number;
}

export interface MetapolicyEntry {
  inclusion?: string;        // "included" | "paid" | "not_available" | ...
  price?: number;
  currency?: string;
  price_unit?: string;       // "per_night" | "per_day" | "per_stay"
  amount?: number;
  age_start?: number;
  age_end?: number;
  extra_bed?: string;
  internet_type?: string;
  work_area?: string;
  territory_type?: string;
  meal_type?: string;
}

export interface MetapolicyStruct {
  children?: MetapolicyEntry[];
  children_meal?: MetapolicyEntry[];
  cot?: MetapolicyEntry[];
  extra_bed?: MetapolicyEntry[];
  internet?: MetapolicyEntry[];
  parking?: MetapolicyEntry[];
  pets?: MetapolicyEntry[];
  deposit?: MetapolicyEntry[];
  no_show?: MetapolicyEntry[];
}

export interface EtgContent {
  roomGroups: RoomGroupEntry[];
  amenityGroups: AmenityGroup[];
  metapolicy: MetapolicyStruct | null;
  metapolicyExtraInfo: string | null;
  importantInformation: string | null;
}
