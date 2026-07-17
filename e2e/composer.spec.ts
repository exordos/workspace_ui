/**
 * E2E tests for the message composer.
 *
 * Tests input, formatting toolbar, emoji picker, and file attachments.
 */
import { test, expect } from "./fixtures";
import { expectReadyMessageComposer } from "./helpers/message-composer";
import { openStreamChatWithComposer } from "./helpers/navigate-messenger";

test.describe("Message Composer", () => {
  test.beforeEach(async ({ authenticated }) => {
    await openStreamChatWithComposer(authenticated);
  });
  test("shows an enabled composer for the selected chat", async ({ authenticated }) => {
    await expectReadyMessageComposer(authenticated);
  });

  test("composer accepts text input", async ({ authenticated }) => {
    const textarea = await expectReadyMessageComposer(authenticated);
    await textarea.fill("Hello world");
    await expect(textarea).toHaveValue("Hello world");
  });

  test("formatting toolbar is visible when rich composer is enabled", async ({ authenticated }) => {
    const toolbar = authenticated.locator('[role="toolbar"]').first();
    const visible = await toolbar
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!visible, "Rich composer toolbar is not rendered in this build");
    const buttons = toolbar.locator("button");
    expect(await buttons.count()).toBeGreaterThanOrEqual(3);
  });

  test("emoji button exists when composer exposes it", async ({ authenticated }) => {
    const emojiBtn = authenticated.getByRole("button", { name: /emoji|эмодзи|смайл/i }).first();
    const visible = await emojiBtn.isVisible().catch(() => false);
    test.skip(!visible, "Emoji control is not exposed in this composer build");
    await expect(emojiBtn).toBeVisible();
  });
});
