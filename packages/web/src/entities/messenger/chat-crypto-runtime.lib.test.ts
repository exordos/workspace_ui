import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { createMessage, getMessagesPage } from "~/shared/api/messenger-messages.api";
import { getStream, getStreamBindingsPage } from "~/shared/api/messenger-streams.api";
import type {
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerStreamDto,
} from "~/shared/api/messenger.types";
import { realChatKeyStorage } from "./chat-crypto-resources.lib";
import { openRealChatSession, decryptRealChatMessage } from "./chat-crypto-runtime.lib";
import { realChatInitialKeyBootstrap } from "./chat-real-key-bootstrap.lib";
import { adaptMessengerMessage, adaptMessengerStream } from "./messenger-adapters.lib";
import { sendMessengerE2eePayload } from "./messenger-message-actions.lib";
import { useMessengerStore } from "./messenger.model";

vi.mock("~/shared/api/messenger-streams.api", async (load) => ({
  ...(await load<typeof import("~/shared/api/messenger-streams.api")>()),
  getStream: vi.fn(),
  getStreamBindingsPage: vi.fn(),
}));
vi.mock("~/shared/api/messenger-messages.api", async (load) => ({
  ...(await load<typeof import("~/shared/api/messenger-messages.api")>()),
  createMessage: vi.fn(),
  getMessagesPage: vi.fn(),
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
  let currentKey = { key_uuid: metadata.keyUuid, key_fingerprint: fingerprint };
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
    current_encryption_key: currentKey,
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
  vi.mocked(getMessagesPage).mockResolvedValue({
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
    if (body.payload.kind === "key_announced")
      currentKey = {
        key_uuid: body.payload.key_uuid,
        key_fingerprint: body.payload.key_fingerprint,
      };
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
  it("reissues a durable generation, preserves old secrets and sends only with the new key", async () => {
    const f = await setup();
    const session = await openRealChatSession({
      runtimeContext: f.admin,
      streamUuid: STREAM,
      getRuntimeContext: () => f.admin,
    });
    await session.load();
    await session.send({ text: "before rotation", topicUuid: TOPIC });
    const oldScope = session.scope;
    const oldKey = await realChatKeyStorage.readChatKey(oldScope);
    const response = await session.reissueKey();
    expect(response.status).toBe("applied");
    expect(session.scope.keyUuid).not.toBe(oldScope.keyUuid);
    expect(session.getState().access).toBe("ready");
    expect(await realChatKeyStorage.readChatKey(oldScope)).toEqual(oldKey);
    const announcements = f.wire.filter((message) => message.payload.kind === "key_announced");
    expect(announcements).toHaveLength(2);
    expect(announcements[0]!.payload).toMatchObject({ key_uuid: oldScope.keyUuid });
    expect(announcements[1]!.payload).toMatchObject({ key_uuid: session.scope.keyUuid });
    const newKey = await realChatKeyStorage.readChatKey(session.scope);
    expect(newKey?.groupKey).toBeTruthy();
    expect(newKey?.groupKey).not.toEqual(oldKey?.groupKey);
    await session.send({ text: "after rotation", topicUuid: TOPIC });
    expect(f.wire.at(-1)?.payload).toMatchObject({ kind: "e2ee", key_uuid: session.scope.keyUuid });
    expect(await session.decrypt(adaptMessengerMessage(f.wire[0]!))).toBe("before rotation");
    expect(await session.decrypt(adaptMessengerMessage(f.wire.at(-1)!))).toBe("after rotation");
    session.dispose();
  });

  it("lets a fresh device request the initial generation from real rotation history without unlocking the newest", async () => {
    const f = await setup();
    const admin = await openRealChatSession({
      runtimeContext: f.admin,
      streamUuid: STREAM,
      getRuntimeContext: () => f.admin,
    });
    await admin.load();
    await admin.send({ text: "initial generation", topicUuid: TOPIC });
    const oldMessage = f.wire[0]!;
    await admin.reissueKey();
    vi.mocked(getMessagesPage).mockImplementation(() =>
      Promise.resolve({ items: [...f.wire], nextPageMarker: null, pageLimit: 100 }),
    );
    const member = await openRealChatSession({
      runtimeContext: f.member,
      streamUuid: STREAM,
      getRuntimeContext: () => f.member,
    });
    await member.load();
    await member.requestKey(f.metadata.keyUuid);
    const request = f.wire.at(-1)!;
    await admin.ingest([adaptMessengerMessage(request)]);
    await admin.grantKey(request.uuid);
    await member.ingest(f.wire.map(adaptMessengerMessage));
    expect(await member.decrypt(adaptMessengerMessage(oldMessage))).toBe("initial generation");
    expect(member.getState().access).toBe("metadata-only");
    expect(member.getGenerationState(f.metadata.keyUuid)?.access).toBe("ready");
    member.dispose();
    admin.dispose();
  });

  it("restores a committed rotation after its POST response is lost without announcing the old key again", async () => {
    const f = await setup();
    const session = await openRealChatSession({
      runtimeContext: f.admin,
      streamUuid: STREAM,
      getRuntimeContext: () => f.admin,
    });
    await session.load();
    const create = vi.mocked(createMessage).getMockImplementation()!;
    let announced = 0;
    vi.mocked(createMessage).mockImplementation(async (options, body) => {
      const response = await create(options, body);
      if (body.payload.kind === "key_announced" && ++announced === 2)
        throw new Error("response lost");
      return response;
    });
    await expect(session.reissueKey()).rejects.toThrow("response lost");
    const lastKey = f.stream(ADMIN).current_encryption_key!.key_uuid;
    expect(
      await realChatKeyStorage.listStagedCreations({
        owner: f.admin,
        deviceId: session.device.deviceId,
      }),
    ).toHaveLength(1);
    session.dispose();
    const restored = await openRealChatSession({
      runtimeContext: f.admin,
      streamUuid: STREAM,
      getRuntimeContext: () => f.admin,
    });
    await restored.load();
    expect(restored.scope.keyUuid).toBe(lastKey);
    expect(restored.getState().access).toBe("ready");
    expect(
      await realChatKeyStorage.listStagedCreations({
        owner: f.admin,
        deviceId: restored.device.deviceId,
      }),
    ).toHaveLength(0);
    expect(f.wire).toHaveLength(2);
    await restored.send({ text: "new epoch after reload", topicUuid: TOPIC });
    expect(f.wire.at(-1)?.payload).toMatchObject({ key_uuid: lastKey });
    restored.dispose();
  });

  it("reconciles a committed rotation on same-session retry instead of generating a second epoch", async () => {
    const f = await setup();
    const session = await openRealChatSession({
      runtimeContext: f.admin,
      streamUuid: STREAM,
      getRuntimeContext: () => f.admin,
    });
    await session.load();
    const create = vi.mocked(createMessage).getMockImplementation()!;
    let announcements = 0;
    vi.mocked(createMessage).mockImplementation(async (options, body) => {
      const response = await create(options, body);
      if (body.payload.kind === "key_announced" && ++announcements === 2)
        throw new Error("response lost");
      return response;
    });
    await expect(session.reissueKey()).rejects.toThrow("response lost");
    const committedKey = f.stream(ADMIN).current_encryption_key!.key_uuid;
    expect((await session.reissueKey()).status).toBe("applied");
    expect(session.scope.keyUuid).toBe(committedKey);
    expect(session.getState().access).toBe("ready");
    expect(f.wire).toHaveLength(2);
    session.dispose();
  });

  it("retries a failed rotation with its persisted secret and canonical announcement UUID", async () => {
    const f = await setup();
    const session = await openRealChatSession({
      runtimeContext: f.admin,
      streamUuid: STREAM,
      getRuntimeContext: () => f.admin,
    });
    await session.load();
    const create = vi.mocked(createMessage).getMockImplementation()!;
    let announced = 0;
    vi.mocked(createMessage).mockImplementation(async (options, body) => {
      if (body.payload.kind === "key_announced" && ++announced === 2) throw new Error("offline");
      return create(options, body);
    });
    await expect(session.reissueKey()).rejects.toThrow("offline");
    const stage = (
      await realChatKeyStorage.listStagedCreations({
        owner: f.admin,
        deviceId: session.device.deviceId,
      })
    )[0]!;
    expect(session.scope.keyUuid).toBe(f.metadata.keyUuid);
    vi.mocked(createMessage).mockImplementation(create);
    await session.reissueKey();
    expect(f.wire.at(-1)?.uuid).toBe(stage.creationId);
    expect(session.scope.keyUuid).toBe(stage.keyUuid);
    expect((await realChatKeyStorage.readChatKey(session.scope))?.groupKey).toEqual(stage.groupKey);
    session.dispose();
  });

  it("does not publish a rotation when durable staging fails or the user is not the owner", async () => {
    const f = await setup();
    const member = await openRealChatSession({
      runtimeContext: f.member,
      streamUuid: STREAM,
      getRuntimeContext: () => f.member,
    });
    await member.load();
    expect(member.getRights().canRotate).toBe(false);
    await expect(member.reissueKey()).rejects.toThrow("forbidden");
    const admin = await openRealChatSession({
      runtimeContext: f.admin,
      streamUuid: STREAM,
      getRuntimeContext: () => f.admin,
    });
    await admin.load();
    const write = vi.spyOn(realChatKeyStorage, "writeStagedCreation").mockResolvedValueOnce(false);
    await expect(admin.reissueKey()).rejects.toThrow("storage-failed");
    expect(createMessage).not.toHaveBeenCalled();
    expect(admin.scope.keyUuid).toBe(f.metadata.keyUuid);
    write.mockRestore();
    member.dispose();
    admin.dispose();
  });

  it("filters correlated terminal responses across historical generations and batches independent failures", async () => {
    const f = await setup();
    const admin = await openRealChatSession({
      runtimeContext: f.admin,
      streamUuid: STREAM,
      getRuntimeContext: () => f.admin,
    });
    await admin.load();
    const member = await openRealChatSession({
      runtimeContext: f.member,
      streamUuid: STREAM,
      getRuntimeContext: () => f.member,
    });
    await member.load();
    await member.requestKey();
    const request = f.wire.at(-1)!;
    await admin.ingest([adaptMessengerMessage(request)]);
    expect(admin.canGrantKey(request.uuid)).toBe(true);
    await admin.reissueKey();
    expect(admin.canGrantKey(request.uuid)).toBe(true);
    expect(admin.getKeyRequests().map((item) => item.uuid)).toEqual([request.uuid]);
    const another = {
      ...request,
      uuid: crypto.randomUUID(),
      payload:
        request.payload.kind === "key_request"
          ? { ...request.payload, device_id: "another-device" }
          : request.payload,
    };
    await admin.ingest([adaptMessengerMessage(another)]);
    const create = vi.mocked(createMessage).getMockImplementation()!;
    vi.mocked(createMessage).mockImplementation(async (options, body) => {
      if (body.payload.kind === "key_grant" && body.payload.request_message_uuid === request.uuid)
        throw new Error("offline");
      return create(options, body);
    });
    const outcomes = await admin.grantAllKeys();
    expect(outcomes).toEqual([
      { requestMessageUuid: request.uuid, status: "failed", reason: "send-failed" },
      { requestMessageUuid: another.uuid, status: "granted" },
    ]);
    expect(admin.getKeyRequests().map((item) => item.uuid)).toEqual([request.uuid]);
    expect(admin.canGrantKey(another.uuid)).toBe(false);
    await expect(admin.grantKey(another.uuid)).rejects.toThrow("invalid-message");
    await admin.rejectKey(request.uuid);
    expect(admin.getKeyRequests()).toEqual([]);
    await admin.ingest([adaptMessengerMessage(request), adaptMessengerMessage(another)]);
    expect(admin.getKeyRequests()).toEqual([]);
    member.dispose();
    admin.dispose();
  });

  it("requests and grants the selected historical generation after reload without unlocking the latest", async () => {
    const f = await setup();
    const creator = await openRealChatSession({
      runtimeContext: f.admin,
      streamUuid: STREAM,
      getRuntimeContext: () => f.admin,
    });
    await creator.load();
    await creator.send({ text: "earlier generation text", topicUuid: TOPIC });
    const earlierMessage = f.wire[0]!;
    creator.dispose();
    const latestUuid = crypto.randomUUID();
    const latestFingerprint = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
    );
    vi.mocked(getStream).mockImplementation((options) =>
      Promise.resolve({
        ...f.stream(options.accessToken ?? ADMIN),
        current_encryption_key: { key_uuid: latestUuid, key_fingerprint: latestFingerprint },
      }),
    );
    const announcement: WorkspaceMessengerMessageDto = {
      ...earlierMessage,
      uuid: crypto.randomUUID(),
      payload: {
        kind: "key_announced",
        key_uuid: f.metadata.keyUuid,
        key_fingerprint: f.stream(ADMIN).current_encryption_key!.key_fingerprint,
      },
    };
    vi.mocked(getMessagesPage).mockResolvedValue({
      items: [announcement],
      nextPageMarker: null,
      pageLimit: 100,
    });
    let recipient = await openRealChatSession({
      runtimeContext: f.member,
      streamUuid: STREAM,
      getRuntimeContext: () => f.member,
    });
    await recipient.load();
    await recipient.requestKey(f.metadata.keyUuid);
    const request = f.wire.at(-1)!;
    expect(request.payload.kind).toBe("key_request");
    expect(request.payload).toMatchObject({ key_uuid: f.metadata.keyUuid });
    const historicalScope = { ...recipient.scope, keyUuid: f.metadata.keyUuid };
    const pendingBefore = await realChatKeyStorage.listPendingRequests(historicalScope);
    expect(pendingBefore).toHaveLength(1);
    recipient.dispose();
    recipient = await openRealChatSession({
      runtimeContext: f.member,
      streamUuid: STREAM,
      getRuntimeContext: () => f.member,
    });
    await recipient.load();
    const issuer = await openRealChatSession({
      runtimeContext: f.admin,
      streamUuid: STREAM,
      getRuntimeContext: () => f.admin,
    });
    await issuer.load();
    await issuer.ingest([adaptMessengerMessage(request)]);
    await issuer.grantKey(request.uuid);
    const grant = f.wire.at(-1)!;
    expect(grant.payload).toMatchObject({ key_uuid: f.metadata.keyUuid });
    const spoofedGrant = adaptMessengerMessage({ ...grant, author_uuid: MEMBER });
    await recipient.ingest([adaptMessengerMessage(request), spoofedGrant]);
    expect(await realChatKeyStorage.listPendingRequests(historicalScope)).toHaveLength(1);
    expect(await recipient.decrypt(adaptMessengerMessage(earlierMessage))).toBeNull();
    await recipient.ingest([adaptMessengerMessage(request), adaptMessengerMessage(grant)]);
    expect(recipient.getGenerationState(f.metadata.keyUuid)?.access).toBe("ready");
    expect(recipient.getState().access).toBe("metadata-only");
    expect(await realChatKeyStorage.listPendingRequests(historicalScope)).toEqual([]);
    expect(await recipient.decrypt(adaptMessengerMessage(earlierMessage))).toBe(
      "earlier generation text",
    );
    expect(getMessagesPage).toHaveBeenCalledTimes(1);
    recipient.dispose();
    const restored = await openRealChatSession({
      runtimeContext: f.member,
      streamUuid: STREAM,
      getRuntimeContext: () => f.member,
    });
    await restored.load();
    expect(await restored.decrypt(adaptMessengerMessage(earlierMessage))).toBe(
      "earlier generation text",
    );
    restored.dispose();
    issuer.dispose();
  });

  it("keeps an unknown old generation explicit and never borrows the current fingerprint", async () => {
    const f = await setup();
    const session = await openRealChatSession({
      runtimeContext: f.member,
      streamUuid: STREAM,
      getRuntimeContext: () => f.member,
    });
    await session.load();
    const unknownUuid = crypto.randomUUID();
    await expect(session.requestKey(unknownUuid)).rejects.toThrow("historical-key-unavailable");
    expect(createMessage).not.toHaveBeenCalled();
    expect(
      await realChatKeyStorage.listPendingRequests({ ...session.scope, keyUuid: unknownUuid }),
    ).toEqual([]);
    expect(
      await realChatKeyStorage.readChatKey({ ...session.scope, keyUuid: unknownUuid }),
    ).toBeNull();
    session.dispose();
  });

  it("does not trust a historical fingerprint announced by a regular member", async () => {
    const f = await setup();
    const session = await openRealChatSession({
      runtimeContext: f.member,
      streamUuid: STREAM,
      getRuntimeContext: () => f.member,
    });
    await session.load();
    const unknownUuid = crypto.randomUUID();
    const spoofed: WorkspaceMessengerMessageDto = {
      uuid: crypto.randomUUID(),
      project_id: PROJECT,
      stream_uuid: STREAM,
      topic_uuid: TOPIC,
      user_uuid: MEMBER,
      author_uuid: MEMBER,
      read: false,
      pinned: false,
      starred: false,
      is_own: true,
      reactions: {},
      reaction_users: {},
      created_at: DATE,
      updated_at: DATE,
      payload: {
        kind: "key_announced",
        key_uuid: unknownUuid,
        key_fingerprint: f.stream(MEMBER).current_encryption_key!.key_fingerprint,
      },
    };
    await session.ingest([adaptMessengerMessage(spoofed)]);
    vi.mocked(getMessagesPage).mockResolvedValue({
      items: [spoofed],
      nextPageMarker: null,
      pageLimit: 100,
    });
    await expect(session.requestKey(unknownUuid)).rejects.toThrow("historical-key-unavailable");
    expect(session.isIssuerAllowed(MEMBER)).toBe(false);
    expect(createMessage).not.toHaveBeenCalled();
    expect(
      await realChatKeyStorage.readChatKey({ ...session.scope, keyUuid: unknownUuid }),
    ).toBeNull();
    session.dispose();
  });

  it("does not replace stored historical metadata with a conflicting announcement", async () => {
    const f = await setup();
    const creator = await openRealChatSession({
      runtimeContext: f.admin,
      streamUuid: STREAM,
      getRuntimeContext: () => f.admin,
    });
    await creator.load();
    const oldScope = creator.scope;
    const original = await realChatKeyStorage.readChatKey(oldScope);
    creator.dispose();
    // Every read in one session observes the same current generation.
    const latest = {
      ...f.stream(ADMIN),
      current_encryption_key: {
        key_uuid: crypto.randomUUID(),
        key_fingerprint: f.stream(ADMIN).current_encryption_key!.key_fingerprint,
      },
    };
    vi.mocked(getStream).mockResolvedValue(latest);
    const issuer = await openRealChatSession({
      runtimeContext: f.admin,
      streamUuid: STREAM,
      getRuntimeContext: () => f.admin,
    });
    await issuer.load();
    const badAnnouncement: WorkspaceMessengerMessageDto = {
      uuid: crypto.randomUUID(),
      project_id: PROJECT,
      stream_uuid: STREAM,
      topic_uuid: TOPIC,
      user_uuid: ADMIN,
      author_uuid: ADMIN,
      read: false,
      pinned: false,
      starred: false,
      is_own: true,
      reactions: {},
      reaction_users: {},
      created_at: DATE,
      updated_at: DATE,
      payload: {
        kind: "key_announced",
        key_uuid: f.metadata.keyUuid,
        key_fingerprint: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))),
      },
    };
    await expect(issuer.ingest([adaptMessengerMessage(badAnnouncement)])).rejects.toThrow(
      "invalid-key",
    );
    expect(await realChatKeyStorage.readChatKey(oldScope)).toEqual(original);
    expect(createMessage).not.toHaveBeenCalled();
    issuer.dispose();
  });

  it("lets an issuer reject an unknown historical request without requiring its secret metadata", async () => {
    const f = await setup();
    const session = await openRealChatSession({
      runtimeContext: f.admin,
      streamUuid: STREAM,
      getRuntimeContext: () => f.admin,
    });
    await session.load();
    const unknownUuid = crypto.randomUUID();
    const request: WorkspaceMessengerMessageDto = {
      uuid: crypto.randomUUID(),
      project_id: PROJECT,
      stream_uuid: STREAM,
      topic_uuid: TOPIC,
      user_uuid: MEMBER,
      author_uuid: MEMBER,
      read: false,
      pinned: false,
      starred: false,
      is_own: false,
      reactions: {},
      reaction_users: {},
      created_at: DATE,
      updated_at: DATE,
      payload: {
        kind: "key_request",
        key_uuid: unknownUuid,
        device_id: "other-device",
        device_name: "Other device",
        public_key: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))),
      },
    };
    await session.ingest([adaptMessengerMessage(request)]);
    expect(session.getGenerationState(unknownUuid)).toBeNull();
    await session.rejectKey(request.uuid);
    expect(f.wire.at(-1)?.payload).toMatchObject({
      kind: "key_reject",
      key_uuid: unknownUuid,
      request_message_uuid: request.uuid,
    });
    expect(getMessagesPage).not.toHaveBeenCalled();
    session.dispose();
  });

  it("rejects historical text and announcements even when a caller supplies the current guard", async () => {
    const f = await setup();
    const key = f.stream(ADMIN).current_encryption_key!;
    const shared = {
      runtimeContext: f.admin,
      streamUuid: STREAM,
      topicUuid: TOPIC,
      keyFingerprint: key.key_fingerprint,
      expectedCurrentKey: { keyUuid: key.key_uuid, keyFingerprint: key.key_fingerprint },
      isCurrent: () => true,
    };
    await expect(
      sendMessengerE2eePayload({
        ...shared,
        payload: {
          kind: "e2ee",
          keyUuid: crypto.randomUUID(),
          content: { bytes: new Uint8Array([1]) },
        },
      }),
    ).rejects.toThrow("invalid-key");
    await expect(
      sendMessengerE2eePayload({
        ...shared,
        payload: {
          kind: "key_announced",
          keyUuid: crypto.randomUUID(),
          keyFingerprint: { bytes: new Uint8Array(32) },
        },
      }),
    ).rejects.toThrow("invalid-key");
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("discards an old-generation history lookup after runtime invalidation", async () => {
    const f = await setup();
    let current = f.member;
    const session = await openRealChatSession({
      runtimeContext: f.member,
      streamUuid: STREAM,
      getRuntimeContext: () => current,
    });
    await session.load();
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const opened = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.mocked(getMessagesPage).mockImplementationOnce(async () => {
      started();
      await gate;
      return { items: [], nextPageMarker: null, pageLimit: 100 };
    });
    const request = session.requestKey(crypto.randomUUID());
    const rejected = expect(request).rejects.toThrow("stale");
    await opened;
    current = { ...current, runtimeGeneration: 2 };
    release();
    await rejected;
    expect(createMessage).not.toHaveBeenCalled();
    session.dispose();
  });

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
