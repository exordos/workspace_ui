import { test, expect } from "../live-fixtures";
import {
  hasLiveAuthCredentials,
  LIVE_EMAIL,
  LIVE_PASSWORD,
  LIVE_ORGANIZATION_URL,
} from "../helpers/live-auth-env";

test.describe("Live auth smoke @live", () => {
  test("logs in with real credentials and opens messenger shell", async ({ page, loginAs }) => {
    test.skip(
      !hasLiveAuthCredentials(),
      "Requires TEST_USER_WORKSPACE_SERVER, TEST_USER_EMAIL, TEST_USER_PASSWORD",
    );

    await loginAs(LIVE_EMAIL!, LIVE_PASSWORD!, LIVE_ORGANIZATION_URL!);

    await expect(page.locator("[data-focus-zone='topbar']")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("navigation", { name: /chat list/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("main[role='main']")).toBeVisible({ timeout: 20_000 });
  });
});
