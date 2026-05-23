# Build your own placestolive

A field guide for anyone wanting to build a similar "find the right county for me" tool using Claude. This documents the actual back-and-forth that produced the app you're looking at, not a sanitized retelling. The interesting bits are the wrong turns, the data sources that died mid-build, and the prompts that got us unstuck.

The whole project went from "I have an idea" to a working, tested, multi-feature app in roughly ~25 hours of focused Claude sessions. The most important skill isn't writing code — it's knowing what to ask Claude to do next.

---

## Part 1 — From idea to scaffold

### The opening prompt

The very first prompt was deliberately broad:

> *"I need help brainstorming on a new project. Right now I want planning mode only. This project would be a way for a user to input a bunch of personal preferences to find a place to live in the united states. Examples of variables would be weather preferences (based on dew point, rain, temperature, air quality like we did for clarkstonweather), political climate preferences (prefering democratic areas, rejecting republican areas), etc. Help me brainstorm and plan this out."*

Two things made this prompt work:
- **"Planning mode only"** — explicitly forbidding code edits. Claude's default is to act; this kept it in design mode.
- **Concrete examples + a reference project** — "like we did for clarkstonweather" anchored the level of polish and stack expected. Claude's clarifying questions were narrower as a result.

> **Try this**: Open Claude Code in a new project folder. Type `/plan` (or "let's plan only") followed by a one-paragraph description of what you want. Include 2-3 concrete examples and reference a project you've built before (even if Claude hasn't seen it — just describe its stack). Let Claude ask 3-4 clarifying questions before producing any artifact.

### The clarifying questions that shaped everything

Claude responded with a structured planning conversation and asked four scoping questions that determined the entire architecture:

1. **Geographic granularity?** → County (~3,143). The other options (ZIP, MSA, hybrid) were each better in some ways but county won on data availability.
2. **Which preference categories should the MVP support?** → Weather, politics, cost, crime, disasters, demographics, geography. Schools dropped for V2.
3. **How should preferences combine?** → Weighted score + hard filters.
4. **Main UI?** → Map + ranked list side-by-side. (Not list-only or map-only or wizard.)

These four answers locked the technical scope. Everything else followed.

> **Try this**: Before letting Claude write any code, ask: *"What four scoping decisions would lock the architecture? Ask them as a single AskUserQuestion call."* You'll get a tighter design conversation and avoid re-litigating fundamentals mid-build.

### Scaffold via existing convention

Once scope was locked, the prompt to start building was:

> *"go ahead and develop everything and check in with me if you have any questions"*

The first thing Claude did was invoke a custom `scaffold-project` skill that creates the standard file layout (`CLAUDE.md`, `README.md`, `DEPLOYMENT.md`, `NEXT_SESSION.md`, `start.bat`, `.gitignore`). This established the file convention for the whole project — anyone coming back later could open `CLAUDE.md` to orient themselves.

The initial deploy assumption was Docker. Within minutes of scaffolding, I corrected: "*Can we build it to run locally like d:\littlebrother?*" Claude switched everything to the native-venv + single-process FastAPI pattern. Lesson:

> **Try this**: When Claude makes an architecture default you don't want, **say so explicitly in the moment**. The cost of changing it later compounds.

The single-process pattern (one FastAPI server serving both the React build and the `/api/*` routes from port 8500) became the foundation. It's what made local development trivial and what made later refactoring possible.

---

## Part 2 — The data pipeline (where it gets real)

### What worked and what didn't

The dataset is the soul of an app like this. We ended up pulling from **9 distinct sources** for 42 columns across 3,144 US counties. Here's the inventory and what was hard about each:

| Source | What we got | Difficulty |
|---|---|---|
| **Census 2024 county gazetteer** (TIGER) | Canonical county list + centroid lat/lon | ✅ Easy — single CSV download |
| **FEMA National Risk Index** (ArcGIS Feature Service) | 9 hazard scores per county | ⚠️ The legacy hazards.fema.gov portal was **retired in 2025**. Had to switch to the ArcGIS REST API with paginated queries. |
| **2024 presidential election** (tonmcg GitHub mirror) | Dem/GOP vote share per county | ⚠️ MIT Election Lab requires a guestbook click that blocks automated downloads. The GitHub mirror had the same data without the gate. |
| **County Health Rankings 2024** | Homicide + firearm deaths per 100k | ⚠️ CHR dropped the "violent crime rate" column in 2024 — had to use homicide rate as a proxy. ~1,776 counties have suppressed (NULL) data. |
| **Census ACS 5-year** | Population, home value, rent, income, age, diversity, education | ⚠️ **API key required since 2024.** Get one free at https://api.census.gov/data/key_signup.html (and remember to activate it via the email link). |
| **NOAA / state climate normals** (hand-coded) | Weather climatology | ⚠️ State-level only — Arizona desert and Arizona mountains end up with identical numbers. |
| **Open-Meteo historical archive** | Per-county weather climatology | ⚠️ Free tier rate-limits at 600/min. Easy to get throttled. |
| **EPA AQS Annual AQI by County** | Air quality | ⚠️ Only ~954 counties have monitors; rest get state-median fallback. |
| **USGS Elevation Point Query Service** | Elevation in feet | ✅ Free, no key, ~3,144 calls. |
| **TIGER county shapefiles → GeoJSON** | Map polygons | ⚠️ The shipped `us-atlas` topojson is pre-projected to Albers USA *pixels*, not lat/lon. MapLibre needs lat/lon. We switched to a Plotly-mirrored GeoJSON. |

