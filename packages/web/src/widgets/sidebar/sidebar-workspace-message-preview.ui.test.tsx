import "fake-indexeddb/auto";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import {
  ensureChatDeviceIdentity,
  notifyRealChatKeyChanges,
  realChatCryptoProvider,
  realChatKeyStorage,
} from "~/entities/messenger/chat-crypto-resources.lib";
import * as cryptoRuntime from "~/entities/messenger/chat-crypto-runtime.lib";
import { encodeChatE2eePayload } from "~/entities/messenger/chat-e2ee-payload-adapters.lib";
import {
  readMessengerMessageBodyCache,
  writeMessengerMessageBodyCache,
} from "~/entities/messenger/messenger-cache.lib";
import { createMessengerTopicMessagePreview } from "~/entities/messenger/messenger-topic-list.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerMessage, MessengerStream } from "~/entities/messenger/messenger.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { setLocale, t } from "~/i18n/i18n";
import { WorkspaceSidebarMessagePreview } from "./sidebar-workspace-message-preview.ui";

const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const TOPIC_UUID = "22222222-2222-4222-8222-222222222222";
const DATE = "2026-10-16T10:00:00Z";

async function seedPreview(plaintext = "Secret **preview**") {
  useWorkspaceAuthStore.getState().setSession({
    accountId: "sidebar-account",
    instanceId: "instance",
    organizationId: "org",
    organizationOrigin: "http://127.0.0.1:9100",
    projectId: "project-a",
    userUuid: "author",
    accessToken: "token",
    refreshToken: "refresh",
    login: "user@example.com",
    profile: {
      uuid: "author",
      username: "author",
      firstName: "Test",
      lastName: "User",
      email: "user@example.com",
    },
  });
  const runtime = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
  if (runtime === null) throw new Error("Missing runtime");
  const owner = workspaceRuntimeOwnerKey(runtime);
  const keyUuid = crypto.randomUUID();
  const key = await realChatCryptoProvider.createGroupKey();
  if (!key.ok) throw new Error("Key creation failed");
  const stream: MessengerStream = {
    uuid: STREAM_UUID,
    projectId: runtime.projectId,
    ownerUuid: runtime.userUuid,
    userUuid: runtime.userUuid,
    role: "owner",
    notificationMode: "all_messages",
    name: "Encrypted channel",
    description: "",
    unreadCount: 0,
    sourceName: "native",
    audience: "channel",
    isPrivate: true,
    inviteOnly: true,
    announce: false,
    isArchived: false,
    directUserUuid: null,
    lastMessageUuid: null,
    encryption: true,
    // The preview must read the message's historical key, not this current generation.
    currentEncryptionKey: { keyUuid: crypto.randomUUID() },
    createdAt: DATE,
    updatedAt: DATE,
  };
  useMessengerStore.getState().startBootstrap(owner);
  useMessengerStore.getState().upsertStream(owner, stream);
  useWorkspaceMessageStore.getState().setOwner(owner, false);
  const device = await ensureChatDeviceIdentity(runtime, () => true);
  const address = { owner: runtime, deviceId: device.deviceId, streamUuid: STREAM_UUID, keyUuid };
  const savedKey = { groupKey: key.value };
  await realChatKeyStorage.writeChatKey(address, savedKey);
  const encrypted = await realChatCryptoProvider.encryptMessage({
    groupKey: key.value,
    plaintext: new TextEncoder().encode(plaintext),
    context: { streamUuid: STREAM_UUID, keyUuid },
  });
  if (!encrypted.ok) throw new Error("Encryption failed");
  const wire = encodeChatE2eePayload({ kind: "e2ee", keyUuid, content: encrypted.value });
  if (wire.kind !== "e2ee") throw new Error("Unexpected payload");
  const message: MessengerMessage = {
    uuid: crypto.randomUUID(),
    conversationId: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
    projectId: runtime.projectId,
    streamUuid: STREAM_UUID,
    topicUuid: TOPIC_UUID,
    authorUuid: runtime.userUuid,
    userUuid: runtime.userUuid,
    payload: { kind: "e2ee", keyUuid, content: wire.content },
    read: true,
    pinned: false,
    starred: false,
    isOwn: true,
    reactions: {},
    reactionUserUuidsByEmojiName: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: DATE,
    updatedAt: DATE,
  };
  useWorkspaceMessageStore.getState().applyLiveCreatedMessage(message);
  const preview = createMessengerTopicMessagePreview({
    messageUuid: message.uuid,
    organizationId: runtime.organizationId,
    projectId: runtime.projectId,
    messagesById: { [message.uuid]: message },
    usersById: {},
    currentUserUuid: runtime.userUuid,
  });
  if (preview === null) throw new Error("Missing encrypted preview");
  const notifyKey = (kind: "updated" | "removed") =>
    notifyRealChatKeyChanges({
      kind,
      ownerKey: owner,
      deviceId: device.deviceId,
      streamUuid: STREAM_UUID,
      keyUuid,
    });
  return { message, preview, owner, address, savedKey, notifyKey };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useMessengerStore.getState().clear();
  useWorkspaceMessageStore.getState().clear();
  useWorkspaceAuthStore.getState().clear();
  setLocale("en");
});

