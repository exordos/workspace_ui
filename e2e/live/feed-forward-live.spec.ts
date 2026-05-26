import { test, expect } from "../fixtures";
import {
  hasLiveAuthCredentials,
  LIVE_EMAIL,
  LIVE_PASSWORD,
  LIVE_REALM,
} from "../helpers/live-auth-env";

test.describe("Feed forward live smoke @live", () => {
  test("opens forward flow from feed and pre-fills destination composer", async ({ page, loginAs }) => {
    test.skip(!hasLiveAuthCredentials(), "Requires TEST_USER_ZULIP_SERVER, TEST_USER_EMAIL, TEST_USER_PASSWORD");

    await loginAs(LIVE_EMAIL!, LIVE_PASSWORD!, LIVE_REALM!);
    await page.goto("/feed");

    const firstFeedRow = page.locator("ul > li").first();
    await expect(firstFeedRow).toBeVisible({ timeout: 20_000 });
    await firstFeedRow.hover();

    const forwardButton = page
      .locator("button[aria-label='Forward'], button[aria-label='Переслать']")
      .first();
    await expect(forwardButton).toBeVisible({ timeout: 10_000 });
    await forwardButton.click();

    await expect(page).toHaveURL(/forward=\d+/, { timeout: 20_000 });

    const streamSelect = page.locator("select").first();
    await expect(streamSelect).toBeVisible({ timeout: 10_000 });
    await streamSelect.selectOption({ index: 1 });

    const forwardToButton = page.getByRole("button", {
      name: /Forward to|Forward|Переслать в|Переслать/i,
    });
    await expect(forwardToButton).toBeEnabled({ timeout: 10_000 });
    await forwardToButton.click();

    const composer = page.locator("textarea").first();
    await expect(composer).toHaveValue(/@_\*\*/, { timeout: 20_000 });
  });
});
