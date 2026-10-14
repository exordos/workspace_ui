import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import {
  ensureChatDeviceIdentity,
  notifyRealChatKeyChanges,
  realChatKeyStorage,
} from "~/entities/messenger/chat-crypto-resources.lib";
import * as cryptoRuntime from "~/entities/messenger/chat-crypto-runtime.lib";
import { encodeChatE2eePayload } from "~/entities/messenger/chat-e2ee-payload-adapters.lib";
import { createRealChatCryptoProvider } from "~/entities/messenger/chat-real-crypto-provider.lib";
import * as quoteResolver from "~/entities/messenger/messenger-quote-resolver.hook";
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
  const stream = createStream({
    userUuid: runtime.userUuid,
    encryption: true,
    currentEncryptionKey: {
      keyUuid,
    },
  });
  useMessengerStore.getState().startBootstrap(owner);
  useMessengerStore.getState().upsertStream(owner, stream);
  useWorkspaceMessageStore.getState().setOwner(owner, false);
  const device = await ensureChatDeviceIdentity(runtime, () => true);
  await realChatKeyStorage.writeChatKey(
    { owner: runtime, deviceId: device.deviceId, streamUuid: stream.uuid, keyUuid },
    { groupKey: keys.value },
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
  return { stored, owner, stream, runtime, device };
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
  it("clears visible plaintext after its local key is removed and ignores unrelated removals", async () => {
    const { stored, owner, stream, runtime, device } =
      await seedRealEncryptedMessage("local secret text");
    if (owner == null) throw new Error("Missing owner");
    render(view(stored));
    expect(await screen.findByText("local secret text")).toBeInTheDocument();
    if (stored.payload.kind !== "e2ee") throw new Error("Unexpected payload");
    act(() => {
      notifyRealChatKeyChanges({
        kind: "removed",
        ownerKey: owner,
        deviceId: device.deviceId,
        streamUuid: stream.uuid,
        keyUuid: "unrelated-key",
      });
    });
    expect(screen.getByText("local secret text")).toBeInTheDocument();
    await realChatKeyStorage.removeChatKey({
      owner: runtime,
      deviceId: device.deviceId,
      streamUuid: stream.uuid,
      keyUuid: stored.payload.keyUuid,
    });
    act(() => {
      if (stored.payload.kind !== "e2ee") return;
      notifyRealChatKeyChanges({
        kind: "removed",
        ownerKey: owner,
        deviceId: device.deviceId,
        streamUuid: stream.uuid,
        keyUuid: stored.payload.keyUuid,
      });
    });
    expect(screen.queryByText("local secret text")).not.toBeInTheDocument();
  });
  it("does not restore plaintext from a decrypt that finishes after key removal", async () => {
    const { stored, owner, stream, runtime, device } =
      await seedRealEncryptedMessage("late secret text");
    if (owner == null || stored.payload.kind !== "e2ee") throw new Error("Missing context");
    let completeDecrypt: ((value: cryptoRuntime.RealChatMessageDecryption) => void) | undefined;
    const pending = new Promise<cryptoRuntime.RealChatMessageDecryption>((resolve) => {
      completeDecrypt = resolve;
    });
    const decrypt = vi
      .spyOn(cryptoRuntime, "decryptRealChatMessageResult")
      .mockReturnValueOnce(pending);
    render(view(stored));
    await waitFor(() => expect(decrypt).toHaveBeenCalled());
    await realChatKeyStorage.removeChatKey({
      owner: runtime,
      deviceId: device.deviceId,
      streamUuid: stream.uuid,
      keyUuid: stored.payload.keyUuid,
    });
    act(() => {
      if (stored.payload.kind !== "e2ee") return;
      notifyRealChatKeyChanges({
        kind: "removed",
        ownerKey: owner,
        deviceId: device.deviceId,
        streamUuid: stream.uuid,
        keyUuid: stored.payload.keyUuid,
      });
    });
    await act(async () => {
      completeDecrypt?.({ status: "ready", plaintext: "late secret text" });
      await pending;
    });
    expect(screen.queryByText("late secret text")).not.toBeInTheDocument();
  });
  it("offers a manual key request only for the failed bubble and disables it while requesting", async () => {
    const { stored } = await seedRealEncryptedMessage("readable text");
    vi.spyOn(cryptoRuntime, "decryptRealChatMessageResult").mockResolvedValue({
      status: "error",
      canRequestKey: true,
    });
    const request = vi.fn();
    const props = {
      message: stored,
      currentUserUuid: "author",
      isFirstInGroup: true,
      isLastInGroup: true,
    };
    const { rerender } = render(
      <WorkspaceEncryptedMessageBubble {...props} actions={{ onRequestMessageKey: request }} />,
    );
    const button = await screen.findByRole("button", { name: "Request key for this message" });
    fireEvent.click(button);
    expect(request).toHaveBeenCalledWith(stored.uuid);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    rerender(
      <WorkspaceEncryptedMessageBubble
        {...props}
        actions={{ onRequestMessageKey: request, requestMessageKeyPending: true }}
      />,
    );
    expect(screen.getByRole("button", { name: "Request key for this message" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Request key for this message" }));
    expect(request).toHaveBeenCalledTimes(1);
    vi.mocked(cryptoRuntime.decryptRealChatMessageResult).mockResolvedValue({
      status: "ready",
      plaintext: "readable text",
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("readable text")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Request key for this message" }),
    ).not.toBeInTheDocument();
  });
  it("uses the ordinary owner shell and keeps the timestamp inside a compact locked body", () => {
    const stored = message("locked-message", {
      kind: "e2ee",
      keyUuid: "old-generation",
      content: "opaque-envelope",
    });
    const { container } = render(view(stored));
    const bubble = container.querySelector('[data-workspace-message-bubble="true"]');
    expect(bubble).toHaveClass("bg-msg-own-bg", "rounded-br-[6px]");
    expect(bubble?.querySelector('[data-message-meta-placement="inline"] time')).not.toBeNull();
    expect(screen.getByText("Key required")).toHaveClass("sr-only");
    expect(container.querySelector("[data-encrypted-message-placeholder] button")).toBeNull();
    expect(container.innerHTML).not.toContain("opaque-envelope");
  });

  it("opens the existing keyboard context menu and requests exactly the locked message", async () => {
    const stored = message("historical-message", {
      kind: "e2ee",
      keyUuid: "old-generation",
      content: "opaque-envelope",
    });
    const request = vi.fn();
    const { container } = render(
      <WorkspaceEncryptedMessageBubble
        message={stored}
        currentUserUuid="author"
        isFirstInGroup
        isLastInGroup
        actions={{ onRequestMessageKey: request }}
      />,
    );
    const bubble = container.querySelector('[data-workspace-message-bubble="true"]');
    if (!(bubble instanceof HTMLElement)) throw new Error("Missing bubble");
    bubble.focus();
    fireEvent.keyDown(bubble, { key: "F10", shiftKey: true });
    fireEvent.click(await screen.findByText("Request key for this message"));
    expect(request).toHaveBeenCalledWith("historical-message");
  });

  it("does not invoke a pending key request from the menu", async () => {
    const request = vi.fn();
    const { container } = render(
      <WorkspaceEncryptedMessageBubble
        message={message("locked", { kind: "e2ee", keyUuid: "old", content: "opaque" })}
        currentUserUuid="author"
        isFirstInGroup
        isLastInGroup
        actions={{ onRequestMessageKey: request, requestMessageKeyPending: true }}
      />,
    );
    const bubble = container.querySelector('[data-workspace-message-bubble="true"]');
    if (!(bubble instanceof HTMLElement)) throw new Error("Missing bubble");
    fireEvent.contextMenu(bubble, { clientX: 20, clientY: 20 });
    const item = await screen.findByText("Request key for this message");
    expect(item.closest('[role="menuitem"]')).toHaveAttribute("data-disabled");
    fireEvent.click(item);
    expect(request).not.toHaveBeenCalled();
  });

  it("renders decoded Markdown safely and keeps the stored envelope across remount", async () => {
    const { stored } = await seedRealEncryptedMessage(
      "Привет **мир** <script>alert('unsafe')</script>",
    );
    const encoded = stored.payload.kind === "e2ee" ? stored.payload.content : "";
    const { container, unmount } = render(view(stored));
    expect((await screen.findByText("мир")).tagName).toBe("STRONG");
    expect(container.querySelector("[data-workspace-message-bubble]")).toHaveClass("bg-msg-own-bg");
    expect(container.querySelector("[data-encrypted-message-placeholder]")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain(encoded);
    expect(useWorkspaceMessageStore.getState().messagesById[stored.uuid]?.payload).toEqual(
      stored.payload,
    );
    unmount();
    render(view(useWorkspaceMessageStore.getState().messagesById[stored.uuid] ?? stored));
    expect(await screen.findByText("мир")).toBeInTheDocument();
  });
  it("keeps decrypted text capabilities restricted and never loads quoted messages", async () => {
    const quote = vi.spyOn(quoteResolver, "useResolvedMessengerQuoteMessage");
    const preview = vi.fn();
    const { stored } = await seedRealEncryptedMessage(
      "Readable fixture\n\n[Alice](urn:quote:44444444-4444-4444-8444-444444444444)\n\n```js\nconst x = 1;\n```",
    );
    const { container } = render(
      <WorkspaceEncryptedMessageBubble
        message={stored}
        currentUserUuid="author"
        isFirstInGroup
        isLastInGroup
        actions={{
          onLoadWorkspaceFilePreview: preview,
          onReplyMessage: vi.fn(),
          onForwardMessage: vi.fn(),
          onEditMessage: vi.fn(),
        }}
      />,
    );
    expect(await screen.findByText("Readable fixture")).toBeInTheDocument();
    expect(quote).not.toHaveBeenCalled();
    expect(preview).not.toHaveBeenCalled();
    expect(
      container.querySelector("[data-workspace-code-copy], [data-workspace-quote]"),
    ).toBeNull();
    const bubble = container.querySelector('[data-workspace-message-bubble="true"]');
    if (!(bubble instanceof HTMLElement)) throw new Error("Missing bubble");
    fireEvent.contextMenu(bubble, { clientX: 20, clientY: 20 });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it.each([
    { kind: "image", tag: "img", name: "photo.png", contentType: "image/png", prefix: "!" },
    { kind: "video", tag: "video", name: "clip.mp4", contentType: "video/mp4", prefix: "" },
  ])(
    "renders decrypted $kind media and removes it when its key is deleted",
    async ({ kind, tag, name, contentType, prefix }) => {
      const objectUrl = `blob:encrypted-${kind}`;
      vi.spyOn(URL, "createObjectURL").mockReturnValue(objectUrl);
      const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
      const fileUuid = "66666666-6666-4666-8666-666666666666";
      const { stored, owner, stream, runtime, device } = await seedRealEncryptedMessage(
        `${prefix}[${name}](urn:${kind}:${fileUuid}?name=${name}&content_type=${encodeURIComponent(contentType)})\nCaption`,
      );
      const preview = vi.fn().mockResolvedValue(new Blob(["media"], { type: contentType }));
      const open = vi.fn();
      const { container } = render(
        <WorkspaceEncryptedMessageBubble
          message={stored}
          currentUserUuid="author"
          isFirstInGroup
          isLastInGroup
          actions={{ onLoadWorkspaceFilePreview: preview, onOpenWorkspaceMedia: open }}
        />,
      );
      expect(await screen.findByText("Caption")).toBeInTheDocument();
      await waitFor(() =>
        expect(container.querySelector(`${tag}[data-workspace-file-preview]`)).toHaveAttribute(
          "src",
          objectUrl,
        ),
      );
      expect(preview).toHaveBeenCalledWith(
        expect.objectContaining({ fileUuid, kind: "media", mediaKind: kind }),
        expect.any(AbortSignal),
      );
      const media = container.querySelector(`${tag}[data-workspace-file-preview]`);
      if (media == null) throw new Error("Missing media preview");
      if (kind === "video") {
        expect(media).toHaveAttribute("controls");
        const expand = container.querySelector("[data-workspace-video-expand]");
        if (expand == null) throw new Error("Missing video expand control");
        fireEvent.click(expand);
      } else {
        fireEvent.click(media);
      }
      expect(open).toHaveBeenCalledWith(expect.objectContaining({ fileUuid, mediaKind: kind }));
      expect(useWorkspaceMessageStore.getState().messagesById[stored.uuid]?.payload).toEqual(
        stored.payload,
      );
      if (stored.payload.kind !== "e2ee") throw new Error("Missing encrypted payload");
      await realChatKeyStorage.removeChatKey({
        owner: runtime,
        deviceId: device.deviceId,
        streamUuid: stream.uuid,
        keyUuid: stored.payload.keyUuid,
      });
      act(() =>
        notifyRealChatKeyChanges({
          kind: "removed",
          ownerKey: owner,
          deviceId: device.deviceId,
          streamUuid: stream.uuid,
          keyUuid: stored.payload.kind === "e2ee" ? stored.payload.keyUuid : "",
        }),
      );
      expect(screen.queryByText("Caption")).not.toBeInTheDocument();
      expect(container.querySelector("[data-workspace-file-preview]")).toBeNull();
      expect(preview.mock.calls[0]?.[1].aborted).toBe(true);
      expect(revoke).toHaveBeenCalledWith(objectUrl);
    },
  );

  it("renders a decrypted attachment as a downloadable file card", async () => {
    const fileUuid = "66666666-6666-4666-8666-666666666666";
    const { stored } = await seedRealEncryptedMessage(
      `[report.pdf](urn:file:${fileUuid}?name=report.pdf&content_type=application%2Fpdf&size=10)`,
    );
    const download = vi.fn();
    const preview = vi.fn();
    const { container } = render(
      <WorkspaceEncryptedMessageBubble
        message={stored}
        currentUserUuid="author"
        isFirstInGroup
        isLastInGroup
        actions={{ onDownloadFile: download, onLoadWorkspaceFilePreview: preview }}
      />,
    );
    expect(await screen.findByText("report.pdf")).toBeInTheDocument();
    const card = container.querySelector('[data-workspace-file-kind="attachment"]');
    if (card == null) throw new Error("Missing file card");
    fireEvent.click(card);
    expect(download).toHaveBeenCalledWith(
      expect.objectContaining({ fileUuid, kind: "attachment" }),
    );
    expect(preview).not.toHaveBeenCalled();
    expect(useWorkspaceMessageStore.getState().messagesById[stored.uuid]?.payload).toEqual(
      stored.payload,
    );
  });

  it("aborts a pending media load and ignores its result after owner invalidation", async () => {
    const { stored } = await seedRealEncryptedMessage(
      "![photo.png](urn:image:66666666-6666-4666-8666-666666666666?name=photo.png&content_type=image%2Fpng)",
    );
    let resolvePreview!: (blob: Blob) => void;
    const pendingPreview = new Promise<Blob>((resolve) => {
      resolvePreview = resolve;
    });
    const preview = vi.fn().mockReturnValue(pendingPreview);
    const createObjectUrl = vi.spyOn(URL, "createObjectURL");
    const { container } = render(
      <WorkspaceEncryptedMessageBubble
        message={stored}
        currentUserUuid="author"
        isFirstInGroup
        isLastInGroup
        actions={{ onLoadWorkspaceFilePreview: preview }}
      />,
    );
    await waitFor(() => expect(preview).toHaveBeenCalledOnce());
    act(() => useWorkspaceMessageStore.setState({ ownerKey: "other-owner" }));
    expect(preview.mock.calls[0]?.[1].aborted).toBe(true);
    await act(async () => {
      resolvePreview(new Blob(["late image"], { type: "image/png" }));
      await pendingPreview;
    });
    expect(container.querySelector("[data-workspace-file-preview]")).toBeNull();
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(useWorkspaceMessageStore.getState().messagesById[stored.uuid]?.payload).toEqual(
      stored.payload,
    );
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
    let resolve!: (value: cryptoRuntime.RealChatMessageDecryption) => void;
    const pending = new Promise<cryptoRuntime.RealChatMessageDecryption>((done) => {
      resolve = done;
    });
    vi.spyOn(cryptoRuntime, "decryptRealChatMessageResult").mockReturnValue(pending);
    render(view(stored));
    act(() => useWorkspaceMessageStore.setState({ ownerKey: "other-owner" }));
    await act(async () => {
      resolve({ status: "ready", plaintext: "late secret" });
      await pending;
    });
    expect(screen.queryByText("late secret")).not.toBeInTheDocument();
  });

  it("rejects a legacy plaintext fixture instead of falling back to mock decoding", async () => {
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
    expect(await screen.findByText("Could not decrypt message")).toBeInTheDocument();
  });

  it("shows accessible loading without exposing the envelope while decryption is pending", async () => {
    const { stored } = await seedRealEncryptedMessage("loading fixture");
    let resolve!: (value: cryptoRuntime.RealChatMessageDecryption) => void;
    const pending = new Promise<cryptoRuntime.RealChatMessageDecryption>((done) => {
      resolve = done;
    });
    vi.spyOn(cryptoRuntime, "decryptRealChatMessageResult").mockReturnValue(pending);
    const { container } = render(view(stored));
    expect(screen.getByText("Decrypting message…")).toHaveClass("sr-only");
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector("[data-encrypted-message-placeholder] button")).toBeNull();
    expect(container.innerHTML).not.toContain(
      stored.payload.kind === "e2ee" ? stored.payload.content : "opaque",
    );
    await act(async () => {
      resolve({ status: "ready", plaintext: "loading fixture" });
      await pending;
    });
    expect(await screen.findByText("loading fixture")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps absent keys compact and retries automatically when key material changes", async () => {
    const { stored } = await seedRealEncryptedMessage("newly available fixture");
    vi.spyOn(realChatKeyStorage, "readChatKey").mockResolvedValueOnce(null);
    const { container } = render(view(stored));
    expect(await screen.findByText("Key required")).toHaveClass("sr-only");
    expect(container.querySelector("[data-encrypted-message-placeholder]")).toHaveAttribute(
      "data-encrypted-message-state",
      "locked",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(container.querySelector("[data-encrypted-message-placeholder] button")).toBeNull();
    act(() => notifyRealChatKeyChanges());
    expect(await screen.findByText("newly available fixture")).toBeInTheDocument();
    expect(useWorkspaceMessageStore.getState().messagesById[stored.uuid]?.payload).toEqual(
      stored.payload,
    );
  });

  it("keeps verified text visible during an unrelated key notification without carrying it to changed ciphertext", async () => {
    const { stored } = await seedRealEncryptedMessage("stable readable fixture");
    const { container, rerender } = render(view(stored));
    expect(await screen.findByText("stable readable fixture")).toBeInTheDocument();
    let resolve!: (value: cryptoRuntime.RealChatMessageDecryption) => void;
    const pending = new Promise<cryptoRuntime.RealChatMessageDecryption>((done) => {
      resolve = done;
    });
    vi.spyOn(cryptoRuntime, "decryptRealChatMessageResult").mockReturnValue(pending);
    act(() => notifyRealChatKeyChanges());
    expect(screen.getByText("stable readable fixture")).toBeInTheDocument();
    expect(container.querySelector("[data-encrypted-message-placeholder]")).toBeNull();
    expect(useWorkspaceMessageStore.getState().messagesById[stored.uuid]?.payload).toEqual(
      stored.payload,
    );
    if (stored.payload.kind !== "e2ee") throw new Error("Missing encrypted payload");
    rerender(view({ ...stored, payload: { ...stored.payload, content: "changed-envelope" } }));
    expect(screen.queryByText("stable readable fixture")).not.toBeInTheDocument();
    expect(screen.getByText("Decrypting message…")).toBeInTheDocument();
    await act(async () => {
      resolve({ status: "error" });
      await pending;
    });
    expect(await screen.findByText("Could not decrypt message")).toBeInTheDocument();
    expect(screen.queryByText("stable readable fixture")).not.toBeInTheDocument();
  });

  it("retries a transient storage failure for the same message without replacing the stored ciphertext", async () => {
    const { stored } = await seedRealEncryptedMessage("retry fixture");
    const readKey = vi
      .spyOn(realChatKeyStorage, "readChatKey")
      .mockRejectedValueOnce(new Error("storage-failed"));
    render(
      <WorkspaceEncryptedMessageBubble
        message={stored}
        currentUserUuid="author"
        isFirstInGroup
        isLastInGroup
        actions={{ onRequestMessageKey: vi.fn() }}
      />,
    );
    expect(await screen.findByText("Could not decrypt message")).not.toHaveClass("sr-only");
    expect(
      screen.queryByRole("button", { name: "Request key for this message" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveAttribute("aria-busy", "false");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("retry fixture")).toBeInTheDocument();
    expect(readKey).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(useWorkspaceMessageStore.getState().messagesById[stored.uuid]?.payload).toEqual(
      stored.payload,
    );
  });

  it("shows damaged ciphertext as an error, without presenting it as an absent key", async () => {
    const { stored } = await seedRealEncryptedMessage("tampered fixture");
    if (stored.payload.kind !== "e2ee") throw new Error("Missing encrypted payload");
    const bytes = new Uint8Array(
      Uint8Array.from(atob(stored.payload.content), (char) => char.charCodeAt(0)),
    );
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1;
    const tampered = {
      ...stored,
      payload: { ...stored.payload, content: btoa(String.fromCharCode(...bytes)) },
    };
    render(view(tampered));
    expect(await screen.findByText("Could not decrypt message")).toBeInTheDocument();
    expect(screen.queryByText("Key required")).not.toBeInTheDocument();
    expect(screen.queryByText("tampered fixture")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
