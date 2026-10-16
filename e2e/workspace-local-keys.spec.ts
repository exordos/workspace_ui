import { createMessengerPlacementUuid } from "../packages/web/src/entities/messenger/messenger-message-identity.lib";
import { test, expect } from "./fixtures";
import { e2eOrgBasePath } from "./helpers/navigate-messenger";
import { seedAuthStorage } from "./helpers/seed-auth";
import { WorkspaceApiMock } from "./helpers/workspace-api-mock";
import {
  E2E_STREAM_UUID,
  E2E_TOPIC_UUID,
  E2E_USER_UUID,
  messageSuccess,
  streamsSuccess,
  usersSuccess,
} from "./mocks/workspace-default-responses";

for (const role of ["owner", "member"] as const) {
  test(`one ${role} account on two devices keeps device-specific key rendering and existing grant rights`, async ({
    authenticated: source,
    browser,
  }, testInfo) => {
    const context = await browser.newContext({ baseURL: "http://localhost:5173" });
    try {
      const target = await context.newPage();
      const api = new WorkspaceApiMock(target);
      await api.install();
      await seedAuthStorage(target);
      await target.goto(`${e2eOrgBasePath()}/messenger`);
      await target.waitForSelector("[data-focus-zone='topbar']");
      const keyUuid = crypto.randomUUID();
      const stream = {
        ...streamsSuccess()[0],
        owner: role === "owner" ? E2E_USER_UUID : crypto.randomUUID(),
        role,
        encryption: true,
        current_encryption_key_uuid: keyUuid,
      };
      let encryptedContent = "";
      const deviceIds: string[] = [];
      for (const [page, deviceName, hasKey] of [
        [source, "MacBook", true],
        [target, "iPhone", false],
      ] as const) {
        const seeded = await page.evaluate(
          async ({ deviceName, hasKey, keyUuid, streamUuid }) => {
            const { useWorkspaceAuthStore } =
              await import("/src/entities/workspace-auth/workspace-auth.model.ts");
            const { realChatKeyStorage, realChatCryptoProvider } =
              await import("/src/entities/messenger/chat-crypto-resources.lib.ts");
            const runtime = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
            if (!runtime) throw new Error("Missing test runtime");
            const previous = await realChatKeyStorage.readDeviceIdentity(runtime);
            const deviceId = previous?.deviceId ?? crypto.randomUUID();
            await realChatKeyStorage.writeDeviceIdentity(runtime, { deviceId, deviceName });
            if (!hasKey) return { deviceId, content: "", userUuid: runtime.userUuid };
            const key = await realChatCryptoProvider.createGroupKey();
            if (!key.ok) throw new Error("Key creation failed");
            await realChatKeyStorage.writeChatKey(
              { owner: runtime, deviceId, streamUuid, keyUuid },
              { groupKey: key.value },
            );
            const encrypted = await realChatCryptoProvider.encryptMessage({
              groupKey: key.value,
              plaintext: new TextEncoder().encode("Two-device encrypted history"),
              context: { streamUuid, keyUuid },
            });
            if (!encrypted.ok) throw new Error("Encryption failed");
            return {
              deviceId,
              content: btoa(String.fromCharCode(...encrypted.value.bytes)),
              userUuid: runtime.userUuid,
            };
          },
          { deviceName, hasKey, keyUuid, streamUuid: E2E_STREAM_UUID },
        );
        expect(seeded.userUuid).toBe(E2E_USER_UUID);
        deviceIds.push(seeded.deviceId);
        if (hasKey) encryptedContent = seeded.content;
      }
      expect(deviceIds[0]).not.toBe(deviceIds[1]);
      type TestMessage = Omit<ReturnType<typeof messageSuccess>, "payload"> & {
        payload: Record<string, string>;
      };
      const history: TestMessage[] = [
        {
          ...messageSuccess(""),
          payload: { kind: "e2ee", key_uuid: keyUuid, content: encryptedContent },
        },
      ];
      for (const page of [source, target]) {
        await page.route(/\/messenger\/streams\/?(?:[^?]*)?(?:\?.*)?$/, async (route) => {
          if (route.request().method() !== "GET") return route.fallback();
          const path = new URL(route.request().url()).pathname.replace(/\/$/, "");
          await route.fulfill({ json: path.endsWith("/streams") ? [stream] : stream });
        });
        await page.route(/\/messenger\/stream_bindings\/?(?:\?.*)?$/, async (route) => {
          await route.fulfill({
            json: [
              {
                uuid: "66666666-6666-4666-8666-666666666666",
                project_id: stream.project_id,
                stream_uuid: E2E_STREAM_UUID,
                user_uuid: E2E_USER_UUID,
                who_uuid: stream.owner,
                role,
                notification_mode: "all_messages",
                created_at: stream.created_at,
                updated_at: stream.updated_at,
              },
            ],
          });
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
          const created = {
            ...messageSuccess("", createMessengerPlacementUuid(E2E_TOPIC_UUID, body.uuid)),
            payload: body.payload,
          };
          history.push(created);
          await route.fulfill({ status: 201, json: created });
        });
      }
      const path = `${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`;
      await source.goto(path);
      await expect(
        source
          .locator("[data-workspace-message-bubble]")
          .getByText("Two-device encrypted history", { exact: true }),
      ).toBeVisible();
      await expect(source.locator("[data-focus-zone='sidebar']")).toContainText(
        "Two-device encrypted history",
      );
      await target.goto(path);
      await expect(target.getByText("Two-device encrypted history", { exact: true })).toHaveCount(
        0,
      );
      await expect(target.locator("[data-focus-zone='sidebar']")).toContainText(
        /Нужен ключ|Key required/,
      );
      await target.getByRole("button", { name: /^(request key|запросить ключ)$/i }).click();
      const targetRequest = target.locator('[data-encrypted-service-message="key_request"]');
      await expect(targetRequest).toContainText(/You requested.*iPhone|Вы запросили.*iPhone/);
      await expect(targetRequest.getByRole("button")).toHaveCount(0);
      if (role === "owner")
        await expect(targetRequest).toContainText(
          /Approve the request on another device|Подтвердите запрос на другом устройстве/,
        );
      else {
        await expect(targetRequest).toContainText(
          /Wait for access|Дождитесь предоставления доступа/,
        );
        await expect(targetRequest).not.toContainText(/Approve the request|Подтвердите запрос/);
      }
      await source.reload();
      const sourceRequest = source.locator('[data-encrypted-service-message="key_request"]');
      await expect(sourceRequest).toContainText(/You requested.*iPhone|Вы запросили.*iPhone/);
      const transfer = sourceRequest.getByRole("button", { name: /^(send key|передать ключ)$/i });
      if (role === "member") {
        await expect(transfer).toHaveCount(0);
        await expect(sourceRequest.getByRole("button")).toHaveCount(0);
        await expect(sourceRequest).toContainText(
          /Wait for access|Дождитесь предоставления доступа/,
        );
        expect(history.some((item) => item.payload.kind === "key_grant")).toBe(false);
        return;
      }
      await expect(transfer).toBeEnabled();
      await sourceRequest.screenshot({
        path: testInfo.outputPath("same-account-other-device-request.png"),
      });
      await transfer.click();
      await expect.poll(() => history.some((item) => item.payload.kind === "key_grant")).toBe(true);
      expect(history.at(-1)?.payload).toMatchObject({
        kind: "key_grant",
        sender_device_id: deviceIds[0],
        recipient_device_id: deviceIds[1],
      });
      const sourceGrant = source.locator('[data-encrypted-service-message="key_grant"]');
      await expect(sourceGrant).toContainText(/You sent.*iPhone|Вы передали.*iPhone/);
      await expect(sourceGrant.getByRole("status")).toHaveCount(0);
      await target.reload();
      await expect(
        target
          .locator("[data-workspace-message-bubble]")
          .getByText("Two-device encrypted history", { exact: true }),
      ).toBeVisible();
      const targetGrant = target.locator('[data-encrypted-service-message="key_grant"]');
      await expect(targetGrant.getByRole("status")).toContainText(
        /available on this device|доступен на этом устройстве/,
      );
      await expect(
        target.locator('[data-encrypted-service-message="key_request"]'),
      ).not.toContainText(
        /Wait for access|Дождитесь предоставления доступа|Approve the request|Подтвердите запрос/,
      );
      await targetGrant.screenshot({
        path: testInfo.outputPath("same-account-key-available-on-recipient.png"),
      });
    } finally {
      await context.close();
    }
  });
}