### The FIPS-join war

Federal datasets identify counties by 5-digit FIPS codes (state code + county code). Sounds simple. Three weeks of edge cases in practice:

- **Connecticut reorganized counties into 9 Planning Regions in 2022.** Old county FIPS (09001-09015) still appear in some sources; new FIPS (09110-09190) appear in others.
- **Alaska boroughs split and rename.** Wade Hampton → Kusilvak. Valdez-Cordova → Chugach + Copper River.
- **South Dakota** renamed Shannon County to Oglala Lakota (46113 → 46102).
- **Virginia** merged Bedford city into Bedford County (2013) but old GeoJSONs still have it.
- **Puerto Rico (FIPS state 72)** is in TIGER but not in the gazetteer's "50 states + DC" filter.
- **Alaska state house districts** vs. **Alaska boroughs** — the tonmcg 2024 election dataset uses State House Districts (02001-02040) which DON'T match borough FIPS. We had to aggregate AK statewide and broadcast.

The fix that finally worked: an explicit alias map in `MapView.tsx`:

```ts
const FIPS_ALIASES = {
  "09001": "09190",  // Fairfield → Western CT Planning Region
  "09003": "09110",  // Hartford → Capitol Planning Region
  "02261": "02063",  // Valdez-Cordova → Chugach
  // ...
};
```

The map shape uses the old FIPS, the data lookup uses the new one.

> **Try this**: For any geographic join, ask Claude: *"What boundary changes have happened in the last 10 years for these geographies? Build me an alias table from old codes to current ones."* It's faster than discovering them via broken renders.

### Hidden-failure modes that cost us a session each

- **Census sentinel values.** ACS returns `-666666666` for suppressed data. `pd.to_numeric` happily ingests it. Our `property_tax_pct` had a min of **-1,427,552** before we caught it. Always strip `-666666666` (and the half-dozen related sentinels) before any math.
- **Cache-and-forget.** Each data source caches to `data/raw/`. A truncated download silently becomes a permanent corrupt cache until you `rm` it. Always size-check or hash-validate cached files.
- **Silent left-join drops.** `df.merge(other, on="fips", how="left")` is forgiving in a bad way — counties in `other` that don't match any FIPS in `df` are silently dropped. Always print row counts before/after every merge.

### The adversarial review pattern

Three times during the build, we ran an adversarial code review using parallel Claude agents:

> **Try this**: *"Spawn three parallel agents to review the codebase. Each gets a different scope: scoring engine, data pipeline, frontend/deploy. Each finds at least 10 issues with file:line citations. Synthesize when they all return."*

The first review (after MVP) caught 30+ real bugs including the sentinel issue above, an Alaska election data mis-join, and a percentile NaN handling lie. We wouldn't have found most of these via testing alone — the agents were looking for *what's missing*, not just *what's wrong*.

---

## Part 3 — Scoring engine + UX evolution

### V1: target + decay (simple, wrong)

The first scoring model was: each dimension has a *target* value (e.g. "ideal summer high = 82°F") and a per-dimension *decay* (e.g. 15°F). A county's match score for that dim was 100 at the target, falling linearly to 0 at the decay distance.

Composite score = weighted average across enabled dims.

This was *intuitive* and *wrong*. Real users don't have "ideal" temperatures — they have **comfort zones**. They don't say "ideal summer high is 82" but rather "75-88 is all fine." A single peak punishes 75 and 90 equally, even though both are inside the user's comfort zone.

### V2: range + threshold (the redesign)

After Rich tried to use it for his own preferences and bounced off the awkwardness, we restructured:

| Dim type | UI | Score |
|---|---|---|
| **Range** (summer high, winter low, rainfall, home price) | Two-handle slider for `[min, max]` | 100 inside, county excluded outside |
| **One-sided** (snow, sunshine, dew point, AQI, distances) | Single threshold + direction | 0→100 linear on the "good" side, county excluded past threshold |
| **Categorical** (politics) | 5-option button group | Linear distance from target lean |
| **Percentile** (crime, disasters, taxes) | Just direction (lower/higher better) | Rank-based 0-100 |

The key UX call was the question "do hard cutoffs and soft preferences need separate controls, or should the range/threshold *be* the hard cutoff?" Rich picked combined. The result: simple UI, but enabling 5+ dims with hard cutoffs collapses the result set to single-digit counties. We tuned defaults to be lenient and the model worked.

> **Try this**: When scoring/ranking UX feels off, sketch 2-3 alternative interaction models in a markdown table BEFORE writing code. Ask Claude: *"What three control patterns would best capture this preference shape? Compare on UX clarity vs. expressiveness."*

### V3: the "find similar" mode

After scoring worked, the natural next feature was "show me counties similar to *this* one." This is k-NN over the feature vector, weighted by the user's preferences.

