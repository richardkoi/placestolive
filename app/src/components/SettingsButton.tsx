import { useEffect, useRef, useState } from "react";
import { PALETTES } from "../lib/theme";
import type { ThemeState } from "../lib/useTheme";

interface Props {
  theme: ThemeState;
}

export function SettingsButton({ theme }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click-outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [open]);

  const fun = PALETTES.filter((p) => p.kind === "fun");
  const colorblind = PALETTES.filter((p) => p.kind === "colorblind");

  const swatchStyle = (stops: string[]) => ({
    background: `linear-gradient(90deg, ${stops.join(", ")})`,
  });

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Settings"
        title="Settings · theme and palette"
        className="text-xs px-2 py-1 rounded border"
        style={{
          borderColor: "var(--border)",
          color: "var(--text-muted)",
          background: open ? "var(--hover)" : "transparent",
        }}
      >
        ⚙
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-80 rounded border shadow-2xl p-3 z-50"
          style={{
            // Fully-opaque so panel text behind never bleeds through
            background: "var(--bg)",
            borderColor: "var(--border)",
            color: "var(--text)",
          }}
        >
          {/* Light / dark toggle */}
          <div className="text-xs uppercase tracking-wider mb-2"
               style={{ color: "var(--text-muted)" }}>
            Theme
          </div>
          <div className="flex gap-1 mb-4">
            {(["dark", "light"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => theme.setMode(m)}
                className="flex-1 text-xs px-2 py-1.5 rounded border capitalize"
                style={{
                  background: theme.mode === m ? "var(--accent)" : "var(--hover)",
                  color: theme.mode === m ? "white" : "var(--text)",
                  borderColor: theme.mode === m ? "var(--accent)" : "var(--border)",
                }}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Palettes — fun set */}
          <div className="text-xs uppercase tracking-wider mb-2"
               style={{ color: "var(--text-muted)" }}>
            Map palette · fun
          </div>
          <div className="grid grid-cols-1 gap-1 mb-3">
            {fun.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => theme.setPaletteId(p.id)}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded border text-left"
                style={{
                  background: theme.palette.id === p.id ? "var(--hover)" : "transparent",
                  borderColor: theme.palette.id === p.id ? "var(--accent)" : "var(--border)",
                  color: "var(--text)",
                }}
              >
                <div className="h-3 w-12 rounded shrink-0" style={swatchStyle(p.stops)} />
                <span className="flex-1 truncate">{p.name}</span>
                {theme.palette.id === p.id && <span style={{ color: "var(--accent)" }}>✓</span>}
              </button>
            ))}
          </div>

          {/* Palettes — colorblind-safe set */}
          <div className="text-xs uppercase tracking-wider mb-2"
               style={{ color: "var(--text-muted)" }}>
            Map palette · colorblind-safe
          </div>
          <div className="grid grid-cols-1 gap-1">
            {colorblind.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => theme.setPaletteId(p.id)}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded border text-left"
                style={{
                  background: theme.palette.id === p.id ? "var(--hover)" : "transparent",
                  borderColor: theme.palette.id === p.id ? "var(--accent)" : "var(--border)",
                  color: "var(--text)",
                }}
              >
                <div className="h-3 w-12 rounded shrink-0" style={swatchStyle(p.stops)} />
                <span className="flex-1 truncate">{p.name}</span>
                {theme.palette.id === p.id && <span style={{ color: "var(--accent)" }}>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
