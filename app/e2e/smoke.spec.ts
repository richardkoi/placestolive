/**
 * E2E smoke tests for placestolive.
 *
 * Run with: npm run test:e2e
 * Requires the production server at PLACESTOLIVE_URL (default http://127.0.0.1:8500).
 *
 * These tests are intentionally tolerant of UI redesigns — they target stable
 * data-flow behavior (request fires, counties appear in the list, drawer opens)
 * rather than fragile DOM structure.
 */
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Start with no URL hash so we always get DEFAULT_PREFS (blank slate),
  // and pre-set the welcome-dismissed flag so the modal doesn't intercept clicks.
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("placestolive_welcomed_v1", "test"));
  await page.goto("/");
});

test("loads the app shell", async ({ page }) => {
  await expect(page).toHaveTitle(/placestolive/i);
  await expect(page.getByText("placestolive").first()).toBeVisible();
});

test("default prefs return all 3,000+ continental counties", async ({ page }) => {
  // Wait for the first /api/score response after page load
  const scoreResp = await page.waitForResponse((r) =>
    r.url().includes("/api/score") && r.request().method() === "POST"
  );
  const body = await scoreResp.json();
  expect(body.total_after_filter).toBeGreaterThan(3000);
  expect(body.top.length).toBeGreaterThan(0);
});

test("toggling continental_only off lets AK + HI back in", async ({ page }) => {
  // Wait for initial render
  await page.waitForResponse((r) => r.url().includes("/api/score"));

  const checkbox = page.locator('input[type="checkbox"]').filter({
    hasText: /continental/i,
  }).or(page.getByLabel(/continental/i));
  // Uncheck "Continental US only"
  await page.getByText(/continental/i).first().click();

  const next = await page.waitForResponse((r) =>
    r.url().includes("/api/score") && r.request().method() === "POST"
  );
  const body = await next.json();
  // 3,109 → ~3,144 when AK + HI are included
  expect(body.total_after_filter).toBeGreaterThan(3140);
});

test("clicking the sample preset loads it", async ({ page }) => {
  await page.waitForResponse((r) => r.url().includes("/api/score"));

  // Click the preset checkbox
  await page.getByText(/sample preset/i).click();

  const resp = await page.waitForResponse((r) =>
    r.url().includes("/api/score") && r.request().method() === "POST"
  );
  const reqBody = JSON.parse(resp.request().postData() ?? "{}");
  // Preset includes politics.strong_d and sunshine threshold=50
  expect(reqBody.politics?.political_lean).toBe("strong_d");
  expect(reqBody.sunshine?.direction).toBe("higher");
});

test("similarity search by typing in the header", async ({ page }) => {
  await page.waitForResponse((r) => r.url().includes("/api/score"));

  // Enable some preferences first so similar() has signal to work with.
  // (With all-zero weights, similar() returns every county at score 50, sorted by FIPS.)
  await page.getByText(/sample preset/i).click();
  await page.waitForResponse((r) =>
    r.url().includes("/api/score") && r.request().method() === "POST"
  );

  // Type into the similarity search box at the top right
  await page.getByPlaceholder(/find similar/i).fill("Boulder");

  // Wait for autocomplete API + dropdown render
  const search = await page.waitForResponse((r) => r.url().includes("/api/counties/search"));
  const results = await search.json();
  expect(results.length).toBeGreaterThan(0);
  const boulderFips = new Set(results.map((r: { fips: string }) => r.fips));

  // Wait for the dropdown <li> to be visible, then click the Boulder one explicitly
  const dropdownItem = page.getByRole("listitem").filter({ hasText: /Boulder/i }).first();
  await dropdownItem.waitFor({ state: "visible" });
  await dropdownItem.click();

  // Should now fire /api/similar with a Boulder county anchor
  const similar = await page.waitForResponse((r) =>
    r.url().includes("/api/similar") && r.request().method() === "POST"
  );
  const reqBody = JSON.parse(similar.request().postData() ?? "{}");
  // Anchor's FIPS should match one of the autocomplete results
  expect(boulderFips.has(reqBody.fips)).toBeTruthy();

  // And the response should have results with the anchor near the top
  const body = await similar.json();
  expect(body.top.length).toBeGreaterThan(0);
  expect(body.top[0].name.toLowerCase()).toContain("boulder");
});

test("health endpoint reports the loaded DB size", async ({ request }) => {
  const r = await request.get("/api/health");
  expect(r.ok()).toBeTruthy();
  const body = await r.json();
  expect(body.status).toBe("ok");
  expect(body.counties).toBeGreaterThan(3000);
});
