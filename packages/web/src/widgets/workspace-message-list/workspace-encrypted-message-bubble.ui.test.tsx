import "fake-indexeddb/auto";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import {
  ensureChatDeviceIdentity,
  realChatKeyStorage,
} from "~/entities/messenger/chat-crypto-resources.lib";
import * as cryptoRuntime from "~/entities/messenger/chat-crypto-runtime.lib";
import { encodeChatE2eePayload } from "~/entities/messenger/chat-e2ee-payload-adapters.lib";
import { createRealChatCryptoProvider } from "~/entities/messenger/chat-real-crypto-provider.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerMessage, MessengerStream } from "~/entities/messenger/messenger.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { WorkspaceEncryptedMessageBubble } from "./workspace-encrypted-message-bubble.ui";
function createStream(overrides: Partial<MessengerStream> = {}): MessengerStream {
  return {
    uuid: "11111111-1111-4111-8111-111111111111",
    projectId: "project-a",
    ownerUuid: "user-a",
    userUuid: "user-a",
    role: "owner",
    notificationMode: "all_messages",
    name: "general",
    description: "",
    unreadCount: 0,
    sourceName: "native",
    source: { kind: "native" },
    audience: "channel",
    isPrivate: false,
    inviteOnly: false,
    announce: false,
    isArchived: false,
    directUserUuid: null,
    lastMessageUuid: null,
    createdAt: "2026-06-22T10:10:00Z",
    updatedAt: "2026-06-22T10:10:00Z",
    ...overrides,
  };
}

function message(uuid: string, payload: MessengerMessage["payload"]): MessengerMessage {
  return {
    uuid,
    conversationId:
      "topic:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222",
    projectId: "project-a",
    streamUuid: "11111111-1111-4111-8111-111111111111",
    topicUuid: "22222222-2222-4222-8222-222222222222",
    authorUuid: "author",
    userUuid: "author",
    payload,
    read: true,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    reactionUserUuidsByEmojiName: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  };
}

