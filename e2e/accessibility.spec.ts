import { test, expect } from "./fixtures";

test.describe("Accessibility", () => {
  test("login page has proper document title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/workspace/i);
  });

  test("html lang attribute is set", async ({ page }) => {
    await page.goto("/");
    const lang = await page.getAttribute("html", "lang");
    expect(lang).toBeTruthy();
    expect(["ru", "en"]).toContain(lang);
  });

  test("login form fields have labels or placeholders", async ({ page }) => {
    await page.goto("/");
    const inputs = page.locator("input");
    const count = await inputs.count();
    expect(count).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const placeholder = await input.getAttribute("placeholder");
      const ariaLabel = await input.getAttribute("aria-label");
      const id = await input.getAttribute("id");
      expect(placeholder ?? ariaLabel ?? id).toBeTruthy();
    }
  });
});
