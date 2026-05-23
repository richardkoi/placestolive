import { useEffect, useMemo, useRef, useState } from "react";
import { PrefsPanel } from "./components/PrefsPanel";
import { MapView } from "./components/MapView";
import { ResultsList } from "./components/ResultsList";
import { CountyDetail } from "./components/CountyDetail";
import { CountySearch } from "./components/CountySearch";
import { WelcomeModal } from "./components/WelcomeModal";
import { SettingsButton } from "./components/SettingsButton";
import { Quiz } from "./quiz/Quiz";
import { useTheme } from "./lib/useTheme";
import { fetchScore, fetchSimilar } from "./lib/api";
import type { ScoreRequest, ScoreResponse } from "./types";

// Tailored to Rich's stated preferences:
//   - far left politically
//   - tolerates hot summers IF dew point < 55 (hard filter)
//   - mild winters preferred but not strict
//   - near nature: coast OR mountains
//   - moderate rain, light snow OK
//   - good air quality (high priority)
//   - mortgage budget ~$1900/mo → ~$350k target, $450k hard cap
//   - low crime + low natural-disaster / climate risk (high priority)
//   - likes sunshine
// Blank slate — every dim disabled. Click reset to come back here. Slide any
// dim's importance above 0 to start filtering / ranking.
const DEFAULT_PREFS: ScoreRequest = {
  continental_only: true,
  limit: 25,
};

// Rich's personal preset — toggled by the "Rich's Preferences" checkbox.
const RICHS_PREFS: ScoreRequest = {
  continental_only: true,
  limit: 25,
  politics:          { weight: 1, political_lean: "strong_d" },
  summer_high:       { weight: 1, range_min: 68, range_max: 95 },
  winter_low:        { weight: 1, range_min: 15, range_max: 70 },
  annual_precip:     { weight: 1, range_min: 10, range_max: 60 },
  annual_snow:       { weight: 1, threshold: 60, direction: "lower" },
  sunshine:          { weight: 3, threshold: 50, direction: "higher" },
  dew_point:         { weight: 1, threshold: 66, direction: "lower" },
  aqi:               { weight: 1, threshold: 60, direction: "lower" },
  home_price:        { weight: 1, range_min: 200000, range_max: 600000 },
  property_tax:      { weight: 1 },
  state_income_tax:  { weight: 1 },
  homicide_rate:     { weight: 1 },
  firearm_deaths:    { weight: 1 },
  disaster_risk:     { weight: 1 },
  hurricane_risk:    { weight: 2 },
  tornado_risk:      { weight: 2 },
  wildfire_risk:     { weight: 2 },
  flood_risk:        { weight: 1 },
  earthquake_risk:   { weight: 1 },
  lgbtq_policy:      { weight: 1 },
  pop_density:       { weight: 1, target: 500 },
  diversity:         { weight: 1, target: 40 },
  dist_to_coast:     { weight: 1, threshold: 1000, direction: "lower" },
  dist_to_mountains: { weight: 2, threshold: 300, direction: "lower" },
};

// URL hash <-> prefs round-trip so links are shareable
function loadFromHash(): ScoreRequest | null {
  if (!window.location.hash || window.location.hash.length < 2) return null;
  try {
    return JSON.parse(decodeURIComponent(atob(window.location.hash.slice(1))));
  } catch {
    return null;
  }
}
function writeToHash(prefs: ScoreRequest) {
  const encoded = btoa(encodeURIComponent(JSON.stringify(prefs)));
  history.replaceState(null, "", `#${encoded}`);
}

interface Anchor { fips: string; name: string; state: string; }

