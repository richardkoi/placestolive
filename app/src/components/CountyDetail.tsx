import { useEffect, useState } from "react";
import { fetchCounty } from "../lib/api";
import { DIMENSIONS } from "../dimensions";
import type { ScoredCounty } from "../types";

// Pretty label for a dimension key, with a fallback that humanizes the raw key.
const DIM_LABELS: Record<string, string> = Object.fromEntries(
  DIMENSIONS.map((d) => {
    // Strip the trailing "(°F)" / "(min %)" / "(max in)" / "(lower = better)" hints
    // so labels read more naturally in the breakdown context.
    const cleaned = d.label
      .replace(/\s*\([^)]*\)\s*$/, "")
      .replace(/\s+(lower|higher)\s*=\s*better\s*$/i, "")
      .trim();
    return [d.key as string, cleaned];
  })
);
function dimLabel(key: string): string {
  return DIM_LABELS[key] ?? key.replace(/_/g, " ");
}

interface Props {
  fips: string;
  scored?: ScoredCounty;
  onClose: () => void;
  onFindSimilar?: (fips: string, name: string, state: string) => void;
}

// A bin maps a numeric value to a qualitative label + a tailwind text color
// class. Used to make "FEMA risk: 88" instantly readable as "very high (red)".
type Bin = { label: string; color: string };
type BinFn = (v: number) => Bin | null;

// Lower-is-better 0-100 scales (FEMA risk components, percentile-like fields)
const binLowerBetter0to100: BinFn = (v) => {
  if (v < 20) return { label: "very low",   color: "text-emerald-400" };
  if (v < 40) return { label: "low",        color: "text-green-400" };
  if (v < 60) return { label: "moderate",   color: "text-amber-400" };
  if (v < 80) return { label: "high",       color: "text-orange-400" };
  return       { label: "very high",  color: "text-rose-400" };
};

// Higher-is-better 0-100 (LGBTQ policy)
const binHigherBetter0to100: BinFn = (v) => {
  if (v >= 80) return { label: "very strong", color: "text-emerald-400" };
  if (v >= 60) return { label: "strong",      color: "text-green-400" };
  if (v >= 40) return { label: "moderate",    color: "text-amber-400" };
  if (v >= 20) return { label: "limited",     color: "text-orange-400" };
  return        { label: "minimal",      color: "text-rose-400" };
};

// Absolute crime rates per 100k
const binHomicide: BinFn = (v) => {
  if (v < 2)  return { label: "very low",  color: "text-emerald-400" };
  if (v < 5)  return { label: "low",       color: "text-green-400" };
  if (v < 10) return { label: "moderate",  color: "text-amber-400" };
  if (v < 20) return { label: "high",      color: "text-orange-400" };
  return        { label: "very high", color: "text-rose-400" };
};
const binFirearm: BinFn = (v) => {
  if (v < 8)  return { label: "very low",  color: "text-emerald-400" };
  if (v < 14) return { label: "low",       color: "text-green-400" };
  if (v < 20) return { label: "moderate",  color: "text-amber-400" };
  if (v < 28) return { label: "high",      color: "text-orange-400" };
  return        { label: "very high", color: "text-rose-400" };
};

// AQI bands per EPA
const binAQI: BinFn = (v) => {
  if (v <= 50)  return { label: "good",      color: "text-emerald-400" };
  if (v <= 100) return { label: "moderate",  color: "text-amber-400" };
  if (v <= 150) return { label: "unhealthy", color: "text-orange-400" };
  return         { label: "very unhealthy", color: "text-rose-400" };
};

// Field config: [db column, label, formatter, optional bin, optional unit suffix shown after the bin]
type FieldDef = [string, string, (v: number) => string, BinFn?, string?];

