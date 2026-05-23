import { useMemo } from "react";
import { DIMENSIONS, GROUPS } from "../dimensions";
import type { Dimension, DimDef, ScoreRequest } from "../types";

interface Props {
  prefs: ScoreRequest;
  onChange: (next: ScoreRequest) => void;
  onReset: () => void;
  onLoadPreset?: () => void;
  presetActive?: boolean;
}

const LEAN_OPTIONS: Array<{ value: NonNullable<Dimension["political_lean"]>; label: string }> = [
  { value: "strong_d", label: "Strong D" },
  { value: "lean_d",   label: "Lean D" },
  { value: "neutral",  label: "Neutral" },
  { value: "lean_r",   label: "Lean R" },
  { value: "strong_r", label: "Strong R" },
];

export function PrefsPanel({ prefs, onChange, onReset, onLoadPreset, presetActive }: Props) {
  const setDim = (def: DimDef, patch: Partial<Dimension>) => {
    const key = def.key;
    const current = (prefs[key] as Dimension | undefined) ?? { weight: 0 };
    const merged: Dimension = { ...current, ...patch };
    // When importance drops to 0, drop the dimension entirely so stale target/max/min
    // don't sit in the URL hash or get sent to the server.
    if ((merged.weight ?? 0) <= 0) {
      const next = { ...prefs };
      delete next[key];
      onChange(next);
      return;
    }
    // Backfill the type-specific config on first-enable so the server has what it needs.
    if (def.mode.kind === "linear_target" && merged.target === undefined) {
      merged.target = def.mode.defaultTarget;
    }
    if (def.mode.kind === "categorical_politics" && merged.political_lean === undefined) {
      merged.political_lean = "neutral";
    }
    if (def.mode.kind === "range") {
      if (merged.range_min === undefined) merged.range_min = def.mode.defaultMin;
      if (merged.range_max === undefined) merged.range_max = def.mode.defaultMax;
    }
    if (def.mode.kind === "one_sided") {
      if (merged.threshold === undefined) merged.threshold = def.mode.defaultThreshold;
      if (merged.direction === undefined) merged.direction = def.mode.direction;
    }
    onChange({ ...prefs, [key]: merged });
  };

  const enabledCount = useMemo(
    () => DIMENSIONS.filter((d) => ((prefs[d.key] as Dimension | undefined)?.weight ?? 0) > 0).length,
    [prefs]
  );

  return (
    <aside
      className="w-full h-full overflow-y-auto px-4 py-4 space-y-6 text-sm"
      style={{
        background: "var(--panel)",
        borderRight: "1px solid var(--border)",
        color: "var(--text)",
      }}
    >
      <div
        className="sticky top-0 -mx-4 -mt-4 px-4 py-3 backdrop-blur z-10"
        style={{ background: "var(--panel-strong)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: "var(--text-heading)" }}>Preferences</h2>
          <button
            type="button"
            onClick={onReset}
            className="text-xs underline-offset-2 hover:underline"
            style={{ color: "var(--text-muted)" }}
          >
            reset
          </button>
        </div>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {enabledCount} {enabledCount === 1 ? "dimension" : "dimensions"} active
        </p>
        <label className="mt-2 flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={prefs.continental_only ?? true}
            onChange={(e) => onChange({ ...prefs, continental_only: e.target.checked })}
            style={{ accentColor: "var(--accent)" }}
          />
          Continental US only (exclude AK + HI)
        </label>
        {onLoadPreset && (
          <label
            className="mt-1 flex items-center gap-2 text-xs cursor-pointer"
            title="Load a preset of preferences — center-left politics, mild climate, mountains/coast, ~$400k home budget"
          >
            <input
              type="checkbox"
              checked={!!presetActive}
              onChange={onLoadPreset}
              style={{ accentColor: "var(--accent)" }}
            />
            Use sample preset
          </label>
        )}
      </div>

      {GROUPS.map((group) => (
        <section key={group}>
          <h3 className="text-xs uppercase tracking-wider text-slate-400 mb-2">{group}</h3>
          <div className="space-y-3">
            {DIMENSIONS.filter((d) => d.group === group).map((d) => {
              const dim = (prefs[d.key] as Dimension | undefined) ?? { weight: 0 };
              const enabled = (dim.weight ?? 0) > 0;
              return (
                <div
                  key={d.key as string}
                  className={`p-3 rounded-md border ${
                    enabled
                      ? "border-indigo-500/50 bg-indigo-950/30"
                      : "border-slate-700 bg-slate-900/30"
                  }`}
                >
                  <label
                    className="block text-slate-200 font-medium decoration-dotted decoration-slate-500 underline-offset-2"
                    style={{ cursor: d.description ? "help" : "default", textDecoration: d.description ? "underline dotted" : undefined, textDecorationColor: "rgba(148, 163, 184, 0.4)" }}
                    title={d.description}
                  >
                    {d.label}
                  </label>

                  <div className="mt-2">
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-slate-400">Importance</span>
                      <span className="text-slate-300 tabular-nums">{dim.weight ?? 0}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={1}
                      value={dim.weight ?? 0}
                      onChange={(e) => setDim(d, { weight: Number(e.target.value) })}
                      className="block w-full mt-1 accent-indigo-500"
                    />
                  </div>

                  {enabled && d.mode.kind === "linear_target" && (
                    <div className="mt-2">
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-slate-400">Target</span>
                        <span className="text-slate-300 tabular-nums">
                          {(dim.target ?? d.mode.defaultTarget).toLocaleString()} {d.mode.unit}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={d.mode.min}
                        max={d.mode.max}
                        step={d.mode.step}
                        value={dim.target ?? d.mode.defaultTarget}
                        onChange={(e) => setDim(d, { target: Number(e.target.value) })}
                        className="block w-full mt-1 accent-indigo-500"
                      />
                    </div>
                  )}

                  {enabled && d.mode.kind === "range" && (() => {
                    const rmin = dim.range_min ?? d.mode.defaultMin;
                    const rmax = dim.range_max ?? d.mode.defaultMax;
                    return (
                      <>
                        <div className="mt-2">
                          <div className="flex items-baseline justify-between text-xs">
                            <span className="text-slate-400">Min</span>
                            <span className="text-slate-300 tabular-nums">
                              {rmin.toLocaleString()} {d.mode.unit}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={d.mode.min}
                            max={d.mode.max}
                            step={d.mode.step}
                            value={rmin}
                            onChange={(e) => {
                              const v = Math.min(Number(e.target.value), rmax);
                              setDim(d, { range_min: v, range_max: Math.max(rmax, v) });
                            }}
                            className="block w-full mt-1 accent-indigo-500"
                          />
                        </div>
                        <div className="mt-2">
                          <div className="flex items-baseline justify-between text-xs">
                            <span className="text-slate-400">Max</span>
                            <span className="text-slate-300 tabular-nums">
                              {rmax.toLocaleString()} {d.mode.unit}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={d.mode.min}
                            max={d.mode.max}
                            step={d.mode.step}
                            value={rmax}
                            onChange={(e) => {
                              const v = Math.max(Number(e.target.value), rmin);
                              setDim(d, { range_max: v, range_min: Math.min(rmin, v) });
                            }}
                            className="block w-full mt-1 accent-indigo-500"
                          />
                        </div>
                      </>
                    );
                  })()}

                  {enabled && d.mode.kind === "one_sided" && (() => {
                    const t = dim.threshold ?? d.mode.defaultThreshold;
                    const arrow = d.mode.direction === "lower" ? "≤" : "≥";
                    return (
                      <div className="mt-2">
                        <div className="flex items-baseline justify-between text-xs">
                          <span className="text-slate-400">
                            {d.mode.direction === "lower" ? "Max" : "Min"} {arrow}
                          </span>
                          <span className="text-slate-300 tabular-nums">
                            {t.toLocaleString()} {d.mode.unit}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={d.mode.min}
                          max={d.mode.max}
                          step={d.mode.step}
                          value={t}
                          onChange={(e) => setDim(d, { threshold: Number(e.target.value) })}
                          className="block w-full mt-1 accent-indigo-500"
                        />
                      </div>
                    );
                  })()}

                  {enabled && d.mode.kind === "categorical_politics" && (
                    <div className="mt-2 flex gap-1">
                      {LEAN_OPTIONS.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => setDim(d, { political_lean: o.value })}
                          className={`flex-1 text-xs px-1 py-1 rounded border ${
                            dim.political_lean === o.value
                              ? "bg-indigo-600 border-indigo-500 text-white"
                              : "bg-slate-800/60 border-slate-600 text-slate-300 hover:bg-slate-800"
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {enabled && d.hardFilter && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-20 shrink-0">
                        Hard {d.hardFilter.kind}
                      </span>
                      <input
                        type="number"
                        step={d.hardFilter.step}
                        placeholder="(none)"
                        value={(d.hardFilter.kind === "max" ? dim.max : dim.min) ?? ""}
                        onChange={(e) => {
                          const v = e.target.value === "" ? undefined : Number(e.target.value);
                          setDim(d, d.hardFilter!.kind === "max" ? { max: v } : { min: v });
                        }}
                        className="flex-1 min-w-0 text-xs px-2 py-1 rounded bg-slate-800 border border-slate-600 text-slate-200"
                      />
                      <span className="text-xs text-slate-400 w-8 shrink-0">{d.hardFilter.unit}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </aside>
  );
}
