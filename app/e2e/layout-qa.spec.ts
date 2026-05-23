// Layout QA: take screenshots in multiple themes/palettes/states so we can
// visually inspect for layout issues.
import { test } from "@playwright/test";
import { existsSync, mkdirSync } from "fs";

const OUT = "qa-screenshots";

test.beforeAll(() => {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  // Wipe localStorage so we always start fresh
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  // Set viewport to a realistic desktop size
  await page.setViewportSize({ width: 1600, height: 1000 });
});

async function dismissWelcome(page: import("@playwright/test").Page) {
  // Dismiss the welcome modal if it's showing
  const btn = page.getByRole("button", { name: /show me the map/i });
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
  }
}

test("1: default dark theme, empty prefs", async ({ page }) => {
  await page.goto("/");
  await dismissWelcome(page);
  await page.waitForResponse((r) => r.url().includes("/api/score"));
  await page.waitForTimeout(2000);   // let map paint
  await page.screenshot({ path: `${OUT}/01-dark-empty.png`, fullPage: false });
});

test("2: dark theme with Rich's preset loaded", async ({ page }) => {
  await page.goto("/");
  await dismissWelcome(page);
  await page.getByText(/sample preset/i).click();
  await page.waitForResponse((r) =>
    r.url().includes("/api/score") && r.request().method() === "POST"
  );
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/02-dark-preset.png`, fullPage: false });
});

test("3: light theme", async ({ page }) => {
  await page.goto("/");
  await dismissWelcome(page);
  await page.waitForResponse((r) => r.url().includes("/api/score"));
  // Open settings, click Light
  await page.getByLabel("Settings").click();
  await page.getByRole("button", { name: "light" }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/03-light-empty.png`, fullPage: false });
});

test("4: light theme with preset + map detail", async ({ page }) => {
  await page.goto("/");
  await dismissWelcome(page);
  await page.getByText(/sample preset/i).click();
  await page.waitForResponse((r) =>
    r.url().includes("/api/score") && r.request().method() === "POST"
  );
  await page.getByLabel("Settings").click();
  await page.getByRole("button", { name: "light" }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/04-light-preset.png`, fullPage: false });
});

test("5: Viridis palette (colorblind-safe)", async ({ page }) => {
  await page.goto("/");
  await dismissWelcome(page);
  await page.getByText(/sample preset/i).click();
  await page.waitForResponse((r) =>
    r.url().includes("/api/score") && r.request().method() === "POST"
  );
  await page.getByLabel("Settings").click();
  await page.getByText(/viridis/i).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/05-viridis-palette.png`, fullPage: false });
});

test("6: Heat palette + light mode", async ({ page }) => {
  await page.goto("/");
  await dismissWelcome(page);
  await page.getByText(/sample preset/i).click();
  await page.waitForResponse((r) =>
    r.url().includes("/api/score") && r.request().method() === "POST"
  );
  await page.getByLabel("Settings").click();
  await page.getByText(/heat/i).first().click();
  await page.getByRole("button", { name: "light" }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/06-heat-light.png`, fullPage: false });
});

test("7: county detail drawer open (dark)", async ({ page }) => {
  await page.goto("/");
  await dismissWelcome(page);
  await page.getByText(/sample preset/i).click();
  await page.waitForResponse((r) =>
    r.url().includes("/api/score") && r.request().method() === "POST"
  );
  // Click the first county in the results list
  await page.locator("ol li").first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/07-county-detail-dark.png`, fullPage: false });
});

test("8: county detail drawer open (light)", async ({ page }) => {
  await page.goto("/");
  await dismissWelcome(page);
  await page.getByText(/sample preset/i).click();
  await page.waitForResponse((r) =>
    r.url().includes("/api/score") && r.request().method() === "POST"
  );
  await page.getByLabel("Settings").click();
  await page.getByRole("button", { name: "light" }).click();
  await page.waitForTimeout(300);
  // Close settings popover then click a county
  await page.mouse.click(800, 500);
  await page.locator("ol li").first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/08-county-detail-light.png`, fullPage: false });
});

test("9: settings popover open (dark)", async ({ page }) => {
  await page.goto("/");
  await dismissWelcome(page);
  await page.waitForTimeout(500);
  await page.getByLabel("Settings").click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/09-settings-popover-dark.png`, fullPage: false });
});

test("10: welcome modal", async ({ page }) => {
  await page.goto("/?welcome=1");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/10-welcome-modal.png`, fullPage: false });
});

test("11: similar mode with anchor highlight", async ({ page }) => {
  await page.goto("/");
  await dismissWelcome(page);
  await page.getByText(/sample preset/i).click();
  await page.waitForResponse((r) =>
    r.url().includes("/api/score") && r.request().method() === "POST"
  );
  // Type in search box
  await page.getByPlaceholder(/find similar/i).fill("Boulder");
  await page.waitForResponse((r) => r.url().includes("/api/counties/search"));
  await page.getByRole("listitem").filter({ hasText: /Boulder/i }).first().click();
  await page.waitForResponse((r) =>
    r.url().includes("/api/similar") && r.request().method() === "POST"
  );
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/11-similar-mode.png`, fullPage: false });
});
