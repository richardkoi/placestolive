// In-browser scoring engine. Direct port of server/scoring.py.
//
// Counties dataset is shipped as counties.json (rows + fields layout).
// Loaded once at startup, then every prefs change scores in-memory against it.
// All 3,144 counties × 25 dims = ~78k operations per request — sub-10ms in V8.

import type { Dimension, ScoreRequest, ScoredCounty, ScoreResponse } from "../types";

// Layout matches server/scoring.py's DIMENSIONS dict.
type Mode = "linear_target" | "percentile" | "categorical" | "range" | "one_sided";

interface DimCfg {
  col: string;
  mode: Mode;
  decay?: number;        // linear_target
  better?: "lower" | "higher";  // percentile + one_sided default
  best?: number;         // one_sided: 100-match end of scale
  direction?: "lower" | "higher";  // one_sided default
  similarDecay?: number; // similar() falloff width
}

export const DIMENSIONS: Record<string, DimCfg> = {
  // weather — range
  summer_high:     { col: "summer_high_f",    mode: "range",     similarDecay: 15 },
  winter_low:      { col: "winter_low_f",     mode: "range",     similarDecay: 20 },
  annual_precip:   { col: "annual_precip_in", mode: "range",     similarDecay: 20 },
  // weather — one-sided
  annual_snow:     { col: "annual_snow_in",   mode: "one_sided", best: 0,  direction: "lower",  similarDecay: 20 },
  sunshine:        { col: "sunshine_pct",     mode: "one_sided", best: 95, direction: "higher", similarDecay: 20 },
  dew_point:       { col: "dew_point_f",      mode: "one_sided", best: 35, direction: "lower",  similarDecay: 15 },
  aqi:             { col: "aqi_mean",         mode: "one_sided", best: 20, direction: "lower",  similarDecay: 30 },
  // politics
  politics:        { col: "dem_share_pct",    mode: "categorical" },
  // cost
  home_price:      { col: "median_home_value", mode: "range",    similarDecay: 150000 },
  median_rent:     { col: "median_rent",      mode: "linear_target", decay: 1000 },
  property_tax:    { col: "property_tax_pct", mode: "percentile", better: "lower" },
  state_income_tax:{ col: "state_income_tax_pct", mode: "percentile", better: "lower" },
  // crime
  homicide_rate:   { col: "homicide_per_100k", mode: "percentile", better: "lower" },
  firearm_deaths:  { col: "firearm_deaths_per_100k", mode: "percentile", better: "lower" },
  // disasters
  disaster_risk:   { col: "fema_risk_score",  mode: "percentile", better: "lower" },
  hurricane_risk:  { col: "fema_hurricane",   mode: "percentile", better: "lower" },
  tornado_risk:    { col: "fema_tornado",     mode: "percentile", better: "lower" },
  wildfire_risk:   { col: "fema_wildfire",    mode: "percentile", better: "lower" },
  flood_risk:      { col: "fema_flood",       mode: "percentile", better: "lower" },
  earthquake_risk: { col: "fema_earthquake",  mode: "percentile", better: "lower" },
  heat_wave_risk:  { col: "fema_heat",        mode: "percentile", better: "lower" },
  // demographics
  pop_density:     { col: "pop_density",      mode: "linear_target", decay: 1500 },
  diversity:       { col: "diversity_pct",    mode: "linear_target", decay: 30 },
  lgbtq_policy:    { col: "lgbtq_policy_score", mode: "percentile", better: "higher" },
  median_age:      { col: "median_age",       mode: "range", similarDecay: 8 },
  population:      { col: "population",       mode: "range", similarDecay: 200000 },
  // geography
  dist_to_coast:     { col: "dist_to_coast_mi",    mode: "one_sided", best: 0, direction: "lower", similarDecay: 100 },
  dist_to_mountains: { col: "dist_to_mountains_mi", mode: "one_sided", best: 0, direction: "lower", similarDecay: 100 },
  elevation:         { col: "elevation_ft",         mode: "linear_target", decay: 3000 },
};

const LEAN_TARGETS: Record<string, number> = {
  strong_d: 80, lean_d: 60, neutral: 50, lean_r: 40, strong_r: 20,
};

