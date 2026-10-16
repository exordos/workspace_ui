import { createMessengerPlacementUuid } from "../packages/web/src/entities/messenger/messenger-message-identity.lib";
import type { WorkspaceMessengerCreateMessageRequestBody } from "../packages/web/src/shared/api/messenger.types";
import { test, expect } from "./fixtures";
import { expectReadyMessageComposer } from "./helpers/message-composer";
import { e2eOrgBasePath } from "./helpers/navigate-messenger";
import {
  E2E_STREAM_UUID,
  E2E_TOPIC_UUID,
  messageSuccess,
  serverSettingsSuccess,
  streamsSuccess,
} from "./mocks/workspace-default-responses";

for (const entry of ["ordinary header", "encrypted header", "encrypted sidebar"] as const) {
  test(`${entry} starts the shared Jitsi flow @mock`, async ({ authenticated: page }) => {
    const encrypted = entry !== "ordinary header";
    const keyUuid = crypto.randomUUID();
    if (encrypted) {
      await page.evaluate(
        async ({ keyUuid, streamUuid }) => {
          const { useWorkspaceAuthStore } =
            await import("/src/entities/workspace-auth/workspace-auth.model.ts");
          const { ensureChatDeviceIdentity, realChatKeyStorage, realChatCryptoProvider } =
            await import("/src/entities/messenger/chat-crypto-resources.lib.ts");
          const runtime = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
          if (!runtime) throw new Error("Missing runtime");
          const device = await ensureChatDeviceIdentity(runtime, () => true);
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
    await page.route(/\/messenger\/messages\/?(?:\?.*)?$/, async (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: [] });
      if (route.request().method() !== "POST") return route.fallback();
      const body = route.request().postDataJSON() as WorkspaceMessengerCreateMessageRequestBody;
      if (!body.uuid) throw new Error("Missing canonical UUID");
      requests.push(body);
      await route.fulfill({
        status: 201,
        json: {
          ...messageSuccess("", createMessengerPlacementUuid(E2E_TOPIC_UUID, body.uuid)),
          payload: body.payload,
        },
      });
    });
    // Exercise the application call flow without joining an external conference.
    await page.route("https://meet.workspace.example.com/**", (route) =>
      route.fulfill({ status: 503, body: "Test conference" }),
    );
    await page.route(/\/messenger\/server_settings\/?(?:\?.*)?$/, (route) =>
      route.fulfill({
        json: { ...serverSettingsSuccess(), meet_url: "https://meet.workspace.example.com" },
      }),
    );
    const topicPath = entry === "encrypted sidebar" ? "" : `/topic/${E2E_TOPIC_UUID}`;
    await page.goto(`${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}${topicPath}`);
    if (topicPath) await expectReadyMessageComposer(page);
    const header = page.getByTestId("chat-page").locator("header").first();
    if (entry === "encrypted sidebar") {
      await header
        .getByRole("button", { name: /информация о канале|channel info/i })
        .first()
        .click();
      const call = page
        .locator('[data-encrypted-chat-screen="info"]')
        .getByRole("button", { name: /^(позвонить|call)$/i });
      await expect(call).toBeEnabled();
      await call.click();
    } else {
      await header.getByRole("button", { name: /^(позвонить|call)$/i }).click();
    }
    await expect.poll(() => requests.length).toBe(1);
    const request = requests[0];
    expect(request?.stream_uuid).toBe(E2E_STREAM_UUID);
    expect(request?.topic_uuid).toBe(E2E_TOPIC_UUID);
    expect(request?.payload.kind).toBe(encrypted ? "e2ee" : "markdown");
    await expect(page.getByTestId("jitsi-call-window")).toBeVisible();
    const meetingUrl = await page.evaluate(async () => {
      const { useJitsiCallStore } = await import("/src/features/jitsi-call/jitsi-call.model.ts");
      return useJitsiCallStore.getState().activeCall?.meetingUrl;
    });
    expect(meetingUrl).toContain("https://meet.workspace.example.com/workspace-");
    if (request?.payload.kind === "markdown") expect(request.payload.content).toBe(meetingUrl);
    if (request?.payload.kind === "e2ee") {
      expect(request.payload.key_uuid).toBe(keyUuid);
      const plaintext = await page.evaluate(
        async ({ payload, streamUuid }) => {
          const { useWorkspaceAuthStore } =
            await import("/src/entities/workspace-auth/workspace-auth.model.ts");
          const { ensureChatDeviceIdentity, realChatKeyStorage, realChatCryptoProvider } =
            await import("/src/entities/messenger/chat-crypto-resources.lib.ts");
          const runtime = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
          if (!runtime) throw new Error("Missing runtime");
          const device = await ensureChatDeviceIdentity(runtime, () => true);
          const key = await realChatKeyStorage.readChatKey({
            owner: runtime,
            deviceId: device.deviceId,
            streamUuid,
            keyUuid: payload.key_uuid,
          });
          if (!key) throw new Error("Missing key");
          const result = await realChatCryptoProvider.decryptMessage({
            groupKey: key.groupKey,
            envelope: {
              bytes: Uint8Array.from(atob(payload.content), (char) => char.charCodeAt(0)),
            },
            context: { streamUuid, keyUuid: payload.key_uuid },
          });
          if (!result.ok) throw new Error("Invite decryption failed");
          return new TextDecoder().decode(result.value);
        },
        { payload: request.payload, streamUuid: E2E_STREAM_UUID },
      );
      expect(plaintext).toBe(meetingUrl);
    }
  });
}