async function seedRealEncryptedMessage(text: string) {
  useWorkspaceAuthStore.getState().setSession({
    accountId: "account",
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
  if (runtime == null) throw new Error("Missing runtime");
  const owner = workspaceRuntimeOwnerKey(runtime);
  const keyUuid = crypto.randomUUID();
  const provider = createRealChatCryptoProvider();
  const keys = await provider.createGroupKey();
  if (!keys.ok) throw new Error("Missing group key");
  const fingerprint = await provider.fingerprintGroupKey(keys.value, keyUuid);
  if (!fingerprint.ok) throw new Error("Missing fingerprint");
  const stream = createStream({
    userUuid: runtime.userUuid,
    encryption: true,
    currentEncryptionKey: {
      keyUuid,
      keyFingerprint: btoa(String.fromCharCode(...fingerprint.value.bytes)),
    },
  });
  useMessengerStore.getState().startBootstrap(owner);
  useMessengerStore.getState().upsertStream(owner, stream);
  useWorkspaceMessageStore.getState().setOwner(owner, false);
  const device = await ensureChatDeviceIdentity(runtime, () => true);
  await realChatKeyStorage.writeChatKey(
    { owner: runtime, deviceId: device.deviceId, streamUuid: stream.uuid, keyUuid },
    { fingerprint: fingerprint.value, groupKey: keys.value },
  );
  const encrypted = await provider.encryptMessage({
    groupKey: keys.value,
    plaintext: new TextEncoder().encode(text),
    context: { streamUuid: stream.uuid, keyUuid },
  });
  if (!encrypted.ok) throw new Error("Encrypt failed");
  const wire = encodeChatE2eePayload({
    kind: "e2ee",
    keyUuid,
    content: encrypted.value,
  });
  if (wire.kind !== "e2ee") throw new Error("Unexpected payload");
  const stored = message("55555555-5555-4555-8555-555555555555", {
    kind: "e2ee",
    keyUuid: wire.key_uuid,
    content: wire.content,
  });
  useWorkspaceMessageStore.getState().applyLiveCreatedMessage(stored);
  return { stored, owner, stream };
}
function view(stored: MessengerMessage) {
  return (
    <WorkspaceEncryptedMessageBubble
      message={stored}
      currentUserUuid="author"
      isFirstInGroup
      isLastInGroup
    />
  );
}
describe("real encrypted message presentation", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useMessengerStore.getState().clear();
    useWorkspaceMessageStore.getState().clear();
    useWorkspaceAuthStore.getState().clear();
  });
  it("renders decoded Markdown safely and keeps the stored envelope across remount", async () => {
    const { stored } = await seedRealEncryptedMessage(
      "Привет **мир** <script>alert('unsafe')</script>",
    );
    const encoded = stored.payload.kind === "e2ee" ? stored.payload.content : "";
    const { container, unmount } = render(view(stored));
    expect((await screen.findByText("мир")).tagName).toBe("STRONG");
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain(encoded);
    expect(useWorkspaceMessageStore.getState().messagesById[stored.uuid]?.payload).toEqual(
      stored.payload,
    );
    unmount();
    render(view(useWorkspaceMessageStore.getState().messagesById[stored.uuid] ?? stored));
    expect(await screen.findByText("мир")).toBeInTheDocument();
  });
  it("reads previous generations after rotation and locks text for another store owner", async () => {
    const { stored, owner, stream } = await seedRealEncryptedMessage(
      "Only current owner can see this fixture",
    );
    const { rerender } = render(view(stored));
    expect(await screen.findByText("Only current owner can see this fixture")).toBeInTheDocument();
    act(() =>
      useMessengerStore.getState().upsertStream(owner, {
        ...stream,
        currentEncryptionKey: {
          keyUuid: "other-key",
          keyFingerprint: stream.currentEncryptionKey!.keyFingerprint,
        },
      }),
    );
    expect(await screen.findByText("Only current owner can see this fixture")).toBeInTheDocument();
    act(() => useMessengerStore.getState().upsertStream(owner, stream));
    expect(await screen.findByText("Only current owner can see this fixture")).toBeInTheDocument();
    act(() => useWorkspaceMessageStore.setState({ ownerKey: "other-owner" }));
    rerender(view(stored));
    expect(screen.queryByText("Only current owner can see this fixture")).not.toBeInTheDocument();
    act(() => {
      useWorkspaceMessageStore.setState({ ownerKey: owner });
      useMessengerStore.setState({ ownerKey: "other-owner" });
    });
    expect(screen.queryByText("Only current owner can see this fixture")).not.toBeInTheDocument();
  });
  it("does not render a late decrypt result after owner invalidation", async () => {
    const { stored } = await seedRealEncryptedMessage("secret");
    let resolve: (text: string | null) => void = () => undefined;
    const pending = new Promise<string | null>((done) => {
      resolve = done;
    });
    vi.spyOn(cryptoRuntime, "decryptRealChatMessage").mockReturnValue(pending);
    render(view(stored));
    act(() => useWorkspaceMessageStore.setState({ ownerKey: "other-owner" }));
    await act(async () => {
      resolve("late secret");
      await pending;
    });
    expect(screen.queryByText("late secret")).not.toBeInTheDocument();
  });

  it("keeps a legacy plaintext fixture locked instead of falling back to mock decoding", async () => {
    const { stored } = await seedRealEncryptedMessage("real text");
    const fixture = {
      ...stored,
      payload: {
        kind: "e2ee" as const,
        keyUuid: stored.payload.kind === "e2ee" ? stored.payload.keyUuid : "",
        content: btoa(
          JSON.stringify({
            testOnly: "WORKSPACE_DEV_PLAINTEXT_TEST_V1",
            text: "fixture plaintext",
          }),
        ),
      },
    };
    render(view(fixture));
    expect(screen.queryByText("fixture plaintext")).not.toBeInTheDocument();
    expect(await screen.findByText("Key required")).toBeInTheDocument();
  });
});
