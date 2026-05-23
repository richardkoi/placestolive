// Top-level quiz component — manages state across:
//   1. Theme picker (multi-select)
//   2. One question per selected theme (one screen at a time)
//   3. Summary preview (top 5 matches + apply)
//
// On apply, calls onApply(prefs) to populate the parent's prefs state.

import { useEffect, useMemo, useState } from "react";
import type { ScoreRequest } from "../types";
import { fetchScore } from "../lib/api";
import { THEMES, type Theme, type ThemeId } from "./questions";
import { questionsForThemes, mergeAnswers } from "./questions";
import { ThemePicker } from "./ThemePicker";
import { QuestionStep } from "./QuestionStep";
import { SummaryStep } from "./SummaryStep";

interface Props {
  onApply: (prefs: ScoreRequest) => void;
  onCancel: () => void;
}

type Step =
  | { kind: "themes" }
  | { kind: "question"; index: number }
  | { kind: "summary" };

export function Quiz({ onApply, onCancel }: Props) {
  const [step, setStep] = useState<Step>({ kind: "themes" });
  const [selectedThemes, setSelectedThemes] = useState<ThemeId[]>([]);
  // answers[i] is the partial ScoreRequest from question i (matched to selectedThemes order)
  const [answers, setAnswers] = useState<Array<Partial<ScoreRequest>>>([]);

  const questions = useMemo(() => questionsForThemes(selectedThemes), [selectedThemes]);
  const mergedPrefs = useMemo(() => mergeAnswers(answers), [answers]);

  // Preview score response on summary step
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof fetchScore>> | null>(null);
  useEffect(() => {
    if (step.kind !== "summary") return;
    setPreviewing(true);
    fetchScore(mergedPrefs)
      .then(setPreview)
      .catch(() => setPreview(null))
      .finally(() => setPreviewing(false));
  }, [step.kind, mergedPrefs]);

  const handleStartQuestions = (themes: ThemeId[]) => {
    setSelectedThemes(themes);
    setAnswers(new Array(themes.length).fill({}));
    if (themes.length === 0) {
      // Bypass straight to summary if nothing picked
      setStep({ kind: "summary" });
    } else {
      setStep({ kind: "question", index: 0 });
    }
  };

  const handleAnswer = (i: number, apply: Partial<ScoreRequest>) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[i] = apply;
      return next;
    });
    if (i + 1 < questions.length) {
      setStep({ kind: "question", index: i + 1 });
    } else {
      setStep({ kind: "summary" });
    }
  };

  const handleSkip = (i: number) => handleAnswer(i, {});

  const handleBack = (i: number) => {
    if (i === 0) {
      setStep({ kind: "themes" });
    } else {
      setStep({ kind: "question", index: i - 1 });
    }
  };

  const handleApply = () => onApply(mergedPrefs);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-2xl rounded-lg shadow-2xl border"
        style={{
          background: "var(--bg)",
          color: "var(--text)",
          borderColor: "var(--border)",
          maxHeight: "92vh",
          overflowY: "auto",
        }}
      >
        {step.kind === "themes" && (
          <ThemePicker
            themes={THEMES}
            initial={selectedThemes}
            onCancel={onCancel}
            onContinue={handleStartQuestions}
          />
        )}
        {step.kind === "question" && (
          <QuestionStep
            question={questions[step.index]}
            theme={lookupTheme(questions[step.index].themeId)}
            currentIndex={step.index}
            total={questions.length}
            onAnswer={(apply) => handleAnswer(step.index, apply)}
            onSkip={() => handleSkip(step.index)}
            onBack={() => handleBack(step.index)}
          />
        )}
        {step.kind === "summary" && (
          <SummaryStep
            previewing={previewing}
            preview={preview}
            mergedPrefs={mergedPrefs}
            themesAnswered={selectedThemes.length}
            onRetake={() => setStep({ kind: "themes" })}
            onApply={handleApply}
          />
        )}
      </div>
    </div>
  );
}

function lookupTheme(id: ThemeId): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
