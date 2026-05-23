import { useState } from "react";
import type { Theme, ThemeId } from "./questions";

interface Props {
  themes: Theme[];
  initial: ThemeId[];
  onCancel: () => void;
  onContinue: (selected: ThemeId[]) => void;
}

export function ThemePicker({ themes, initial, onCancel, onContinue }: Props) {
  const [picked, setPicked] = useState<Set<ThemeId>>(new Set(initial));
  const toggle = (id: ThemeId) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const count = picked.size;

  return (
    <div className="p-6">
      <div className="mb-1 text-xs uppercase tracking-wider"
           style={{ color: "var(--text-muted)" }}>Step 1 of 3</div>
      <h2 className="text-2xl font-semibold mb-1"
          style={{ color: "var(--text-heading)" }}>
        What matters to you?
      </h2>
      <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
        Pick the dimensions you care about. We'll ask one question for each, then
        pre-fill your filters. You can tweak anything afterward.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {themes.map((t) => {
          const active = picked.has(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t.id)}
              className="text-left p-3 rounded-md border transition-colors"
              style={{
                background: active ? "var(--hover)" : "transparent",
                borderColor: active ? "var(--accent)" : "var(--border)",
                borderWidth: active ? 2 : 1,
              }}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl leading-none">{t.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium" style={{ color: "var(--text-heading)" }}>
                    {t.label}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {t.description}
                  </div>
                </div>
                {active && (
                  <span style={{ color: "var(--accent)" }} className="text-lg">✓</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 text-sm rounded border"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          Skip quiz
        </button>
        <div className="flex-1 text-xs text-right pr-2" style={{ color: "var(--text-muted)" }}>
          {count === 0
            ? "Pick at least one to continue, or skip the quiz."
            : `${count} selected → ${count} question${count === 1 ? "" : "s"}`}
        </div>
        <button
          type="button"
          disabled={count === 0}
          onClick={() => onContinue(Array.from(picked))}
          className="px-4 py-2 text-sm rounded font-medium"
          style={{
            background: count === 0 ? "var(--hover)" : "var(--accent)",
            color: count === 0 ? "var(--text-muted)" : "white",
            opacity: count === 0 ? 0.5 : 1,
            cursor: count === 0 ? "not-allowed" : "pointer",
          }}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
