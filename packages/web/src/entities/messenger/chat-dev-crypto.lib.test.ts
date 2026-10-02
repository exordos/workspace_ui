import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";
import type {
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerCreateMessageRequestBody,
} from "~/shared/api/messenger.types";
import {
  canUseDevChatCrypto,
  createDevChatCryptoProvider,
  decodeDevChatMessageForPresentation,
  pinDevChatCryptoRequestOptions,
} from "./chat-dev-crypto.lib";
import { sendDevEncryptedMessengerMessage } from "./chat-dev-message-actions.lib";
import { DEV_CHAT_PUBLIC_KEY_MARKER } from "./chat-initial-key-bootstrap.lib";
import { adaptMessengerMessage, adaptMessengerStream } from "./messenger-adapters.lib";
import { useMessengerStore } from "./messenger.model";
const ACCOUNT_A = "account-a";
const INSTANCE_A = "instance-a";
const ORGANIZATION_A = "organization-a";
const PROJECT_A = "22222222-2222-4222-8222-222222222222";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "44444444-4444-4444-8444-444444444444";
const STREAM_A = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_A = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const MESSAGE_A = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const DATE = "2026-06-22T10:10:00Z";

function createRuntimeContext(
  overrides: Partial<WorkspaceRuntimeContext> = {},
): WorkspaceRuntimeContext {
  return {
    accountId: ACCOUNT_A,
    instanceId: INSTANCE_A,
    organizationId: ORGANIZATION_A,
    organizationOrigin: "http://127.0.0.1:23190",
    projectId: PROJECT_A,
    userUuid: USER_A,
    accessToken: "access-token-a",
    runtimeGeneration: 1,
    ...overrides,
  };
}