export default function App() {
  const theme = useTheme();
  const [prefs, setPrefs] = useState<ScoreRequest>(() => loadFromHash() ?? DEFAULT_PREFS);
  const [response, setResponse] = useState<ScoreResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [applyFiltersInSimilar, setApplyFiltersInSimilar] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const reqIdRef = useRef(0);

  const inSimilarMode = anchor !== null;

  // Refetch whenever prefs, mode, or anchor changes.
  // Request-id guard prevents stale responses from overwriting newer ones.
  useEffect(() => {
    if (!inSimilarMode) {
      // Only persist prefs to URL hash in normal mode (similarity anchor is ephemeral)
      writeToHash(prefs);
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const myId = ++reqIdRef.current;
      setLoading(true);
      const p = inSimilarMode
        ? fetchSimilar({
            fips: anchor!.fips,
            prefs,
            apply_filters: applyFiltersInSimilar,
            continental_only: prefs.continental_only ?? true,
            limit: prefs.limit ?? 25,
          })
        : fetchScore(prefs);
      p.then((r) => {
        if (myId === reqIdRef.current) setResponse(r);
      })
        .catch((e) => {
          if (myId === reqIdRef.current) console.error(e);
        })
        .finally(() => {
          if (myId === reqIdRef.current) setLoading(false);
        });
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [prefs, inSimilarMode, anchor, applyFiltersInSimilar]);

  const counties = response?.counties ?? [];
  const top = response?.top ?? [];

  const selectedScored = useMemo(
    () => (selected ? counties.find((c) => c.fips === selected) : undefined),
    [selected, counties]
  );

  const handleReset = () => setPrefs(DEFAULT_PREFS);

  // The preset is "active" iff current prefs are byte-equal to RICHS_PREFS.
  // Any slider tweak will naturally break equality and uncheck the box.
  const presetActive = JSON.stringify(prefs) === JSON.stringify(RICHS_PREFS);
  const handleTogglePreset = () =>
    setPrefs(presetActive ? DEFAULT_PREFS : RICHS_PREFS);

  // ?welcome=1 in the URL forces the welcome modal open (for testing / docs links)
  const forceWelcome =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("welcome") === "1";

  const enterSimilar = (fips: string, name: string, state: string) => {
    setAnchor({ fips, name, state });
    setSelected(null);
  };
  const exitSimilar = () => setAnchor(null);

  return (
    <>
    <WelcomeModal forceOpen={forceWelcome} onStartQuiz={() => setQuizOpen(true)} />
    {quizOpen && (
      <Quiz
        onApply={(p) => { setPrefs(p); setQuizOpen(false); }}
        onCancel={() => setQuizOpen(false)}
      />
    )}
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "grid",
        gridTemplateRows: "60px 1fr",
        gridTemplateColumns: "380px 1fr 380px",
        gridTemplateAreas: '"header header header" "prefs map results"',
        background: "var(--bg)",
        color: "var(--text)",
      }}
    >
      <header
        style={{
          gridArea: "header",
          background: "var(--panel-strong)",
          borderBottom: "1px solid var(--border)",
        }}
        className="flex items-center px-4 gap-4"
      >
        <h1 className="text-base font-semibold" style={{ color: "var(--text-heading)" }}>
          <span style={{ color: "var(--accent)" }}>places</span>tolive
        </h1>
        {!inSimilarMode && (
          <span
            className="text-xs cursor-help"
            style={{ color: "var(--text-muted)" }}
            title="Politics: 2024 presidential election | Census ACS 2023 5-year | FEMA NRI 2025 | Weather (temp/precip/snow): NOAA Annual Climate Normals 1991-2020, per-county | Dew point + sunshine: NOAA Hourly Climate Normals 1991-2020, per-county | EPA AQI 2024 | CHR 2024 | USGS elevation"
          >
            Find a US county that matches your preferences · hover for data sources
          </span>
        )}
        {inSimilarMode && (
          <div className="flex items-center gap-2 text-xs">
            <span style={{ color: "var(--text-muted)" }}>Showing counties similar to</span>
            <span className="font-medium" style={{ color: "var(--accent)" }}>{anchor.name}, {anchor.state}</span>
            <label className="ml-3 flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={applyFiltersInSimilar}
                onChange={(e) => setApplyFiltersInSimilar(e.target.checked)}
                style={{ accentColor: "var(--accent)" }}
              />
              apply prefs filters
            </label>
            <button
              type="button"
              onClick={exitSimilar}
              className="ml-2 px-2 py-0.5 rounded border"
              style={{ background: "var(--hover)", borderColor: "var(--border)", color: "var(--text)" }}
            >
              ← back to prefs
            </button>
          </div>
        )}
        <div className="ml-auto flex items-center gap-3">
          {loading && <span className="text-xs" style={{ color: "#f59e0b" }}>scoring…</span>}
          <CountySearch
            onPick={(c) => enterSimilar(c.fips, c.county_name, c.state)}
          />
          <button
            type="button"
            onClick={() => setQuizOpen(true)}
            className="text-xs px-2 py-1 rounded border"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            title="Take the 2-min quiz to set up your filters"
          >
            Quiz
          </button>
          <a
            href="docs.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-2 py-1 rounded border"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            title="How this app was built — for other Claude users"
          >
            Docs
          </a>
          <SettingsButton theme={theme} />
        </div>
      </header>

      <div style={{ gridArea: "prefs" }} className="min-h-0 overflow-hidden">
        <PrefsPanel
          prefs={prefs}
          onChange={setPrefs}
          onReset={handleReset}
          onLoadPreset={handleTogglePreset}
          presetActive={presetActive}
        />
      </div>

      <div
        style={{
          gridArea: "map",
          position: "relative",
          overflow: "hidden",
          minHeight: 0,
          minWidth: 0,
        }}
      >
        <MapView counties={counties} onSelect={setSelected} anchorFips={anchor?.fips ?? null} paletteStops={theme.palette.stops} themeMode={theme.mode} />
        {selected && (
          <CountyDetail
            fips={selected}
            scored={selectedScored}
            onClose={() => setSelected(null)}
            onFindSimilar={enterSimilar}
          />
        )}
      </div>

      <div style={{ gridArea: "results" }} className="min-h-0 overflow-hidden">
        <ResultsList
          top={top}
          totalAfter={response?.total_after_filter ?? 0}
          totalBefore={response?.total_before_filter ?? 0}
          selected={selected}
          onSelect={setSelected}
          anchorName={anchor ? `${anchor.name}, ${anchor.state}` : undefined}
        />
      </div>
    </div>
    </>
  );
}
