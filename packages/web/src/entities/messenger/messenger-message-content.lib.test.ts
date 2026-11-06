import { afterEach, describe, expect, it, vi } from "vitest";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { decryptRealChatMessageResult } from "./chat-crypto-runtime.lib";
import {
  canPrepareMessengerEncryptedMessage,
  getImmediateMessengerMessageContent,
  getMessengerMessageContentKey,
  prepareMessengerMessageContent,
} from "./messenger-message-content.lib";
import type { RealChatMessageDecryption } from "./chat-crypto-runtime.lib";
import type { MessengerMessage, MessengerStream } from "./messenger.types";

vi.mock("./chat-crypto-runtime.lib", () => ({ decryptRealChatMessageResult: vi.fn() }));

const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const TOPIC_UUID = "22222222-2222-4222-8222-222222222222";
const MESSAGE_UUID = "33333333-3333-4333-8333-333333333333";
const KEY_UUID = "44444444-4444-4444-8444-444444444444";
const runtime: WorkspaceRuntimeContext = {
  accountId: "account",
  instanceId: "instance",
  organizationId: "organization",
  projectId: "project",
  userUuid: "reader",
  organizationOrigin: "https://example.test",
  accessToken: "synthetic-token",
  runtimeGeneration: 1,
};
const owner = workspaceRuntimeOwnerKey(runtime);
const message: MessengerMessage = {
  uuid: MESSAGE_UUID,
  conversationId: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
  projectId: runtime.projectId,
  streamUuid: STREAM_UUID,
  topicUuid: TOPIC_UUID,
  authorUuid: "another-participant",
  userUuid: runtime.userUuid,
  payload: { kind: "e2ee", keyUuid: KEY_UUID, content: "encoded-envelope" },
  read: false,
  pinned: false,
  starred: false,
  isOwn: false,
  reactions: {},
  reactionUserUuidsByEmojiName: {},
  ownReactionUuidsByEmojiName: {},
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};
const stream: MessengerStream = {
  uuid: STREAM_UUID,
  projectId: runtime.projectId,
  userUuid: runtime.userUuid,
  ownerUuid: "another-participant",
  role: "member",
  notificationMode: "all_messages",
  name: "Native chat",
  description: "",
  unreadCount: 0,
  sourceName: "native",
  audience: "channel",
  isPrivate: true,
  encryption: false,
  currentEncryptionKey: null,
  inviteOnly: true,
  announce: false,
  isArchived: false,
  directUserUuid: null,
  lastMessageUuid: MESSAGE_UUID,
  createdAt: message.createdAt,
  updatedAt: message.updatedAt,
};
type PreparationInput = Parameters<typeof canPrepareMessengerEncryptedMessage>[0];
const input: PreparationInput = {
  runtime,
  message,
  stream,
  catalogOwner: owner,
  messageOwner: owner,
};

afterEach(() => vi.resetAllMocks());

describe("message content dispatch", () => {
  it("returns ordinary Markdown and service payloads immediately without cryptography", async () => {
    const ordinary: MessengerMessage = {
      ...message,
      payload: { kind: "markdown", content: "Public **text**" },
    };
    const service: MessengerMessage = {
      ...message,
      payload: { kind: "key_announced", keyUuid: KEY_UUID },
    };
    const markdownContent = { status: "ready", kind: "markdown", markdown: "Public **text**" };
    const serviceContent = { status: "ready", kind: "service", payload: service.payload };

    expect(getImmediateMessengerMessageContent(ordinary)).toEqual(markdownContent);
    expect(getImmediateMessengerMessageContent(service)).toEqual(serviceContent);
    expect(await prepareMessengerMessageContent(runtime, ordinary, () => true)).toEqual(
      markdownContent,
    );
    expect(await prepareMessengerMessageContent(runtime, service, () => true)).toEqual(
      serviceContent,
    );
    expect(decryptRealChatMessageResult).not.toHaveBeenCalled();
    expect(getImmediateMessengerMessageContent(message)).toBeNull();
  });

  it("keeps content identity across metadata updates and invalidates edited ciphertext", () => {
    expect(
      getMessengerMessageContentKey({
        ...message,
        read: true,
        reactions: { heart: 2 },
        updatedAt: "2026-10-02T00:00:00Z",
      }),
    ).toBe(getMessengerMessageContentKey(message));
    expect(
      getMessengerMessageContentKey({
        ...message,
        payload: { kind: "e2ee", keyUuid: KEY_UUID, content: "changed-envelope" },
      }),
    ).not.toBe(getMessengerMessageContentKey(message));
    expect(getMessengerMessageContentKey({ ...message, streamUuid: "another-stream" })).not.toBe(
      getMessengerMessageContentKey(message),
    );
  });
});

