import { test, expect } from "@playwright/test";

test("capture console errors", async ({ page }) => {
  const messages: string[] = [];
  page.on("console", (msg) => {
    messages.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    messages.push(`[ERROR] ${err.message}`);
  });

  await page.goto("/");
  await page.waitForTimeout(3000);

  console.log("=== CONSOLE OUTPUT ===");
  for (const m of messages) console.log(m);
  console.log("=== END ===");

  // Always pass — we just want the output
  expect(true).toBe(true);
});
