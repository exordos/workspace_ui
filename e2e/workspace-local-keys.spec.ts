import { test, expect } from "./fixtures";
import { e2eOrgBasePath } from "./helpers/navigate-messenger";
import {
  E2E_STREAM_UUID,
  E2E_TOPIC_UUID,
  E2E_USER_UUID,
  messageSuccess,
  streamsSuccess,
  usersSuccess,
} from "./mocks/workspace-default-responses";

test("encrypted channel owner adds a participant through the shared picker", async ({
  authenticated,
}) => {
  const page = authenticated;
  const newUserUuid = crypto.randomUUID();
  const stream = {
    ...streamsSuccess()[0],
    encryption: true,
    current_encryption_key_uuid: crypto.randomUUID(),
  };
  const users = [
    ...usersSuccess(),
    {
      ...usersSuccess()[0],
      uuid: newUserUuid,
      username: "new-participant",
      first_name: "New",
      last_name: "Participant",
      email: "new-participant@example.test",
    },
  ];
  const submittedBodies: unknown[] = [];
  await page.route(/\/messenger\/streams\/?(?:[^?]*)?(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const path = new URL(route.request().url()).pathname.replace(/\/$/, "");
    await route.fulfill({ json: path.endsWith("/streams") ? [stream] : stream });
  });
  await page.route(/\/users\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ json: users });
  });
  await page.route(/\/streams\/[^/]+\/actions\/add_users\/invoke$/, async (route) => {
    submittedBodies.push(route.request().postDataJSON() as unknown);
    await route.fulfill({
      json: [
        {
          uuid: crypto.randomUUID(),
          project_id: stream.project_id,
          stream_uuid: E2E_STREAM_UUID,
          user_uuid: newUserUuid,
          who_uuid: E2E_USER_UUID,
          role: "member",
          notification_mode: "all_messages",
          created_at: stream.created_at,
          updated_at: stream.updated_at,
        },
      ],
    });
  });
  await page.goto(`${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`);
  await page
    .getByRole("button", { name: /^(channel info|информация о канале)$/i })
    .first()
    .click();
  const addMembers = page.getByRole("button", { name: /^(add members|добавить участников)$/i });
  await expect(addMembers).toBeEnabled();
  await addMembers.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("checkbox", { name: /E2E User/ })).toHaveCount(0);
  await dialog.getByRole("checkbox", { name: /New Participant/ }).check();
  await dialog.getByRole("button", { name: /^(add|добавить)$/i }).click();
  await expect.poll(() => submittedBodies).toEqual([{ member: [newUserUuid] }]);
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("complementary").getByText(/^New Participant/)).toBeVisible();
});