// ---------- Counties dataset --------------------------------------------

export interface CountiesDataset {
  fields: string[];
  rows: (number | string | null)[][];
  fieldIndex: Record<string, number>;
}

export function indexCounties(data: { fields: string[]; rows: (number | string | null)[][] }): CountiesDataset {
  const fieldIndex: Record<string, number> = {};
  data.fields.forEach((f, i) => { fieldIndex[f] = i; });
  return { fields: data.fields, rows: data.rows, fieldIndex };
}

function col(dataset: CountiesDataset, name: string): number | undefined {
  return dataset.fieldIndex[name];
}

// ---------- Match functions ---------------------------------------------

function matchLinearTarget(vals: (number | null)[], target: number, decay: number): (number | null)[] {
  return vals.map((v) => {
    if (v === null) return null;
    const diff = Math.abs(v - target);
    return Math.max(0, Math.min(100, 100 * (1 - diff / decay)));
  });
}

function matchPercentile(vals: (number | null)[], better: "lower" | "higher"): (number | null)[] {
  // Rank-based percentile with NaN preservation
  const indexed = vals.map((v, i) => ({ v, i }));
  const valid = indexed.filter((x) => x.v !== null) as Array<{ v: number; i: number }>;
  valid.sort((a, b) => a.v - b.v);
  const result: (number | null)[] = vals.map(() => null);
  const n = valid.length;
  for (let r = 0; r < n; r++) {
    const pct = (r + 1) / n;     // 0 to 1 as we go from lowest to highest value
    const score = better === "lower" ? (1 - pct) * 100 : pct * 100;
    result[valid[r].i] = score;
  }
  return result;
}

function matchRange(vals: (number | null)[], lo: number, hi: number): (number | null)[] {
  return vals.map((v) => {
    if (v === null) return null;
    return v >= lo && v <= hi ? 100 : null;   // null = exclude
  });
}

function matchOneSided(vals: (number | null)[], threshold: number, best: number, direction: "lower" | "higher"): (number | null)[] {
  return vals.map((v) => {
    if (v === null) return null;
    if (direction === "lower") {
      if (v > threshold) return null;
      const denom = threshold - best || 1;
      return Math.max(0, Math.min(100, ((threshold - v) / denom) * 100));
    }
    if (v < threshold) return null;
    const denom = best - threshold || 1;
    return Math.max(0, Math.min(100, ((v - threshold) / denom) * 100));
  });
}

function matchCategoricalLean(vals: (number | null)[], leanKey: string): (number | null)[] {
  const target = LEAN_TARGETS[leanKey] ?? 50;
  return matchLinearTarget(vals, target, 30);
}

// ---------- Hard filters ------------------------------------------------

function applyHardFilters(rows: number[], dataset: CountiesDataset, req: ScoreRequest): number[] {
  let keep = rows;
  for (const [key, cfg] of Object.entries(DIMENSIONS)) {
    const dim = (req as Record<string, unknown>)[key] as Dimension | undefined;
    if (!dim || (dim.weight ?? 0) <= 0) continue;
    const ci = col(dataset, cfg.col);
    if (ci === undefined) continue;
    keep = keep.filter((rowIdx) => {
      const v = dataset.rows[rowIdx][ci] as number | null;
      if (v === null) return true;            // NaN preserves
      if (dim.max != null && v > dim.max) return false;
      if (dim.min != null && v < dim.min) return false;
      if (cfg.mode === "range") {
        if (dim.range_min != null && dim.range_max != null) {
          if (v < dim.range_min || v > dim.range_max) return false;
        }
      }
      if (cfg.mode === "one_sided" && dim.threshold != null) {
        const direction = dim.direction ?? cfg.direction ?? "lower";
        if (direction === "lower" && v > dim.threshold) return false;
        if (direction === "higher" && v < dim.threshold) return false;
      }
      return true;
    });
  }
  return keep;
}

