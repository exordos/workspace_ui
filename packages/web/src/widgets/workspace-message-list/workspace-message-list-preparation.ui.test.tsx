import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { notifyRealChatKeyChanges } from "~/entities/messenger/chat-crypto-resources.lib";
import * as cryptoResources from "~/entities/messenger/chat-crypto-resources.lib";
import * as cryptoRuntime from "~/entities/messenger/chat-crypto-runtime.lib";
import type { RealChatMessageDecryption } from "~/entities/messenger/chat-crypto-runtime.lib";
import type { MessengerOutgoingMessage } from "~/entities/messenger/messenger-outbox.types";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerMessage, MessengerStream } from "~/entities/messenger/messenger.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { setLocale } from "~/i18n/i18n";
import { WorkspaceMessageList } from "./workspace-message-list.ui";
import type { WorkspaceMessageListProps } from "./workspace-message-list.types";

const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const TOPIC_UUID = "22222222-2222-4222-8222-222222222222";
const KEY_UUID = "33333333-3333-4333-8333-333333333333";
const CONVERSATION_ID = `topic:${STREAM_UUID}:${TOPIC_UUID}` as const;

async function flushPresentation(update: () => void) {
  await act(async () => {
    update();
    await Promise.resolve();
  });
}

function deferNextDecryption() {
  let resolve!: (value: RealChatMessageDecryption) => void;
  vi.mocked(cryptoRuntime.decryptRealChatMessageResult).mockReturnValueOnce(
    new Promise((complete) => {
      resolve = complete;
    }),
  );
  return (value: RealChatMessageDecryption) => flushPresentation(() => resolve(value));
}

