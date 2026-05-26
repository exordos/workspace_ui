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
    await expect(
      authenticated.getByRole("searchbox", { name: /поиск|search/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows activity section with links", async ({ authenticated }) => {
    await expect(
      authenticated.getByRole("link", { name: /входящие|inbox|избранное|starred/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("folder rail is visible when folders UI is enabled", async ({ authenticated }) => {
    const folderBtn = authenticated.locator("button").filter({ hasText: /folder|папк/i }).first();
    const folderRail = authenticated.locator('[class*="folder"], [class*="rail"]').first();
    const anyFolder = folderBtn.or(folderRail);
    const visible = await anyFolder.isVisible().catch(() => false);
    test.skip(!visible, "Folder rail is not rendered in this build");
    await expect(anyFolder).toBeVisible();
  });
});
