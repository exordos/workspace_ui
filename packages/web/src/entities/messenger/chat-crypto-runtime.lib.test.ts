import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { createMessage } from "~/shared/api/messenger-messages.api";
import { getStream, getStreamBindingsPage } from "~/shared/api/messenger-streams.api";
import type {
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerStreamDto,
} from "~/shared/api/messenger.types";
import { realChatKeyStorage } from "./chat-crypto-resources.lib";
import { openRealChatSession, decryptRealChatMessage } from "./chat-crypto-runtime.lib";
import { realChatInitialKeyBootstrap } from "./chat-real-key-bootstrap.lib";
import { adaptMessengerMessage, adaptMessengerStream } from "./messenger-adapters.lib";
import { useMessengerStore } from "./messenger.model";

vi.mock("~/shared/api/messenger-streams.api", async (load) => ({
  ...(await load<typeof import("~/shared/api/messenger-streams.api")>()),
  getStream: vi.fn(),
  getStreamBindingsPage: vi.fn(),
}));
vi.mock("~/shared/api/messenger-messages.api", async (load) => ({
  ...(await load<typeof import("~/shared/api/messenger-messages.api")>()),
  createMessage: vi.fn(),
}));

const STREAM = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const TOPIC = "33333333-3333-4333-8333-333333333333";
const ADMIN = "44444444-4444-4444-8444-444444444444";
const MEMBER = "55555555-5555-4555-8555-555555555555";
const DATE = "2026-10-02T00:00:00Z";
function runtime(user = ADMIN): WorkspaceRuntimeContext {
  return {
    accountId: crypto.randomUUID(),
    instanceId: "instance",
    organizationId: "organization",
    projectId: PROJECT,
    userUuid: user,
    organizationOrigin: "http://127.0.0.1:23190",
    accessToken: user,
    runtimeGeneration: 1,
  };
}

async function setup() {
  const admin = runtime();
  const member = runtime(MEMBER);
  const metadata = await realChatInitialKeyBootstrap.prepare({
    runtimeContext: admin,
    isCurrent: () => true,
  });
  const fingerprint = btoa(String.fromCharCode(...metadata.keyFingerprint.bytes));
  const stream = (user: string): WorkspaceMessengerStreamDto => ({
    uuid: STREAM,
    project_id: PROJECT,
    name: "Real encrypted test",
    description: "",
    owner: ADMIN,
    user_uuid: user,
    role: user === ADMIN ? "owner" : "member",
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
    encryption: true,
    current_encryption_key: { key_uuid: metadata.keyUuid, key_fingerprint: fingerprint },
    created_at: DATE,
    updated_at: DATE,
  });
  vi.mocked(getStream).mockImplementation((options) =>
    Promise.resolve(stream(options.accessToken ?? ADMIN)),
  );
  vi.mocked(getStreamBindingsPage).mockResolvedValue({
    items: [],
    nextPageMarker: null,
    pageLimit: 100,
  });
  const wire: WorkspaceMessengerMessageDto[] = [];
  vi.mocked(createMessage).mockImplementation((options, body) => {
    const message: WorkspaceMessengerMessageDto = {
      uuid: body.uuid ?? crypto.randomUUID(),
      stream_uuid: body.stream_uuid,
      topic_uuid: body.topic_uuid,
      project_id: PROJECT,
      user_uuid: options.accessToken ?? ADMIN,
      author_uuid: options.accessToken ?? ADMIN,
      payload: body.payload,
      read: false,
      pinned: false,
      starred: false,
      is_own: true,
      reactions: {},
      reaction_users: {},
      created_at: DATE,
      updated_at: DATE,
    };
    wire.push(message);
    return Promise.resolve(message);
  });
  useMessengerStore.setState({
    ownerKey: null,
    streamsById: {},
    streamBindingsById: {},
    topicsById: {
      [TOPIC]: {
        uuid: TOPIC,
        projectId: PROJECT,
        streamUuid: STREAM,
        userUuid: ADMIN,
        name: "",
        unreadCount: 0,
        isDefault: true,
        isDone: false,
        lastMessageUuid: null,
        notificationMode: "default",
        createdAt: DATE,
        updatedAt: DATE,
      },
    },
  });
  return { admin, member, metadata, wire, stream };
}
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.clearAllMocks();
});