function seedRuntime(accountId = "account-a") {
  useWorkspaceAuthStore.getState().setSession({
    accountId,
    instanceId: "instance",
    organizationId: "org",
    organizationOrigin: "http://127.0.0.1:9100",
    projectId: "project-a",
    userUuid: "author",
    accessToken: "synthetic-token",
    refreshToken: "synthetic-refresh",
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
  if (runtime == null) throw new Error("Missing synthetic runtime");
  const owner = workspaceRuntimeOwnerKey(runtime);
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
    currentEncryptionKey: { keyUuid: KEY_UUID },
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  };
  useMessengerStore.getState().startBootstrap(owner);
  useMessengerStore.getState().upsertStream(owner, stream);
  useWorkspaceMessageStore.getState().setOwner(owner, false);
  return owner;
}

function encryptedMessage(index: number, ciphertext = `ciphertext-${index}`): MessengerMessage {
  return {
    uuid: `55555555-5555-4555-8555-${String(index).padStart(12, "0")}`,
    conversationId: CONVERSATION_ID,
    projectId: "project-a",
    streamUuid: STREAM_UUID,
    topicUuid: TOPIC_UUID,
    authorUuid: "author",
    userUuid: "author",
    payload: { kind: "e2ee", keyUuid: KEY_UUID, content: ciphertext },
    read: false,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    reactionUserUuidsByEmojiName: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: new Date(Date.parse("2026-10-01T00:00:00Z") + index * 60_000).toISOString(),
    updatedAt: "2026-10-01T00:00:00Z",
  };
}

function configureOrdinaryStream(sourceName: MessengerStream["sourceName"] = "native") {
  const catalog = useMessengerStore.getState();
  const current = catalog.streamsById[STREAM_UUID];
  if (catalog.ownerKey == null || current == null) throw new Error("Missing synthetic stream");
  const stream = { ...current, sourceName, encryption: false };
  delete stream.currentEncryptionKey;
  catalog.upsertStream(catalog.ownerKey, stream);
}

function ordinaryMessage(index: number): MessengerMessage {
  return { ...encryptedMessage(index), payload: { kind: "markdown", content: "Ordinary text" } };
}

function view(
  messages: readonly MessengerMessage[],
  props: Partial<WorkspaceMessageListProps> = {},
) {
  return (
    <WorkspaceMessageList
      messages={messages}
      conversationId={CONVERSATION_ID}
      currentUserUuid="reader"
      initialPositionReady
      {...props}
    />
  );
}

describe("WorkspaceMessageList encrypted preparation", () => {
  beforeEach(() => {
    setLocale("en");
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    seedRuntime();
    vi.spyOn(cryptoRuntime, "decryptRealChatMessageResult").mockResolvedValue({
      status: "missing-key",
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useWorkspaceAuthStore.getState().clear();
    useMessengerStore.getState().clear();
    useWorkspaceMessageStore.getState().setOwner(null, false);
  });

  it.each([true, false])(
    "reveals the initial window together and defers read callbacks (encryptedChat=%s)",
    async (encryptedChat) => {
      if (!encryptedChat) configureOrdinaryStream();
      const finishFirst = deferNextDecryption();
      const finishSecond = deferNextDecryption();
      const messages = [encryptedMessage(1), encryptedMessage(2)];
      if (!encryptedChat) messages.unshift(ordinaryMessage(0));
      const onUnreadMessagesVisible = vi.fn();
      const onUnreadMessagesAtBottom = vi.fn();
      const { container } = render(
        view(messages, {
          onUnreadMessagesVisible,
          onUnreadMessagesAtBottom,
        }),
      );

      expect(container.querySelector("[data-message-uuid]")).toBeNull();
      await finishFirst({ status: "ready", plaintext: "Prepared first" });
      expect(container.querySelector("[data-message-uuid]")).toBeNull();
      expect(onUnreadMessagesVisible).not.toHaveBeenCalled();
      expect(onUnreadMessagesAtBottom).not.toHaveBeenCalled();

      await finishSecond({ status: "ready", plaintext: "Prepared second" });
      expect(screen.getByText("Prepared first")).toBeInTheDocument();
      expect(screen.getByText("Prepared second")).toBeInTheDocument();
      if (!encryptedChat) expect(screen.getByText("Ordinary text")).toBeInTheDocument();
      expect(container.querySelectorAll("article[data-message-uuid]")).toHaveLength(
        messages.length,
      );
      expect(container.querySelectorAll("[data-encrypted-message-placeholder]")).toHaveLength(0);
      expect(cryptoRuntime.decryptRealChatMessageResult).toHaveBeenCalledTimes(2);
      await waitFor(() => expect(onUnreadMessagesAtBottom).toHaveBeenCalled());
    },
  );

  it("reuses window preparation in bubbles and quotes without local key subscriptions", async () => {
    const subscribe = vi.spyOn(cryptoResources, "subscribeRealChatKeyChanges");
    const original = encryptedMessage(1);
    useWorkspaceMessageStore.getState().applyLiveCreatedMessage(original);
    vi.mocked(cryptoRuntime.decryptRealChatMessageResult).mockResolvedValue({
      status: "ready",
      plaintext: "Prepared source text",
    });
    const { rerender } = render(view([original]));
    expect(await screen.findByText("Prepared source text")).toBeInTheDocument();
    expect(subscribe).toHaveBeenCalledTimes(1);

    const reply: MessengerMessage = {
      ...ordinaryMessage(2),
      payload: {
        kind: "markdown",
        content: `[Author](urn:quote:${original.uuid})\n\nOrdinary reply`,
      },
    };
    rerender(view([original, reply]));
    expect(await screen.findAllByText("Prepared source text")).toHaveLength(2);
    expect(screen.getByText("Ordinary reply")).toBeInTheDocument();
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(cryptoRuntime.decryptRealChatMessageResult).toHaveBeenCalledTimes(1);
  });

  it("settles missing keys in ordinary-native messages and exposes their key request", async () => {
    configureOrdinaryStream();
    const requestKey = vi.fn();
    const encrypted = encryptedMessage(2);
    const { container } = render(
      view([ordinaryMessage(1), encrypted], { actions: { onRequestMessageKey: requestKey } }),
    );
    expect(await screen.findByText("Ordinary text")).toBeInTheDocument();
    expect(container.querySelector("[data-encrypted-message-state='locked']")).toBeInTheDocument();
    const request = container.querySelector<HTMLButtonElement>(
      "[data-workspace-message-quick-action='request-message-key']",
    );
    expect(request).toBeInTheDocument();
    if (request == null) throw new Error("Missing key request action");
    fireEvent.click(request);
    expect(requestKey).toHaveBeenCalledWith(encrypted.uuid);
    expect(cryptoRuntime.decryptRealChatMessageResult).toHaveBeenCalledTimes(1);
  });

  it("keeps existing rows and publishes an appended message while another retry is pending", async () => {
    configureOrdinaryStream();
    vi.mocked(cryptoRuntime.decryptRealChatMessageResult).mockResolvedValueOnce({
      status: "error",
    });
    const finishRetry = deferNextDecryption();
    vi.mocked(cryptoRuntime.decryptRealChatMessageResult).mockResolvedValueOnce({
      status: "ready",
      plaintext: "New prepared message",
    });
    const messages = [ordinaryMessage(1), encryptedMessage(2)];
    const { container, rerender } = render(view(messages));
    const retryButton = await screen.findByRole("button", { name: "Retry" });
    const failedRow = container.querySelector(`[data-message-uuid='${encryptedMessage(2).uuid}']`);
    const ordinary = screen.getByText("Ordinary text");
    fireEvent.click(retryButton);
    expect(container.querySelector(`[data-message-uuid='${encryptedMessage(2).uuid}']`)).toBe(
      failedRow,
    );
    expect(retryButton).toBeDisabled();
    expect(screen.getByText("Ordinary text")).toBe(ordinary);

    rerender(view([...messages, encryptedMessage(3)]));
    expect(await screen.findByText("New prepared message")).toBeInTheDocument();
    expect(retryButton).toBeDisabled();
    expect(screen.getByText("Ordinary text")).toBe(ordinary);

    await finishRetry({ status: "ready", plaintext: "Retry decrypted text" });
    expect(screen.getByText("Retry decrypted text")).toBeInTheDocument();
    expect(screen.getByText("Ordinary text")).toBe(ordinary);
    expect(cryptoRuntime.decryptRealChatMessageResult).toHaveBeenCalledTimes(3);
  });

  it("does not decrypt encrypted payloads from an unsupported external stream", async () => {
    configureOrdinaryStream("zulip");
    const { container } = render(view([ordinaryMessage(1), encryptedMessage(2)]));
    expect(await screen.findByText("Ordinary text")).toBeInTheDocument();
    expect(container.querySelector("[data-encrypted-message-state='locked']")).toBeInTheDocument();
    expect(cryptoRuntime.decryptRealChatMessageResult).not.toHaveBeenCalled();
    expect(
      container.querySelector("[data-workspace-message-quick-action='request-message-key']"),
    ).toBeNull();
  });

  it.each(["older", "newer"] as const)(
    "keeps displayed rows mounted as %s messages prepare independently",
    async (direction) => {
      vi.mocked(cryptoRuntime.decryptRealChatMessageResult).mockResolvedValueOnce({
        status: "ready",
        plaintext: "Existing message",
      });
      const original = encryptedMessage(3);
      const first = encryptedMessage(direction === "older" ? 1 : 4);
      const second = encryptedMessage(direction === "older" ? 2 : 5);
      const { container, rerender } = render(view([original]));
      const existingBody = await screen.findByText("Existing message");
      const existingRow = container.querySelector(`[data-message-uuid='${original.uuid}']`);
      const finishFirst = deferNextDecryption();
      const finishSecond = deferNextDecryption();

      rerender(view(direction === "older" ? [first, second, original] : [original, first, second]));
      expect(screen.getByText("Existing message")).toBe(existingBody);
      expect(container.querySelector(`[data-message-uuid='${original.uuid}']`)).toBe(existingRow);
      expect(container.querySelector(`[data-message-uuid='${first.uuid}']`)).toBeNull();
      expect(container.querySelector(`[data-message-uuid='${second.uuid}']`)).toBeNull();

      await finishSecond({ status: "ready", plaintext: "Second prepared message" });
      expect(screen.getByText("Second prepared message")).toBeInTheDocument();
      expect(container.querySelector(`[data-message-uuid='${first.uuid}']`)).toBeNull();
      expect(screen.getByText("Existing message")).toBe(existingBody);
      expect(container.querySelector(`[data-message-uuid='${original.uuid}']`)).toBe(existingRow);

      await finishFirst({ status: "ready", plaintext: "First prepared message" });
      expect(screen.getByText("First prepared message")).toBeInTheDocument();
      expect(screen.getByText("Existing message")).toBe(existingBody);
      expect(container.querySelector(`[data-message-uuid='${original.uuid}']`)).toBe(existingRow);
      expect(cryptoRuntime.decryptRealChatMessageResult).toHaveBeenCalledTimes(3);
    },
  );

  it("treats missing keys and decryption failures as settled states", async () => {
    vi.mocked(cryptoRuntime.decryptRealChatMessageResult).mockResolvedValueOnce({
      status: "missing-key",
    });
    const finishLast = deferNextDecryption();
    const { container } = render(view([encryptedMessage(1), encryptedMessage(2)]));
    expect(container.querySelector("[data-message-uuid]")).toBeNull();

    await finishLast({ status: "error" });
    expect(container.querySelectorAll("article[data-message-uuid]")).toHaveLength(2);
    expect(container.querySelector("[data-encrypted-message-state='locked']")).toBeInTheDocument();
    expect(container.querySelector("[data-encrypted-message-state='error']")).toBeInTheDocument();
    expect(cryptoRuntime.decryptRealChatMessageResult).toHaveBeenCalledTimes(2);
  });

  it("keeps a confirmed outgoing row visible until its encrypted server row is ready", async () => {
    const server = {
      ...encryptedMessage(1),
      authorUuid: "reader",
      userUuid: "reader",
      isOwn: true,
    };
    const outgoing: MessengerOutgoingMessage = {
      canonicalMessageUuid: server.uuid,
      placementUuid: server.uuid,
      ownerKey: useWorkspaceMessageStore.getState().ownerKey ?? "",
      conversationId: CONVERSATION_ID,
      projectId: server.projectId,
      streamUuid: STREAM_UUID,
      topicUuid: TOPIC_UUID,
      authorUuid: "reader",
      markdown: "Locally sent text",
      sourceMarkdown: "Locally sent text",
      status: "sending",
      createdAt: server.createdAt,
      updatedAt: server.updatedAt,
      attempt: 1,
      error: null,
      includeStreamConversation: false,
      encryption: { keyUuid: KEY_UUID, deviceId: "synthetic-device" },
    };
    const { container, rerender } = render(view([], { outgoingMessages: [outgoing] }));
    const row = container.querySelector(`[data-message-uuid='${server.uuid}']`);
    expect(row).toHaveTextContent("Locally sent text");
    const finishConfirmation = deferNextDecryption();

    rerender(view([server], { outgoingMessages: [] }));
    expect(container.querySelector(`[data-message-uuid='${server.uuid}']`)).toBe(row);
    expect(row).toHaveTextContent("Locally sent text");
    expect(container.querySelector("[data-workspace-message-preparation]")).toBeNull();
    rerender(view([{ ...server, read: true }], { outgoingMessages: [] }));
    expect(container.querySelector(`[data-message-uuid='${server.uuid}']`)).toBe(row);

    await finishConfirmation({ status: "ready", plaintext: "Locally sent text" });
    expect(container.querySelector(`[data-message-uuid='${server.uuid}']`)).toBe(row);
    expect(row).toHaveAttribute("data-message-kind", "server");
    expect(cryptoRuntime.decryptRealChatMessageResult).toHaveBeenCalledTimes(1);
  });

  it("waits for a focused message to prepare before reporting its DOM result", async () => {
    const previousScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollIntoView",
    );
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    try {
      vi.mocked(cryptoRuntime.decryptRealChatMessageResult).mockResolvedValueOnce({
        status: "ready",
        plaintext: "Opening window",
      });
      const { rerender } = render(view([encryptedMessage(1)]));
      await screen.findByText("Opening window");
      const target = encryptedMessage(2);
      const finishFocus = deferNextDecryption();
      const onFocusedMessageMissing = vi.fn();
      const onFocusedMessageApplied = vi.fn();
      const focusProps = {
        focusedMessageTarget: { intentId: 1, messageUuid: target.uuid, focusAttempt: 0 },
        onFocusedMessageMissing,
        onFocusedMessageApplied,
        scrollToBottomKey: "focus-new-window",
        anchorNavigationActive: true,
      };
      rerender(view([target], focusProps));
      expect(onFocusedMessageMissing).not.toHaveBeenCalled();
      expect(onFocusedMessageApplied).not.toHaveBeenCalled();

      await finishFocus({ status: "ready", plaintext: "Focused plaintext" });
      expect(onFocusedMessageMissing).not.toHaveBeenCalled();
      expect(onFocusedMessageApplied).toHaveBeenCalledWith(focusProps.focusedMessageTarget);
    } finally {
      if (previousScrollIntoView == null)
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
      else Object.defineProperty(HTMLElement.prototype, "scrollIntoView", previousScrollIntoView);
    }
  });

  it("reuses preparation for metadata changes but never shows stale plaintext for edited ciphertext", async () => {
    const original = encryptedMessage(1);
    vi.mocked(cryptoRuntime.decryptRealChatMessageResult).mockResolvedValueOnce({
      status: "ready",
      plaintext: "Original plaintext",
    });
    const { rerender } = render(view([original]));
    const originalBody = await screen.findByText("Original plaintext");
    const metadataUpdate = {
      ...original,
      read: true,
      pinned: true,
      updatedAt: "2026-10-02T00:00:00Z",
    };

    rerender(view([metadataUpdate]));
    expect(screen.getByText("Original plaintext")).toBe(originalBody);
    expect(cryptoRuntime.decryptRealChatMessageResult).toHaveBeenCalledTimes(1);

    const finishEdit = deferNextDecryption();
    rerender(
      view([{ ...metadataUpdate, payload: encryptedMessage(1, "edited-ciphertext").payload }]),
    );
    expect(screen.queryByText("Original plaintext")).not.toBeInTheDocument();

    await finishEdit({ status: "ready", plaintext: "Edited plaintext" });
    expect(screen.getByText("Edited plaintext")).toBeInTheDocument();
    expect(cryptoRuntime.decryptRealChatMessageResult).toHaveBeenCalledTimes(2);
  });

  it("clears ready text on key removal and rejects a pending result from before the removal", async () => {
    const owner = useWorkspaceMessageStore.getState().ownerKey;
    if (owner == null) throw new Error("Missing owner");
    vi.mocked(cryptoRuntime.decryptRealChatMessageResult).mockResolvedValueOnce({
      status: "ready",
      plaintext: "Private text",
    });
    const original = encryptedMessage(1);
    const { container, rerender } = render(view([original]));
    expect(await screen.findByText("Private text")).toBeInTheDocument();
    const finishRevoked = deferNextDecryption();
    rerender(view([original, encryptedMessage(2)]));
    await waitFor(() =>
      expect(cryptoRuntime.decryptRealChatMessageResult).toHaveBeenCalledTimes(2),
    );

    await flushPresentation(() => {
      notifyRealChatKeyChanges({
        kind: "removed",
        ownerKey: owner,
        deviceId: "synthetic-device",
        streamUuid: STREAM_UUID,
        keyUuid: KEY_UUID,
      });
    });
    expect(screen.queryByText("Private text")).not.toBeInTheDocument();
    await finishRevoked({ status: "ready", plaintext: "Revoked text" });
    expect(screen.queryByText("Private text")).not.toBeInTheDocument();
    expect(screen.queryByText("Revoked text")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(container.querySelectorAll("[data-encrypted-message-state='locked']")).toHaveLength(2),
    );
  });

  it("does not publish results from a previous runtime", async () => {
    const finishStale = deferNextDecryption();
    render(view([encryptedMessage(1)]));
    await waitFor(() =>
      expect(cryptoRuntime.decryptRealChatMessageResult).toHaveBeenCalledTimes(1),
    );
    const isCurrent = vi.mocked(cryptoRuntime.decryptRealChatMessageResult).mock.calls[0]?.[2];
    expect(isCurrent?.()).toBe(true);

    await flushPresentation(() => {
      seedRuntime("account-b");
    });
    expect(isCurrent?.()).toBe(false);
    await finishStale({ status: "ready", plaintext: "Previous account secret" });
    expect(screen.queryByText("Previous account secret")).not.toBeInTheDocument();
    expect(await screen.findByText("Key required")).toBeInTheDocument();
  });
});