test("encrypted chat header explains message and media protection on hover and keyboard focus", async ({
  authenticated,
}, testInfo) => {
  const page = authenticated;
  const stream = {
    ...streamsSuccess()[0],
    encryption: true,
    current_encryption_key_uuid: crypto.randomUUID(),
  };
  await page.route(/\/messenger\/streams\/?(?:[^?]*)?(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const path = new URL(route.request().url()).pathname.replace(/\/$/, "");
    await route.fulfill({ json: path.endsWith("/streams") ? [stream] : stream });
  });
  await page.goto(`${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`);
  const information = page.getByRole("button", {
    name: /protected chat information|особенности защищ[её]нного чата/i,
  });
  await expect(information).toBeVisible();
  await information.locator("span").hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText(
    /stored without end-to-end encryption|хранятся без сквозного шифрования/i,
  );
  await expect(tooltip.getByRole("listitem")).toHaveCount(5);
  await page.screenshot({ path: testInfo.outputPath("encrypted-chat-tooltip.png") });
  await tooltip.hover();
  await expect(tooltip).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(tooltip).toBeHidden();
  await information.focus();
  await expect(tooltip).toBeVisible();
  await information.press("Escape");
  await expect(tooltip).toBeHidden();
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto(`${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`);
  await information.hover();
  await expect(tooltip).toBeVisible();
  const bounds = await tooltip.boundingBox();
  if (bounds == null) throw new Error("Missing tooltip bounds");
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(960);
  await page.screenshot({ path: testInfo.outputPath("encrypted-chat-tooltip-narrow.png") });
  await page.setViewportSize({ width: 960, height: 320 });
  await page.goto(`${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`);
  await information.focus();
  await expect(tooltip).toBeVisible();
  expect(await tooltip.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
    true,
  );
  await information.press("End");
  expect(await tooltip.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(information).toBeFocused();
  await information.press("Home");
  expect(await tooltip.evaluate((element) => element.scrollTop)).toBe(0);
});

test("encrypted channel owner adds and removes a participant through the shared membership actions", async ({
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
  const addedBindingUuid = crypto.randomUUID();
  const deletedBindingUuids: string[] = [];
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
          uuid: addedBindingUuid,
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
  await page.route(/\/stream_bindings\/[^/?]+(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    deletedBindingUuids.push(new URL(route.request().url()).pathname.split("/").at(-1) ?? "");
    await route.fulfill({ status: 204 });
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
  const membersPanel = page.getByRole("complementary");
  await expect(membersPanel.getByText(/^New Participant/)).toBeVisible();
  await membersPanel
    .getByRole("button", {
      name: /Remove from channel: New Participant|Удалить из канала: New Participant/i,
    })
    .click();
  await expect.poll(() => deletedBindingUuids).toEqual([addedBindingUuid]);
  await expect(membersPanel.getByText(/^New Participant/)).toHaveCount(0);
});

for (const encryption of [false, true]) {
  test(`${encryption ? "encrypted" : "ordinary"} channel member cannot open the add-members picker`, async ({
    authenticated,
  }) => {
    const page = authenticated;
    const stream = {
      ...streamsSuccess()[0],
      owner: crypto.randomUUID(),
      role: "member",
      encryption,
      current_encryption_key_uuid: encryption ? crypto.randomUUID() : null,
    };
    await page.route(/\/messenger\/streams\/?(?:[^?]*)?(?:\?.*)?$/, async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const path = new URL(route.request().url()).pathname.replace(/\/$/, "");
      await route.fulfill({ json: path.endsWith("/streams") ? [stream] : stream });
    });
    await page.goto(`${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`);
    await page
      .getByRole("button", { name: /^(channel info|информация о канале)$/i })
      .first()
      .click();
    const panel = page.getByRole("complementary");
    await expect(panel.getByRole("heading", { name: /members|участники/i })).toBeVisible();
    await expect(
      panel.getByRole("button", { name: /^(add members|добавить участников)$/i }),
    ).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    if (encryption && stream.current_encryption_key_uuid != null) {
      await expect(
        panel.getByText(stream.current_encryption_key_uuid, { exact: true }),
      ).toBeVisible();
      await expect(
        panel.getByRole("button", { name: /^(reissue key|перевыпустить ключ)$/i }),
      ).toHaveCount(0);
    }
  });
}

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
    const created = {
      ...messageSuccess("", createMessengerPlacementUuid(E2E_TOPIC_UUID, body.uuid)),
      payload: body.payload,
    };
    history.push(created);
    await route.fulfill({ status: 201, json: created });
  });
  await page.goto(`${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`);
  await expect(
    page.locator("[data-workspace-message-bubble]").getByText("Saved-key history", { exact: true }),
  ).toBeVisible();
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