// ---------- Distance helper for anchor filter --------------------------

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => d * Math.PI / 180;
  const dlat = toRad(lat2 - lat1);
  const dlon = toRad(lon2 - lon1);
  const a = Math.sin(dlat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dlon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ---------- Core score() ------------------------------------------------

export function score(req: ScoreRequest, dataset: CountiesDataset): ScoreResponse {
  const totalBefore = dataset.rows.length;
  const fipsIdx = col(dataset, "fips")!;
  const nameIdx = col(dataset, "county_name")!;
  const stateIdx = col(dataset, "state")!;
  const latIdx = col(dataset, "lat");
  const lonIdx = col(dataset, "lon");

  // Initial filter set: all rows, then continental_only, then hard filters, then anchor radius
  let filtered: number[] = Array.from({ length: dataset.rows.length }, (_, i) => i);

  if (req.continental_only !== false) {
    filtered = filtered.filter((i) => {
      const s = dataset.rows[i][stateIdx] as string;
      return s !== "AK" && s !== "HI";
    });
  }

  filtered = applyHardFilters(filtered, dataset, req);

  if (req.anchor && latIdx !== undefined && lonIdx !== undefined) {
    const ax = req.anchor.lat, ay = req.anchor.lon, max = req.anchor.max_miles;
    filtered = filtered.filter((i) => {
      const lat = dataset.rows[i][latIdx] as number | null;
      const lon = dataset.rows[i][lonIdx] as number | null;
      if (lat === null || lon === null) return false;
      return haversineMiles(ax, ay, lat, lon) <= max;
    });
  }

  if (filtered.length === 0) {
    return { counties: [], top: [], total_after_filter: 0, total_before_filter: totalBefore };
  }

  // For each enabled dim, compute match scores per filtered row
  const matches: Record<string, (number | null)[]> = {};   // key -> array aligned to filtered[]
  const weights: Record<string, number> = {};
  const exclusionMasks: boolean[][] = [];

  for (const [key, cfg] of Object.entries(DIMENSIONS)) {
    const dim = (req as Record<string, unknown>)[key] as Dimension | undefined;
    if (!dim || (dim.weight ?? 0) <= 0) continue;
    const ci = col(dataset, cfg.col);
    if (ci === undefined) continue;
    const vals = filtered.map((i) => dataset.rows[i][ci] as number | null);

    let m: (number | null)[] | null = null;
    if (cfg.mode === "linear_target") {
      if (dim.target === undefined || dim.target === null) continue;
      m = matchLinearTarget(vals, dim.target, cfg.decay ?? 100);
    } else if (cfg.mode === "percentile") {
      const better = (dim.direction ?? cfg.better ?? "lower") as "lower" | "higher";
      m = matchPercentile(vals, better);
    } else if (cfg.mode === "categorical") {
      if (!dim.political_lean) continue;
      m = matchCategoricalLean(vals, dim.political_lean);
    } else if (cfg.mode === "range") {
      if (dim.range_min === undefined || dim.range_max === undefined) continue;
      m = matchRange(vals, dim.range_min, dim.range_max);
      exclusionMasks.push(m.map((x, j) => x !== null || vals[j] === null));
    } else if (cfg.mode === "one_sided") {
      if (dim.threshold === undefined) continue;
      const direction = (dim.direction ?? cfg.direction ?? "lower") as "lower" | "higher";
      m = matchOneSided(vals, dim.threshold, cfg.best ?? 0, direction);
      exclusionMasks.push(m.map((x, j) => x !== null || vals[j] === null));
    }
    if (m === null) continue;
    matches[key] = m;
    weights[key] = dim.weight!;
  }

  // Apply range/one_sided exclusions
  if (exclusionMasks.length > 0) {
    const keepFlags = exclusionMasks[0].slice();
    for (let i = 1; i < exclusionMasks.length; i++) {
      for (let j = 0; j < keepFlags.length; j++) keepFlags[j] = keepFlags[j] && exclusionMasks[i][j];
    }
    const newFiltered: number[] = [];
    for (let j = 0; j < keepFlags.length; j++) {
      if (keepFlags[j]) newFiltered.push(filtered[j]);
    }
    filtered = newFiltered;
    // Reindex matches
    for (const key of Object.keys(matches)) {
      const old = matches[key];
      const fresh: (number | null)[] = [];
      for (let j = 0; j < keepFlags.length; j++) {
        if (keepFlags[j]) fresh.push(old[j]);
      }
      matches[key] = fresh;
    }
  }

  // Composite score per surviving row
  const scores = new Array<number | null>(filtered.length).fill(null);
  const hasWeights = Object.keys(weights).length > 0;
  if (!hasWeights) {
    for (let i = 0; i < scores.length; i++) scores[i] = 50;
  } else {
    for (let i = 0; i < filtered.length; i++) {
      let sum = 0, wsum = 0;
      for (const [key, w] of Object.entries(weights)) {
        const m = matches[key][i];
        if (m === null) continue;
        sum += m * w;
        wsum += w;
      }
      scores[i] = wsum > 0 ? sum / wsum : null;
    }
  }

  // Build ScoredCounty list
  const allResults: ScoredCounty[] = filtered.map((rowIdx, j) => {
    const breakdown: Record<string, number | null> = {};
    for (const key of Object.keys(matches)) {
      breakdown[key] = matches[key][j];
    }
    return {
      fips: dataset.rows[rowIdx][fipsIdx] as string,
      name: (dataset.rows[rowIdx][nameIdx] as string) ?? "",
      state: (dataset.rows[rowIdx][stateIdx] as string) ?? "",
      score: scores[j] ?? 0,
      breakdown,
    };
  });

  // Sort by score descending; null scores last
  allResults.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const limit = req.limit ?? 100;
  return {
    counties: allResults,
    top: allResults.slice(0, limit),
    total_after_filter: filtered.length,
    total_before_filter: totalBefore,
  };
}

// ---------- similar() ---------------------------------------------------

export interface SimilarRequest {
  fips: string;
  prefs: ScoreRequest;
  apply_filters?: boolean;
  continental_only?: boolean;
  limit?: number;
}

export function similar(req: SimilarRequest, dataset: CountiesDataset): ScoreResponse {
  const totalBefore = dataset.rows.length;
  const fipsIdx = col(dataset, "fips")!;
  const stateIdx = col(dataset, "state")!;

  // Find anchor row
  const anchorIdx = dataset.rows.findIndex((r) => r[fipsIdx] === req.fips);
  if (anchorIdx < 0) {
    return { counties: [], top: [], total_after_filter: 0, total_before_filter: totalBefore };
  }
  const anchorRow = dataset.rows[anchorIdx];

  let filtered: number[] = Array.from({ length: dataset.rows.length }, (_, i) => i);
  if (req.continental_only !== false) {
    filtered = filtered.filter((i) => {
      const s = dataset.rows[i][stateIdx] as string;
      return s !== "AK" && s !== "HI";
    });
  }
  if (req.apply_filters) {
    filtered = applyHardFilters(filtered, dataset, req.prefs);
  }

  if (filtered.length === 0) {
    return { counties: [], top: [], total_after_filter: 0, total_before_filter: totalBefore };
  }

  // For each dim — first try user's prefs, fall back to equal weight=1 if none enabled
  function computeMatchFor(_key: string, cfg: DimCfg): (number | null)[] | null {
    const ci = col(dataset, cfg.col);
    if (ci === undefined) return null;
    const anchorVal = anchorRow[ci] as number | null;
    if (anchorVal === null) return null;
    const vals = filtered.map((i) => dataset.rows[i][ci] as number | null);

    if (cfg.mode === "linear_target") {
      return matchLinearTarget(vals, anchorVal, cfg.decay ?? 100);
    }
    if (cfg.mode === "percentile") {
      // Rank-space similarity: anchor's percentile vs each county's, linear falloff
      const allVals = dataset.rows.map((r) => r[ci] as number | null);
      const ranks = percentileRanks(allVals);
      const anchorRank = ranks[anchorIdx];
      if (anchorRank === null) return null;
      const filteredRanks = filtered.map((i) => ranks[i]);
      return matchLinearTarget(filteredRanks.map((x) => x === null ? null : x * 100), anchorRank * 100, 30);
    }
    if (cfg.mode === "categorical") {
      return matchLinearTarget(vals, anchorVal, 30);
    }
    if (cfg.mode === "range" || cfg.mode === "one_sided") {
      return matchLinearTarget(vals, anchorVal, cfg.similarDecay ?? 20);
    }
    return null;
  }

  const matches: Record<string, (number | null)[]> = {};
  const weights: Record<string, number> = {};

  // Pass 1: use enabled prefs
  for (const [key, cfg] of Object.entries(DIMENSIONS)) {
    const dim = (req.prefs as Record<string, unknown>)[key] as Dimension | undefined;
    if (!dim || (dim.weight ?? 0) <= 0) continue;
    const m = computeMatchFor(key, cfg);
    if (m === null) continue;
    matches[key] = m;
    weights[key] = dim.weight!;
  }

  // Fallback: if no prefs enabled, equal weight across all dims
  if (Object.keys(weights).length === 0) {
    for (const [key, cfg] of Object.entries(DIMENSIONS)) {
      const m = computeMatchFor(key, cfg);
      if (m === null) continue;
      matches[key] = m;
      weights[key] = 1;
    }
  }

  // Composite
  const scores = new Array<number | null>(filtered.length).fill(null);
  if (Object.keys(weights).length === 0) {
    for (let i = 0; i < scores.length; i++) scores[i] = 50;
  } else {
    for (let i = 0; i < filtered.length; i++) {
      let sum = 0, wsum = 0;
      for (const [key, w] of Object.entries(weights)) {
        const m = matches[key][i];
        if (m === null) continue;
        sum += m * w;
        wsum += w;
      }
      scores[i] = wsum > 0 ? sum / wsum : null;
    }
  }

  const fipsIdx2 = col(dataset, "fips")!;
  const nameIdx2 = col(dataset, "county_name")!;
  const stateIdx2 = col(dataset, "state")!;
  const allResults: ScoredCounty[] = filtered.map((rowIdx, j) => {
    const breakdown: Record<string, number | null> = {};
    for (const key of Object.keys(matches)) {
      breakdown[key] = matches[key][j];
    }
    return {
      fips: dataset.rows[rowIdx][fipsIdx2] as string,
      name: (dataset.rows[rowIdx][nameIdx2] as string) ?? "",
      state: (dataset.rows[rowIdx][stateIdx2] as string) ?? "",
      score: scores[j] ?? 0,
      breakdown,
    };
  });
  allResults.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const limit = req.limit ?? 100;
  return {
    counties: allResults,
    top: allResults.slice(0, limit),
    total_after_filter: filtered.length,
    total_before_filter: totalBefore,
  };
}

// ---------- helpers -----------------------------------------------------

function percentileRanks(vals: (number | null)[]): (number | null)[] {
  const indexed = vals.map((v, i) => ({ v, i }));
  const valid = indexed.filter((x) => x.v !== null) as Array<{ v: number; i: number }>;
  valid.sort((a, b) => a.v - b.v);
  const result: (number | null)[] = vals.map(() => null);
  const n = valid.length;
  for (let r = 0; r < n; r++) {
    result[valid[r].i] = (r + 1) / n;
  }
  return result;
}

// ---------- County lookup + search --------------------------------------

export function getCounty(fips: string, dataset: CountiesDataset): Record<string, number | string | null> | null {
  const fipsIdx = col(dataset, "fips")!;
  const padded = String(fips).padStart(5, "0");
  const row = dataset.rows.find((r) => r[fipsIdx] === padded);
  if (!row) return null;
  const out: Record<string, number | string | null> = {};
  dataset.fields.forEach((f, i) => { out[f] = row[i]; });
  return out;
}

export function searchCounties(q: string, dataset: CountiesDataset, limit = 10): Array<{ fips: string; county_name: string; state: string }> {
  const ql = q.trim().toLowerCase();
  if (ql.length < 2) return [];
  const fipsIdx = col(dataset, "fips")!;
  const nameIdx = col(dataset, "county_name")!;
  const stateIdx = col(dataset, "state")!;
  const results: Array<{ fips: string; county_name: string; state: string }> = [];
  for (const row of dataset.rows) {
    const name = (row[nameIdx] as string).toLowerCase();
    const state = (row[stateIdx] as string).toLowerCase();
    if (name.startsWith(ql) || state === ql.slice(0, 2)) {
      results.push({
        fips: row[fipsIdx] as string,
        county_name: row[nameIdx] as string,
        state: row[stateIdx] as string,
      });
      if (results.length >= limit) break;
    }
  }
  return results;
}
