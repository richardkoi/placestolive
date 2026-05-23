// Theme + question definitions for the onboarding quiz.
//
// Each theme has one question. An option's `apply` is a partial ScoreRequest
// merged into the final prefs. A weight of 5 is the default for any dim that
// gets enabled via a quiz answer (medium importance). Users tweak afterward.

import type { ScoreRequest } from "../types";

export interface Theme {
  id: ThemeId;
  label: string;
  icon: string;
  description: string;
}

export type ThemeId =
  | "climate" | "politics" | "cost" | "safety"
  | "disasters" | "community" | "nature" | "air";

export const THEMES: Theme[] = [
  { id: "climate", label: "Climate", icon: "🌤️",
    description: "Temperature, humidity, sun, snow, rain" },
  { id: "politics", label: "Politics", icon: "🏛️",
    description: "Local political leaning" },
  { id: "cost", label: "Cost of living", icon: "💰",
    description: "Home prices and taxes" },
  { id: "safety", label: "Safety", icon: "🛡️",
    description: "Crime + firearm deaths" },
  { id: "disasters", label: "Disaster risk", icon: "⚠️",
    description: "Hurricane, wildfire, flood, earthquake, etc." },
  { id: "community", label: "Community", icon: "🏘️",
    description: "Town size, age, diversity, LGBTQ policy" },
  { id: "nature", label: "Nature & geography", icon: "🏔️",
    description: "Coast, mountains, distance from nature" },
  { id: "air", label: "Air quality", icon: "🌬️",
    description: "EPA AQI" },
];

export interface QuizOption {
  label: string;
  sublabel?: string;
  apply: Partial<ScoreRequest>;
}

export interface QuizQuestion {
  id: string;
  themeId: ThemeId;
  prompt: string;
  hint?: string;
  options: QuizOption[];
  allowMulti?: boolean;        // if true, user can pick multiple options that all merge
}

