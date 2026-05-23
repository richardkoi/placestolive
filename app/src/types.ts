// Matches server/schema.py.

export type Direction = "higher" | "lower";
export type PoliticalLean = "strong_d" | "lean_d" | "neutral" | "lean_r" | "strong_r";

export interface Dimension {
  weight: number;                  // 0-10 (0 disables)
  target?: number;
  direction?: Direction;
  political_lean?: PoliticalLean;
  range_min?: number;
  range_max?: number;
  threshold?: number;
  max?: number;
  min?: number;
}

export interface AnchorCity {
  name: string;
  lat: number;
  lon: number;
  max_miles: number;
}

export interface ScoreRequest {
  // weather
  summer_high?: Dimension;
  winter_low?: Dimension;
  dew_point?: Dimension;
  annual_precip?: Dimension;
  annual_snow?: Dimension;
  sunshine?: Dimension;
  aqi?: Dimension;
  // politics
  politics?: Dimension;
  // cost
  home_price?: Dimension;
  median_rent?: Dimension;
  property_tax?: Dimension;
  state_income_tax?: Dimension;
  // crime
  homicide_rate?: Dimension;
  firearm_deaths?: Dimension;
  // disasters
  disaster_risk?: Dimension;
  hurricane_risk?: Dimension;
  tornado_risk?: Dimension;
  wildfire_risk?: Dimension;
  flood_risk?: Dimension;
  earthquake_risk?: Dimension;
  // demographics
  pop_density?: Dimension;
  diversity?: Dimension;
  lgbtq_policy?: Dimension;
  median_age?: Dimension;
  population?: Dimension;
  heat_wave_risk?: Dimension;
  // geography
  dist_to_coast?: Dimension;
  dist_to_mountains?: Dimension;
  elevation?: Dimension;

  anchor?: AnchorCity;
  continental_only?: boolean;     // exclude AK + HI; defaults true server-side
  limit?: number;
}

export interface ScoredCounty {
  fips: string;
  name: string;
  state: string;
  score: number;
  breakdown: Record<string, number>;
}

export interface ScoreResponse {
  counties: ScoredCounty[];
  top: ScoredCounty[];
  total_after_filter: number;
  total_before_filter: number;
}

// UI configuration for each dimension
export type DimMode =
  | { kind: "linear_target"; min: number; max: number; step: number; unit: string; defaultTarget: number }
  | { kind: "percentile" }
  | { kind: "categorical_politics" }
  | {
      kind: "range";
      min: number;
      max: number;
      step: number;
      unit: string;
      defaultMin: number;
      defaultMax: number;
    }
  | {
      kind: "one_sided";
      min: number;
      max: number;
      step: number;
      unit: string;
      defaultThreshold: number;
      direction: "higher" | "lower";   // which side is "good"
    };

export interface DimDef {
  key: keyof ScoreRequest;
  label: string;
  group: string;
  mode: DimMode;
  description?: string;            // shown as hover tooltip on the prefs panel label
  hardFilter?: { kind: "max" | "min"; unit: string; step: number; defaultValue?: number };
}