function createMessageDto(
  overrides: Partial<WorkspaceMessengerMessageDto> = {},
): WorkspaceMessengerMessageDto {
  return {
    uuid: MESSAGE_A,
    project_id: PROJECT_A,
    stream_uuid: STREAM_A,
    topic_uuid: TOPIC_A,
    author_uuid: USER_A,
    payload: {
      kind: "markdown",
      content: "Hello, workspace",
    },
    user_uuid: USER_A,
    read: false,
    pinned: false,
    starred: false,
    is_own: true,
    reactions: {},
    reaction_users: {},
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function createStreamDto(
  overrides: Partial<WorkspaceMessengerStreamDto> = {},
): WorkspaceMessengerStreamDto {
  return {
    uuid: STREAM_A,
    name: "Engineering",
    description: "Engineering workspace",
    project_id: PROJECT_A,
    owner: USER_A,
    user_uuid: USER_A,
    role: "owner",
    notification_mode: "all_messages",
    unread_count: 0,
    active_unread_count: 0,
    passive_unread_count: 0,
    source_name: "native",
    source: { kind: "native" },
    invite_only: false,
    announce: false,
    private: false,
    is_archived: false,
    direct_user_uuid: null,
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

const KEY_A = "99999999-9999-4999-8999-999999999999";
function encryptedStream(overrides: Partial<WorkspaceMessengerStreamDto> = {}) {
  return createStreamDto({
    encryption: true,
    current_encryption_key: { key_uuid: KEY_A, key_fingerprint: btoa(DEV_CHAT_PUBLIC_KEY_MARKER) },
    ...overrides,
  });
}
function prepare(publicKey = btoa(DEV_CHAT_PUBLIC_KEY_MARKER)) {
  const runtime = createRuntimeContext();
  const stream = adaptMessengerStream(
    encryptedStream({ current_encryption_key: { key_uuid: KEY_A, key_fingerprint: publicKey } }),
  );
  const owner = workspaceRuntimeOwnerKey(runtime);
  useMessengerStore.getState().startBootstrap(owner);
  useMessengerStore.getState().upsertStream(owner, stream);
  const apply = vi.fn();
  const cache = vi.fn();
  const store = {
    getState: () => ({ ...useWorkspaceMessageStore.getState(), applyLiveCreatedMessage: apply }),
  };
  return { runtime, stream, owner, apply, cache, store };
}

describe("local test crypto", () => {
  beforeEach(() => {
    vi.stubEnv("DEV", true);
    useMessengerStore.getState().clear();
  });
  afterEach(() => vi.unstubAllEnvs());
  it.each([btoa(DEV_CHAT_PUBLIC_KEY_MARKER), btoa("FIX")])(
    "sends only encoded e2ee payload and restores local presentation with fixture %s",
    async (publicKey) => {
      const s = prepare(publicKey);
      const text = "Привет **мир** <script>local</script>";
      const create = vi.fn(
        (_options: MessengerClientOptions, body: WorkspaceMessengerCreateMessageRequestBody) =>
          Promise.resolve(createMessageDto({ uuid: body.uuid, payload: body.payload })),
      );
      const result = await sendDevEncryptedMessengerMessage({
        runtimeContext: s.runtime,
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
        markdown: text,
        canonicalMessageUuid: MESSAGE_A,
        store: s.store,
        cache: { writeConversationMessagePage: s.cache },
        client: {
          getStream: () =>
            Promise.resolve(
              encryptedStream({
                current_encryption_key: { key_uuid: KEY_A, key_fingerprint: publicKey },
              }),
            ),
          createMessage: create,
        },
      });
      expect(result.status).toBe("applied");
      expect(create.mock.calls[0]?.[0]).toMatchObject({
        baseUrl: "/api/workspace/v1/messenger",
        devTargetOrigin: s.runtime.organizationOrigin,
      });
      const message = s.apply.mock.calls[0]?.[0];
      expect(message.payload.kind).toBe("e2ee");
      expect(
        decodeDevChatMessageForPresentation(s.runtime, s.stream, {
          ...message,
          projectId: STREAM_A,
        }),
      ).toBeNull();
      expect(message.payload.content).not.toContain(text);
      expect(s.cache.mock.calls[0]?.[2].messages[0]).toEqual(message);
      expect(decodeDevChatMessageForPresentation(s.runtime, s.stream, message)).toBe(text);
      expect(
        decodeDevChatMessageForPresentation(
          createRuntimeContext({ runtimeGeneration: 3 }),
          adaptMessengerStream(
            encryptedStream({
              current_encryption_key: { key_uuid: KEY_A, key_fingerprint: publicKey },
            }),
          ),
          message,
        ),
      ).toBe(text);
      expect(
        decodeDevChatMessageForPresentation(
          s.runtime,
          { ...s.stream, uuid: STREAM_A + "other" },
          message,
        ),
      ).toBeNull();
      expect(
        decodeDevChatMessageForPresentation(
          s.runtime,
          {
            ...s.stream,
            currentEncryptionKey: {
              keyUuid: STREAM_A,
              keyFingerprint: btoa(DEV_CHAT_PUBLIC_KEY_MARKER),
            },
          },
          message,
        ),
      ).toBeNull();
    },
  );
  it.each([false, true])("refuses production or remote runtime dev=%s", async (dev) => {
    vi.stubEnv("DEV", dev);
    const s = prepare();
    const runtime = dev
      ? createRuntimeContext({ organizationOrigin: "https://remote.example.com" })
      : s.runtime;
    expect(canUseDevChatCrypto(runtime, s.stream)).toBe(false);
    expect(createDevChatCryptoProvider(runtime, s.stream)).toBeNull();
    const create = vi.fn();
    await expect(
      sendDevEncryptedMessengerMessage({
        runtimeContext: runtime,
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
        markdown: "local",
        client: { createMessage: create },
      }),
    ).rejects.toThrow("unavailable");
    expect(create).not.toHaveBeenCalled();
  });
  it.each(["http://localhost:23191", "https://remote.example.com"])(
    "rejects target override %s",
    (target) =>
      expect(() =>
        pinDevChatCryptoRequestOptions(createRuntimeContext(), {
          accessToken: "test",
          devTargetOrigin: target,
        }),
      ).toThrow("unavailable"),
  );
  it.each(["https://remote.example.com", "//remote.example.com", "/api/other"])(
    "rejects arbitrary API base %s",
    (baseUrl) => {
      const runtime = createRuntimeContext();
      expect(() =>
        pinDevChatCryptoRequestOptions(runtime, {
          accessToken: "test",
          devTargetOrigin: runtime.organizationOrigin,
          baseUrl,
        }),
      ).toThrow("unavailable");
    },
  );
  it("keeps malformed envelope and incompatible keys locked", () => {
    const s = prepare();
    const message = adaptMessengerMessage(
      createMessageDto({ payload: { kind: "e2ee", key_uuid: KEY_A, content: btoa("not json") } }),
    );
    expect(decodeDevChatMessageForPresentation(s.runtime, s.stream, message)).toBeNull();
    expect(
      canUseDevChatCrypto(s.runtime, {
        ...s.stream,
        currentEncryptionKey: { keyUuid: KEY_A, keyFingerprint: btoa("OTHER") },
      }),
    ).toBe(false);
  });
  it.each(["plaintext", "wrong-key", "wrong-author"])(
    "rejects API response %s before store/cache",
    async (variant) => {
      const s = prepare();
      await expect(
        sendDevEncryptedMessengerMessage({
          runtimeContext: s.runtime,
          streamUuid: STREAM_A,
          topicUuid: TOPIC_A,
          markdown: "local",
          canonicalMessageUuid: MESSAGE_A,
          store: s.store,
          cache: { writeConversationMessagePage: s.cache },
          client: {
            getStream: () => Promise.resolve(encryptedStream()),
            createMessage: (_options, body) =>
              Promise.resolve(
                createMessageDto({
                  uuid: body.uuid,
                  author_uuid: variant === "wrong-author" ? USER_B : USER_A,
                  payload:
                    variant === "plaintext"
                      ? { kind: "markdown", content: "local" }
                      : variant === "wrong-key"
                        ? { kind: "e2ee", key_uuid: STREAM_A, content: "AQID" }
                        : body.payload,
                }),
              ),
          },
        }),
      ).rejects.toThrow("response mismatch");
      expect(s.apply).not.toHaveBeenCalled();
      expect(s.cache).not.toHaveBeenCalled();
    },
  );
  it.each(["owner", "key", "remove", "public-key"])(
    "skips late API result after invalidation %s",
    async (mode) => {
      const s = prepare();
      let runtime = s.runtime;
      let finish!: (value: WorkspaceMessengerMessageDto) => void;
      let sent!: WorkspaceMessengerMessageDto;
      const response = new Promise<WorkspaceMessengerMessageDto>((resolve) => {
        finish = resolve;
      });
      const action = sendDevEncryptedMessengerMessage({
        runtimeContext: s.runtime,
        getRuntimeContext: () => runtime,
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
        markdown: "local",
        canonicalMessageUuid: MESSAGE_A,
        store: s.store,
        cache: { writeConversationMessagePage: s.cache },
        client: {
          getStream: () => Promise.resolve(encryptedStream()),
          createMessage: (_options, body) => {
            sent = createMessageDto({ uuid: body.uuid, payload: body.payload });
            return response;
          },
        },
      });
      await vi.waitFor(() => expect(sent).toBeDefined());
      if (mode === "owner") runtime = createRuntimeContext({ runtimeGeneration: 3 });
      else if (mode === "key")
        useMessengerStore.getState().upsertStream(s.owner, {
          ...s.stream,
          currentEncryptionKey: {
            keyUuid: STREAM_A,
            keyFingerprint: btoa(DEV_CHAT_PUBLIC_KEY_MARKER),
          },
        });
      else if (mode === "public-key")
        useMessengerStore.getState().upsertStream(s.owner, {
          ...s.stream,
          currentEncryptionKey: { keyUuid: KEY_A, keyFingerprint: btoa("FIX") },
        });
      else useMessengerStore.setState({ streamsById: {} });
      finish(sent);
      expect(await action).toMatchObject({ status: "skipped", reason: "stale-owner" });
      expect(s.apply).not.toHaveBeenCalled();
      expect(s.cache).not.toHaveBeenCalled();
    },
  );
});