describe("Workspace sidebar message preview", () => {
  it("decrypts with the historical key and leaves both message store and durable cache encrypted", async () => {
    const fixture = await seedPreview();
    await writeMessengerMessageBodyCache(fixture.owner, [fixture.message]);
    const before = useWorkspaceMessageStore.getState().messagesById;
    const { unmount } = render(<WorkspaceSidebarMessagePreview preview={fixture.preview} />);
    expect(await screen.findByText("Secret preview")).toBeVisible();
    expect(screen.getByText(t("common.you"))).toBeVisible();
    expect(useWorkspaceMessageStore.getState().messagesById).toBe(before);
    expect(await readMessengerMessageBodyCache(fixture.owner, [fixture.message.uuid])).toEqual([
      fixture.message,
    ]);
    expect(fixture.preview.text).toBe("");
    unmount();
    expect(screen.queryByText("Secret preview")).not.toBeInTheDocument();
  });

  it("shows the missing-key label, refreshes when the key arrives, and hides text when it is deleted", async () => {
    const fixture = await seedPreview();
    await realChatKeyStorage.removeChatKey(fixture.address);
    setLocale("ru");
    render(<WorkspaceSidebarMessagePreview preview={fixture.preview} />);
    expect(await screen.findByText("Нужен ключ")).toBeVisible();
    await realChatKeyStorage.writeChatKey(fixture.address, fixture.savedKey);
    act(() => fixture.notifyKey("updated"));
    expect(await screen.findByText("Secret preview")).toBeVisible();
    await realChatKeyStorage.removeChatKey(fixture.address);
    act(() => fixture.notifyKey("removed"));
    expect(screen.queryByText("Secret preview")).not.toBeInTheDocument();
    expect(await screen.findByText("Нужен ключ")).toBeVisible();
  });

  it("does not publish late decryption after switching owners", async () => {
    const fixture = await seedPreview();
    let finish: ((value: cryptoRuntime.RealChatMessageDecryption) => void) | undefined;
    const decrypt = vi.spyOn(cryptoRuntime, "decryptRealChatMessageResult").mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<WorkspaceSidebarMessagePreview preview={fixture.preview} />);
    await waitFor(() => expect(decrypt).toHaveBeenCalledOnce());
    expect(screen.getByText(t("e2ee.messageDecrypting"))).toBeVisible();
    act(() => useWorkspaceMessageStore.getState().setOwner("other-owner", false));
    await act(async () => {
      finish?.({ status: "ready", plaintext: "Late secret" });
      await Promise.resolve();
    });
    expect(screen.queryByText("Late secret")).not.toBeInTheDocument();
    expect(screen.getByText(t("e2ee.lockedTitle"))).toBeVisible();
  });

  it("replaces a readable preview when the last message changes and distinguishes errors from missing keys", async () => {
    const fixture = await seedPreview();
    const { rerender } = render(<WorkspaceSidebarMessagePreview preview={fixture.preview} />);
    expect(await screen.findByText("Secret preview")).toBeVisible();
    const broken: MessengerMessage = {
      ...fixture.message,
      uuid: crypto.randomUUID(),
      payload: { kind: "e2ee", keyUuid: fixture.address.keyUuid, content: "invalid-envelope" },
    };
    act(() => useWorkspaceMessageStore.getState().applyLiveCreatedMessage(broken));
    rerender(
      <WorkspaceSidebarMessagePreview preview={{ ...fixture.preview, messageUuid: broken.uuid }} />,
    );
    expect(screen.queryByText("Secret preview")).not.toBeInTheDocument();
    expect(await screen.findByText(t("e2ee.messageDecryptError"))).toBeVisible();
    expect(screen.queryByText(t("e2ee.lockedTitle"))).not.toBeInTheDocument();
  });

  it("summarizes decrypted attachments without exposing their references", async () => {
    const fileUuid = "33333333-3333-4333-8333-333333333333";
    const fixture = await seedPreview(
      `![private.png](urn:image:${fileUuid}?name=private.png) **Hello**`,
    );
    const { container } = render(<WorkspaceSidebarMessagePreview preview={fixture.preview} />);
    expect(await screen.findByText("Изображение: Hello")).toBeVisible();
    expect(container.textContent).not.toContain(fileUuid);
    expect(container.querySelector("img")).toBeNull();
  });

  it("uses standard service labels without attempting decryption", async () => {
    const fixture = await seedPreview();
    const service: MessengerMessage = {
      ...fixture.message,
      payload: { kind: "key_announced", keyUuid: fixture.address.keyUuid },
    };
    useWorkspaceMessageStore.getState().applyLiveCreatedMessage(service);
    const decrypt = vi.spyOn(cryptoRuntime, "decryptRealChatMessageResult");
    render(<WorkspaceSidebarMessagePreview preview={fixture.preview} />);
    expect(screen.getByText(t("e2ee.keyAnnouncedTitle"))).toBeVisible();
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("keeps ordinary previews and empty rows independent of decryption", () => {
    const decrypt = vi.spyOn(cryptoRuntime, "decryptRealChatMessageResult");
    const { rerender, container } = render(
      <WorkspaceSidebarMessagePreview
        preview={{ messageUuid: "ordinary", senderName: "Alice", text: "Ordinary preview" }}
      />,
    );
    expect(screen.getByText("Ordinary preview")).toBeVisible();
    rerender(<WorkspaceSidebarMessagePreview preview={null} />);
    expect(container.textContent).toBe("");
    expect(decrypt).not.toHaveBeenCalled();
  });
});
