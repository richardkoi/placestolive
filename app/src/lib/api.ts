import type { ScoreRequest, ScoreResponse } from "../types";

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

export async function fetchScore(req: ScoreRequest): Promise<ScoreResponse> {
  const r = await fetch("/api/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!r.ok) throw new Error(`score request failed: ${r.status}`);
  return r.json();
}

export async function fetchSimilar(req: SimilarRequest): Promise<ScoreResponse> {
  const r = await fetch("/api/similar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!r.ok) throw new Error(`similar request failed: ${r.status}`);
  return r.json();
}

export async function searchCounties(q: string, limit = 10): Promise<CountySearchResult[]> {
  const r = await fetch(`/api/counties/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  if (!r.ok) return [];
  return r.json();
}

export async function fetchCounty(fips: string): Promise<Record<string, unknown>> {
  const r = await fetch(`/api/county/${fips}`);
  if (!r.ok) throw new Error(`county ${fips} not found`);
  return r.json();
}

export async function fetchHealth(): Promise<{ status: string; counties: number }> {
  const r = await fetch("/api/health");
  return r.json();
}
