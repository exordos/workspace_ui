import { createMessengerPlacementUuid } from "../packages/web/src/entities/messenger/messenger-message-identity.lib";
import type {
  WorkspaceMessengerCreateMessageRequestBody,
  WorkspaceMessengerMessageDto,
} from "../packages/web/src/shared/api/messenger.types";
import { test, expect } from "./fixtures";
import { expectReadyMessageComposer } from "./helpers/message-composer";
import { e2eOrgBasePath } from "./helpers/navigate-messenger";
import {
  E2E_STREAM_UUID,
  E2E_TOPIC_UUID,
  messageSuccess,
  streamsSuccess,
} from "./mocks/workspace-default-responses";

for (const encryption of [false, true]) {
  test(`${encryption ? "encrypted" : "ordinary"} outbox frees typing and focus, and retries an uncertain send without duplicates @mock`, async ({
    authenticated: page,
  }) => {
    const keyUuid = crypto.randomUUID();
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
      const stream = {
        ...streamsSuccess()[0],
        encryption: true,
        current_encryption_key_uuid: keyUuid,
      };
      await page.route(/\/messenger\/streams\/?(?:[^?]*)?(?:\?.*)?$/, async (route) => {
        if (route.request().method() !== "GET") return route.fallback();
        const path = new URL(route.request().url()).pathname.replace(/\/$/, "");
        await route.fulfill({ json: path.endsWith("/streams") ? [stream] : stream });
      });
    }
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
    await page.goto(`${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`);
    const textbox = await expectReadyMessageComposer(page);
    await textbox.fill("First outgoing message");
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
