import { test, expect } from "./fixtures";

test.describe("Theme", () => {
  test("defaults to dark theme", async ({ page }) => {
    await page.goto("/");
    const theme = await page.getAttribute("html", "data-theme");
    expect(theme).toBe("dark");
  });

  test("can switch to light theme via devtools", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      (window as unknown as { __dev__: { theme: { toggle: () => void } } }).__dev__?.theme.toggle();
    });
    const theme = await page.getAttribute("html", "data-theme");
    expect(theme).toBe("light");
  });
});
