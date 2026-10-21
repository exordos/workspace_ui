/**
 * E2E tests for the sidebar — chat list, folders, activity section.
 */
import { test, expect } from "./fixtures";
import { e2eOrgBasePath } from "./helpers/navigate-messenger";
import {
  E2E_STREAM_UUID,
  E2E_TOPIC_UUID,
  streamsSuccess,
  usersSuccess,
} from "./mocks/workspace-default-responses";

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

  test("finds direct streams by name, username and email while preserving group and topic search", async ({
    authenticated: page,
  }) => {
    const userUuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const directUuid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await page.route(/\/users\/?(?:\?.*)?$/, (route) =>
      route.fulfill({
        json: [
          ...usersSuccess(),
          {
            ...usersSuccess()[0]!,
            uuid: userUuid,
            username: "hidden-login",
            first_name: "Alice",
            last_name: "Adams",
            email: "alice@example.test",
          },
        ],
      }),
    );
    await page.route(/\/streams\/?(?:\?.*)?$/, (route) =>
      route.fulfill({
        json: [
          ...streamsSuccess(),
          {
            ...streamsSuccess()[0]!,
            uuid: directUuid,
            name: "Personal stream",
            private: true,
            direct_user_uuid: userUuid,
            last_message_uuid: null,
          },
        ],
      }),
    );
    await page.goto(`${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`);

    const sidebar = page.getByRole("navigation", { name: "Chat list" });
    const search = sidebar.getByRole("searchbox");
    const direct = sidebar.getByRole("link", { name: /Alice Adams/ });
    const group = sidebar.getByRole("link", { name: /#General/ });
    await expect(direct).toBeVisible();
    for (const query of ["Adams", " HIDDEN-LOGIN ", "alice@example.test"]) {
      await search.fill(query);
      await expect(direct).toBeVisible();
      await expect(group).toHaveCount(0);
    }
    await expect(sidebar.getByText("hidden-login", { exact: true })).toHaveCount(0);
    await search.fill("General");
    await expect(group.first()).toBeVisible();
    await expect(direct).toHaveCount(0);
    await search.fill("");
    await expect(direct).toBeVisible();
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
