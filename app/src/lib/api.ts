// Client-side data layer. Loads counties.json once on first call, then runs
// scoring + search in-memory. No backend required — the static deploy ships
// everything needed.

import type { ScoreRequest, ScoreResponse } from "../types";
import {
  indexCounties,
  score as scoreLocal,
  similar as similarLocal,
  getCounty,
  searchCounties,
  type CountiesDataset,
  type SimilarRequest as SimilarLocalRequest,
} from "./scoring";

export interface SimilarRequest {
  fips: string;
  prefs: ScoreRequest;
  apply_filters?: boolean;
  continental_only?: boolean;
  limit?: number;
}

export interface CountySearchResult {
  fips: string;
  county_name: string;
  state: string;
}

// Module-level cache so the JSON is fetched only once per page load
let datasetPromise: Promise<CountiesDataset> | null = null;
function loadDataset(): Promise<CountiesDataset> {
  if (!datasetPromise) {
    datasetPromise = fetch("/counties.json")
      .then((r) => {
        if (!r.ok) throw new Error(`counties.json: ${r.status}`);
        return r.json();
      })
      .then((data) => indexCounties(data));
  }
  return datasetPromise;
}

export async function fetchScore(req: ScoreRequest): Promise<ScoreResponse> {
  const dataset = await loadDataset();
  return scoreLocal(req, dataset);
}

export async function fetchSimilar(req: SimilarRequest): Promise<ScoreResponse> {
  const dataset = await loadDataset();
  return similarLocal(req as SimilarLocalRequest, dataset);
}

export async function fetchCounty(fips: string): Promise<Record<string, unknown>> {
  const dataset = await loadDataset();
  const row = getCounty(fips, dataset);
  if (!row) throw new Error(`county ${fips} not found`);
  return row;
}

export async function search(q: string, limit = 10): Promise<CountySearchResult[]> {
  const dataset = await loadDataset();
  return searchCounties(q, dataset, limit);
}

// Backwards-compatible alias (some places import `searchCounties` from api.ts)
export const searchCounties_api = search;
export { search as searchCounties };
