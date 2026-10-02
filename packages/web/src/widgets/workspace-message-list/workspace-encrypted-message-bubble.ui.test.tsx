import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { createDevChatCryptoProvider } from "~/entities/messenger/chat-dev-crypto.lib";
import { encodeChatE2eePayload } from "~/entities/messenger/chat-e2ee-payload-adapters.lib";
import { DEV_CHAT_PUBLIC_KEY_MARKER } from "~/entities/messenger/chat-initial-key-bootstrap.lib";
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

async function seedDevEncryptedMessage(text: string) {
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
  const stream = createStream({
    userUuid: runtime.userUuid,
    encryption: true,
    currentEncryptionKey: { keyUuid: "current-key", publicKey: btoa(DEV_CHAT_PUBLIC_KEY_MARKER) },
  });
  useMessengerStore.getState().startBootstrap(owner);
  useMessengerStore.getState().upsertStream(owner, stream);
  useWorkspaceMessageStore.getState().setOwner(owner, false);
  const provider = createDevChatCryptoProvider(runtime, stream);
  if (provider == null) throw new Error("Missing mock provider");
  const keys = await provider.createChatKeyPair();
  if (!keys.ok) throw new Error("Missing mock key");
  const encrypted = await provider.encryptMessage({
    publicKey: keys.value.publicKey,
    plaintext: new TextEncoder().encode(text),
    context: { streamUuid: stream.uuid, keyUuid: "current-key" },
  });
  if (!encrypted.ok) throw new Error("Mock encode failed");
  const wire = encodeChatE2eePayload({
    kind: "e2ee",
    keyUuid: "current-key",
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
describe("local mock encrypted message presentation", () => {
  afterEach(() => {
    cleanup();
    useMessengerStore.getState().clear();
    useWorkspaceMessageStore.getState().clear();
    useWorkspaceAuthStore.getState().clear();
  });
  it("renders decoded Markdown safely and keeps the stored envelope across remount", async () => {
    const { stored } = await seedDevEncryptedMessage(
      "Привет **мир** <script>alert('unsafe')</script>",
    );
    const encoded = stored.payload.kind === "e2ee" ? stored.payload.content : "";
    const { container, unmount } = render(view(stored));
    expect(screen.getByText("мир").tagName).toBe("STRONG");
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain(encoded);
    expect(useWorkspaceMessageStore.getState().messagesById[stored.uuid]?.payload).toEqual(
      stored.payload,
    );
    unmount();
    render(view(useWorkspaceMessageStore.getState().messagesById[stored.uuid] ?? stored));
    expect(screen.getByText("мир")).toBeInTheDocument();
  });
  it("locks decoded text when the key changes or either store belongs to another owner", async () => {
    const { stored, owner, stream } = await seedDevEncryptedMessage(
      "Only current owner can see this fixture",
    );
    const { rerender } = render(view(stored));
    expect(screen.getByText("Only current owner can see this fixture")).toBeInTheDocument();
    act(() =>
      useMessengerStore.getState().upsertStream(owner, {
        ...stream,
        currentEncryptionKey: {
          keyUuid: "other-key",
          publicKey: btoa(DEV_CHAT_PUBLIC_KEY_MARKER),
        },
      }),
    );
    expect(screen.queryByText("Only current owner can see this fixture")).not.toBeInTheDocument();
    act(() => useMessengerStore.getState().upsertStream(owner, stream));
    expect(screen.getByText("Only current owner can see this fixture")).toBeInTheDocument();
    act(() => useWorkspaceMessageStore.setState({ ownerKey: "other-owner" }));
    rerender(view(stored));
    expect(screen.queryByText("Only current owner can see this fixture")).not.toBeInTheDocument();
    act(() => {
      useWorkspaceMessageStore.setState({ ownerKey: owner });
      useMessengerStore.setState({ ownerKey: "other-owner" });
    });
    expect(screen.queryByText("Only current owner can see this fixture")).not.toBeInTheDocument();
  });
});
