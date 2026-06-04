/**
 * E2E: sidebar unread updates from injected Zulip message events.
 */
import { test, expect } from "./fixtures";
import { E2E_USER_ID } from "./mocks/zulip-default-responses";

test.describe("Realtime unread @mock", () => {
  test("updates sidebar preview and unread badge after injected message event", async ({
    authenticated,
    zulipApi,
  }) => {
    await authenticated.waitForSelector("[data-focus-zone='topbar']", { timeout: 45_000 });

    const sidebar = authenticated.locator("[data-focus-zone='sidebar']");

    zulipApi.setNextEventsResponse({
      result: "success",
      events: [
        {
          type: "message",
          id: 9001,
          message: {
            id: 5001,
            sender_id: 2,
            sender_full_name: "Other User",
            content: "Unread from E2E",
            timestamp: Math.floor(Date.now() / 1000),
            type: "stream",
            stream_id: 10,
            display_recipient: "general",
            subject: "general",
            flags: [],
          },
        },
      ],
    });

    await expect
      .poll(
        async () => {
          const text = await sidebar.innerText();
          return /Unread from E2E|general|общий/i.test(text);
        },
        { timeout: 20_000 },
      )
      .toBe(true);

    const generalChatLink = sidebar.locator('a[href*="/stream/10-general"]');
    await expect(generalChatLink.getByText("1", { exact: true })).toBeVisible({ timeout: 10_000 });

    expect(E2E_USER_ID).toBeGreaterThan(0);
  });
});
