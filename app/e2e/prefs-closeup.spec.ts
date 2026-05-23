// Close-up screenshot of the prefs panel to see overflow issues
import { test } from "@playwright/test";

test("prefs panel close-up with preset enabled", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  const dismiss = page.getByRole("button", { name: /OK, let's go/i });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
  await page.getByText(/sample preset/i).click();
  await page.waitForResponse((r) =>
    r.url().includes("/api/score") && r.request().method() === "POST"
  );
  await page.waitForTimeout(800);
  // Screenshot just the left prefs panel
  await page.screenshot({
    path: "qa-screenshots/prefs-closeup.png",
    clip: { x: 0, y: 0, width: 400, height: 1000 },
  });
  // And scroll to bottom for home_price slider (longest value)
  await page.evaluate(() => {
    const aside = document.querySelector("aside");
    if (aside) aside.scrollTop = aside.scrollHeight;
  });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "qa-screenshots/prefs-closeup-scrolled.png",
    clip: { x: 0, y: 0, width: 400, height: 1000 },
  });
});