// One question per theme. Each option's `apply` carries the full effect.
// Default weight is 5 unless the option intentionally sets it higher.
export const QUESTIONS: QuizQuestion[] = [
  // ---- Climate ----
  {
    id: "climate_ideal",
    themeId: "climate",
    prompt: "What's your ideal climate?",
    hint: "We'll pre-fill temperature, humidity, sunshine, snow ranges.",
    options: [
      {
        label: "Mild year-round",
        sublabel: "Easy winters, comfortable summers (Pacific NW coast, mid-Atlantic, parts of CA)",
        apply: {
          summer_high:   { weight: 6, range_min: 70, range_max: 85 },
          winter_low:    { weight: 7, range_min: 30, range_max: 55 },
          dew_point:     { weight: 5, threshold: 60, direction: "lower" },
          annual_snow:   { weight: 4, threshold: 20, direction: "lower" },
        },
      },
      {
        label: "Hot, dry, sunny",
        sublabel: "Desert / Mediterranean climates (AZ, NM, NV, inland CA)",
        apply: {
          summer_high:   { weight: 5, range_min: 85, range_max: 110 },
          winter_low:    { weight: 4, range_min: 25, range_max: 55 },
          dew_point:     { weight: 8, threshold: 50, direction: "lower" },
          sunshine:      { weight: 7, threshold: 75, direction: "higher" },
          annual_snow:   { weight: 3, threshold: 12, direction: "lower" },
        },
      },
      {
        label: "Real four seasons",
        sublabel: "Cold winters with snow, warm summers (New England, Upper Midwest)",
        apply: {
          summer_high:   { weight: 5, range_min: 75, range_max: 90 },
          winter_low:    { weight: 6, range_min: -10, range_max: 25 },
          annual_snow:   { weight: 4, threshold: 100, direction: "lower" },
        },
      },
      {
        label: "Hot & humid",
        sublabel: "Sub-tropical (FL, Gulf Coast, Deep South)",
        apply: {
          summer_high:   { weight: 5, range_min: 85, range_max: 100 },
          winter_low:    { weight: 6, range_min: 45, range_max: 70 },
          dew_point:     { weight: 3, threshold: 75, direction: "lower" },
          annual_snow:   { weight: 5, threshold: 5, direction: "lower" },
        },
      },
      {
        label: "Cool & misty",
        sublabel: "Pacific NW, coastal CA, Maine coast",
        apply: {
          summer_high:   { weight: 6, range_min: 65, range_max: 80 },
          winter_low:    { weight: 5, range_min: 25, range_max: 50 },
          dew_point:     { weight: 4, threshold: 60, direction: "lower" },
        },
      },
      {
        label: "No strong preference",
        apply: {},
      },
    ],
  },

  // ---- Politics ----
  {
    id: "politics_lean",
    themeId: "politics",
    prompt: "What's your political lean?",
    hint: "Based on 2024 presidential vote share at the county level.",
    options: [
      { label: "Strong Democratic", sublabel: "70%+ Dem vote share",
        apply: { politics: { weight: 8, political_lean: "strong_d" } } },
      { label: "Lean Democratic", sublabel: "55-70% Dem",
        apply: { politics: { weight: 6, political_lean: "lean_d" } } },
      { label: "Mixed / centrist", sublabel: "Roughly even split",
        apply: { politics: { weight: 5, political_lean: "neutral" } } },
      { label: "Lean Republican", sublabel: "55-70% GOP",
        apply: { politics: { weight: 6, political_lean: "lean_r" } } },
      { label: "Strong Republican", sublabel: "70%+ GOP vote share",
        apply: { politics: { weight: 8, political_lean: "strong_r" } } },
      { label: "Doesn't matter to me", apply: {} },
    ],
  },

  // ---- Cost ----
  {
    id: "cost_budget",
    themeId: "cost",
    prompt: "What's your home-buying budget?",
    hint: "Median home value cap. You can adjust the exact range later.",
    options: [
      { label: "Under $250k", sublabel: "Affordable Midwest, rural South, parts of TX/OK",
        apply: { home_price: { weight: 7, range_min: 50000, range_max: 250000 } } },
      { label: "Under $400k", sublabel: "Most of the US — typical suburbs and mid-size cities",
        apply: { home_price: { weight: 6, range_min: 100000, range_max: 400000 } } },
      { label: "Under $600k", sublabel: "Sun Belt metros, suburbs of major cities",
        apply: { home_price: { weight: 5, range_min: 150000, range_max: 600000 } } },
      { label: "Under $1M", sublabel: "Coastal cities, expensive metros",
        apply: { home_price: { weight: 4, range_min: 200000, range_max: 1000000 } } },
      { label: "No budget concerns", apply: {} },
    ],
  },

  // ---- Safety ----
  {
    id: "safety_crime",
    themeId: "safety",
    prompt: "How important is low crime?",
    hint: "Uses CHR 2024 homicide rate. ~1,700 rural counties have suppressed data and may not appear with strict filters.",
    options: [
      { label: "Critical — minimize crime risk",
        apply: { homicide_rate: { weight: 9, direction: "lower" } } },
      { label: "Important",
        apply: { homicide_rate: { weight: 6, direction: "lower" } } },
      { label: "Mild preference",
        apply: { homicide_rate: { weight: 3, direction: "lower" } } },
      { label: "Not a major factor", apply: {} },
    ],
  },

  // ---- Disasters ----
  {
    id: "disaster_tolerance",
    themeId: "disasters",
    prompt: "How concerned are you about natural disasters?",
    hint: "Uses FEMA National Risk Index — composite of 18 hazards weighted by historic loss.",
    options: [
      { label: "Minimize all disaster risk",
        sublabel: "Will rule out hurricane / wildfire / tornado / flood / quake zones",
        apply: {
          disaster_risk:   { weight: 9, direction: "lower" },
          hurricane_risk:  { weight: 6, direction: "lower" },
          wildfire_risk:   { weight: 6, direction: "lower" },
          flood_risk:      { weight: 5, direction: "lower" },
        } },
      { label: "Avoid the worst", sublabel: "Strong preference but not absolute",
        apply: {
          disaster_risk:   { weight: 6, direction: "lower" },
        } },
      { label: "Some concern", apply: { disaster_risk: { weight: 3, direction: "lower" } } },
      { label: "Don't worry about it", apply: {} },
    ],
  },

  // ---- Community ----
  {
    id: "community_size",
    themeId: "community",
    prompt: "What size community do you want?",
    options: [
      { label: "Small town or rural", sublabel: "<25k population, low density",
        apply: {
          population:  { weight: 6, range_min: 0,      range_max: 25000 },
          pop_density: { weight: 3, target: 50 },
        } },
      { label: "Mid-size city", sublabel: "25k-200k, walkable but not crowded",
        apply: {
          population:  { weight: 6, range_min: 25000,  range_max: 200000 },
          pop_density: { weight: 3, target: 500 },
        } },
      { label: "Major metro area", sublabel: "200k+, urban amenities",
        apply: {
          population:  { weight: 6, range_min: 200000, range_max: 5000000 },
          pop_density: { weight: 3, target: 2000 },
        } },
      { label: "Big city, dense", sublabel: "1M+, high density",
        apply: {
          population:  { weight: 6, range_min: 1000000, range_max: 10000000 },
          pop_density: { weight: 4, target: 8000 },
        } },
      { label: "No preference", apply: {} },
    ],
  },

  // ---- Nature ----
  {
    id: "nature_proximity",
    themeId: "nature",
    prompt: "Want to be close to nature?",
    hint: "We'll prefer counties within a couple hours of what you pick.",
    options: [
      { label: "Near the coast",
        apply: { dist_to_coast: { weight: 7, threshold: 100, direction: "lower" } } },
      { label: "Near mountains",
        apply: { dist_to_mountains: { weight: 7, threshold: 100, direction: "lower" } } },
      { label: "Near both",
        apply: {
          dist_to_coast: { weight: 5, threshold: 200, direction: "lower" },
          dist_to_mountains: { weight: 5, threshold: 200, direction: "lower" },
        } },
      { label: "Either is fine, just not landlocked",
        apply: {
          dist_to_coast: { weight: 3, threshold: 300, direction: "lower" },
          dist_to_mountains: { weight: 3, threshold: 300, direction: "lower" },
        } },
      { label: "Don't care", apply: {} },
    ],
  },

  // ---- Air quality ----
  {
    id: "air_quality",
    themeId: "air",
    prompt: "Air quality importance?",
    hint: "Uses EPA AQI per-county (annual mean of monitor readings).",
    options: [
      { label: "Critical — sensitive to air pollution",
        apply: { aqi: { weight: 8, threshold: 45, direction: "lower" } } },
      { label: "Prefer cleaner air",
        apply: { aqi: { weight: 5, threshold: 55, direction: "lower" } } },
      { label: "Mild preference",
        apply: { aqi: { weight: 3, threshold: 70, direction: "lower" } } },
      { label: "Not concerned", apply: {} },
    ],
  },
];

// Helper: pick the questions for a set of selected theme IDs, in theme order
export function questionsForThemes(themeIds: ThemeId[]): QuizQuestion[] {
  const set = new Set(themeIds);
  return QUESTIONS.filter((q) => set.has(q.themeId));
}

// Merge a stack of partial ScoreRequest answers into one. Later answers
// overwrite earlier ones at the dim level (each answer is one full dim config).
export function mergeAnswers(answers: Partial<ScoreRequest>[]): ScoreRequest {
  const result: ScoreRequest = { continental_only: true, limit: 25 };
  for (const a of answers) {
    Object.assign(result, a);
  }
  return result;
}
