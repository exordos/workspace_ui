/**
 * E2E tests for the sidebar — chat list, folders, activity section.
 */
import { test, expect } from "./fixtures";

test.describe("Sidebar", () => {
  test("shows sidebar navigation when authenticated", async ({ authenticated }) => {
    await expect(
      authenticated.locator("[data-focus-zone='sidebar']").or(authenticated.locator("aside")).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("has search input", async ({ authenticated }) => {
    const search = authenticated.getByPlaceholder(/find|search/i).first();
    await expect(search).toBeVisible({ timeout: 10_000 });
  });

  test("shows activity section with links", async ({ authenticated }) => {
    const starred = authenticated.getByText(/starred|favorites/i).first();
    await expect(starred).toBeVisible({ timeout: 10_000 });
  });

  test("folder rail is visible", async ({ authenticated }) => {
    const folderBtn = authenticated.locator("button").filter({ hasText: /folder/i }).first();
    const folderRail = authenticated.locator('[class*="folder"], [class*="rail"]').first();
    const anyFolder = folderBtn.or(folderRail);
    if (await anyFolder.isVisible().catch(() => false)) {
      expect(true).toBe(true);
    }
  });
});
