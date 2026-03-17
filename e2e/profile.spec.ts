/**
 * E2E tests for the profile drawer and settings.
 */
import { test, expect } from "./fixtures";

test.describe("Profile & Settings", () => {
  test("profile button exists in top bar", async ({ authenticated }) => {
    const profileBtn = authenticated.locator('[aria-label*="profile" i], [aria-label*="Profile" i]').first();
    await expect(profileBtn).toBeVisible({ timeout: 10_000 });
  });

  test("dark theme is default", async ({ authenticated }) => {
    const theme = await authenticated.getAttribute("html", "data-theme");
    expect(theme).toBe("dark");
  });

  test("app has correct lang attribute", async ({ page }) => {
    await page.goto("/");
    const lang = await page.getAttribute("html", "lang");
    expect(["en", "ru"]).toContain(lang);
  });
});
