import type { DimDef } from "./types";

// UI definitions for each scoring dimension. Grouped for the prefs panel.
// `description` is shown as a hover tooltip on the label — keep concise and
// include reference values to anchor the user's mental scale.
export const DIMENSIONS: DimDef[] = [
  // ---- Weather: two-sided (range) ----
  { key: "summer_high", label: "Summer high (°F)", group: "Weather",
    description:
      "Average daily June-Aug high (NOAA 1991-2020 normals, per-county nearest-station). 75°F mild · 85°F warm · 95°F hot · 100°F+ desert.",
    mode: { kind: "range", min: 50, max: 110, step: 1, unit: "°F",
            defaultMin: 75, defaultMax: 90 } },
  { key: "winter_low", label: "Winter low (°F)", group: "Weather",
    description:
      "Average daily Dec-Feb low (NOAA 1991-2020 normals, per-county nearest-station). 45°F mild south · 25°F cold · 0°F harsh north.",
    mode: { kind: "range", min: -20, max: 70, step: 1, unit: "°F",
            defaultMin: 25, defaultMax: 50 } },
  { key: "annual_precip", label: "Annual rainfall (in)", group: "Weather",
    description:
      "Total inches of rain per year (NOAA 1991-2020 normals). 10in arid (Phoenix) · 35in US avg · 60in Gulf Coast / PNW · 100in+ Olympic Peninsula.",
    mode: { kind: "range", min: 0, max: 150, step: 1, unit: "in",
            defaultMin: 20, defaultMax: 50 } },

  // ---- Weather: one-sided ----
  { key: "annual_snow", label: "Annual snow (max in)", group: "Weather",
    description:
      "Annual snowfall in inches (NOAA 1991-2020 normals). 0 = southern · 30 = NYC/Chicago · 80 = upstate NY · 150+ = mountain/lake-effect zones.",
    mode: { kind: "one_sided", min: 0, max: 250, step: 5, unit: "in",
            defaultThreshold: 24, direction: "lower" } },
  { key: "sunshine", label: "Sunshine (min %)", group: "Weather",
    description:
      "Percent of daylight hours with clear/few-cloud sky (NOAA hourly normals 1991-2020, per-county via nearest-station). 45% Pacific NW · 65% NE/Midwest · 85%+ Southwest.",
    mode: { kind: "one_sided", min: 30, max: 95, step: 1, unit: "%",
            defaultThreshold: 60, direction: "higher" } },
  { key: "dew_point", label: "Summer dew point (max °F)", group: "Weather",
    description:
      "Summer humidity (NOAA hourly normals 1991-2020, JJA average, per-county). <55°F dry & comfortable · 55-65°F sticky · 65+°F oppressive (FL, Gulf).",
    mode: { kind: "one_sided", min: 25, max: 75, step: 1, unit: "°F",
            defaultThreshold: 55, direction: "lower" } },
  { key: "aqi", label: "Air quality / AQI (max)", group: "Weather",
    description:
      "Average annual EPA Air Quality Index. <50 good · 50-100 moderate · 100-150 unhealthy for sensitive groups.",
    mode: { kind: "one_sided", min: 20, max: 100, step: 1, unit: "",
            defaultThreshold: 55, direction: "lower" } },

  // ---- Politics ----
  { key: "politics", label: "Political lean", group: "Politics",
    description:
      "2024 presidential vote share. Strong D = 70%+ Dem · Lean D = 55-70% · Neutral ≈ 50/50 · Lean R = 30-45% · Strong R = <30% Dem.",
    mode: { kind: "categorical_politics" } },

  // ---- Cost ----
  { key: "home_price", label: "Median home price ($)", group: "Cost",
    description:
      "Median value of owner-occupied homes (Census ACS 2022). Reference: $250k rural midwest · $450k Sun Belt cities · $800k+ coastal CA/NE.",
    mode: { kind: "range", min: 50_000, max: 1_500_000, step: 25_000, unit: "$",
            defaultMin: 200_000, defaultMax: 450_000 } },
  { key: "median_rent", label: "Median rent ($/mo)", group: "Cost",
    description:
      "Median gross monthly rent (Census ACS 2022). $1,000 cheap · $1,800 average · $2,500+ HCOL metros.",
    mode: { kind: "linear_target", min: 500, max: 4000, step: 50, unit: "$", defaultTarget: 1500 } },
  { key: "property_tax", label: "Property tax (lower = better)", group: "Cost",
    description:
      "Effective annual property tax as % of home value. <1% low (most South/West) · 1-2% moderate · 2-3% high (NJ, IL, TX).",
    mode: { kind: "percentile" } },
  { key: "state_income_tax", label: "State income tax (lower = better)", group: "Cost",
    description:
      "Top marginal state income tax rate on wages. 0% in FL/TX/WA/etc. · 5-7% most states · 10-13% NJ/CA/HI.",
    mode: { kind: "percentile" } },

  // ---- Crime ----
  { key: "homicide_rate", label: "Homicide rate (lower = better)", group: "Crime",
    description:
      "Annual homicides per 100,000 residents (CHR 2024). US average ≈ 6. <2 very low · 2-5 low · 5-10 moderate · 10+ high. Rural counties may have suppressed data.",
    mode: { kind: "percentile" } },
  { key: "firearm_deaths", label: "Firearm deaths (lower = better)", group: "Crime",
    description:
      "Annual firearm-related deaths per 100k (includes homicide, suicide, accidents). US avg ≈ 14. <10 low · 10-18 moderate · 18-25 high · 25+ very high.",
    mode: { kind: "percentile" } },

  // ---- Disasters ----
  { key: "disaster_risk", label: "Overall disaster risk (lower = better)", group: "Disasters",
    description:
      "FEMA National Risk Index composite score, 0-100. Combines 18 natural hazards weighted by historic loss + social vulnerability.",
    mode: { kind: "percentile" } },
  { key: "hurricane_risk", label: "Hurricane (lower = better)", group: "Disasters",
    description:
      "FEMA NRI hurricane component, 0-100. Highest along Gulf Coast (LA, TX, FL) and Atlantic (NC, SC).",
    mode: { kind: "percentile" } },
  { key: "tornado_risk", label: "Tornado (lower = better)", group: "Disasters",
    description:
      "FEMA NRI tornado component, 0-100. Highest in Tornado Alley (OK, KS, TX, MO) and Dixie Alley (MS, AL, TN).",
    mode: { kind: "percentile" } },
  { key: "wildfire_risk", label: "Wildfire (lower = better)", group: "Disasters",
    description:
      "FEMA NRI wildfire component, 0-100. Highest in California, Pacific NW interior, Mountain West.",
    mode: { kind: "percentile" } },
  { key: "flood_risk", label: "Flood (lower = better)", group: "Disasters",
    description:
      "FEMA NRI flood component (max of coastal + riverine). Highest along major rivers, Gulf coast, and lowland coastal areas.",
    mode: { kind: "percentile" } },
  { key: "earthquake_risk", label: "Earthquake (lower = better)", group: "Disasters",
    description:
      "FEMA NRI earthquake component, 0-100. Highest in CA, PNW, AK, Mountain West, plus the New Madrid zone (TN/AR/MO).",
    mode: { kind: "percentile" } },
  { key: "heat_wave_risk", label: "Heat wave (lower = better)", group: "Disasters",
    description:
      "FEMA NRI heat wave component, 0-100. Combines historic events + social vulnerability — distinct from raw summer high temps. Climate-change-sensitive.",
    mode: { kind: "percentile" } },

  // ---- Demographics ----
  { key: "pop_density", label: "Population density (per sq mi)", group: "Demographics",
    description:
      "People per square mile. <100 rural · 500-2,000 suburban · 5,000+ urban · 20,000+ dense city (Manhattan ≈ 75,000).",
    mode: { kind: "linear_target", min: 0, max: 5000, step: 50, unit: "/mi²", defaultTarget: 500 } },
  { key: "diversity", label: "Diversity (% non-white)", group: "Demographics",
    description:
      "Percent of residents who are NOT non-Hispanic White (Census B03002). Includes Hispanic/Latino ethnicity correctly. US avg ≈ 41%.",
    mode: { kind: "linear_target", min: 0, max: 100, step: 1, unit: "%", defaultTarget: 40 } },
  { key: "lgbtq_policy", label: "LGBTQ-protective policy (higher = better)", group: "Demographics",
    description:
      "State-level Movement Advancement Project Equality Index, 0-100. Higher = stronger legal protections (non-discrimination, marriage, healthcare).",
    mode: { kind: "percentile" } },

  // ---- Community ----
  { key: "median_age", label: "Median age (years)", group: "Community",
    description:
      "Median resident age (Census ACS 2023). 30-35 = young/college town · 38-42 = US average · 45+ = older / retirement areas.",
    mode: { kind: "range", min: 20, max: 65, step: 1, unit: "yr",
            defaultMin: 30, defaultMax: 50 } },
  { key: "population", label: "Population", group: "Community",
    description:
      "Total county population (Census ACS 2023). <10k rural · 50k-200k small city · 500k-1M mid-size metro · 1M+ major metro.",
    mode: { kind: "range", min: 0, max: 2_000_000, step: 5000, unit: "ppl",
            defaultMin: 20_000, defaultMax: 500_000 } },

  // ---- Geography: one-sided (closer = better, capped at threshold) ----
  { key: "dist_to_coast", label: "Distance to coast (max mi)", group: "Geography",
    description:
      "Straight-line distance to nearest US coast (Pacific, Atlantic, Gulf, Great Lakes, HI/AK shores). 0-50 coastal · 100-300 near-coast · 500+ interior.",
    mode: { kind: "one_sided", min: 0, max: 1500, step: 25, unit: "mi",
            defaultThreshold: 100, direction: "lower" } },
  { key: "dist_to_mountains", label: "Distance to mountains (max mi)", group: "Geography",
    description:
      "Straight-line distance to nearest significant range (Sierras, Rockies, Cascades, Appalachians, Adirondacks, etc.). 0-50 in/near mountains · 200+ Great Plains / midwest flatlands.",
    mode: { kind: "one_sided", min: 0, max: 1500, step: 25, unit: "mi",
            defaultThreshold: 100, direction: "lower" } },
];

export const GROUPS = Array.from(new Set(DIMENSIONS.map((d) => d.group)));
