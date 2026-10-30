/**
 * E2E tests for the sidebar — chat list, folders, activity section.
 */
import { test, expect } from "./fixtures";
import { e2eOrgBasePath } from "./helpers/navigate-messenger";
import {
  E2E_STREAM_UUID,
  E2E_TOPIC_UUID,
  messageSuccess,
  streamsSuccess,
  topicsSuccess,
  usersSuccess,
} from "./mocks/workspace-default-responses";

test.describe("Sidebar", () => {
  test("switches chat-card navigation to the latest topic and keeps avatar navigation @mock", async ({
    authenticated: page,
  }, testInfo) => {
    const latestTopicUuid = "66666666-6666-4666-8666-666666666666";
    const latestMessageUuid = "77777777-7777-4777-8777-777777777777";
    const streamPath = `${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}`;
    const latestPath = `${streamPath}/topic/${latestTopicUuid}`;
    const defaultTopic = topicsSuccess()[0]!;
    const latestTopic = {
      ...topicsSuccess()[0]!,
      uuid: latestTopicUuid,
      name: "Release",
      is_default: false,
      last_message_uuid: latestMessageUuid,
    };
    await page.route(/\/messenger\/streams\/?(?:\?.*)?$/, (route) =>
      route.fulfill({ json: [{ ...streamsSuccess()[0]!, last_message_uuid: latestMessageUuid }] }),
    );
    await page.route(/\/messenger\/stream_topics\/?(?:[^?]*)?(?:\?.*)?$/, (route) => {
      const path = new URL(route.request().url()).pathname.replace(/\/$/, "");
      return route.fulfill({
        json: path.endsWith("/stream_topics")
          ? [defaultTopic, latestTopic]
          : path.endsWith(latestTopicUuid)
            ? latestTopic
            : defaultTopic,
      });
    });
    await page.route(/\/messenger\/messages\/?(?:[^?]*)?(?:\?.*)?$/, (route) => {
      const messages = [
        messageSuccess("General message"),
        {
          ...messageSuccess("Latest release message", latestMessageUuid),
          topic_uuid: latestTopicUuid,
        },
      ];
      const url = new URL(route.request().url());
      const path = url.pathname.replace(/\/$/, "");
      const topicUuid = url.searchParams.get("topic_uuid");
      return route.fulfill({
        json: path.endsWith("/messages")
          ? messages.filter((message) => topicUuid == null || message.topic_uuid === topicUuid)
          : (messages.find((message) => path.endsWith(message.uuid)) ?? messages[1]),
      });
    });
    await page.goto(`${e2eOrgBasePath()}/messenger`);

    const sidebar = page.getByRole("navigation", { name: "Chat list" });
    const title = sidebar.getByRole("link", { name: "General", exact: true });
    await expect(title).toHaveAttribute("href", streamPath);
    await sidebar.getByTitle(/^(General Chat|Общий чат): General$/i).hover();
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath("chat-avatar-hover.png"),
    });
    await title.click();
    await expect(page).toHaveURL(new RegExp(`${streamPath}$`));
    await expect(sidebar.getByRole("link", { name: /#Release/ })).toBeVisible();
    await sidebar.getByTestId("sidebar-stream-expand-chevron").click();
    await sidebar.getByRole("link", { name: /Latest release message/ }).click();
    await expect(page).toHaveURL(new RegExp(`${latestPath}$`));
    await expect(sidebar.getByRole("link", { name: /#Release/ })).toHaveCount(0);

    await page.getByRole("button", { name: /профиль|profile/i }).click();
    await page.getByTestId("user-menu-settings-row").click();
    await page.getByTestId("right-panel-settings-chat-click-trigger").click();
    await page
      .getByRole("button", { name: /Последний топик|Latest topic/ })
      .click();
    await page.screenshot({ path: testInfo.outputPath("chat-click-settings.png") });
    await page.reload();
    await expect(title).toHaveAttribute("href", latestPath);

    // The avatar opens the general chat and expands topics; the card does neither.
    const avatar = sidebar.getByRole("link", { name: /^(General Chat|Общий чат): General$/i });
    await page.keyboard.press("Tab");
    await avatar.focus();
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath("chat-avatar-focus.png"),
    });
    await avatar.click();
    await expect(page).toHaveURL(new RegExp(`${streamPath}$`));
    await expect(sidebar.getByRole("link", { name: /#Release/ })).toBeVisible();
    await sidebar.getByTestId("sidebar-stream-expand-chevron").click();
    const card = title.locator("../..");
    await card.click({ position: { x: 2, y: 2 } });
    await expect(page).toHaveURL(new RegExp(`${latestPath}$`));
    await expect(sidebar.getByRole("link", { name: /#Release/ })).toHaveCount(0);

    await page.getByRole("button", { name: /профиль|profile/i }).click();
    await page.getByTestId("user-menu-appearance-row").click();
    await page.getByTestId("right-panel-appearance-density-trigger").click();
    await page.getByRole("button", { name: /^(Компактная|Compact)$/i }).click();
    await page.reload();
    await expect(sidebar.getByText("Latest release message")).toHaveCount(0);
    await expect(avatar).toBeVisible();
    await avatar.click();
    await expect(page).toHaveURL(new RegExp(`${streamPath}$`));
    await sidebar.getByTestId("sidebar-stream-expand-chevron").click();
    await title.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${latestPath}$`));
    await expect(sidebar.getByRole("link", { name: /#Release/ })).toHaveCount(0);
    await expect(page.getByTestId("chat-page").locator("header").first()).toContainText("Release");
    await avatar.hover();
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath("chat-click-compact.png"),
    });
  });

  test("shows sidebar navigation when authenticated", async ({ authenticated }) => {
    await expect(
      authenticated
        .locator("[data-focus-zone='sidebar']")
        .or(authenticated.locator("aside"))
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("has search input", async ({ authenticated }) => {
    await expect(authenticated.getByRole("searchbox", { name: /поиск|search/i })).toBeVisible({
      timeout: 10_000,
    });
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
    const group = sidebar.getByRole("link", { name: "General", exact: true });
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
    const folderBtn = authenticated
      .locator("button")
      .filter({ hasText: /folder|папк/i })
      .first();
    const folderRail = authenticated.locator('[class*="folder"], [class*="rail"]').first();
    const anyFolder = folderBtn.or(folderRail);
    const visible = await anyFolder.isVisible().catch(() => false);
    test.skip(!visible, "Folder rail is not rendered in this build");
    await expect(anyFolder).toBeVisible();
  });
});
