import { test, expect, LOGIN_BUTTON } from "./fixtures";

test.describe("Navigation", () => {
  test("redirects to login when not authenticated", async ({ guestPage }) => {
    await guestPage.goto("/stream/general");
    await expect(guestPage.getByRole("button", { name: LOGIN_BUTTON })).toBeVisible();
  });

  test("shows sidebar when authenticated", async ({ authenticated }) => {
    await expect(authenticated.getByRole("navigation", { name: /chat list/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});