describe("real ordinary chat orchestration", () => {
  it("restores a staged creator key after a lost create response and serializes concurrent sends to distinct topics", async () => {
    const f = await setup();
    const session = await openRealChatSession({
      runtimeContext: f.admin,
      streamUuid: STREAM,
      getRuntimeContext: () => f.admin,
    });
    await session.load();
    expect(session.getState().access).toBe("ready");
    const scopes = { owner: f.admin, deviceId: session.device.deviceId };
    expect(await realChatKeyStorage.listStagedCreations(scopes)).toEqual([]);
    const secondTopic = crypto.randomUUID();
    const sent = await Promise.all([
      session.send({ text: "first private text", topicUuid: TOPIC }),
      session.send({ text: "second private text", topicUuid: secondTopic }),
    ]);
    expect(sent.every((result) => result.status === "applied")).toBe(true);
    expect(f.wire.map((message) => message.topic_uuid)).toEqual([TOPIC, secondTopic]);
    expect(JSON.stringify(f.wire)).not.toContain("private text");
    expect(await session.decrypt(adaptMessengerMessage(f.wire[0]!))).toBe("first private text");
    expect(await session.decrypt(adaptMessengerMessage(f.wire[1]!))).toBe("second private text");
    session.dispose();
  });

  it("completes a real HPKE grant after a recipient session reload and keeps plaintext outside wire messages", async () => {
    const f = await setup();
    const admin = await openRealChatSession({
      runtimeContext: f.admin,
      streamUuid: STREAM,
      getRuntimeContext: () => f.admin,
    });
    await admin.load();
    await admin.send({ text: "protected history", topicUuid: TOPIC });
    let member = await openRealChatSession({
      runtimeContext: f.member,
      streamUuid: STREAM,
      getRuntimeContext: () => f.member,
    });
    await member.load();
    expect(await member.decrypt(adaptMessengerMessage(f.wire[0]!))).toBeNull();
    expect(member.getRights().canGrant).toBe(false);
    await member.requestKey();
    const request = f.wire.at(-1)!;
    const pending = await realChatKeyStorage.listPendingRequests(member.scope);
    expect(pending).toHaveLength(1);
    member.dispose();
    member = await openRealChatSession({
      runtimeContext: f.member,
      streamUuid: STREAM,
      getRuntimeContext: () => f.member,
    });
    await member.load();
    expect(member.getState().requestStatus).toBe("requested");
    await admin.ingest(f.wire.map(adaptMessengerMessage));
    await admin.grantKey(request.uuid);
    await member.ingest(f.wire.map(adaptMessengerMessage));
    expect(member.getState().access).toBe("ready");
    expect(await realChatKeyStorage.listPendingRequests(member.scope)).toEqual([]);
    expect(await member.decrypt(adaptMessengerMessage(f.wire[0]!))).toBe("protected history");
    await member.send({ text: "member reply", topicUuid: TOPIC });
    expect(await admin.decrypt(adaptMessengerMessage(f.wire.at(-1)!))).toBe("member reply");
    expect(JSON.stringify(f.wire)).not.toContain("protected history");
    expect(JSON.stringify(f.wire)).not.toContain("member reply");
    admin.dispose();
    member.dispose();
  });

  it("fails closed for legacy fixture fingerprints and does not dispatch messages", async () => {
    const f = await setup();
    vi.mocked(getStream).mockResolvedValue({
      ...f.stream(ADMIN),
      current_encryption_key: { key_uuid: f.metadata.keyUuid, key_fingerprint: btoa("FIX") },
    });
    await expect(
      openRealChatSession({
        runtimeContext: f.admin,
        streamUuid: STREAM,
        getRuntimeContext: () => f.admin,
      }),
    ).rejects.toThrow("invalid-key");
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("discards decoded content and queued actions after an owner generation change", async () => {
    const f = await setup();
    let current = f.admin;
    const session = await openRealChatSession({
      runtimeContext: f.admin,
      streamUuid: STREAM,
      getRuntimeContext: () => current,
    });
    await session.load();
    await session.send({ text: "before switch", topicUuid: TOPIC });
    current = { ...f.admin, runtimeGeneration: 3 };
    const count = f.wire.length;
    await expect(session.send({ text: "after switch", topicUuid: TOPIC })).rejects.toThrow("stale");
    expect(f.wire).toHaveLength(count);
    expect(
      await decryptRealChatMessage(f.admin, adaptMessengerMessage(f.wire[0]!), () => false),
    ).toBeNull();
    session.dispose();
  });
  it("accepts a semantically identical encrypted response with reordered JSON fields", async () => {
    const f = await setup();
    const session = await openRealChatSession({
      runtimeContext: f.admin,
      streamUuid: STREAM,
      getRuntimeContext: () => f.admin,
    });
    await session.load();
    const create = vi.mocked(createMessage).getMockImplementation();
    if (!create) throw new Error("missing fixture");
    vi.mocked(createMessage).mockImplementationOnce(async (options, body) => {
      const message = await create(options, body);
      if (message.payload.kind !== "e2ee") throw new Error("wrong fixture");
      return {
        ...message,
        payload: {
          content: message.payload.content,
          key_uuid: message.payload.key_uuid,
          kind: "e2ee",
        },
      };
    });
    expect((await session.send({ text: "ordered response", topicUuid: TOPIC })).status).toBe(
      "applied",
    );
    expect(f.wire).toHaveLength(1);
    session.dispose();
  });
  it("does not overwrite a realtime role revocation with an older pending REST snapshot", async () => {
    const f = await setup();
    const owner = workspaceRuntimeOwnerKey(f.admin);
    useMessengerStore.getState().startBootstrap(owner);
    useMessengerStore.getState().upsertStream(owner, adaptMessengerStream(f.stream(ADMIN)));
    const session = await openRealChatSession({
      runtimeContext: f.admin,
      streamUuid: STREAM,
      getRuntimeContext: () => f.admin,
    });
    await session.load();
    let release!: () => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(getStreamBindingsPage).mockImplementationOnce(async () => {
      started();
      await gate;
      return { items: [], nextPageMarker: null, pageLimit: 100 };
    });
    const sending = session.send({ text: "must not be dispatched", topicUuid: TOPIC });
    const rejected = expect(sending).rejects.toThrow("forbidden");
    await startedPromise;
    useMessengerStore
      .getState()
      .upsertStream(
        owner,
        adaptMessengerStream({ ...f.stream(ADMIN), owner: MEMBER, role: "member" }),
      );
    release();
    await rejected;
    expect(useMessengerStore.getState().streamsById[STREAM]?.ownerUuid).toBe(MEMBER);
    expect(createMessage).not.toHaveBeenCalled();
    session.dispose();
  });
});
