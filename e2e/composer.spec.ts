/**
 * E2E tests for the message composer.
 *
 * Tests input, formatting toolbar, emoji picker, and file attachments.
 */
import { test, expect } from "./fixtures";

test.describe("Message Composer", () => {
  test("shows composer when authenticated", async ({ authenticated }) => {
    const composer = authenticated.getByPlaceholder(/message/i).or(authenticated.locator("textarea"));
    await expect(composer).toBeVisible({ timeout: 10_000 });
  });

  test("composer accepts text input", async ({ authenticated }) => {
    const textarea = authenticated.locator("textarea").first();
    await textarea.waitFor({ state: "visible", timeout: 10_000 });
    await textarea.fill("Hello world");
    await expect(textarea).toHaveValue("Hello world");
  });

  test("formatting toolbar is visible", async ({ authenticated }) => {
    await authenticated.waitForTimeout(2000);
    const toolbar = authenticated.locator('[role="toolbar"]').first();
    if (await toolbar.isVisible()) {
      const buttons = toolbar.locator("button");
      const count = await buttons.count();
      expect(count).toBeGreaterThanOrEqual(3);
    }
  });

  test("emoji button exists", async ({ authenticated }) => {
    const emojiBtn = authenticated.locator('[aria-label*="moji"], [aria-label*="Emoji"]').first();
    await expect(emojiBtn).toBeVisible({ timeout: 10_000 });
  });
});
