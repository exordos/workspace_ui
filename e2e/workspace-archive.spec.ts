import { test, expect } from "./fixtures";
import { e2eOrgBasePath } from "./helpers/navigate-messenger";
import { seedAuthStorage } from "./helpers/seed-auth";
import {
  E2E_STREAM_UUID,
  E2E_TOPIC_UUID,
  foldersSuccess,
  messageSuccess,
  streamsSuccess,
  topicsSuccess,
  usersSuccess,
} from "./mocks/workspace-default-responses";

const DIRECT_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHANNEL_UUID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ALICE_UUID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DIRECT_TOPIC_UUID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CHANNEL_TOPIC_UUID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const DIRECT_MESSAGE_UUID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const CHANNEL_MESSAGE_UUID = "99999999-9999-4999-8999-999999999999";

test("archive opens direct and channel history without restoring, then restores through Workspace", async ({
  page,
}) => {
  const template = streamsSuccess()[0]!;
  const archivedStreams = [
    {
      ...template,
      uuid: DIRECT_UUID,
      name: "Imported direct stream",
      private: true,
      direct_user_uuid: ALICE_UUID,
      is_archived: true,
      last_message_uuid: null,
    },
    {
      ...template,
      uuid: CHANNEL_UUID,
      name: "Archived planning",
      is_archived: true,
      last_message_uuid: null,
    },
  ];
  const restored: string[] = [];
  await page.route(/\/streams\/?(?:\?.*)?$/, (route) =>
    route.fulfill({ json: [...streamsSuccess(), ...archivedStreams] }),
  );
  await page.route(/\/users\/?(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: [
        ...usersSuccess(),
        {
          ...usersSuccess()[0]!,
          uuid: ALICE_UUID,
          username: "alice-archive",
          first_name: "Alice",
          last_name: "Adams",
          email: "alice@example.test",
        },
      ],
    }),
  );
  await page.route(/\/folders\/?(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: [{ ...foldersSuccess()[0]!, uuid: "00000000-0000-0000-0000-000000000000" }],
    }),
  );
  await page.route(/\/stream_topics\/?(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: [
        ...topicsSuccess(),
        ...[DIRECT_UUID, CHANNEL_UUID].map((streamUuid, index) => ({
          ...topicsSuccess()[0]!,
          uuid: index === 0 ? DIRECT_TOPIC_UUID : CHANNEL_TOPIC_UUID,
          stream_uuid: streamUuid,
          last_message_uuid: null,
        })),
      ],
    }),
  );
  await page.route(/\/messages\/?(?:\?.*)?$/, (route) => {
    const url = new URL(route.request().url());
    const streamUuid = url.searchParams.get("stream_uuid");
    const archived = archivedStreams.find((stream) => stream.uuid === streamUuid);
    if (url.searchParams.get("read") === "false") return route.fulfill({ json: [] });
    return route.fulfill({
      json: archived
        ? [
            {
              ...messageSuccess(
                `Archived history for ${archived.name}`,
                archived.uuid === DIRECT_UUID ? DIRECT_MESSAGE_UUID : CHANNEL_MESSAGE_UUID,
              ),
              stream_uuid: archived.uuid,
              topic_uuid: archived.uuid === DIRECT_UUID ? DIRECT_TOPIC_UUID : CHANNEL_TOPIC_UUID,
            },
          ]
        : [messageSuccess("E2E initial message")],
    });
  });
  await page.route(/\/streams\/[^/]+\/actions\/unarchive\/invoke$/, (route) => {
    const uuid = new URL(route.request().url()).pathname.split("/").at(-4)!;
    const stream = archivedStreams.find((candidate) => candidate.uuid === uuid);
    expect(route.request().method()).toBe("POST");
    expect(stream).toBeDefined();
    restored.push(uuid);
    return route.fulfill({ json: { ...stream!, is_archived: false } });
  });

  await seedAuthStorage(page);
  await page.goto(`${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`);
  const sidebar = page.getByRole("navigation", { name: "Chat list" });
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole("link", { name: /Alice Adams|Archived planning/ })).toHaveCount(0);

  const dialog = page.getByRole("dialog");
  const historyButton = (name: string) =>
    dialog.getByRole("button", {
      name: new RegExp(`^(?:Open history|Открыть историю): ${name}$`, "i"),
    });
  const archiveSearch = dialog.getByRole("textbox", {
    name: /search archived chats|поиск архивированных чатов/i,
  });
  const openArchive = async () => {
    await page.getByRole("button", { name: /^(new chat|новый чат)$/i }).click();
    await dialog.getByRole("tab", { name: /^(archive|архив)$/i }).click();
  };
  await openArchive();
  await expect(historyButton("Alice Adams")).toBeVisible();
  await expect(historyButton("Archived planning")).toBeVisible();
  await expect(dialog.getByRole("tab", { name: /^(archive|архив)$/i })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByRole("tab", { name: /^(archive|архив)$/i })).toBeInViewport({
    ratio: 1,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await archiveSearch.fill("Alice");
  await expect(historyButton("Archived planning")).toHaveCount(0);
  await archiveSearch.fill("");

  for (const [name, uuid, history] of [
    ["Alice Adams", DIRECT_UUID, "Archived history for Imported direct stream"],
    ["Archived planning", CHANNEL_UUID, "Archived history for Archived planning"],
  ] as const) {
    await historyButton(name).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/stream/${uuid}(?:/|$)`));
    await expect(page.getByText(history, { exact: true })).toBeVisible();
    expect(restored).toEqual([]);
    await openArchive();
  }

  for (const [name, uuid] of [
    ["Alice Adams", DIRECT_UUID],
    ["Archived planning", CHANNEL_UUID],
  ] as const) {
    await dialog
      .getByRole("button", {
        name: new RegExp(`^(?:Unarchive|Разархивировать): ${name}$`, "i"),
      })
      .click();
    await expect(historyButton(name)).toHaveCount(0);
    expect(restored).toContain(uuid);
  }
  expect(restored).toEqual([DIRECT_UUID, CHANNEL_UUID]);
  await dialog.getByRole("button", { name: /^(cancel|отмена)$/i }).click();
  await expect(sidebar.getByRole("link", { name: "Alice Adams", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Archived planning", exact: true })).toBeVisible();
});
