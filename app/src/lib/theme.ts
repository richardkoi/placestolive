// Theme system: light/dark mode + map palette selection.
// Tokens are applied as CSS custom properties on :root so every component can
// reference them via `bg-[var(--bg)]` etc. Persistence via localStorage.

export type Mode = "dark" | "light";
export type PaletteKind = "fun" | "colorblind";

export interface Palette {
  id: string;
  name: string;
  kind: PaletteKind;
  // 5 stops at score 0, 25, 50, 75, 100 — used directly by the MapLibre interpolate expression
  stops: [string, string, string, string, string];
  // Accent color used for buttons, highlights, focus rings
  accent: string;
  // Mid-color shown alongside the accent (used for the preset checkbox active state, etc.)
  accentAlt: string;
}

export const PALETTES: Palette[] = [
  // ---- Fun set ----
  {
    id: "indigo-amber",
    name: "Default · indigo → amber → red",
    kind: "fun",
    stops: ["#1e293b", "#312e81", "#6366f1", "#fbbf24", "#f87171"],
    accent: "#6366f1",
    accentAlt: "#fbbf24",
  },
  {
    id: "heat",
    name: "Heat · yellow → orange → red",
    kind: "fun",
    stops: ["#1f2937", "#7c2d12", "#ea580c", "#f59e0b", "#fde047"],
    accent: "#ea580c",
    accentAlt: "#fde047",
  },
  {
    id: "cool",
    name: "Cool · teal → cyan → pink",
    kind: "fun",
    stops: ["#1f2937", "#134e4a", "#0891b2", "#22d3ee", "#f472b6"],
    accent: "#0891b2",
    accentAlt: "#f472b6",
  },
  {
    id: "sunset",
    name: "Sunset · purple → pink → gold",
    kind: "fun",
    stops: ["#1f1d3a", "#581c87", "#c026d3", "#f43f5e", "#fbbf24"],
    accent: "#c026d3",
    accentAlt: "#fbbf24",
  },
  // ---- Colorblind-safe set ----
  {
    id: "viridis",
    name: "Viridis · purple → green → yellow",
    kind: "colorblind",
    stops: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
    accent: "#21918c",
    accentAlt: "#fde725",
  },
  {
    id: "cividis",
    name: "Cividis · blue → tan → yellow",
    kind: "colorblind",
    stops: ["#00204c", "#414e6f", "#7f7c75", "#bfae5c", "#ffe945"],
    accent: "#7f7c75",
    accentAlt: "#ffe945",
  },
  {
    id: "plasma",
    name: "Plasma · purple → pink → yellow",
    kind: "colorblind",
    stops: ["#0d0887", "#7e03a8", "#cc4778", "#f89540", "#f0f921"],
    accent: "#cc4778",
    accentAlt: "#f89540",
  },
];

// CSS variable tokens for the rest of the UI. Set on :root.
export interface ThemeTokens {
  bg: string;            // body background
  panel: string;         // prefs / results panel bg
  panelStrong: string;   // header / modal bg
  text: string;          // body text
  textHeading: string;   // headings
  textMuted: string;     // captions, hints
  border: string;        // panel borders
  hover: string;         // hover surface
  noDataFill: string;    // counties with no data on the map
  mapBg: string;         // map area background
}

const DARK: ThemeTokens = {
  bg: "#0a0f1c",
  panel: "rgba(15, 23, 42, 0.6)",
  panelStrong: "rgba(15, 23, 42, 0.95)",
  text: "#e2e8f0",
  textHeading: "#f1f5f9",
  textMuted: "#94a3b8",
  border: "#334155",
  hover: "#1e293b",
  noDataFill: "#3b3a36",
  mapBg: "#11182a",
};

const LIGHT: ThemeTokens = {
  bg: "#f8fafc",
  panel: "rgba(255, 255, 255, 0.85)",
  panelStrong: "rgba(248, 250, 252, 0.97)",
  text: "#1e293b",
  textHeading: "#0f172a",
  textMuted: "#64748b",
  border: "#cbd5e1",
  hover: "#e2e8f0",
  noDataFill: "#d6d3d1",
  mapBg: "#e2e8f0",
};

export function tokensFor(mode: Mode): ThemeTokens {
  return mode === "light" ? LIGHT : DARK;
}

export function paletteById(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

// Apply theme to :root as CSS custom properties + a data attribute for any
// component that wants to vary by light vs dark (e.g. map style)
export function applyTheme(mode: Mode, palette: Palette) {
  const t = tokensFor(mode);
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.style.setProperty("--bg", t.bg);
  root.style.setProperty("--panel", t.panel);
  root.style.setProperty("--panel-strong", t.panelStrong);
  root.style.setProperty("--text", t.text);
  root.style.setProperty("--text-heading", t.textHeading);
  root.style.setProperty("--text-muted", t.textMuted);
  root.style.setProperty("--border", t.border);
  root.style.setProperty("--hover", t.hover);
  root.style.setProperty("--no-data", t.noDataFill);
  root.style.setProperty("--map-bg", t.mapBg);
  root.style.setProperty("--accent", palette.accent);
  root.style.setProperty("--accent-alt", palette.accentAlt);
  // Map stops as comma-separated linear-gradient values (handy for legend swatches)
  root.style.setProperty("--score-gradient",
    `linear-gradient(90deg, ${palette.stops.join(", ")})`);
}

// ---- Persistence ----------------------------------------------------------
const MODE_KEY = "placestolive_theme_mode_v1";
const PALETTE_KEY = "placestolive_theme_palette_v1";

export function loadSavedMode(): Mode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {}
  return "dark";
}
export function loadSavedPaletteId(): string {
  try {
    const v = localStorage.getItem(PALETTE_KEY);
    if (v && PALETTES.some((p) => p.id === v)) return v;
  } catch {}
  return PALETTES[0].id;
}
export function saveMode(m: Mode) {
  try { localStorage.setItem(MODE_KEY, m); } catch {}
}
export function savePaletteId(id: string) {
  try { localStorage.setItem(PALETTE_KEY, id); } catch {}
}
