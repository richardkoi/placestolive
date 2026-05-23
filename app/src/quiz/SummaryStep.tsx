import type { ScoreRequest, ScoreResponse } from "../types";

interface Props {
  previewing: boolean;
  preview: ScoreResponse | null;
  mergedPrefs: ScoreRequest;
  themesAnswered: number;
  onRetake: () => void;
  onApply: () => void;
}

export function SummaryStep({
  previewing, preview, mergedPrefs, themesAnswered, onRetake, onApply,
}: Props) {
  const total = preview?.total_after_filter ?? 0;
  const beforeTotal = preview?.total_before_filter ?? 3144;
  const top = preview?.top.slice(0, 5) ?? [];

  // Count how many dims were enabled across the merged prefs
  const dimCount = Object.values(mergedPrefs).filter(
    (v) => v && typeof v === "object" && "weight" in v && (v.weight ?? 0) > 0
  ).length;

  return (
    <div className="p-6">
      <div className="mb-1 text-xs uppercase tracking-wider"
           style={{ color: "var(--text-muted)" }}>Step 3 of 3</div>
      <h2 className="text-2xl font-semibold mb-1"
          style={{ color: "var(--text-heading)" }}>
        {previewing ? "Crunching numbers..." : "Here's what matches"}
      </h2>
      <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
        You answered {themesAnswered} theme{themesAnswered === 1 ? "" : "s"}, enabling{" "}
        {dimCount} filter{dimCount === 1 ? "" : "s"}.{" "}
        {!previewing && (
          <span>
            <strong style={{ color: "var(--text)" }}>{total.toLocaleString()}</strong> of{" "}
            {beforeTotal.toLocaleString()} counties match your preferences.
          </span>
        )}
      </p>

      {previewing && (
        <div className="py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          Loading…
        </div>
      )}

      {!previewing && top.length > 0 && (
        <div className="mb-5">
          <h3 className="text-xs uppercase tracking-wider mb-2"
              style={{ color: "var(--text-muted)" }}>Your top 5</h3>
          <ol className="space-y-1.5">
            {top.map((c, i) => (
              <li
                key={c.fips}
                className="flex items-center justify-between p-2 rounded border"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums w-5 text-right"
                        style={{ color: "var(--text-muted)" }}>{i + 1}.</span>
                  <span style={{ color: "var(--text-heading)" }}>{c.name}, {c.state}</span>
                </div>
                <span className="text-sm font-semibold tabular-nums"
                      style={{ color: "var(--accent)" }}>{c.score.toFixed(1)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {!previewing && top.length === 0 && (
        <div className="mb-5 p-4 rounded border text-sm"
             style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          No counties match — your filters are too strict. Try retaking the quiz
          with looser answers, or tweak the filters manually after applying.
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRetake}
          className="px-3 py-2 text-sm rounded border"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          ← Retake quiz
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onApply}
          className="px-4 py-2 text-sm rounded font-medium"
          style={{ background: "var(--accent)", color: "white" }}
        >
          Show me the map →
        </button>
      </div>
    </div>
  );
}
