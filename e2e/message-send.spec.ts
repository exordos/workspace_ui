/**
 * E2E: send message flow via composer.
 */
import { test, expect } from "./fixtures";
import { openStreamChatWithComposer } from "./helpers/navigate-messenger";

test.describe("Message send @mock", () => {
  test.beforeEach(async ({ authenticated }) => {
    await openStreamChatWithComposer(authenticated);
  });

  test("clears composer and shows message bubble after send", async ({ authenticated }) => {
    const messageText = "E2E outbound bubble text";
    const textarea = authenticated.locator("textarea").first();
    await textarea.fill(messageText);
    await authenticated
      .getByRole("form", { name: /поле ввода сообщения|message composer/i })
      .getByRole("button")
      .last()
      .click();

    await expect(textarea).toHaveValue("", { timeout: 10_000 });

    const main = authenticated.locator("[data-focus-zone='main']").or(authenticated.locator("main"));
    await expect(main.getByText(messageText, { exact: true })).toBeVisible({ timeout: 10_000 });
  });
});