The implementation reuses the entire scoring infrastructure: for each enabled dim, set the *target* to the anchor county's actual value, then compute matches as usual. With no user prefs set, the system falls back to equal weight=1 across every dim with valid data — so the feature works out of the box, but personalizes when the user dials in their preferences.

> **Try this**: Whenever you build a "Find similar to X" feature, write the prompt: *"Implement similarity as a degenerate case of the existing scoring engine. Reuse every match function. Anchor's values become the target."* You'll get a feature that's consistent with the rest of the app instead of a parallel implementation.

### UX clarity layer (the part everyone underestimates)

The biggest single UX improvement came after Rich said "*I am having trouble understanding what each filter and each data point means.*"

The fix was a single design call: hover tooltips on every dimension label, with reference values for context. For example, "Summer dew point (max °F)" → tooltip says *"Summer humidity proxy. <55°F dry & comfortable · 55-65°F sticky · 65+°F oppressive (Florida)."*

Combined with qualitative bins on raw values in the detail drawer ("FEMA risk: 88 / 100 *(very high)*" in red), the app went from "I have to interpret these numbers" to "I instantly know what this means."

> **Try this**: For every numeric value the user sees, ask Claude: *"Add reference anchors so the user has a mental yardstick. For each dimension, what are the bottom-quartile, median, and top-quartile values nationally? Use them in the tooltip."*

---

## Part 4 — The shape of the conversation

Over ~25 hours of total session time, three patterns emerged that mattered more than any individual technique:

**1. Question discipline.** Claude defaults to acting. The single highest-leverage move is enforcing *"plan-only"* periods and *"ask three questions before code"* discipline. Every time we let Claude jump straight to implementation, we ended up reverting.

**2. Adversarial review as a regular practice.** Not just once at the end — three times during the build, and every time it surfaced bugs that would have shipped otherwise. Make this a habit, not an event.

**3. Stop, name what's wrong, restart.** The dew_point hard filter that kept knocking out 70% of the country. The percentile NaN handling that silently inflated bad data. The MapLibre CSS that overrode my Tailwind class. Each took 30+ minutes of *"this isn't working"* before someone said *"OK what specifically is broken here, with file:line."* Make the diagnostic specific and fast.

---

## Appendix — Project structure cheat sheet

```
placestolive/
├── CLAUDE.md              # Project context for any Claude session
├── README.md              # Public-facing overview
├── DEPLOYMENT.md          # How to run + deploy
├── NEXT_SESSION.md        # Handoff for the next session
├── start.bat              # Dev launcher
├── server/                # FastAPI backend (single process)
│   ├── main.py            # /api/* endpoints
│   ├── scoring.py         # All scoring math
│   └── schema.py          # Pydantic models
├── data_pipeline/         # Offline ingestion scripts
│   ├── build_db.py        # Master pipeline
│   └── ingest_*.py        # One per source
├── data/
│   └── counties.sqlite    # Final database (~1 MB)
├── app/                   # React + Vite + Tailwind frontend
│   ├── public/
│   │   ├── counties.geojson    # Map polygons (3.1 MB)
│   │   └── cities.geojson      # City labels (65 KB)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── dimensions.ts       # UI config for each scoring dim
│   │   ├── components/         # PrefsPanel, MapView, etc.
│   │   └── lib/api.ts          # Fetch helpers
│   └── e2e/                # Playwright smoke tests
├── tests/                  # pytest backend + pipeline tests
├── docs/
│   ├── BUILD_YOUR_OWN.md   # ← this file
│   └── UAT.md              # Manual test checklist
└── scripts/
    └── install-service.bat # Optional shawl Windows Service
```

## Appendix — One-shot prompts you can adapt

These are prompts that worked at key inflection points. Adapt them to your domain.

> **For initial brainstorming:**
> *"I want to build [thing]. Don't write any code yet. Ask me 4 clarifying questions that would lock the architecture. Use AskUserQuestion."*

> **For scaffolding:**
> *"Scaffold this project with [CLAUDE.md, README.md, DEPLOYMENT.md, NEXT_SESSION.md, start.bat]. Don't write features yet — just the structure."*

> **For data sources:**
> *"For [domain], list every free + public data source I could use, with: URL, format, update cadence, gotchas, and how to join it to my key. Include the ones that died in the last 2 years."*

> **For adversarial review:**
> *"Spawn 3 parallel agents to review [scoring | pipeline | frontend]. Each finds at least 10 issues with file:line citations. Report findings as triaged bugs/sketches/nits. Be cynical."*

> **For UX clarity:**
> *"For every numeric data point users see, add a hover tooltip with: (a) what the variable measures, (b) reference values for the bottom quartile / median / top quartile. Don't change layout."*

> **For test infrastructure:**
> *"Build critical-path tests only. Backend pytest for the scoring engine + API endpoints. E2E smoke tests with Playwright. A UAT manual checklist for the rest. ~3 hours total."*

---

*This guide reflects the actual conversation that built this app. The code itself is the canonical reference — read `server/scoring.py`, `data_pipeline/build_db.py`, and `app/src/dimensions.ts` for the substance.*
