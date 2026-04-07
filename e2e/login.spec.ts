import { test, expect } from "./fixtures";

test.describe("Login page", () => {
  test("shows login form when no instances", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /login/i })).toBeVisible();
  });

  test("has realm, email, and password fields", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByPlaceholder(/example\.com|server/i)).toBeVisible();
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    await expect(page.getByPlaceholder(/password/i)).toBeVisible();
  });

  test("login button is present", async ({ page }) => {
    await page.goto("/");
    const button = page.getByRole("button", { name: /login/i });
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
  });
});
