/**
 * E2E: expired session (401) clears credentials and redirects to login.
 */
import { test, expect, LOGIN_BUTTON } from "./fixtures";
import { openStreamChatWithComposer } from "./helpers/navigate-messenger";

test.describe("Session expiry @mock", () => {
  test("redirects to login after protected API returns 401", async ({ authenticated, zulipApi }) => {
    await authenticated.waitForSelector("[data-focus-zone='topbar']", { timeout: 45_000 });

    zulipApi.statusMatching(/\/api\/v1\//, 401, 100);
    void openStreamChatWithComposer(authenticated).catch(() => undefined);

    await expect(authenticated.getByRole("button", { name: LOGIN_BUTTON })).toBeVisible({
      timeout: 30_000,
    });
    await expect(authenticated.locator("[data-focus-zone='topbar']")).toBeHidden({
      timeout: 10_000,
    });

    const hasApiKey = await authenticated.evaluate(() => {
      const raw = localStorage.getItem("zulip-web-instances");
      return raw?.includes("apiKey") ?? false;
    });
    expect(hasApiKey).toBe(false);
  });
});
