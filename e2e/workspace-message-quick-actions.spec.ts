import type { Locator } from "@playwright/test";
import { test, expect } from "./fixtures";
import { expectReadyMessageComposer } from "./helpers/message-composer";
import { openStreamChatWithComposer } from "./helpers/navigate-messenger";
import {
  E2E_MESSAGE_UUID,
  E2E_PROJECT_ID,
  E2E_USER_UUID,
  messageSuccess,
} from "./mocks/workspace-default-responses";

const QUICK_ACTIONS = "[data-workspace-message-quick-actions]";
const REPLY_ACTION = "[data-workspace-message-quick-action='reply']";
const REACTION_ACTION = "[data-workspace-message-quick-action='reaction']";
const REACTION_UUID = "88888888-8888-4888-8888-888888888888";

async function expectActionsHidden(actions: Locator): Promise<void> {
  await expect(actions).toHaveCSS("opacity", "0");
  await expect(actions).toHaveCSS("pointer-events", "none");
}

test.describe("Workspace message quick actions @mock", () => {
  test("reveals actions on hover and keyboard focus, and sends a reply to the message", async ({
    authenticated,
  }, testInfo) => {
    await openStreamChatWithComposer(authenticated);
    const row = authenticated.locator(`[data-message-uuid='${E2E_MESSAGE_UUID}']`);
    const bubble = row.locator("[data-workspace-message-bubble='true']");
    const actions = row.locator(QUICK_ACTIONS);
    await expect(actions).toBeAttached();
    await authenticated.mouse.move(0, 0);
    await expectActionsHidden(actions);

    await bubble.hover();
    await expect(actions).toHaveCSS("opacity", "1");
    await expect(actions.locator(REPLY_ACTION)).toBeVisible();
    await expect(actions.locator(REACTION_ACTION)).toBeVisible();
    const hoverScreenshotPath = testInfo.outputPath("message-quick-actions-hover.png");
    await row.screenshot({ path: hoverScreenshotPath });
    await testInfo.attach("message-quick-actions-hover", {
      path: hoverScreenshotPath,
      contentType: "image/png",
    });

    await authenticated.mouse.move(0, 0);
    await expectActionsHidden(actions);
    await actions.locator(REPLY_ACTION).focus();
    await expect(actions.locator(REPLY_ACTION)).toBeFocused();
    await expect(actions).toHaveCSS("opacity", "1");
    await authenticated.keyboard.press("Enter");

    const quote = authenticated.locator("[data-composer-reply-quote='true']");
    await expect(quote).toContainText("E2E initial message");
    const composer = await expectReadyMessageComposer(authenticated);
    await composer.fill("Answer from the quick reply action");
    const sent = authenticated.waitForRequest(
      (request) => request.method() === "POST" && /\/messenger\/messages\/?$/.test(request.url()),
    );
    await authenticated
      .getByRole("form", { name: /поле ввода сообщения|message composer/i })
      .getByRole("button")
      .last()
      .click();
    const payload = (await sent).postDataJSON() as { payload?: { content?: string } };
    expect(payload.payload?.content).toContain(`urn:quote:${E2E_MESSAGE_UUID}`);
    expect(payload.payload?.content).toContain("Answer from the quick reply action");
    await expect(composer).toHaveValue("");
    await expect(quote).toHaveCount(0);
  });

  test("adds and removes a heart reaction through the existing Workspace API", async ({
    authenticated,
  }) => {
    await authenticated.route(/\/messenger\/message_reactions\/?(?:\?.*)?$/, async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          uuid: REACTION_UUID,
          project_id: E2E_PROJECT_ID,
          message_uuid: E2E_MESSAGE_UUID,
          user_uuid: E2E_USER_UUID,
          emoji_name: "❤️",
          created_at: "2026-10-15T10:00:00.000Z",
          updated_at: "2026-10-15T10:00:00.000Z",
        }),
      });
    });
    await openStreamChatWithComposer(authenticated);
    const row = authenticated.locator(`[data-message-uuid='${E2E_MESSAGE_UUID}']`);
    const heart = row.locator(REACTION_ACTION);
    await row.locator("[data-workspace-message-bubble='true']").hover();
    const added = authenticated.waitForRequest(
      (request) => request.method() === "POST" && /\/message_reactions\/?$/.test(request.url()),
    );
    await heart.click();
    expect((await added).postDataJSON()).toEqual({
      message_uuid: E2E_MESSAGE_UUID,
      emoji_name: "❤️",
    });
    const chip = row.locator("[data-workspace-message-reaction-chip='true']");
    await expect(chip).toHaveCount(1);
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(chip).toHaveAttribute("data-workspace-message-reaction-pending", "false");
    await expect(chip).toContainText("❤️");

    const removed = authenticated.waitForRequest(
      (request) =>
        request.method() === "DELETE" &&
        new URL(request.url()).pathname.endsWith(`/message_reactions/${REACTION_UUID}`),
    );
    await heart.click();
    await removed;
    await expect(chip).toHaveCount(0);
  });

  for (const owner of ["own", "peer"] as const) {
    test(`keeps ${owner} quick actions inside a narrow chat without covering the preceding message`, async ({
      authenticated,
    }, testInfo) => {
      const nextMessageUuid = "66666666-6666-4666-8666-666666666666";
      await authenticated.setViewportSize({ width: 900, height: 844 });
      await authenticated.route(/\/messenger\/messages\/?(?:\?.*)?$/, async (route) => {
        if (route.request().method() !== "GET") {
          await route.fallback();
          return;
        }
        const query = new URL(route.request().url()).searchParams;
        const messages = [
          messageSuccess("First short message", nextMessageUuid),
          {
            ...messageSuccess(
              "Second message with enough text to wrap onto multiple lines in a narrow chat.",
            ),
            created_at: "2026-07-16T10:01:00.000Z",
            updated_at: "2026-07-16T10:01:00.000Z",
          },
        ].map((message) =>
          owner === "own"
            ? message
            : {
                ...message,
                author_uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                is_own: false,
              },
        );
        const items = query.get("read") === "false" ? [] : messages;
        if (query.get("sort_dir") === "desc") items.reverse();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(items),
        });
      });
      await openStreamChatWithComposer(authenticated);
      const previousBubble = authenticated.locator(
        `[data-message-uuid='${nextMessageUuid}'] [data-workspace-message-bubble='true']`,
      );
      const row = authenticated.locator(`[data-message-uuid='${E2E_MESSAGE_UUID}']`);
      await row.locator("[data-workspace-message-bubble='true']").hover();
      const actions = row.locator(QUICK_ACTIONS);
      await expect(actions).toHaveCSS("opacity", "1");
      const narrowScreenshotPath = testInfo.outputPath("message-quick-actions-narrow.png");
      await authenticated.screenshot({ path: narrowScreenshotPath });
      await testInfo.attach("message-quick-actions-narrow", {
        path: narrowScreenshotPath,
        contentType: "image/png",
      });
      const bounds = await actions.boundingBox();
      const previousBounds = await previousBubble.boundingBox();
      const mainBounds = await authenticated.locator("main").boundingBox();
      if (bounds == null || previousBounds == null || mainBounds == null)
        throw new Error("Message bounds are unavailable");
      expect(bounds.x).toBeGreaterThanOrEqual(mainBounds.x);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(mainBounds.x + mainBounds.width);
      expect(bounds.y).toBeGreaterThanOrEqual(previousBounds.y + previousBounds.height);
    });
  }
});
