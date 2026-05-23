import { useEffect, useState } from "react";

const STORAGE_KEY = "placestolive_welcomed_v1";

interface Props {
  // Force the modal open for testing (e.g. ?welcome=1 in URL). Defaults to false.
  forceOpen?: boolean;
  // Callback when the user wants to take the quiz
  onStartQuiz?: () => void;
}

export function WelcomeModal({ forceOpen = false, onStartQuiz }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      return;
    }
    // Only show if the user hasn't seen this before. Versioned key so we can
    // re-show once if the content changes meaningfully later.
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (!seen) setOpen(true);
    } catch {
      // localStorage may be blocked (private mode, etc.) — just don't show.
    }
  }, [forceOpen]);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      // ignore
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl max-w-lg w-full p-6 text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="welcome-title" className="text-xl font-semibold mb-1">
          Welcome to <span className="text-indigo-400">placestolive</span>
        </h2>
        <p className="text-sm text-slate-400 mb-4">
          Find a US county that matches what you actually care about — climate, politics, cost,
          crime, disasters, demographics, and more — across all ~3,100 continental counties.
        </p>

        <div className="text-sm space-y-3 mb-5">
          <div className="flex items-start gap-3">
            <span className="text-indigo-400 font-semibold mt-0.5">1.</span>
            <p>
              <strong className="text-slate-100">Slide importance</strong> on any preference in
              the left panel to filter or rank counties by that dimension. Sliders at 0 are
              ignored.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-indigo-400 font-semibold mt-0.5">2.</span>
            <p>
              <strong className="text-slate-100">Hover any label</strong> (the dotted
              underline) to see what it measures and reference values.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-indigo-400 font-semibold mt-0.5">3.</span>
            <p>
              <strong className="text-slate-100">Click any county</strong> on the map for a
              full breakdown. Use <em>"Find counties similar to this one"</em> to discover
              lookalikes anywhere in the country.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-indigo-400 font-semibold mt-0.5">4.</span>
            <p>
              In a hurry? Check <strong className="text-slate-100">"Use sample preset"</strong>{" "}
              at the top of the prefs panel for a starting configuration to tweak.
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-500 mb-5">
          Data: 2024 election · Census ACS 2023 · FEMA NRI · NOAA Climate Normals 1991-2020 ·
          EPA AQI · CHR 2024 · USGS elevation. See the{" "}
          <a
            href="docs.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300 underline"
          >
            docs
          </a>{" "}
          for how this app was built.
        </p>

        <div className="flex gap-2">
          {onStartQuiz && (
            <button
              type="button"
              onClick={() => { dismiss(); onStartQuiz(); }}
              className="flex-1 px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm"
              autoFocus
            >
              Take a 2-min quiz →
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="px-4 py-2 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 font-medium text-sm"
          >
            Show me the map
          </button>
        </div>
      </div>
    </div>
  );
}
