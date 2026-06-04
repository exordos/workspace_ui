/**
 * E2E: folder chat assignment rolls back when Workspace API fails.
 */
import { test, expect } from "./fixtures";
import { seedChatListIndexedDb } from "./helpers/seed-chat-list-cache";

test.describe("Folder assign rollback @mock", () => {
  test("rolls back folder assignment when items API returns 500", async ({ page, authenticated }) => {
    await authenticated.waitForSelector("[data-focus-zone='topbar']", { timeout: 45_000 });
    await seedChatListIndexedDb(authenticated);
    await authenticated.reload();
    await authenticated.waitForSelector("[data-focus-zone='topbar']", { timeout: 45_000 });

    const chatPreview = authenticated.getByText("Cached hello");
    await expect(chatPreview).toBeVisible({ timeout: 15_000 });

    await page.route(/\/workspace\/v1\/folders\/.*\/items\/?$/, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "E2E simulated assignment failure" }),
        });
        return;
      }
      await route.continue();
    });

    await chatPreview.click({ button: "right" });
    const addToFolderItem = authenticated.getByRole("menuitem", {
      name: /add to folder|добавить в папку/i,
    });
    await addToFolderItem.hover();

    const personalFolderItem = authenticated.getByRole("menuitemcheckbox", { name: /personal/i });
    await expect(personalFolderItem).toBeVisible({ timeout: 10_000 });
    await personalFolderItem.click();

    await expect(personalFolderItem).not.toBeChecked({ timeout: 10_000 });
    await expect(chatPreview).toBeVisible();
  });
});
