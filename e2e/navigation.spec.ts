import { test, expect } from "./fixtures";

test.describe("Navigation", () => {
  test("redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/stream/general");
    await expect(page.getByRole("button", { name: /login/i })).toBeVisible();
  });

  test("shows sidebar when authenticated", async ({ authenticated }) => {
    await expect(authenticated.getByText(/chats|channels/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
