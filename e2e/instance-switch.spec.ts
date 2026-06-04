/**
 * E2E: multi-instance switcher keeps per-org chat list state.
 */
import { test, expect } from "./fixtures";
import { e2eOrgBasePath } from "./helpers/navigate-messenger";
import { seedChatListIndexedDb } from "./helpers/seed-chat-list-cache";
import { E2E_INSTANCE_2_ID, seedMultiInstanceAuth } from "./helpers/seed-multi-instance-auth";
import { E2E_INSTANCE_ID } from "./mocks/zulip-default-responses";

test.describe("Instance switch @mock", () => {
  test("preserves chat list when switching between instances", async ({ page, zulipApi: _zulipApi }) => {
    await seedMultiInstanceAuth(page);
    await page.goto(`${e2eOrgBasePath()}/inbox`);
    await page.waitForSelector("[data-focus-zone='topbar']", { timeout: 45_000 });
    await seedChatListIndexedDb(page, E2E_INSTANCE_ID);
    await page.reload();
    await page.waitForSelector("[data-focus-zone='topbar']", { timeout: 45_000 });

    await expect(page.getByText("Cached hello")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId(`instance-quick-${E2E_INSTANCE_2_ID}`).click();
    await expect(page).toHaveURL(/\/org\/zulip2\.test\.local\/inbox/, { timeout: 15_000 });

    await page.getByTestId(`instance-quick-${E2E_INSTANCE_ID}`).click();
    await expect(page).toHaveURL(/\/org\/zulip\.test\.local\/inbox/, { timeout: 15_000 });
    await expect(page.getByText("Cached hello")).toBeVisible({ timeout: 15_000 });
  });
});
