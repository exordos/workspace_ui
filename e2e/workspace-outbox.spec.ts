import { createMessengerPlacementUuid } from "../packages/web/src/entities/messenger/messenger-message-identity.lib";
import type {
  WorkspaceMessengerCreateMessageRequestBody,
  WorkspaceMessengerMessageDto,
} from "../packages/web/src/shared/api/messenger.types";
import { test, expect } from "./fixtures";
import { expectReadyMessageComposer } from "./helpers/message-composer";
import { e2eOrgBasePath } from "./helpers/navigate-messenger";
import { seedAuthStorage } from "./helpers/seed-auth";
import {
  E2E_STREAM_UUID,
  E2E_TOPIC_UUID,
  messageSuccess,
  streamsSuccess,
} from "./mocks/workspace-default-responses";

for (const { encryption, revalidateAfterInput } of [
  { encryption: false, revalidateAfterInput: false },
  { encryption: true, revalidateAfterInput: false },
  { encryption: true, revalidateAfterInput: true },
]) {
  test(`${encryption ? "encrypted" : "ordinary"} outbox frees typing and focus, and retries an uncertain send without duplicates${revalidateAfterInput ? " after delayed catalog revalidation" : ""} @mock`, async ({
    page,
  }) => {
    await seedAuthStorage(page);
    const keyUuid = crypto.randomUUID();
    let refreshCatalog = false;
    let releaseCatalog: () => void = () => {
      throw new Error("Catalog gate is missing");
    };
    const catalogResponse = new Promise<void>((resolve) => {
      releaseCatalog = resolve;
    });
    const refreshedStreamName = "Revalidated encrypted outbox";
    // Install the stream contract before the first bootstrap can persist its catalog.
    if (encryption) {
      const stream = {
        ...streamsSuccess()[0],
        encryption: true,
        current_encryption_key_uuid: keyUuid,
      };
      await page.route(/\/messenger\/streams\/?(?:[^?]*)?(?:\?.*)?$/, async (route) => {
        if (route.request().method() !== "GET") return route.fallback();
        const path = new URL(route.request().url()).pathname.replace(/\/$/, "");
        const delayed = revalidateAfterInput && refreshCatalog && path.endsWith("/streams");
        if (delayed) await catalogResponse;
        const responseStream = delayed ? { ...stream, name: refreshedStreamName } : stream;
        await route.fulfill({
          json: path.endsWith("/streams") ? [responseStream] : responseStream,
        });
      });
    }
    await page.goto(`${e2eOrgBasePath()}/messenger`);
    await expect(page.locator("[data-focus-zone='topbar']")).toBeVisible();
    if (encryption) {
      await page.evaluate(
        async ({ keyUuid, streamUuid }) => {
          const { useWorkspaceAuthStore } =
            await import("/src/entities/workspace-auth/workspace-auth.model.ts");
          const { realChatKeyStorage, realChatCryptoProvider } =
            await import("/src/entities/messenger/chat-crypto-resources.lib.ts");
          const runtime = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
          if (!runtime) throw new Error("Missing test runtime");
          const device = (await realChatKeyStorage.readDeviceIdentity(runtime)) ?? {
            deviceId: crypto.randomUUID(),
            deviceName: "Outbox test",
          };
          await realChatKeyStorage.writeDeviceIdentity(runtime, device);
          const key = await realChatCryptoProvider.createGroupKey();
          if (!key.ok) throw new Error("Key creation failed");
          await realChatKeyStorage.writeChatKey(
            { owner: runtime, deviceId: device.deviceId, streamUuid, keyUuid },
            { groupKey: key.value },
          );
        },
        { keyUuid, streamUuid: E2E_STREAM_UUID },
      );
    }
    // The reload below must restore an actual cached catalog, not race its first write.
    if (revalidateAfterInput)
      await expect
        .poll(() =>
          page.evaluate(async (streamUuid) => {
            const { useWorkspaceAuthStore } =
              await import("/src/entities/workspace-auth/workspace-auth.model.ts");
            const { workspaceRuntimeOwnerKey } =
              await import("/src/entities/workspace-runtime/workspace-runtime.lib.ts");
            const { readMessengerCatalogPayloadCache } =
              await import("/src/entities/messenger/messenger-cache.lib.ts");
            const runtime = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
            if (!runtime) return false;
            const cached = await readMessengerCatalogPayloadCache(
              workspaceRuntimeOwnerKey(runtime),
            );
            return cached?.payload.streams.some((stream) => stream.uuid === streamUuid) === true;
          }, E2E_STREAM_UUID),
        )
        .toBe(true);
    const requests: WorkspaceMessengerCreateMessageRequestBody[] = [];
    const committed = new Map<string, WorkspaceMessengerMessageDto>();
    let releaseFirst: () => void = () => {
      throw new Error("First gate is missing");
    };
    const firstResponse = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    await page.route(/\/messenger\/messages\/?(?:\?.*)?$/, async (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: [] });
      if (route.request().method() !== "POST") return route.fallback();
      const body = route.request().postDataJSON() as WorkspaceMessengerCreateMessageRequestBody;
      if (!body.uuid) throw new Error("Missing canonical message UUID");
      requests.push(body);
      const firstAttempt = requests.length === 1;
      const created = committed.get(body.uuid) ?? {
        ...messageSuccess("", createMessengerPlacementUuid(E2E_TOPIC_UUID, body.uuid)),
        payload: body.payload,
      };
      committed.set(body.uuid, created);
      if (firstAttempt) {
        await firstResponse;
        return route.fulfill({ status: 503, json: { message: "Response lost after commit" } });
      }
      await route.fulfill({ status: 201, json: created });
    });
    // Hold revalidation until input exists, then exercise that exact transition before Enter.
    refreshCatalog = true;
    await page.goto(`${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`);
    const textbox = await expectReadyMessageComposer(page);
    await textbox.fill("First outgoing message");
    if (revalidateAfterInput) {
      releaseCatalog();
      await expect(page.getByRole("heading", { level: 1 })).toContainText(refreshedStreamName);
      await expect(
        page.getByRole("button", {
          name: /protected chat information|особенности защищ[её]нного чата/i,
        }),
      ).toBeVisible();
    }
    await textbox.press("Enter");
    await expect.poll(() => requests.length).toBe(1);
    await expect(textbox).toHaveValue("");
    await expect(textbox).toBeEnabled();
    await expect(textbox).toBeFocused();
    await expect(
      page.locator("[data-workspace-message-bubble][data-outgoing-delivery-status='sending']"),
    ).toHaveCount(1);
    await textbox.fill("Second outgoing message");
    await page
      .getByRole("form", { name: /поле ввода сообщения|message composer/i })
      .getByRole("button")
      .last()
      .click();
    await expect(textbox).toHaveValue("");
    await expect(textbox).toBeFocused();
    releaseFirst();
    await expect.poll(() => requests.length).toBe(2);
    await expect(
      page.locator("[data-workspace-message-bubble][data-outgoing-delivery-status='failed']"),
    ).toHaveCount(1);
    await expect(
      page
        .locator("[data-workspace-message-bubble]")
        .getByText("Second outgoing message", { exact: true }),
    ).toBeVisible();
    await textbox.fill("Next draft stays intact");
    await page.getByRole("button", { name: /^(повторить отправку|retry send)$/i }).click();
    await expect.poll(() => requests.length).toBe(3);
    expect(requests[2]).toEqual(requests[0]);
    expect(requests[1]?.uuid).not.toBe(requests[0]?.uuid);
    expect(
      requests.every((request) => request.payload.kind === (encryption ? "e2ee" : "markdown")),
    ).toBe(true);
    await expect(page.locator("[data-outgoing-message-id]")).toHaveCount(0);
    await expect(
      page
        .locator("[data-workspace-message-bubble]")
        .getByText("First outgoing message", { exact: true }),
    ).toBeVisible();
    expect(committed.size).toBe(2);
    await expect(textbox).toHaveValue("Next draft stays intact");
  });
}
