/**
 * E2E: sidebar unread updates from injected messenger message events.
 */
import { test, expect } from "./fixtures";
import { E2E_STREAM_UUID, unreadSidebarDeltaEvents } from "./mocks/messenger-default-responses";

test.describe("Realtime unread @mock", () => {
  test("updates sidebar preview and unread badge after injected message event", async ({
    authenticated,
    messengerApi,
  }) => {
    await authenticated.waitForSelector("[data-focus-zone='topbar']", { timeout: 45_000 });

    const sidebar = authenticated.locator("[data-focus-zone='sidebar']");

    messengerApi.setNextEventsResponse(unreadSidebarDeltaEvents());

    const generalChatLink = sidebar.locator(`a[href*="/stream/${E2E_STREAM_UUID}"]`);
    await expect(generalChatLink.getByText("Unread from E2E", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(generalChatLink.getByText("1", { exact: true })).toBeVisible({ timeout: 10_000 });
  });
});
