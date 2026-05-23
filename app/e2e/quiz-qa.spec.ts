// QA pass on the quiz flow
import { test } from "@playwright/test";

test("quiz: welcome -> theme picker", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "qa-screenshots/quiz-01-welcome.png" });
  // Click the Take Quiz button
  await page.getByRole("button", { name: /take a 2-min quiz/i }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "qa-screenshots/quiz-02-theme-picker.png" });
});

test("quiz: middle of question flow", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /take a 2-min quiz/i }).click();
  await page.waitForTimeout(400);
  // Pick 3 themes — Climate, Politics, Cost
  await page.getByText("Climate").first().click();
  await page.getByText("Politics").first().click();
  await page.getByText("Cost of living").first().click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: "qa-screenshots/quiz-03-themes-picked.png" });
  await page.getByRole("button", { name: /continue/i }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "qa-screenshots/quiz-04-question1.png" });
  // Answer first question (Climate)
  await page.getByText("Real four seasons").click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "qa-screenshots/quiz-05-question2.png" });
});

test("quiz: summary screen with results", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /take a 2-min quiz/i }).click();
  await page.waitForTimeout(400);
  await page.getByText("Climate").first().click();
  await page.getByText("Politics").first().click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.waitForTimeout(300);
  await page.getByText("Real four seasons").click();
  await page.waitForTimeout(300);
  await page.getByText("Lean Democratic").click();
  await page.waitForTimeout(1500);  // summary needs API
  await page.screenshot({ path: "qa-screenshots/quiz-06-summary.png" });
});

test("quiz: applied then back on main app", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /take a 2-min quiz/i }).click();
  await page.waitForTimeout(400);
  await page.getByText("Climate").first().click();
  await page.getByText("Cost of living").first().click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.waitForTimeout(300);
  await page.getByText("Mild year-round").click();
  await page.waitForTimeout(300);
  await page.getByText("Under $400k").click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /show me the map/i }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "qa-screenshots/quiz-07-applied.png" });
});