const FIELD_LABELS: FieldDef[] = [
  ["dem_share_pct",          "Dem vote share",          (v) => `${v.toFixed(1)}%`],
  ["gop_share_pct",          "GOP vote share",          (v) => `${v.toFixed(1)}%`],
  ["fema_risk_score",        "FEMA composite risk",     (v) => v.toFixed(1),  binLowerBetter0to100, " / 100"],
  ["fema_hurricane",         "Hurricane risk",          (v) => v.toFixed(1),  binLowerBetter0to100, " / 100"],
  ["fema_tornado",           "Tornado risk",            (v) => v.toFixed(1),  binLowerBetter0to100, " / 100"],
  ["fema_wildfire",          "Wildfire risk",           (v) => v.toFixed(1),  binLowerBetter0to100, " / 100"],
  ["fema_flood",             "Flood risk",              (v) => v.toFixed(1),  binLowerBetter0to100, " / 100"],
  ["fema_earthquake",        "Earthquake risk",         (v) => v.toFixed(1),  binLowerBetter0to100, " / 100"],
  ["fema_heat",              "Heat wave risk",          (v) => v.toFixed(1),  binLowerBetter0to100, " / 100"],
  ["fema_drought",           "Drought risk",            (v) => v.toFixed(1),  binLowerBetter0to100, " / 100"],
  ["summer_high_f",          "Avg summer high",         (v) => `${v.toFixed(0)}°F`],
  ["winter_low_f",           "Avg winter low",          (v) => `${v.toFixed(0)}°F`],
  ["dew_point_f",            "Avg summer dew point",    (v) => `${v.toFixed(0)}°F`],
  ["annual_precip_in",       "Annual rainfall",         (v) => `${v.toFixed(0)} in`],
  ["annual_snow_in",         "Annual snow",             (v) => `${v.toFixed(0)} in`],
  ["sunshine_pct",           "Sunshine",                (v) => `${v.toFixed(0)}%`],
  ["aqi_mean",               "Air quality (AQI)",       (v) => v.toFixed(0), binAQI],
  ["dist_to_coast_mi",       "Distance to coast",       (v) => `${v.toFixed(0)} mi`],
  ["dist_to_mountains_mi",   "Distance to mountains",   (v) => `${v.toFixed(0)} mi`],
  ["pop_density",            "Population density",      (v) => `${v.toFixed(0)} / sq mi`],
  ["population",             "Population",              (v) => v.toLocaleString()],
  ["median_age",             "Median age",              (v) => v.toFixed(1)],
  ["diversity_pct",          "% non-white residents",   (v) => `${v.toFixed(1)}%`],
  ["bachelors_pct",          "% with bachelor's+",      (v) => `${v.toFixed(1)}%`],
  ["median_home_value",      "Median home value",       (v) => `$${v.toLocaleString()}`],
  ["median_rent",            "Median rent",             (v) => `$${v.toLocaleString()}/mo`],
  ["median_household_income","Median household income", (v) => `$${v.toLocaleString()}`],
  ["state_income_tax_pct",   "State income tax (top)",  (v) => `${v.toFixed(2)}%`],
  ["property_tax_pct",       "Effective property tax",  (v) => `${v.toFixed(2)}%`],
  ["lgbtq_policy_score",     "LGBTQ policy strength",   (v) => v.toFixed(0), binHigherBetter0to100, " / 100"],
  ["homicide_per_100k",      "Homicide rate /100k",     (v) => v.toFixed(1), binHomicide],
  ["firearm_deaths_per_100k", "Firearm deaths /100k",   (v) => v.toFixed(1), binFirearm],
];

export function CountyDetail({ fips, scored, onClose, onFindSimilar }: Props) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setErr(null);
    fetchCounty(fips).then((d) => {
      if (!cancelled) setData(d);
    }).catch((e) => {
      if (!cancelled) setErr(String(e));
    });
    return () => { cancelled = true; };
  }, [fips]);

  return (
    <div className="absolute right-0 top-0 h-full w-96 bg-slate-900/95 border-l border-slate-700 backdrop-blur p-4 overflow-y-auto shadow-2xl">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">
            {String(data?.county_name ?? scored?.name ?? "…")}, {String(data?.state ?? scored?.state ?? "")}
          </h3>
          <p className="text-xs text-slate-500">FIPS {fips}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-100 px-2 py-1"
        >
          ✕
        </button>
      </div>

      {onFindSimilar && (
        <button
          type="button"
          onClick={() => onFindSimilar(
            fips,
            String(data?.county_name ?? scored?.name ?? ""),
            String(data?.state ?? scored?.state ?? ""),
          )}
          className="w-full mt-1 mb-3 px-3 py-2 text-xs font-medium rounded bg-indigo-600 hover:bg-indigo-500 text-white"
        >
          Find counties similar to this one →
        </button>
      )}

      {scored && (
        <>
          <div className="my-3 p-3 rounded bg-indigo-900/30 border border-indigo-700/50">
            <div className="text-xs text-slate-400 uppercase tracking-wider">Match score</div>
            <div className="text-2xl font-bold text-indigo-300 tabular-nums">{scored.score.toFixed(1)}</div>
          </div>

          {Object.keys(scored.breakdown).length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs uppercase text-slate-400 mb-2">Score breakdown</h4>
              <div className="space-y-1.5">
                {Object.entries(scored.breakdown)
                  .sort((a, b) => (b[1] ?? -1) - (a[1] ?? -1))
                  .map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 text-xs" title={k}>
                      <span className="w-32 text-slate-300 truncate">{dimLabel(k)}</span>
                      <div className="flex-1 h-2 rounded bg-slate-800 overflow-hidden">
                        {v != null && (
                          <div
                            className="h-full bg-gradient-to-r from-indigo-600 to-amber-400"
                            style={{ width: `${Math.max(0, Math.min(100, v))}%` }}
                          />
                        )}
                      </div>
                      <span className="w-12 text-right tabular-nums text-slate-300">
                        {v == null ? "no data" : v.toFixed(0)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}

      {err && <div className="text-rose-400 text-sm">{err}</div>}

      {data && (
        <div className="space-y-1">
          <h4 className="text-xs uppercase text-slate-400 mb-1">Raw data</h4>
          <table className="w-full text-xs">
            <tbody>
              {FIELD_LABELS.map(([k, label, fmt, bin, suffix]) => {
                const v = data[k];
                if (v == null || typeof v !== "number") return null;
                const b = bin ? bin(v) : null;
                return (
                  <tr key={k} className="border-t border-slate-800">
                    <td className="py-1 pr-2 text-slate-400">{label}</td>
                    <td className="py-1 text-right tabular-nums">
                      <span className={b?.color ?? "text-slate-200"}>{fmt(v)}</span>
                      {suffix && <span className="text-slate-500">{suffix}</span>}
                      {b && <span className={`ml-1 ${b.color}`}>({b.label})</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
