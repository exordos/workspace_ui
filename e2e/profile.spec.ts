/**
 * E2E tests for the profile drawer and settings.
 */
import { test, expect } from "./fixtures";

test.describe("Profile & Settings", () => {
  test("profile button exists in top bar", async ({ authenticated }) => {
    const profileBtn = authenticated.getByRole("button", { name: /профиль|profile/i });
    await expect(profileBtn).toBeVisible({ timeout: 10_000 });
  });

  test("dark theme is default", async ({ authenticated }) => {
    await expect(authenticated.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("app has correct lang attribute", async ({ page }) => {
    await page.goto("/");
    const lang = await page.getAttribute("html", "lang");
    expect(["en", "ru"]).toContain(lang);
  });
});
