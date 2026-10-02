import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type {
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerTopicDto,
} from "~/shared/api/messenger.types";
import {
  createInsecureSandboxProvider,
  E2EE_SANDBOX_FIXTURE_TEXT,
} from "./chat-e2ee-dev-provider.lib";
import { createDevChatE2eeSandbox, isE2eeSandboxRuntimeAllowed } from "./chat-e2ee-dev-sandbox.lib";

const runtime: WorkspaceRuntimeContext = {
  accountId: "a",
  instanceId: "i",
  organizationId: "o",
  projectId: "11111111-1111-4111-8111-111111111111",
  userUuid: "22222222-2222-4222-8222-222222222222",
  organizationOrigin: "http://127.0.0.1:23190",
  accessToken: "fixture-session",
  runtimeGeneration: 1,
};
type Api = NonNullable<Parameters<typeof createDevChatE2eeSandbox>[0]["api"]>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { resolve, promise };
}

function fixture() {
  let current: WorkspaceRuntimeContext | null = runtime;
  const date = "2026-10-02T00:00:00Z";
  const stream: WorkspaceMessengerStreamDto = {
    uuid: "33333333-3333-4333-8333-333333333333",
    name: "",
    description: "",
    project_id: runtime.projectId,
    owner: runtime.userUuid,
    user_uuid: runtime.userUuid,
    role: "owner",
    notification_mode: "all_messages",
    unread_count: 0,
    active_unread_count: 0,
    passive_unread_count: 0,
    source_name: "native",
    source: { kind: "native" },
    invite_only: true,
    announce: false,
    private: false,
    encryption: true,
    is_archived: false,
    created_at: date,
    updated_at: date,
  };
  const topic: WorkspaceMessengerTopicDto = {
    uuid: "44444444-4444-4444-8444-444444444444",
    project_id: runtime.projectId,
    name: "General",
    stream_uuid: stream.uuid,
    user_uuid: runtime.userUuid,
    unread_count: 0,
    active_unread_count: 0,
    passive_unread_count: 0,
    is_default: true,
    is_done: false,
    notification_mode: "default",
    created_at: date,
    updated_at: date,
  };
  const messages: WorkspaceMessengerMessageDto[] = [];
  const api = {
    createStreamWithDefaultTopic: vi.fn<Api["createStreamWithDefaultTopic"]>((_options, body) => {
      stream.name = body.name;
      stream.current_encryption_key = body.current_encryption_key;
      return Promise.resolve({ stream, defaultTopic: topic });
    }),
    getStream: vi.fn<Api["getStream"]>(() => Promise.resolve(stream)),
    getMessagesPage: vi.fn<Api["getMessagesPage"]>(() =>
      Promise.resolve({ items: [...messages], nextPageMarker: null, pageLimit: 100 }),
    ),
    createMessage: vi.fn<Api["createMessage"]>((_options, body) => {
      const message: WorkspaceMessengerMessageDto = {
        uuid: body.uuid ?? crypto.randomUUID(),
        project_id: runtime.projectId,
        stream_uuid: body.stream_uuid,
        topic_uuid: body.topic_uuid,
        author_uuid: runtime.userUuid,
        payload: body.payload,
        user_uuid: runtime.userUuid,
        read: false,
        pinned: false,
        starred: false,
        is_own: true,
        reactions: {},
        reaction_users: {},
        created_at: date,
        updated_at: date,
      };
      messages.push(message);
      return Promise.resolve(message);
    }),
  };
  const sandbox = createDevChatE2eeSandbox({ runtime, getCurrentRuntime: () => current, api });
  return {
    sandbox,
    api,
    stream,
    topic,
    messages,
    setCurrent: (next: WorkspaceRuntimeContext | null) => {
      current = next;
    },
  };
}