describe("encrypted message capability", () => {
  it("accepts native encrypted payloads with no channel-wide key or author restriction", () => {
    expect(canPrepareMessengerEncryptedMessage(input)).toBe(true);
    expect(
      canPrepareMessengerEncryptedMessage({
        ...input,
        stream: {
          ...stream,
          encryption: true,
          currentEncryptionKey: { keyUuid: "different-generation" },
        },
      }),
    ).toBe(true);
  });

  const invalidInputs: readonly {
    name: string;
    change: Partial<PreparationInput>;
  }[] = [
    { name: "missing runtime", change: { runtime: null } },
    { name: "catalog owner mismatch", change: { catalogOwner: "other" } },
    { name: "message owner mismatch", change: { messageOwner: null } },
    {
      name: "message project mismatch",
      change: { message: { ...message, projectId: "other" } },
    },
    { name: "missing stream", change: { stream: undefined } },
    {
      name: "stream UUID mismatch",
      change: { stream: { ...stream, uuid: "other" } },
    },
    {
      name: "stream project mismatch",
      change: { stream: { ...stream, projectId: "other" } },
    },
    {
      name: "stream user mismatch",
      change: { stream: { ...stream, userUuid: "other" } },
    },
    {
      name: "unsupported external stream",
      change: { stream: { ...stream, sourceName: "zulip", encryption: false } },
    },
    {
      name: "ordinary Markdown",
      change: { message: { ...message, payload: { kind: "markdown", content: "Public" } } },
    },
  ];
  it.each(invalidInputs)("rejects $name", ({ change }) => {
    expect(canPrepareMessengerEncryptedMessage({ ...input, ...change })).toBe(false);
    expect(decryptRealChatMessageResult).not.toHaveBeenCalled();
  });
});

describe("asynchronous encrypted content", () => {
  it("delegates the exact historical envelope and returns Markdown without mutating its input", async () => {
    const isCurrent = () => true;
    const payloadBefore = { ...message.payload };
    vi.mocked(decryptRealChatMessageResult).mockResolvedValue({
      status: "ready",
      plaintext: "Private **text**",
    });

    expect(await prepareMessengerMessageContent(runtime, message, isCurrent)).toEqual({
      status: "ready",
      kind: "markdown",
      markdown: "Private **text**",
    });
    expect(decryptRealChatMessageResult).toHaveBeenCalledExactlyOnceWith(
      runtime,
      message,
      isCurrent,
    );
    expect(message.payload).toEqual(payloadBefore);
  });

  it.each<RealChatMessageDecryption>([
    { status: "missing-key" },
    { status: "error" },
    { status: "error", canRequestKey: true },
  ])("preserves unavailable content state %j", async (result) => {
    vi.mocked(decryptRealChatMessageResult).mockResolvedValue(result);
    expect(await prepareMessengerMessageContent(runtime, message, () => true)).toEqual(result);
  });

  it("does not start decryption for invalidated work", async () => {
    expect(await prepareMessengerMessageContent(runtime, message, () => false)).toEqual({
      status: "missing-key",
    });
    expect(decryptRealChatMessageResult).not.toHaveBeenCalled();
  });

  it("rejects plaintext completed after runtime or key invalidation", async () => {
    let resolve!: (value: RealChatMessageDecryption) => void;
    vi.mocked(decryptRealChatMessageResult).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    let current = true;
    const result = prepareMessengerMessageContent(runtime, message, () => current);
    current = false;
    resolve({ status: "ready", plaintext: "Stale secret" });
    expect(await result).toEqual({ status: "missing-key" });
  });

  it("returns a retryable error if the crypto boundary unexpectedly rejects", async () => {
    vi.mocked(decryptRealChatMessageResult).mockRejectedValue(new Error("storage-unavailable"));
    expect(await prepareMessengerMessageContent(runtime, message, () => true)).toEqual({
      status: "error",
    });
  });
});
