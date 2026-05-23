import type { ScoredCounty } from "../types";

interface Props {
  top: ScoredCounty[];
  totalAfter: number;
  totalBefore: number;
  selected: string | null;
  onSelect: (fips: string | null) => void;
  anchorName?: string;          // when set, panel is in similarity mode
}

export function ResultsList({
  top, totalAfter, totalBefore, selected, onSelect, anchorName,
}: Props) {
  const isSimilar = !!anchorName;
  return (
    <aside className="w-full h-full overflow-y-auto bg-slate-900/60 border-l border-slate-700 text-sm">
      <div className="sticky top-0 px-4 py-3 bg-slate-900/95 border-b border-slate-700 backdrop-blur z-10">
        <h2 className="text-base font-semibold text-slate-100">
          {isSimilar ? `Most similar to ${anchorName}` : "Top matches"}
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          {totalAfter.toLocaleString()} of {totalBefore.toLocaleString()} counties after filters
        </p>
      </div>
      <ol className="divide-y divide-slate-800">
        {top.map((c, i) => {
          const active = c.fips === selected;
          return (
            <li
              key={c.fips}
              onClick={() => onSelect(active ? null : c.fips)}
              className={`px-4 py-2 cursor-pointer flex items-center gap-3 hover:bg-slate-800/60 ${
                active ? "bg-indigo-900/40" : ""
              }`}
            >
              <span className="text-slate-500 w-6 text-right tabular-nums">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-slate-100 truncate">
                  {c.name}, {c.state}
                </div>
                <div className="text-xs text-slate-400">{c.fips}</div>
              </div>
              <div className="text-right">
                <div className="text-slate-100 font-semibold tabular-nums">{c.score.toFixed(1)}</div>
                <div className="text-xs text-slate-500">score</div>
              </div>
            </li>
          );
        })}
        {top.length === 0 && (
          <li className="px-4 py-6 text-center text-slate-500">No counties match your filters.</li>
        )}
      </ol>
    </aside>
  );
}
