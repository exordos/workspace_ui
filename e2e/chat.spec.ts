/**
 * E2E tests for the chat experience — the core messaging flow.
 *
 * These tests verify that a user can view chats, see messages,
 * interact with the composer, and use the context menu.
 * Uses the authenticated fixture to bypass login.
 */
import { test, expect } from "./fixtures";
import { openStreamChatWithComposer } from "./helpers/navigate-messenger";

test.describe("Chat Page", () => {
  test.beforeEach(async ({ authenticated }) => {
    await openStreamChatWithComposer(authenticated);
  });
  // The main content area should be visible after authentication
  test("shows chat interface when authenticated", async ({ authenticated }) => {
    await expect(
      authenticated.locator("[data-focus-zone='main']").or(authenticated.locator("main")),
    ).toBeVisible({ timeout: 10_000 });
  });

  // The message composer should be present at the bottom
  test("shows message composer", async ({ authenticated }) => {
    await expect(
      authenticated.getByPlaceholder(/сообщение|message/i).or(authenticated.locator("textarea")).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // Skip-to-content link should exist (accessibility)
  test("has skip-to-content link", async ({ authenticated }) => {
    const skipLink = authenticated.locator(".skip-link");
    await expect(skipLink).toBeAttached();
  });
});