describe("development E2EE integration sandbox", () => {
  beforeEach(() => vi.stubEnv("DEV", true));
  afterEach(() => vi.unstubAllEnvs());

  it("is disabled in production even for a loopback backend", () => {
    vi.stubEnv("DEV", false);
    expect(isE2eeSandboxRuntimeAllowed(runtime)).toBe(false);
    expect(() => createDevChatE2eeSandbox({ runtime, getCurrentRuntime: () => runtime })).toThrow(
      "development",
    );
    expect(() => createInsecureSandboxProvider()).toThrow("development");
  });

  it.each([
    "https://workspace.example.com",
    "http://192.168.1.20:23190",
    "http://localhost:23190/api",
    "http://localhost:23190?target=remote",
    "http://user:password@localhost:23190",
  ])("rejects nonlocal or invalid proxy target %s", (organizationOrigin) => {
    const invalid = { ...runtime, organizationOrigin };
    expect(isE2eeSandboxRuntimeAllowed(invalid)).toBe(false);
    expect(() =>
      createDevChatE2eeSandbox({ runtime: invalid, getCurrentRuntime: () => invalid }),
    ).toThrow("loopback");
  });

  it("creates only a new fixture stream and runs request/grant/history/decrypt through API payloads", async () => {
    const f = fixture();
    await expect(f.sandbox.sendFixture()).rejects.toThrow("first");
    expect(f.api.createMessage).not.toHaveBeenCalled();
    await f.sandbox.initialize();
    const creation = f.api.createStreamWithDefaultTopic.mock.calls[0];
    expect(creation?.[1]).toMatchObject({
      encryption: true,
      source_name: "native",
      invite_only: true,
    });
    expect(creation?.[1].name).toMatch(/^INSECURE E2EE TEST /);
    expect(creation?.[0]).toMatchObject({
      baseUrl: "/api/workspace/v1/messenger",
      devTargetOrigin: runtime.organizationOrigin,
    });
    await f.sandbox.sendFixture();
    await f.sandbox.switchDevice("recipient");
    expect(f.sandbox.getSnapshot().state?.access).toBe("metadata-only");
    expect(
      f.sandbox.getSnapshot().messages.find((message) => message.kind === "e2ee")?.plaintext,
    ).toBeNull();
    await f.sandbox.requestKey();
    await f.sandbox.switchDevice("issuer");
    await f.sandbox.respondToRequest(false);
    await f.sandbox.switchDevice("recipient");
    await f.sandbox.reload();
    expect(f.sandbox.getSnapshot().state?.access).toBe("ready");
    expect(
      f.sandbox.getSnapshot().messages.find((message) => message.kind === "e2ee")?.plaintext,
    ).toBe(E2EE_SANDBOX_FIXTURE_TEXT);
    expect(f.messages.map((message) => message.payload.kind)).toEqual([
      "key_announced",
      "e2ee",
      "key_request",
      "key_grant",
    ]);
    expect(f.api.getMessagesPage.mock.calls[0]?.[1]).toMatchObject({
      streamUuid: f.stream.uuid,
      sortDir: "asc",
    });
    expect(
      f.api.createMessage.mock.calls.every(([, body]) => body.stream_uuid === f.stream.uuid),
    ).toBe(true);
    await expect(f.sandbox.initialize()).rejects.toThrow("already");
    expect(f.api.createStreamWithDefaultTopic).toHaveBeenCalledTimes(1);
  });

  it("uses fixture issuance permissions and rejection never fabricates access", async () => {
    const f = fixture();
    await f.sandbox.initialize();
    await f.sandbox.switchDevice("recipient");
    await f.sandbox.requestKey();
    await expect(f.sandbox.respondToRequest(false)).rejects.toThrow("forbidden");
    await f.sandbox.switchDevice("issuer");
    await f.sandbox.respondToRequest(true);
    await f.sandbox.switchDevice("recipient");
    expect(f.sandbox.getSnapshot().state).toMatchObject({
      access: "metadata-only",
      requestStatus: "rejected",
    });
    expect(f.messages.at(-1)?.payload.kind).toBe("key_reject");
  });

  it("does not continue initialization or send an announcement after an owner A-B-A switch", async () => {
    const f = fixture();
    const started = deferred<void>();
    const created = deferred<Awaited<ReturnType<Api["createStreamWithDefaultTopic"]>>>();
    const original = f.api.createStreamWithDefaultTopic.getMockImplementation();
    f.api.createStreamWithDefaultTopic.mockImplementation((options, body) => {
      void original?.(options, body);
      started.resolve();
      return created.promise;
    });
    const initializing = f.sandbox.initialize();
    await started.promise;
    f.setCurrent({ ...runtime, accountId: "b", runtimeGeneration: 2 });
    f.setCurrent({ ...runtime, runtimeGeneration: 3 });
    created.resolve({
      stream: f.stream,
      defaultTopic: f.topic,
    });
    await expect(initializing).rejects.toThrow("stale");
    expect(f.api.getStream).not.toHaveBeenCalled();
    expect(f.api.createMessage).not.toHaveBeenCalled();
    expect(f.sandbox.getSnapshot().messages).toEqual([]);
  });

  it("does not apply late history after disposal", async () => {
    const f = fixture();
    await f.sandbox.initialize();
    const started = deferred<void>();
    const page = deferred<Awaited<ReturnType<Api["getMessagesPage"]>>>();
    f.api.getMessagesPage.mockImplementation(() => {
      started.resolve();
      return page.promise;
    });
    const loading = f.sandbox.reload();
    await started.promise;
    f.sandbox.dispose();
    page.resolve({ items: f.messages, nextPageMarker: null, pageLimit: 100 });
    await expect(loading).rejects.toThrow("stale");
    expect(f.sandbox.getSnapshot().messages).toEqual([]);
    expect(f.sandbox.getSnapshot().state).toBeNull();
  });

  it("the mock accepts fixed fixture data only", async () => {
    const provider = createInsecureSandboxProvider();
    const pair = await provider.createGroupKey();
    if (!pair.ok) throw new Error("fixture");
    const result = await provider.encryptMessage({
      plaintext: new TextEncoder().encode("arbitrary user data"),
      groupKey: pair.value,
      context: { streamUuid: "test", keyUuid: "test" },
    });
    expect(result).toEqual({ ok: false, reason: "invalid-ciphertext" });
  });
});
