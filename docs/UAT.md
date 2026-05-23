# placestolive — User Acceptance Testing Checklist

Manual test scenarios to run through before any deploy or after any significant change. Each scenario has a goal, the steps, and the expected result. Use the checkboxes to track a pass-through.

**Prereq:** Server running at http://127.0.0.1:8500 (via `start.bat` or the shawl service), browser hard-refreshed.

---

## 1. Cold start — does the app load?

- [ ] **1.1** Open http://127.0.0.1:8500 in a fresh browser tab. Expected: page loads in under 3 seconds, no red errors in the console, the three-pane layout (prefs / map / results) is visible.
- [ ] **1.2** The US map renders all ~3,100 counties colored in indigo (neutral score 50, since no prefs are enabled).
- [ ] **1.3** Major city labels (NYC, LA, Chicago, Houston, Phoenix, etc.) are visible on the map at default zoom.
- [ ] **1.4** The right-hand "Top matches" panel shows 25 counties, each with a 50.0 score.

## 2. Prefs panel — basic interaction

- [ ] **2.1** Slide "Politics → Importance" from 0 to 8. Pick "Strong D". Expected: within ~300 ms the map repaints, blue counties (e.g. coastal CA, MA, NY) get warm/bright colors and rural red counties get cool/dark.
- [ ] **2.2** Slide "Importance" back to 0. Expected: the dim disappears from the request (visible in DevTools Network → /api/score payload) and the map returns to all-neutral.
- [ ] **2.3** Enable "Summer high (°F)" range. Drag Min to 70, Max to 88. Expected: the range labels update live; once you release, the map shows fewer colored counties (those outside the range are excluded → no-data brown).
- [ ] **2.4** Enable "Dew point" with threshold 55, direction "lower". Expected: the entire humid Southeast (FL, GA, AL, MS, LA, SC) goes brown; only mountain/desert regions stay colored.
- [ ] **2.5** Click the **"reset"** link at the top of the prefs panel. Expected: every dim slider returns to 0, the map returns to all-neutral.

## 3. Continental US toggle

- [ ] **3.1** With the "Continental US only" checkbox checked (default), confirm Alaska and Hawaii are uncolored / not in the results list.
- [ ] **3.2** Uncheck it. Expected: AK boroughs and HI counties appear in the results list and (where they have shape coverage) color up on the map. Count in the right panel jumps by ~35.

## 4. Rich's Preferences preset

- [ ] **4.1** Check the **"Rich's Preferences"** checkbox. Expected: every relevant slider populates with Rich's saved values; the map repaints with the preset's results.
- [ ] **4.2** Change any single slider. Expected: the "Rich's Preferences" checkbox auto-unchecks (because prefs no longer byte-match the preset).
- [ ] **4.3** Re-check it. Expected: prefs restore to the preset; checkbox stays checked.

## 5. County detail drawer

