import { test, expect } from "./fixtures";
import { e2eOrgBasePath } from "./helpers/navigate-messenger";
import {
  E2E_STREAM_UUID,
  E2E_TOPIC_UUID,
  E2E_USER_UUID,
  streamsSuccess,
  usersSuccess,
} from "./mocks/workspace-default-responses";

const ALICE_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB_UUID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

for (const mode of ["create", "add"] as const) {
  test(`${mode} channel members preserves selections across searches and finds hidden usernames`, async ({
    authenticated: page,
  }) => {
    const submittedBodies: unknown[] = [];
    const stream = streamsSuccess()[0]!;
    const template = usersSuccess()[0]!;
    await page.route(/\/users\/?(?:\?.*)?$/, async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await route.fulfill({
        json: [
          ...usersSuccess(),
          {
            ...template,
            uuid: ALICE_UUID,
            username: "engineer-alpha",
            first_name: "Alice",
            last_name: "Adams",
            email: "alice@example.test",
          },
          {
            ...template,
            uuid: BOB_UUID,
            username: "engineer-beta",
            first_name: "Bob",
            last_name: "Baker",
            email: "bob@example.test",
          },
        ],
      });
    });
    await page.route(/\/streams\/[^/]+\/actions\/add_users\/invoke$/, async (route) => {
      submittedBodies.push(route.request().postDataJSON() as unknown);
      await route.fulfill({
        json: [ALICE_UUID, BOB_UUID].map((userUuid) => ({
          uuid: crypto.randomUUID(),
          project_id: stream.project_id,
          stream_uuid: E2E_STREAM_UUID,
          user_uuid: userUuid,
          who_uuid: E2E_USER_UUID,
          role: "member",
          notification_mode: "all_messages",
          created_at: stream.created_at,
          updated_at: stream.updated_at,
        })),
      });
    });
    await page.goto(`${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`);

    if (mode === "create") {
      await page.getByRole("button", { name: /^(new chat|новый чат)$/i }).click();
      await page.getByRole("tab", { name: /^(create channel|создать канал)$/i }).click();
      await page.getByPlaceholder(/^(channel name|название канала)$/i).fill("Picker test");
    } else {
      await page
        .getByRole("button", { name: /^(channel info|информация о канале)$/i })
        .first()
        .click();
      await page.getByRole("button", { name: /^(add members|добавить участников)$/i }).click();
    }

    const dialog = page.getByRole("dialog");
    const search = dialog.getByRole("textbox", { name: /search users|поиск пользователей/i });
    await search.fill("Adams");
    await dialog.getByRole("checkbox", { name: /Alice Adams/ }).check();
    await search.fill(" ENGINEER-BETA ");
    await expect(dialog.getByRole("checkbox", { name: /Alice Adams/ })).toHaveCount(0);
    await expect(dialog.getByText("engineer-beta", { exact: true })).toHaveCount(0);
    await dialog.getByRole("checkbox", { name: /Bob Baker/ }).check();
    await search.fill("alice@example.test");
    await expect(dialog.getByRole("checkbox", { name: /Alice Adams/ })).toBeChecked();
    await search.fill("");
    await expect(dialog.getByRole("checkbox", { name: /Bob Baker/ })).toBeChecked();
    await search.fill("no matching people");
    await expect(dialog.getByRole("checkbox", { name: /Alice Adams|Bob Baker/ })).toHaveCount(0);
    await dialog
      .getByRole("button", {
        name: mode === "create" ? /^(create|создать)$/i : /^(add|добавить)$/i,
      })
      .click();

    await expect.poll(() => submittedBodies).toEqual([{ member: [ALICE_UUID, BOB_UUID] }]);
    await expect(dialog).toBeHidden();
  });
}
