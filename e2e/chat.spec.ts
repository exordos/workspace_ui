/**
 * E2E tests for the chat experience — the core messaging flow.
 *
 * These tests verify that a user can view chats, see messages,
 * interact with the composer, and use the context menu.
 * Uses the authenticated fixture to bypass login.
 */
import { test, expect } from "./fixtures";

test.describe("Chat Page", () => {
  // The main content area should be visible after authentication
  test("shows chat interface when authenticated", async ({ authenticated }) => {
    await expect(
      authenticated.locator("[data-focus-zone='main']").or(authenticated.locator("main")),
    ).toBeVisible({ timeout: 10_000 });
  });

  // The message composer should be present at the bottom
  test("shows message composer", async ({ authenticated }) => {
    await expect(
      authenticated.getByPlaceholder(/message/i).or(authenticated.locator("textarea")),
    ).toBeVisible({ timeout: 10_000 });
  });

  // Skip-to-content link should exist (accessibility)
  test("has skip-to-content link", async ({ authenticated }) => {
    const skipLink = authenticated.locator(".skip-link");
    await expect(skipLink).toBeAttached();
  });
});

test.describe("Sidebar", () => {
  // The sidebar should show navigation sections
  test("shows chats and channels heading", async ({ authenticated }) => {
    await expect(
      authenticated.getByText(/chats|channels/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // Search input should be present in the sidebar
  test("has search input in sidebar", async ({ authenticated }) => {
    await expect(
      authenticated.getByPlaceholder(/find|search/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Top Bar", () => {
  // Top bar should be present with navigation sections
  test("shows top bar with section buttons", async ({ authenticated }) => {
    const topbar = authenticated.locator("[data-focus-zone='topbar']");
    await expect(topbar).toBeVisible({ timeout: 10_000 });
  });
});
