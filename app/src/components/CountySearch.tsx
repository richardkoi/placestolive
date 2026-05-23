import { useEffect, useRef, useState } from "react";
import { searchCounties } from "../lib/api";
import type { CountySearchResult } from "../lib/api";

interface Props {
  onPick: (county: CountySearchResult) => void;
}

export function CountySearch({ onPick }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CountySearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const tRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tRef.current) clearTimeout(tRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    tRef.current = window.setTimeout(() => {
      searchCounties(q).then((r) => {
        setResults(r);
        setOpen(true);
      });
    }, 150);
  }, [q]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={q}
        placeholder="Find similar to… (type a county)"
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        className="bg-slate-800/70 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 w-56 focus:outline-none focus:border-indigo-500"
      />
      {open && results.length > 0 && (
        <ul className="absolute top-full mt-1 left-0 right-0 bg-slate-900 border border-slate-700 rounded shadow-lg z-30 max-h-72 overflow-y-auto">
          {results.map((r) => (
            <li
              key={r.fips}
              onClick={() => {
                onPick(r);
                setQ("");
                setOpen(false);
                setResults([]);
              }}
              className="px-3 py-1.5 text-xs text-slate-200 hover:bg-indigo-900/40 cursor-pointer"
            >
              {r.county_name}, {r.state}
              <span className="ml-2 text-slate-500">{r.fips}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