test("local key manager separates current metadata from saved keys and deletes only the selected key", async ({
  authenticated,
}, testInfo) => {
  const page = authenticated;
  const currentKeyUuid = crypto.randomUUID();
  const historicalKeyUuid = crypto.randomUUID();
  const stream = {
    ...streamsSuccess()[0],
    encryption: true,
    current_encryption_key_uuid: currentKeyUuid,
  };
  const encryptedContent = await page.evaluate(
    async ({ streamUuid, keyUuid }) => {
      const { useWorkspaceAuthStore } =
        await import("/src/entities/workspace-auth/workspace-auth.model.ts");
      const { realChatKeyStorage, realChatCryptoProvider, ensureChatDeviceIdentity } =
        await import("/src/entities/messenger/chat-crypto-resources.lib.ts");
      const runtime = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
      if (!runtime) throw new Error("Missing test runtime");
      const device = await ensureChatDeviceIdentity(runtime, () => true);
      const key = await realChatCryptoProvider.createGroupKey();
      if (!key.ok) throw new Error("Key creation failed");
      await realChatKeyStorage.writeChatKey(
        { owner: runtime, deviceId: device.deviceId, streamUuid, keyUuid },
        { groupKey: key.value },
      );
      const encrypted = await realChatCryptoProvider.encryptMessage({
        groupKey: key.value,
        plaintext: new TextEncoder().encode("Saved-key history"),
        context: { streamUuid, keyUuid },
      });
      if (!encrypted.ok) throw new Error("Encryption failed");
      return btoa(String.fromCharCode(...encrypted.value.bytes));
    },
    { streamUuid: E2E_STREAM_UUID, keyUuid: historicalKeyUuid },
  );
  type TestMessage = Omit<ReturnType<typeof messageSuccess>, "payload"> & {
    payload: Record<string, string>;
  };
  const history: TestMessage[] = [
    {
      ...messageSuccess("", crypto.randomUUID()),
      payload: { kind: "key_announced", key_uuid: currentKeyUuid },
    },
    {
      ...messageSuccess("", crypto.randomUUID()),
      payload: { kind: "key_announced", key_uuid: historicalKeyUuid },
    },
    {
      ...messageSuccess(""),
      payload: { kind: "e2ee", key_uuid: historicalKeyUuid, content: encryptedContent },
    },
  ];
  const requestedKeyUuids: string[] = [];
  await page.route(/\/messenger\/streams\/?(?:[^?]*)?(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const path = new URL(route.request().url()).pathname.replace(/\/$/, "");
    await route.fulfill({ json: path.endsWith("/streams") ? [stream] : stream });
  });
  await page.route(/\/messenger\/messages\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "GET") {
      const unreadOnly = new URL(route.request().url()).searchParams.get("read") === "false";
      return route.fulfill({ json: unreadOnly ? [] : history });
    }
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON() as {
      uuid: string;
      payload: Record<string, string>;
    };
    if (body.payload.kind === "key_request") {
      if (!body.payload.key_uuid) throw new Error("Missing requested generation");
      requestedKeyUuids.push(body.payload.key_uuid);
    }
    const created = { ...messageSuccess("", body.uuid), payload: body.payload };
    history.push(created);
    await route.fulfill({ status: 201, json: created });
  });
  await page.goto(`${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`);
  await expect(page.getByText("Saved-key history", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: /^(channel info|информация о канале)$/i })
    .first()
    .click();
  await page.getByRole("button", { name: /^(settings|настройки)$/i }).click();
  await page.getByRole("button", { name: /^(encryption keys|ключи шифрования)$/i }).click();
  const drawer = page.locator("[data-encrypted-chat-screen='key']");
  await expect(drawer.getByText(currentKeyUuid, { exact: true })).toBeVisible();
  const inventory = drawer.getByRole("button", {
    name: /Keys on this device \(1\)|Ключи на этом устройстве \(1\)/i,
  });
  await expect(inventory).toBeVisible();
  const requestCurrent = drawer.getByRole("button", {
    name: /^(request current key|запросить актуальный ключ)$/i,
  });
  await expect(requestCurrent).toBeVisible();
  await requestCurrent.click();
  await expect.poll(() => requestedKeyUuids).toContain(currentKeyUuid);
  await inventory.click();
  const row = drawer.getByRole("button", { name: new RegExp(historicalKeyUuid) });
  await expect(row).toBeVisible();
  const rowBounds = await row.boundingBox();
  expect(rowBounds).not.toBeNull();
  expect(rowBounds?.height).toBeLessThanOrEqual(64);
  await page.locator("[data-focus-zone='panel']").screenshot({
    path: testInfo.outputPath("local-key-manager.png"),
  });
  await row.click();
  const detail = page.locator("[data-encrypted-chat-screen='local-key']");
  await expect(detail.getByText(historicalKeyUuid, { exact: true })).toBeVisible();
  await expect(detail.getByText(/^(announced in chat|объявлен в чате)$/i)).toBeVisible();
  await expect(
    detail.getByText(/^(added to this device|добавлен на это устройство)$/i),
  ).toBeVisible();
  await expect(
    detail.getByRole("button", { name: /^(перевыпустить ключ|rotate key)$/i }),
  ).toHaveCount(0);
  await page.locator("[data-focus-zone='panel']").screenshot({
    path: testInfo.outputPath("local-key-details.png"),
  });
  await detail
    .getByRole("button", { name: /^(request this key again|повторно запросить этот ключ)$/i })
    .click();
  await expect.poll(() => requestedKeyUuids).toContain(historicalKeyUuid);
  await detail
    .getByRole("button", { name: /^(delete from this device|удалить с этого устройства)$/i })
    .click();
  const confirmation = page.getByRole("dialog");
  await confirmation.getByRole("button", { name: /^(cancel|отмена)$/i }).click();
  await expect(detail).toBeVisible();
  await detail
    .getByRole("button", { name: /^(delete from this device|удалить с этого устройства)$/i })
    .click();
  await confirmation
    .getByRole("button", { name: /^(delete from this device|удалить с этого устройства)$/i })
    .click();
  await expect(
    drawer.getByRole("button", {
      name: /Keys on this device \(0\)|Ключи на этом устройстве \(0\)/i,
    }),
  ).toBeVisible();
  await expect(drawer.getByText(currentKeyUuid, { exact: true })).toBeVisible();
  await expect(page.getByText("Saved-key history", { exact: true })).toHaveCount(0);
});
