/**
 * E2E: expired session (401) clears credentials and redirects to login.
 */
import { test, expect, expectLoginOrganizationStep } from "./fixtures";
import { failWorkspaceApi } from "./helpers/fail-workspace-api";
import { openStreamChatWithComposer } from "./helpers/navigate-messenger";

test.describe("Session expiry @mock", () => {
  test("redirects to login after protected API returns 401", async ({
    authenticated,
    messengerApi: _messengerApi,
  }) => {
    await authenticated.waitForSelector("[data-focus-zone='topbar']", { timeout: 45_000 });

    await failWorkspaceApi(authenticated, 401);
    void openStreamChatWithComposer(authenticated).catch(() => undefined);

    await expectLoginOrganizationStep(authenticated, { timeout: 30_000 });
    await expect(authenticated.locator("[data-focus-zone='topbar']")).toBeHidden({
      timeout: 10_000,
    });

    const hasApiKey = await authenticated.evaluate(() => {
      const raw = localStorage.getItem("messenger-web-instances");
      return raw?.includes("apiKey") ?? false;
    });
    expect(hasApiKey).toBe(false);
  });
});
