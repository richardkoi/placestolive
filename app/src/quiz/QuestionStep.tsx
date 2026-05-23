import type { ScoreRequest } from "../types";
import type { QuizQuestion, Theme } from "./questions";

interface Props {
  question: QuizQuestion;
  theme: Theme;
  currentIndex: number;
  total: number;
  onAnswer: (apply: Partial<ScoreRequest>) => void;
  onSkip: () => void;
  onBack: () => void;
}

export function QuestionStep({
  question, theme, currentIndex, total, onAnswer, onSkip, onBack,
}: Props) {
  const pct = ((currentIndex + 1) / total) * 100;
  return (
    <div className="p-6">
      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-baseline justify-between text-xs mb-1.5"
             style={{ color: "var(--text-muted)" }}>
          <span>{theme.icon} {theme.label} · Question {currentIndex + 1} of {total}</span>
          <span>{Math.round(pct)}%</span>
        </div>
        <div className="h-1.5 rounded overflow-hidden" style={{ background: "var(--hover)" }}>
          <div
            className="h-full transition-all"
            style={{ width: `${pct}%`, background: "var(--accent)" }}
          />
        </div>
      </div>

      {/* Question + hint */}
      <h2 className="text-xl font-semibold mb-1" style={{ color: "var(--text-heading)" }}>
        {question.prompt}
      </h2>
      {question.hint && (
        <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>{question.hint}</p>
      )}

      {/* Option cards */}
      <div className="space-y-2 mb-5">
        {question.options.map((opt, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onAnswer(opt.apply)}
            className="w-full text-left p-3 rounded-md border transition-colors hover:border-indigo-500"
            style={{
              borderColor: "var(--border)",
              background: "transparent",
              color: "var(--text)",
            }}
          >
            <div className="font-medium" style={{ color: "var(--text-heading)" }}>
              {opt.label}
            </div>
            {opt.sublabel && (
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                {opt.sublabel}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="px-3 py-2 text-sm rounded border"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          ← Back
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onSkip}
          className="px-3 py-2 text-sm rounded"
          style={{ color: "var(--text-muted)" }}
        >
          Skip this →
        </button>
      </div>
    </div>
  );
}