- [ ] **5.1** Click any county on the map. Expected: the right-side drawer slides in, header shows "{Name}, {State}" + FIPS, the **"Find counties similar to this one →"** button is visible.
- [ ] **5.2** Scroll the drawer. Expected: a per-dimension breakdown bar chart at the top (if a non-trivial score), and a "Raw data" table with numeric values for every populated column.
- [ ] **5.3** Click two counties in succession (A then B before A's data loads). Expected: drawer shows B's data, not a mix of A's body + B's header (race-condition fix).
- [ ] **5.4** Click the **×** in the drawer. Expected: drawer closes, no data leaks into next county click.

## 6. Find similar counties

- [ ] **6.1** Click any county → click the **"Find counties similar to this one →"** button in the drawer. Expected: header changes to "Showing counties similar to {Name}, {State}", map repaints with similarity scores (anchor is highest), top-25 list shows neighbors.
- [ ] **6.2** Click **"← back to prefs"** in the header. Expected: returns to scoring mode, map reflects current prefs again.
- [ ] **6.3** In the header search box, type "Boulder". Expected: dropdown shows Boulder County CO + Boulder County NE. Click one. Expected: similar mode activates with that county as anchor.
- [ ] **6.4** In similar mode, toggle **"apply prefs filters"** on. Expected: if your prefs include hard filters (e.g. home_price range), out-of-budget similar counties are excluded.

## 7. URL hash persistence

- [ ] **7.1** Set up a non-trivial prefs combo. Copy the URL. Open it in a new browser window. Expected: the new window loads with identical sliders, same top results.
- [ ] **7.2** With the URL hash present, click "reset". Expected: hash updates to encode the blank-default state.

## 8. Map interaction

- [ ] **8.1** Hover over a county on the map. Expected: cursor turns to a pointer; that county's outline highlights in white.
- [ ] **8.2** Zoom in (scroll) until you can read state-level detail. Expected: more city labels appear at higher zoom (≥250k pop at zoom 4.5; ≥100k pop at zoom 6.5).
- [ ] **8.3** Old Connecticut county shapes (Fairfield, Hartford, etc.) show colors, not gray. Same for old Alaska borough shapes (Valdez-Cordova → Chugach data via alias).

## 9. Edge cases & "weird inputs"

- [ ] **9.1** Set every weight to 10 with restrictive ranges. Expected: very few or zero counties returned; the right panel shows "No counties match your filters" if zero.
- [ ] **9.2** Set every weight to 0 (or click reset). Expected: all 3,109 (or 3,144 without continental filter) counties returned at neutral 50.
- [ ] **9.3** Set home_price range_min ≥ range_max (e.g. min=600k max=400k). Expected: range slider clamps automatically — moving min above max bumps max up to match (this is by-design in PrefsPanel).
- [ ] **9.4** Manually craft an invalid URL hash (garbage after `#`). Expected: app falls back to DEFAULT_PREFS, doesn't crash.
- [ ] **9.5** Open dev tools → Network → throttle to "Slow 3G". Reload. Move a slider rapidly multiple times. Expected: only the latest response is reflected in the UI (request-id race-guard).

## 10. Data freshness

- [ ] **10.1** Run `venvs\placestolive\Scripts\python.exe -m data_pipeline.build_db`. Reload the page. Expected: server picks up new DB automatically (mtime invalidation); no restart needed. Confirm by hitting `/api/health` — `counties` count reflects the new data.
- [ ] **10.2** Hit `POST /api/reload`. Expected: returns `{"reloaded": true, "counties": <N>}`.

## 11. API contracts (curl spot-checks)

- [ ] **11.1** `curl http://127.0.0.1:8500/api/health` → `{"status":"ok", "counties": >3000, ...}`
- [ ] **11.2** `curl http://127.0.0.1:8500/api/county/06037` → Los Angeles County, CA with population, median values, etc.
- [ ] **11.3** `curl 'http://127.0.0.1:8500/api/counties/search?q=ashe'` → JSON array including Ashe County NC.
- [ ] **11.4** POST `/api/score` with `{"limit": 3}` → 3 counties, score 50 each.
- [ ] **11.5** POST `/api/similar` with `{"fips": "06037", "prefs": {}, "limit": 3}` → first result has fips `06037`.

## 12. Performance benchmarks (informal)

- [ ] **12.1** Time from page load to first map render: < 3 seconds.
- [ ] **12.2** Time from slider change to map repaint: < 500 ms (debounced to 200 ms + ~50 ms scoring + paint).
- [ ] **12.3** Memory usage in DevTools Task Manager: < 250 MB for the tab.

---

## Quick "automated" alternative

For a faster sweep without doing the full manual walkthrough:

```powershell
# Backend + pipeline + API tests (~2 sec)
venvs\placestolive\Scripts\python.exe -m pytest tests/ -v

# E2E smoke tests (~12 sec, requires server running)
cd app
npm run test:e2e
```

The automated suite covers 73 backend unit/integration tests + 6 E2E scenarios. UAT items 9.1, 9.4, 12.x and the visual checks (8.x, "is it brown vs colored", etc.) still need a human eye.

---

## Test-failure escalation

If any UAT item fails:
1. Check `console` in browser DevTools for red errors
2. Check the uvicorn log (output of `start.bat` or `Get-EventLog` if running as shawl service)
3. Run the relevant automated suite — backend regressions usually surface there first
4. If automated tests pass but UAT fails, it's likely a frontend regression — `git diff app/src/`
