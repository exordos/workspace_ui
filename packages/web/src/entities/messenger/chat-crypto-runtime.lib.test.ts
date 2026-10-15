import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { createMessage, getMessagesPage } from "~/shared/api/messenger-messages.api";
import { getStream, getStreamBindingsPage } from "~/shared/api/messenger-streams.api";
import type {
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerStreamDto,
} from "~/shared/api/messenger.types";
import {
  realChatCryptoProvider,
  realChatKeyStorage,
  subscribeRealChatKeyChanges,
} from "./chat-crypto-resources.lib";
import {
  openRealChatSession as openChatSession,
  decryptRealChatMessage,
  decryptRealChatMessageResult,
} from "./chat-crypto-runtime.lib";
import { encodeChatE2eePayload } from "./chat-e2ee-payload-adapters.lib";
import { realChatInitialKeyBootstrap } from "./chat-real-key-bootstrap.lib";
import { adaptMessengerMessage, adaptMessengerStream } from "./messenger-adapters.lib";
import { messengerMessageActionCache } from "./messenger-cache.lib";
import { conversationIdForStream, conversationIdForTopic } from "./messenger-ids.lib";
import { sendMessengerE2eePayload } from "./messenger-message-actions.lib";
import { createMessengerPlacementUuid } from "./messenger-message-identity.lib";
import { useMessengerStore } from "./messenger.model";
import type { MessengerStoreState } from "./messenger.model";
import type { MessengerStreamBinding } from "./messenger.types";

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
type DeviceCatalog = ReturnType<typeof createDeviceCatalog>;
const deviceCatalogs = new Map<string, DeviceCatalog>();
const openSessions = new Set<Awaited<ReturnType<typeof openChatSession>>>();

function createDeviceCatalog(owner: WorkspaceRuntimeContext, stream: WorkspaceMessengerStreamDto) {
  const ownerKey = workspaceRuntimeOwnerKey(owner);
  const catalog = createStore<MessengerStoreState>()(() => ({
    ...useMessengerStore.getInitialState(),
    ownerKey,
    streamsById: { [STREAM]: adaptMessengerStream(stream) },
    streamIds: [STREAM],
    streamBindingsById: Object.fromEntries(
      [adminBinding(), memberBinding()].map((value) => [value.uuid, value]),
    ),
    streamBindingIds: [adminBinding().uuid, memberBinding().uuid],
    streamBindingIdsByStreamId: { [STREAM]: [adminBinding().uuid, memberBinding().uuid] },
    streamBindingsLoadedByStreamId: { [STREAM]: true },
    topicsById: {
      [TOPIC]: {
        uuid: TOPIC,
        projectId: PROJECT,
        streamUuid: STREAM,
        userUuid: owner.userUuid,
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
  }));
  const set = catalog.setState;
  catalog.setState({
    upsertStream: (expectedOwner, value) =>
      set((state) =>
        state.ownerKey === expectedOwner
          ? { streamsById: { ...state.streamsById, [value.uuid]: value } }
          : state,
      ),
    upsertStreamBindings: (expectedOwner, values) =>
      set((state) => {
        if (state.ownerKey !== expectedOwner) return state;
        return bindingState({
          ...state.streamBindingsById,
          ...Object.fromEntries(values.map((value) => [value.uuid, value])),
        });
      }),
    replaceStreamBindingsForStream: (expectedOwner, streamUuid, values) =>
      set((state) => {
        if (state.ownerKey !== expectedOwner) return state;
        const unrelated = Object.values(state.streamBindingsById).filter(
          (value) => value.streamUuid !== streamUuid,
        );
        const all = [...unrelated, ...values];
        return {
          ...bindingState(Object.fromEntries(all.map((value) => [value.uuid, value]))),
          streamBindingsLoadedByStreamId: {
            ...state.streamBindingsLoadedByStreamId,
            [streamUuid]: true,
          },
        };
      }),
    removeStreamBinding: (expectedOwner, value) =>
      set((state) => {
        if (state.ownerKey !== expectedOwner) return state;
        const remaining = Object.values(state.streamBindingsById).filter(
          (binding) => binding.uuid !== value.uuid,
        );
        return {
          ...bindingState(Object.fromEntries(remaining.map((binding) => [binding.uuid, binding]))),
        };
      }),
  });
  return catalog;
}

function bindingState(streamBindingsById: Record<string, MessengerStreamBinding>) {
  const streamBindingIdsByStreamId: Record<string, string[]> = {};
  for (const binding of Object.values(streamBindingsById)) {
    const ids = streamBindingIdsByStreamId[binding.streamUuid] ?? [];
    ids.push(binding.uuid);
    streamBindingIdsByStreamId[binding.streamUuid] = ids;
  }
  return {
    streamBindingsById,
    streamBindingIds: Object.keys(streamBindingsById),
    streamBindingIdsByStreamId,
  };
}

async function openRealChatSession(options: Parameters<typeof openChatSession>[0]) {
  const messengerStore =
    options.messengerStore ?? deviceCatalogs.get(workspaceRuntimeOwnerKey(options.runtimeContext));
  if (!messengerStore) throw new Error("Missing device catalog fixture");
  const session = await openChatSession({ ...options, messengerStore });
  openSessions.add(session);
  return session;
}

function openSessionFor(runtimeContext: WorkspaceRuntimeContext) {
  return openRealChatSession({
    runtimeContext,
    streamUuid: STREAM,
    getRuntimeContext: () => runtimeContext,
  });
}

function deviceCatalog(owner: WorkspaceRuntimeContext): DeviceCatalog {
  const catalog = deviceCatalogs.get(workspaceRuntimeOwnerKey(owner));
  if (!catalog) throw new Error("Missing device catalog fixture");
  return catalog;
}

function memberBinding(role: MessengerStreamBinding["role"] = "member"): MessengerStreamBinding {
  return {
    uuid: "66666666-6666-4666-8666-666666666666",
    projectId: PROJECT,
    streamUuid: STREAM,
    userUuid: MEMBER,
    whoUuid: ADMIN,
    role,
    notificationMode: "all_messages",
    createdAt: DATE,
    updatedAt: DATE,
  };
}

function adminBinding(): MessengerStreamBinding {
  return {
    ...memberBinding("owner"),
    uuid: "77777777-7777-4777-8777-777777777777",
    userUuid: ADMIN,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
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

async function setup({ publishRotationUpdates = true } = {}) {
  const admin = runtime();
  const member = runtime(MEMBER);
  const metadata = await realChatInitialKeyBootstrap.prepare({
    runtimeContext: admin,
    isCurrent: () => true,
  });
  let currentKey = { key_uuid: metadata.keyUuid };
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
    current_encryption_key_uuid: currentKey.key_uuid,
    created_at: DATE,
    updated_at: DATE,
  });
  vi.mocked(getStream).mockRejectedValue(new Error("Unexpected crypto stream request"));
  vi.mocked(getStreamBindingsPage).mockRejectedValue(
    new Error("Unexpected crypto participant request"),
  );
  vi.mocked(getMessagesPage).mockResolvedValue({
    items: [],
    nextPageMarker: null,
    pageLimit: 100,
  });
  const wire: WorkspaceMessengerMessageDto[] = [];
  const publishKey = (keyUuid = currentKey.key_uuid) => {
    for (const [ownerKey, catalog] of deviceCatalogs) {
      const snapshot = catalog.getState();
      const existing = snapshot.streamsById[STREAM];
      if (snapshot.ownerKey === ownerKey && existing)
        snapshot.upsertStream(ownerKey, {
          ...existing,
          currentEncryptionKey: { keyUuid },
        });
    }
  };
  vi.mocked(createMessage).mockImplementation((options, body) => {
    const message: WorkspaceMessengerMessageDto = {
      uuid: createMessengerPlacementUuid(
        body.topic_uuid ?? TOPIC,
        body.uuid ?? crypto.randomUUID(),
      ),
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
    if (body.payload.kind === "key_announced") {
      currentKey = { key_uuid: body.payload.key_uuid };
      if (publishRotationUpdates) publishKey();
    }
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
  deviceCatalogs.set(workspaceRuntimeOwnerKey(admin), createDeviceCatalog(admin, stream(ADMIN)));
  deviceCatalogs.set(workspaceRuntimeOwnerKey(member), createDeviceCatalog(member, stream(MEMBER)));
  return { admin, member, metadata, wire, stream, catalog: deviceCatalog, publishKey };
}
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.clearAllMocks();
  deviceCatalogs.clear();
});
afterEach(() => {
  for (const session of openSessions) session.dispose();
  openSessions.clear();
  expect(getStream).not.toHaveBeenCalled();
  expect(getStreamBindingsPage).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe("real ordinary chat orchestration", () => {
  it("loads the local session and ingests an empty batch without catalog requests or message dispatch", async () => {
    const f = await setup();
    const session = await openSessionFor(f.admin);
    await session.load();
    await session.ingest([]);
    expect(session.getState()).toMatchObject({ access: "ready", sendKeyUuid: f.metadata.keyUuid });
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("publishes scoped bootstrap keys once and keeps state-only operations local", async () => {
    const f = await setup();
    const session = await openSessionFor(f.admin);
    const keyChanged = vi.fn();
    const stateChanged = vi.fn();
    const unsubscribeKeys = subscribeRealChatKeyChanges(keyChanged);
    const unsubscribeState = session.subscribe(stateChanged);
    try {
      await session.load();
      expect(keyChanged.mock.calls).toEqual([
        [
          {
            kind: "updated",
            ownerKey: workspaceRuntimeOwnerKey(f.admin),
            deviceId: session.device.deviceId,
            streamUuid: STREAM,
            keyUuid: f.metadata.keyUuid,
          },
        ],
      ]);
      keyChanged.mockClear();
      stateChanged.mockClear();
      await session.load();
      await session.send({ text: "state-only operation", topicUuid: TOPIC });
      await session.ingest([]);
      expect(stateChanged).toHaveBeenCalledTimes(6);
      expect(keyChanged).not.toHaveBeenCalled();
    } finally {
      unsubscribeKeys();
      unsubscribeState();
    }
  });

  it("sends 40,000 plaintext characters even when the ciphertext exceeds the former client limit", async () => {
    const f = await setup();
    const session = await openSessionFor(f.admin);
    await session.load();
    const text = "A".repeat(40_000);
    await expect(session.send({ text, topicUuid: TOPIC })).resolves.toMatchObject({
      status: "applied",
    });
    expect(createMessage).toHaveBeenCalledOnce();
    const payload = vi.mocked(createMessage).mock.calls[0]?.[1].payload;
    if (payload?.kind !== "e2ee") throw new Error("Expected encrypted payload");
    // Base64 contains the plaintext bytes, a 32-byte salt, and a 16-byte tag.
    expect(payload.content).toHaveLength(53_400);
  });

  it("preserves keys and session state when the backend rejects real ciphertext", async () => {
    const f = await setup();
    const session = await openSessionFor(f.admin);
    await session.load();
    const originalKey = await realChatKeyStorage.readChatKey(session.scope);
    const text = "😀".repeat(40_000);
    expect(Array.from(text)).toHaveLength(40_000);
    expect(new TextEncoder().encode(text)).toHaveLength(160_000);
    vi.mocked(createMessage).mockRejectedValueOnce(new Error("Backend rejected payload"));
    let encodedLength = 0;
    const encrypt = realChatCryptoProvider.encryptMessage;
    const encryption = vi
      .spyOn(realChatCryptoProvider, "encryptMessage")
      .mockImplementation(async (input) => {
        const result = await encrypt(input);
        if (result.ok) {
          const payload = encodeChatE2eePayload({
            kind: "e2ee",
            keyUuid: input.context.keyUuid,
            content: result.value,
          });
          if (payload.kind !== "e2ee") throw new Error("Missing encrypted payload fixture");
          encodedLength = payload.content.length;
        }
        return result;
      });
    await expect(session.send({ text, topicUuid: TOPIC })).rejects.toThrow("send-failed");
    expect(encryption).toHaveBeenCalledOnce();
    expect(encodedLength).toBe(213_400);
    expect(createMessage).toHaveBeenCalledOnce();
    expect(f.wire).toEqual([]);
    expect(await realChatKeyStorage.readChatKey(session.scope)).toEqual(originalKey);
    expect(session.getState()).toMatchObject({
      access: "ready",
      sendKeyUuid: f.metadata.keyUuid,
      pending: false,
    });
  });

  it("denies management actions for a known member without loading the participant list", async () => {
    const f = await setup();
    const catalog = f.catalog(f.member);
    catalog.setState({
      streamBindingsById: {},
      streamBindingIds: [],
      streamBindingIdsByStreamId: {},
      streamBindingsLoadedByStreamId: {},
    });
    const session = await openSessionFor(f.member);
    await session.load();
    await session.requestKey();
    const request = f.wire.at(-1)!;
    await session.ingest([adaptMessengerMessage(request)]);
    vi.mocked(createMessage).mockClear();
    await expect(session.grantKey(request.uuid)).rejects.toThrow("forbidden");
    await expect(session.grantAllKeys()).rejects.toThrow("forbidden");
    await expect(session.rejectKey(request.uuid)).rejects.toThrow("forbidden");
    await expect(session.reissueKey()).rejects.toThrow("forbidden");
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("lists only stored secrets and lets a member remove the current key across live sessions", async () => {
    const f = await setup();
    const options = {
      runtimeContext: f.member,
      streamUuid: STREAM,
      getRuntimeContext: () => f.member,
    };
    const member = await openRealChatSession(options);
    const sibling = await openRealChatSession(options);
    await member.load();
    await sibling.load();
    expect(await member.listLocalKeys()).toEqual([]);
    const admin = await openSessionFor(f.admin);
    await admin.load();
    const actual = await realChatKeyStorage.readChatKey(admin.scope);
    if (!actual?.groupKey) throw new Error("Missing fixture key");
    const oldUuid = crypto.randomUUID();
    await realChatKeyStorage.writeChatKey({ ...member.scope, keyUuid: oldUuid }, actual);
    await realChatKeyStorage.writeChatKey(member.scope, actual);
    await member.load();
    await sibling.load();
    expect(member.getRights().canRotate).toBe(false);
    expect((await member.listLocalKeys()).map((key) => key.keyUuid).sort()).toEqual(
      [oldUuid, f.metadata.keyUuid].sort(),
    );
    vi.mocked(getStream).mockClear();
    vi.mocked(createMessage).mockClear();
    await member.removeLocalKey(f.metadata.keyUuid);
    await vi.waitFor(() =>
      expect(sibling.getState()).toMatchObject({
        access: "missing",
        sendKeyUuid: oldUuid,
        pending: false,
      }),
    );
    expect(member.getState()).toMatchObject({ access: "missing", sendKeyUuid: oldUuid });
    expect(await member.listLocalKeys()).toEqual([
      { keyUuid: oldUuid, receivedAt: expect.any(Number) },
    ]);
    expect((await admin.listLocalKeys()).map((key) => key.keyUuid)).toContain(f.metadata.keyUuid);
    expect(getStream).not.toHaveBeenCalled();
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("does not restore a removed secret from a late grant or its saved repair request", async () => {
    const f = await setup();
    const admin = await openSessionFor(f.admin);
    const member = await openSessionFor(f.member);
    await admin.load();
    await member.load();
    await admin.send({ text: "recovery probe", topicUuid: TOPIC });
    const message = adaptMessengerMessage(f.wire.at(-1)!);
    const wrong = await realChatCryptoProvider.createGroupKey();
    if (!wrong.ok) throw new Error(wrong.reason);
    await realChatKeyStorage.writeChatKey(member.scope, { groupKey: wrong.value });
    await member.requestKey(f.metadata.keyUuid, message);
    const request = f.wire.at(-1)!;
    expect((await realChatKeyStorage.listPendingRequests(member.scope))[0]?.recovery).toBeDefined();
    await admin.ingest([adaptMessengerMessage(request)]);
    await admin.grantKey(request.uuid);
    await member.removeLocalKey(f.metadata.keyUuid);
    expect(await realChatKeyStorage.listPendingRequests(member.scope)).toEqual([]);
    await member.ingest(f.wire.map(adaptMessengerMessage));
    expect(await member.listLocalKeys()).toEqual([]);
    expect(await member.decrypt(message)).toBeNull();
    expect(member.getState()).toMatchObject({ access: "missing", sendKeyUuid: null });
    await member.requestKey(f.metadata.keyUuid);
    expect(f.wire.at(-1)?.uuid).not.toBe(request.uuid);
  });

  it.each(["key-removed", "disposed", "runtime-replaced"] as const)(
    "discards and clears plaintext when a pending presentation decryption is %s",
    async (reason) => {
      const f = await setup();
      let current = f.admin;
      const session = await openRealChatSession({
        runtimeContext: f.admin,
        streamUuid: STREAM,
        getRuntimeContext: () => current,
      });
      await session.load();
      await session.send({ text: "scoped plaintext", topicUuid: TOPIC });
      const decrypt = realChatCryptoProvider.decryptMessage.bind(realChatCryptoProvider);
      const started = deferred<void>();
      const gate = deferred<void>();
      let plaintext: Uint8Array | null = null;
      vi.spyOn(realChatCryptoProvider, "decryptMessage").mockImplementationOnce(async (input) => {
        const result = await decrypt(input);
        if (result.ok) plaintext = result.value;
        started.resolve();
        await gate.promise;
        return result;
      });
      const message = adaptMessengerMessage(f.wire.at(-1)!);
      const pending =
        reason === "key-removed"
          ? decryptRealChatMessageResult(f.admin, message, () => true)
          : session.decrypt(message);
      await started.promise;
      if (reason === "key-removed") await realChatKeyStorage.removeChatKey(session.scope);
      else if (reason === "disposed") session.dispose();
      else current = { ...f.admin, runtimeGeneration: f.admin.runtimeGeneration + 2 };
      gate.resolve();
      expect(await pending).toEqual(reason === "key-removed" ? { status: "missing-key" } : null);
      expect(plaintext).toEqual(new Uint8Array("scoped plaintext".length));
    },
  );

  it("cancels a prepared request through durable deletion even before another tab broadcasts", async () => {
    const f = await setup();
    const member = await openSessionFor(f.member);
    await member.load();
    const started = deferred<void>();
    const gate = deferred<void>();
    const prepare = realChatCryptoProvider.createRequestKeyPair.bind(realChatCryptoProvider);
    vi.spyOn(realChatCryptoProvider, "createRequestKeyPair").mockImplementationOnce(async () => {
      started.resolve();
      await gate.promise;
      return prepare();
    });
    const requested = member.requestKey(f.metadata.keyUuid);
    await started.promise;
    const rejected = expect(requested).rejects.toThrow("storage-failed");
    // Direct storage deletion models the interval before another tab's message arrives.
    await realChatKeyStorage.removeChatKey(member.scope);
    gate.resolve();
    await rejected;
    expect(await realChatKeyStorage.listPendingRequests(member.scope)).toEqual([]);
    expect(await member.listLocalKeys()).toEqual([]);
    expect(f.wire).toEqual([]);
    await member.requestKey(f.metadata.keyUuid);
    expect(f.wire.at(-1)?.payload).toMatchObject({
      kind: "key_request",
      key_uuid: f.metadata.keyUuid,
    });
  });

  it("re-requests a usable saved key without deleting it or creating an unchecked repair", async () => {
    const f = await setup();
    const session = await openSessionFor(f.admin);
    await session.load();
    await session.send({ text: "readable probe", topicUuid: TOPIC });
    const message = adaptMessengerMessage(f.wire.at(-1)!);
    const before = await session.listLocalKeys();
    await session.requestKey(f.metadata.keyUuid, message, true);
    expect(f.wire.at(-1)?.payload).toMatchObject({
      kind: "key_request",
      key_uuid: f.metadata.keyUuid,
    });
    expect(
      (await realChatKeyStorage.listPendingRequests(session.scope))[0]?.recovery,
    ).toBeUndefined();
    expect(await session.listLocalKeys()).toEqual(before);
    expect(await session.decrypt(message)).toBe("readable probe");
  });

  it("retains an existing secret when a repeated grant has different bytes and no ciphertext probe", async () => {
    const f = await setup();
    const admin = await openSessionFor(f.admin);
    const member = await openSessionFor(f.member);
    await admin.load();
    await member.load();
    const wrong = await realChatCryptoProvider.createGroupKey();
    if (!wrong.ok) throw new Error(wrong.reason);
    await realChatKeyStorage.writeChatKey(member.scope, { groupKey: wrong.value });
    await member.requestKey(f.metadata.keyUuid);
    const request = f.wire.at(-1)!;
    await admin.ingest([adaptMessengerMessage(request)]);
    await admin.grantKey(request.uuid);
    await expect(member.ingest(f.wire.map(adaptMessengerMessage))).rejects.toThrow(
      "storage-failed",
    );
    expect((await realChatKeyStorage.readChatKey(member.scope))?.groupKey).toEqual(wrong.value);
  });

  it("rejects a delayed key inventory after the owner changes", async () => {
    const f = await setup();
    let live = f.admin;
    const session = await openRealChatSession({
      runtimeContext: f.admin,
      streamUuid: STREAM,
      getRuntimeContext: () => live,
    });
    const gate = deferred<readonly { keyUuid: string; receivedAt: number | null }[]>();
    vi.spyOn(realChatKeyStorage, "listChatKeys").mockReturnValueOnce(gate.promise);
    const listed = session.listLocalKeys();
    const rejected = expect(listed).rejects.toThrow("stale");
    live = { ...f.admin, runtimeGeneration: live.runtimeGeneration + 1 };
    gate.resolve([{ keyUuid: f.metadata.keyUuid, receivedAt: 1 }]);
    await rejected;
  });

  it("discards a last-key lookup after the runtime owner changes", async () => {
    const f = await setup();
    let live = f.member;
    const member = await openRealChatSession({
      runtimeContext: f.member,
      streamUuid: STREAM,
      getRuntimeContext: () => live,
    });
    let finish: ((value: null) => void) | undefined;
    const lookup = vi.spyOn(realChatKeyStorage, "readLastAvailableChatKey").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const loading = member.load();
    await vi.waitFor(() => expect(lookup).toHaveBeenCalledOnce());
    live = { ...f.member, runtimeGeneration: 2 };
    const rejected = expect(loading).rejects.toThrow("stale");
    finish?.(null);
    await rejected;
    expect(member.getState().sendKeyUuid).toBeNull();
    expect(createMessage).not.toHaveBeenCalled();
    lookup.mockRestore();
    member.dispose();
  });

  it("keeps sending with the previous key after rotation and reload until the current key is granted", async () => {
    const f = await setup();
    const admin = await openSessionFor(f.admin);
    let member = await openSessionFor(f.member);
    await admin.load();
    await member.load();
    await member.requestKey();
    const initialRequest = f.wire.at(-1)!;
    await admin.ingest(f.wire.map(adaptMessengerMessage));
    await admin.grantKey(initialRequest.uuid);
    await member.ingest(f.wire.map(adaptMessengerMessage));
    const oldUuid = member.scope.keyUuid;
    expect(member.getState().sendKeyUuid).toBe(oldUuid);
    await admin.reissueKey();
    await member.ingest(f.wire.map(adaptMessengerMessage));
    const newUuid = member.scope.keyUuid;
    expect(newUuid).not.toBe(oldUuid);
    expect(member.getState()).toMatchObject({ access: "missing", sendKeyUuid: oldUuid });
    await member.send({ text: "old key after rotation", topicUuid: TOPIC });
    expect(f.wire.at(-1)?.payload).toMatchObject({ kind: "e2ee", key_uuid: oldUuid });
    expect(await admin.decrypt(adaptMessengerMessage(f.wire.at(-1)!))).toBe(
      "old key after rotation",
    );
    member.dispose();
    member = await openSessionFor(f.member);
    await member.load();
    expect(member.getState().sendKeyUuid).toBe(oldUuid);
    await member.requestKey();
    const request = f.wire.at(-1)!;
    expect(request.payload).toMatchObject({ kind: "key_request", key_uuid: newUuid });
    await member.send({ text: "old key while waiting", topicUuid: TOPIC });
    expect(f.wire.at(-1)?.payload).toMatchObject({ kind: "e2ee", key_uuid: oldUuid });
    await admin.ingest(f.wire.map(adaptMessengerMessage));
    await admin.grantKey(request.uuid);
    await member.ingest(f.wire.map(adaptMessengerMessage));
    expect(member.getState()).toMatchObject({ access: "ready", sendKeyUuid: newUuid });
    await member.send({ text: "current key after grant", topicUuid: TOPIC });
    expect(f.wire.at(-1)?.payload).toMatchObject({ kind: "e2ee", key_uuid: newUuid });
    expect(await admin.decrypt(adaptMessengerMessage(f.wire.at(-1)!))).toBe(
      "current key after grant",
    );
    admin.dispose();
    member.dispose();
  });

  it("repairs an existing key through a real grant after the requesting session reloads", async () => {
    const f = await setup();
    const admin = await openSessionFor(f.admin);
    await admin.load();
    await admin.send({ text: "repair probe", topicUuid: TOPIC });
    const message = adaptMessengerMessage(f.wire.at(-1)!);
    const member = await openSessionFor(f.member);
    await member.load();
    const wrong = await realChatCryptoProvider.createGroupKey();
    if (!wrong.ok) throw new Error(wrong.reason);
    await realChatKeyStorage.writeChatKey(member.scope, { groupKey: wrong.value });
    expect(await member.decrypt(message)).toBeNull();
    await member.requestKey(f.metadata.keyUuid, message);
    const request = f.wire.at(-1)!;
    expect(request.payload.kind).toBe("key_request");
    expect(request.payload).not.toHaveProperty("recovery");
    expect((await realChatKeyStorage.readChatKey(member.scope))?.groupKey).toEqual(wrong.value);
    member.dispose();
    const restored = await openSessionFor(f.member);
    await restored.load();
    await admin.ingest([adaptMessengerMessage(request)]);
    await admin.grantKey(request.uuid);
    await restored.ingest(f.wire.map(adaptMessengerMessage));
    expect(await restored.decrypt(message)).toBe("repair probe");
    expect((await realChatKeyStorage.readChatKey(restored.scope))?.groupKey).not.toEqual(
      wrong.value,
    );
    await restored.ingest(f.wire.map(adaptMessengerMessage));
    expect(await restored.decrypt(message)).toBe("repair probe");
    await restored.send({ text: "repaired reply", topicUuid: TOPIC });
    expect(await admin.decrypt(adaptMessengerMessage(f.wire.at(-1)!))).toBe("repaired reply");
    restored.dispose();
    admin.dispose();
  });

  it("requests the same key for one damaged message without affecting other readable text", async () => {
    const f = await setup();
    const session = await openSessionFor(f.admin);
    await session.load();
    await session.send({ text: "still readable", topicUuid: TOPIC });
    const readable = adaptMessengerMessage(f.wire.at(-1)!);
    if (readable.payload.kind !== "e2ee") throw new Error("Missing encrypted message");
    const broken = {
      ...readable,
      uuid: crypto.randomUUID(),
      payload: {
        ...readable.payload,
        content: btoa("damaged message"),
      },
    };
    const original = await realChatKeyStorage.readChatKey(session.scope);
    expect(await decryptRealChatMessageResult(f.admin, broken, () => true)).toEqual({
      status: "error",
      canRequestKey: true,
    });
    await session.requestKey(f.metadata.keyUuid, broken);
    const request = f.wire.at(-1)!;
    await session.ingest(f.wire.map(adaptMessengerMessage));
    await session.grantKey(request.uuid);
    await session.ingest(f.wire.map(adaptMessengerMessage));
    expect(await realChatKeyStorage.readChatKey(session.scope)).toEqual(original);
    expect(await session.decrypt(readable)).toBe("still readable");
    expect(await session.decrypt(broken)).toBeNull();
    await expect(session.requestKey(f.metadata.keyUuid, readable)).rejects.toThrow(
      "invalid-message",
    );
    await expect(
      session.requestKey(f.metadata.keyUuid, { ...broken, streamUuid: crypto.randomUUID() }),
    ).rejects.toThrow("invalid-message");
    session.dispose();
  });

  it("reissues a durable generation from the verified receipt without WebSocket and preserves old secrets", async () => {
    const f = await setup({ publishRotationUpdates: false });
    const session = await openSessionFor(f.admin);
    await session.load();
    await session.send({ text: "before rotation", topicUuid: TOPIC });
    const oldScope = session.scope;
    const oldKey = await realChatKeyStorage.readChatKey(oldScope);
    const response = await session.reissueKey();
    expect(response.status).toBe("applied");
    expect(session.scope.keyUuid).not.toBe(oldScope.keyUuid);
    expect(f.catalog(f.member).getState().streamsById[STREAM]?.currentEncryptionKey?.keyUuid).toBe(
      oldScope.keyUuid,
    );
    expect(session.getState().access).toBe("ready");
    expect(await realChatKeyStorage.readChatKey(oldScope)).toEqual(oldKey);
    const announcements = f.wire.filter((message) => message.payload.kind === "key_announced");
    expect(announcements).toHaveLength(1);
    expect(announcements[0]!.payload).toMatchObject({ key_uuid: session.scope.keyUuid });
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
    const admin = await openSessionFor(f.admin);
    await admin.load();
    await admin.send({ text: "initial generation", topicUuid: TOPIC });
    const oldMessage = f.wire[0]!;
    await admin.reissueKey();
    vi.mocked(getMessagesPage).mockImplementation(() =>
      Promise.resolve({ items: [...f.wire], nextPageMarker: null, pageLimit: 100 }),
    );
    const member = await openSessionFor(f.member);
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
    const f = await setup({ publishRotationUpdates: false });
    const session = await openSessionFor(f.admin);
    await session.load();
    const create = vi.mocked(createMessage).getMockImplementation()!;
    let announced = 0;
    vi.mocked(createMessage).mockImplementation(async (options, body) => {
      const response = await create(options, body);
      if (body.payload.kind === "key_announced" && ++announced === 1)
        throw new Error("response lost");
      return response;
    });
    await expect(session.reissueKey()).rejects.toThrow("response lost");
    const lastKey = f.stream(ADMIN).current_encryption_key_uuid!;
    expect(
      await realChatKeyStorage.listStagedCreations({
        owner: f.admin,
        deviceId: session.device.deviceId,
      }),
    ).toHaveLength(1);
    session.dispose();
    f.publishKey();
    const restored = await openSessionFor(f.admin);
    await restored.load();
    expect(restored.scope.keyUuid).toBe(lastKey);
    expect(restored.getState().access).toBe("ready");
    expect(
      await realChatKeyStorage.listStagedCreations({
        owner: f.admin,
        deviceId: restored.device.deviceId,
      }),
    ).toHaveLength(0);
    expect(f.wire).toHaveLength(1);
    await restored.send({ text: "new epoch after reload", topicUuid: TOPIC });
    expect(f.wire.at(-1)?.payload).toMatchObject({ key_uuid: lastKey });
    restored.dispose();
  });

  it("reconciles a committed rotation on same-session retry instead of generating a second epoch", async () => {
    const f = await setup();
    const session = await openSessionFor(f.admin);
    await session.load();
    const create = vi.mocked(createMessage).getMockImplementation()!;
    let announcements = 0;
    vi.mocked(createMessage).mockImplementation(async (options, body) => {
      const response = await create(options, body);
      if (body.payload.kind === "key_announced" && ++announcements === 1)
        throw new Error("response lost");
      return response;
    });
    await expect(session.reissueKey()).rejects.toThrow("response lost");
    const committedKey = f.stream(ADMIN).current_encryption_key_uuid!;
    expect((await session.reissueKey()).status).toBe("applied");
    expect(session.scope.keyUuid).toBe(committedKey);
    expect(session.getState().access).toBe("ready");
    expect(f.wire).toHaveLength(1);
    session.dispose();
  });

  it("retries a lost rotation response without WebSocket using the same durable announcement and secret", async () => {
    const f = await setup({ publishRotationUpdates: false });
    const session = await openSessionFor(f.admin);
    await session.load();
    const create = vi.mocked(createMessage).getMockImplementation()!;
    const receipt = deferred<WorkspaceMessengerMessageDto>();
    let attempts = 0;
    vi.mocked(createMessage).mockImplementation(async (options, body) => {
      const attempt = attempts++;
      if (attempt === 0) {
        receipt.resolve(await create(options, body));
        throw new Error("response lost");
      }
      const response = await receipt.promise;
      expect(createMessengerPlacementUuid(body.topic_uuid ?? TOPIC, body.uuid!)).toBe(
        response.uuid,
      );
      expect(body.payload).toEqual(response.payload);
      return response;
    });
    const generate = vi.spyOn(realChatCryptoProvider, "createGroupKey");
    await expect(session.reissueKey()).rejects.toThrow("response lost");
    expect(session.scope.keyUuid).toBe(f.metadata.keyUuid);
    const pendingStages = await realChatKeyStorage.listStagedCreations({
      owner: f.admin,
      deviceId: session.device.deviceId,
    });
    const staged = pendingStages[0];
    if (!staged) throw new Error("Missing durable rotation fixture");
    const retried = await session.reissueKey();
    expect(retried.status).toBe("applied");
    expect(session.getState()).toMatchObject({ access: "ready", sendKeyUuid: staged.keyUuid });
    expect(session.scope.keyUuid).toBe(staged.keyUuid);
    expect(await realChatKeyStorage.readChatKey(session.scope)).toMatchObject({
      groupKey: staged.groupKey,
    });
    expect(
      await realChatKeyStorage.listStagedCreations({
        owner: f.admin,
        deviceId: session.device.deviceId,
      }),
    ).toEqual([]);
    expect(generate).toHaveBeenCalledOnce();
    expect(createMessage).toHaveBeenCalledTimes(2);
    expect(f.wire).toHaveLength(1);
  });

  it("creates distinct generations for two intentional successful rotations", async () => {
    const f = await setup();
    const session = await openSessionFor(f.admin);
    await session.load();
    await session.reissueKey();
    const firstUuid = session.scope.keyUuid;
    await session.reissueKey();
    const secondUuid = session.scope.keyUuid;
    expect(secondUuid).not.toBe(firstUuid);
    expect(session.getState()).toMatchObject({ access: "ready", sendKeyUuid: secondUuid });
    expect(f.wire.map((message) => message.payload)).toEqual([
      { kind: "key_announced", key_uuid: firstUuid },
      { kind: "key_announced", key_uuid: secondUuid },
    ]);
    const firstKey = await realChatKeyStorage.readChatKey({ ...session.scope, keyUuid: firstUuid });
    expect(firstKey?.groupKey).toBeTruthy();
  });

  it("recovers a lost rotation response from a store event before retry without publishing another announcement", async () => {
    const f = await setup({ publishRotationUpdates: false });
    const session = await openSessionFor(f.admin);
    await session.load();
    const create = vi.mocked(createMessage).getMockImplementation()!;
    vi.mocked(createMessage).mockImplementationOnce(async (options, body) => {
      await create(options, body);
      throw new Error("response lost");
    });
    await expect(session.reissueKey()).rejects.toThrow("response lost");
    const committedUuid = f.stream(ADMIN).current_encryption_key_uuid!;
    vi.mocked(getStream).mockClear();
    vi.mocked(getStreamBindingsPage).mockClear();
    const keyChanged = vi.fn();
    const unsubscribeKeys = subscribeRealChatKeyChanges(keyChanged);
    f.catalog(f.admin)
      .getState()
      .upsertStream(workspaceRuntimeOwnerKey(f.admin), adaptMessengerStream(f.stream(ADMIN)));
    await vi.waitFor(() =>
      expect(session.getState()).toMatchObject({
        access: "ready",
        sendKeyUuid: committedUuid,
        pending: false,
      }),
    );
    unsubscribeKeys();
    expect(keyChanged.mock.calls).toEqual([
      [
        {
          kind: "updated",
          ownerKey: workspaceRuntimeOwnerKey(f.admin),
          deviceId: session.device.deviceId,
          streamUuid: STREAM,
          keyUuid: committedUuid,
        },
      ],
    ]);
    expect(
      await realChatKeyStorage.listStagedCreations({
        owner: f.admin,
        deviceId: session.device.deviceId,
      }),
    ).toEqual([]);
    expect(getStream).not.toHaveBeenCalled();
    expect(getStreamBindingsPage).not.toHaveBeenCalled();
    const retry = await session.reissueKey();
    expect(retry.status).toBe("applied");
    expect(session.scope.keyUuid).toBe(committedUuid);
    expect(f.wire).toHaveLength(1);
  });

  it("does not overwrite a newer realtime generation with its delayed rotation response", async () => {
    const f = await setup({ publishRotationUpdates: false });
    const session = await openSessionFor(f.admin);
    await session.load();
    const started = deferred<void>();
    const gate = deferred<void>();
    const create = vi.mocked(createMessage).getMockImplementation()!;
    vi.mocked(createMessage).mockImplementationOnce(async (options, body) => {
      const response = await create(options, body);
      started.resolve();
      await gate.promise;
      return response;
    });
    const rotating = session.reissueKey();
    const rejected = expect(rotating).rejects.toThrow("send-failed");
    await started.promise;
    const announcedUuid = f.stream(ADMIN).current_encryption_key_uuid!;
    const nextUuid = crypto.randomUUID();
    expect(announcedUuid).not.toBe(nextUuid);
    const catalog = f.catalog(f.admin);
    catalog.getState().upsertStream(
      workspaceRuntimeOwnerKey(f.admin),
      adaptMessengerStream({
        ...f.stream(ADMIN),
        current_encryption_key_uuid: nextUuid,
      }),
    );
    gate.resolve();
    await rejected;
    expect(catalog.getState().streamsById[STREAM]?.currentEncryptionKey?.keyUuid).toBe(nextUuid);
    await vi.waitFor(() =>
      expect(session.getState()).toMatchObject({
        access: "missing",
        sendKeyUuid: f.metadata.keyUuid,
        pending: false,
      }),
    );
    expect(f.wire).toHaveLength(1);
    expect(session.scope.keyUuid).toBe(nextUuid);
    expect(
      await realChatKeyStorage.listStagedCreations({
        owner: f.admin,
        deviceId: session.device.deviceId,
      }),
    ).toMatchObject([{ keyUuid: announcedUuid }]);
  });

  it("retries staged key recovery after ownership returns without changing the generation or refreshing", async () => {
    const f = await setup({ publishRotationUpdates: false });
    const session = await openSessionFor(f.admin);
    await session.load();
    const create = vi.mocked(createMessage).getMockImplementation()!;
    vi.mocked(createMessage).mockImplementationOnce(async (options, body) => {
      await create(options, body);
      throw new Error("response lost");
    });
    await expect(session.reissueKey()).rejects.toThrow("response lost");
    const committedUuid = f.stream(ADMIN).current_encryption_key_uuid!;
    const catalog = f.catalog(f.admin);
    const owner = workspaceRuntimeOwnerKey(f.admin);
    const reads = vi.spyOn(realChatKeyStorage, "readChatKey");
    vi.mocked(getStream).mockClear();
    vi.mocked(getStreamBindingsPage).mockClear();
    catalog
      .getState()
      .upsertStream(
        owner,
        adaptMessengerStream({ ...f.stream(ADMIN), owner: MEMBER, role: "member" }),
      );
    catalog.getState().upsertStreamBindings(owner, [{ ...adminBinding(), role: "member" }]);
    await vi.waitFor(() => {
      expect(session.scope.keyUuid).toBe(committedUuid);
      expect(reads).toHaveBeenCalledWith(expect.objectContaining({ keyUuid: committedUuid }));
      expect(session.getState()).toMatchObject({ access: "missing", pending: false });
    });
    expect(
      await realChatKeyStorage.listStagedCreations({
        owner: f.admin,
        deviceId: session.device.deviceId,
      }),
    ).toHaveLength(1);
    catalog.getState().upsertStream(owner, adaptMessengerStream(f.stream(ADMIN)));
    catalog.getState().upsertStreamBindings(owner, [adminBinding()]);
    await vi.waitFor(() =>
      expect(session.getState()).toMatchObject({
        access: "ready",
        sendKeyUuid: committedUuid,
        pending: false,
      }),
    );
    expect(
      await realChatKeyStorage.listStagedCreations({
        owner: f.admin,
        deviceId: session.device.deviceId,
      }),
    ).toEqual([]);
    expect(getStream).not.toHaveBeenCalled();
    expect(getStreamBindingsPage).not.toHaveBeenCalled();
    expect(f.wire).toHaveLength(1);
  });

  it("rechecks skipped staged recovery when ownership returns during local controller loading", async () => {
    const f = await setup({ publishRotationUpdates: false });
    const session = await openSessionFor(f.admin);
    await session.load();
    const create = vi.mocked(createMessage).getMockImplementation()!;
    vi.mocked(createMessage).mockImplementationOnce(async (options, body) => {
      await create(options, body);
      throw new Error("response lost");
    });
    await expect(session.reissueKey()).rejects.toThrow("response lost");
    const committedUuid = f.stream(ADMIN).current_encryption_key_uuid!;
    const catalog = f.catalog(f.admin);
    const owner = workspaceRuntimeOwnerKey(f.admin);
    const started = deferred<void>();
    const gate = deferred<void>();
    const read = realChatKeyStorage.readChatKey.bind(realChatKeyStorage);
    let paused = false;
    vi.spyOn(realChatKeyStorage, "readChatKey").mockImplementation(async (scope) => {
      if (!paused && scope.keyUuid === committedUuid) {
        paused = true;
        started.resolve();
        await gate.promise;
      }
      return read(scope);
    });
    vi.mocked(getStream).mockClear();
    vi.mocked(getStreamBindingsPage).mockClear();
    catalog
      .getState()
      .upsertStream(
        owner,
        adaptMessengerStream({ ...f.stream(ADMIN), owner: MEMBER, role: "member" }),
      );
    catalog.getState().upsertStreamBindings(owner, [{ ...adminBinding(), role: "member" }]);
    await started.promise;
    expect(session.getRights().canRotate).toBe(false);
    expect(await read({ ...session.scope, keyUuid: committedUuid })).toBeNull();
    catalog.getState().upsertStream(owner, adaptMessengerStream(f.stream(ADMIN)));
    catalog.getState().upsertStreamBindings(owner, [adminBinding()]);
    gate.resolve();
    await vi.waitFor(() =>
      expect(session.getState()).toMatchObject({
        access: "ready",
        sendKeyUuid: committedUuid,
        pending: false,
      }),
    );
    expect(
      await realChatKeyStorage.listStagedCreations({
        owner: f.admin,
        deviceId: session.device.deviceId,
      }),
    ).toEqual([]);
    expect(getStream).not.toHaveBeenCalled();
    expect(getStreamBindingsPage).not.toHaveBeenCalled();
    expect(f.wire).toHaveLength(1);
  });

  it("retries a failed rotation with its persisted secret and canonical announcement UUID", async () => {
    const f = await setup();
    const session = await openSessionFor(f.admin);
    await session.load();
    const create = vi.mocked(createMessage).getMockImplementation()!;
    let announced = 0;
    vi.mocked(createMessage).mockImplementation(async (options, body) => {
      if (body.payload.kind === "key_announced" && ++announced === 1) throw new Error("offline");
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
    expect(f.wire.at(-1)?.uuid).toBe(createMessengerPlacementUuid(TOPIC, stage.creationId));
    expect(session.scope.keyUuid).toBe(stage.keyUuid);
    expect((await realChatKeyStorage.readChatKey(session.scope))?.groupKey).toEqual(stage.groupKey);
    session.dispose();
  });

  it("does not publish a rotation when durable staging fails or the user is not the owner", async () => {
    const f = await setup();
    const member = await openSessionFor(f.member);
    await member.load();
    expect(member.getRights().canRotate).toBe(false);
    await expect(member.reissueKey()).rejects.toThrow("forbidden");
    const admin = await openSessionFor(f.admin);
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
    const admin = await openSessionFor(f.admin);
    await admin.load();
    const member = await openSessionFor(f.member);
    await member.load();
    await member.requestKey();
    const request = f.wire.at(-1)!;
    await admin.ingest([adaptMessengerMessage(request)]);
    expect(admin.canGrantKey(request.uuid)).toBe(true);
    expect(admin.getKeyRequestOutcomes()[0]).toBe(admin.getKeyRequestOutcomes()[0]);
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
    const catalog = f.catalog(f.admin);
    const owner = workspaceRuntimeOwnerKey(f.admin);
    catalog
      .getState()
      .upsertStream(
        owner,
        adaptMessengerStream({ ...f.stream(ADMIN), owner: MEMBER, role: "member" }),
      );
    catalog.getState().upsertStreamBindings(owner, [{ ...adminBinding(), role: "member" }]);
    expect(admin.getKeyRequests().map((item) => item.uuid)).toEqual([request.uuid, another.uuid]);
    expect(admin.canRejectKey(request.uuid)).toBe(false);
    catalog.getState().upsertStream(owner, adaptMessengerStream(f.stream(ADMIN)));
    catalog.getState().upsertStreamBindings(owner, [adminBinding()]);
    expect(admin.getKeyRequests()).toEqual([]);
    member.dispose();
    admin.dispose();
  });

  it("requests and grants the selected historical generation after reload without unlocking the latest", async () => {
    const f = await setup();
    const creator = await openSessionFor(f.admin);
    await creator.load();
    await creator.send({ text: "earlier generation text", topicUuid: TOPIC });
    const earlierMessage = f.wire[0]!;
    creator.dispose();
    const latestUuid = crypto.randomUUID();
    f.publishKey(latestUuid);
    const announcement: WorkspaceMessengerMessageDto = {
      ...earlierMessage,
      uuid: crypto.randomUUID(),
      payload: {
        kind: "key_announced",
        key_uuid: f.metadata.keyUuid,
      },
    };
    vi.mocked(getMessagesPage).mockResolvedValue({
      items: [announcement],
      nextPageMarker: null,
      pageLimit: 100,
    });
    let recipient = await openSessionFor(f.member);
    await recipient.load();
    await recipient.requestKey(f.metadata.keyUuid);
    const request = f.wire.at(-1)!;
    expect(request.payload.kind).toBe("key_request");
    expect(request.payload).toMatchObject({ key_uuid: f.metadata.keyUuid });
    const historicalScope = { ...recipient.scope, keyUuid: f.metadata.keyUuid };
    const pendingBefore = await realChatKeyStorage.listPendingRequests(historicalScope);
    expect(pendingBefore).toHaveLength(1);
    recipient.dispose();
    recipient = await openSessionFor(f.member);
    await recipient.load();
    const issuer = await openSessionFor(f.admin);
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
    expect(getMessagesPage).not.toHaveBeenCalled();
    recipient.dispose();
    const restored = await openSessionFor(f.member);
    await restored.load();
    expect(await restored.decrypt(adaptMessengerMessage(earlierMessage))).toBe(
      "earlier generation text",
    );
    restored.dispose();
    issuer.dispose();
  });

  it("requests an unknown historical generation by its UUID", async () => {
    const f = await setup();
    const session = await openSessionFor(f.member);
    await session.load();
    const unknownUuid = crypto.randomUUID();
    await session.requestKey(unknownUuid);
    expect(f.wire.at(-1)?.payload).toMatchObject({ kind: "key_request", key_uuid: unknownUuid });
    expect(
      await realChatKeyStorage.listPendingRequests({ ...session.scope, keyUuid: unknownUuid }),
    ).toHaveLength(1);
    expect(
      await realChatKeyStorage.readChatKey({ ...session.scope, keyUuid: unknownUuid }),
    ).toMatchObject({ groupKey: null });
    session.dispose();
  });

  it("ignores unauthorized announcements while requests still address generations by UUID", async () => {
    const f = await setup();
    const session = await openSessionFor(f.member);
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
      },
    };
    await session.ingest([adaptMessengerMessage(spoofed)]);
    expect(
      await realChatKeyStorage.readChatKey({ ...session.scope, keyUuid: unknownUuid }),
    ).toBeNull();
    vi.mocked(getMessagesPage).mockResolvedValue({
      items: [spoofed],
      nextPageMarker: null,
      pageLimit: 100,
    });
    await session.requestKey(unknownUuid);
    expect(session.isIssuerAllowed(MEMBER)).toBe(false);
    expect(createMessage).toHaveBeenCalledOnce();
    expect(
      await realChatKeyStorage.readChatKey({ ...session.scope, keyUuid: unknownUuid }),
    ).toMatchObject({ groupKey: null });
    session.dispose();
  });

  it("does not persist metadata for a batch of untrusted unknown generations", async () => {
    const f = await setup();
    const session = await openSessionFor(f.member);
    await session.load();
    const writes = vi.spyOn(realChatKeyStorage, "writeChatKey");
    const unknown = Array.from({ length: 24 }, () => crypto.randomUUID());
    const messages: WorkspaceMessengerMessageDto[] = unknown.map((keyUuid, index) => ({
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
      payload:
        index % 2 === 0
          ? { kind: "key_announced", key_uuid: keyUuid }
          : {
              kind: "key_request",
              key_uuid: keyUuid,
              device_id: "other-device",
              device_name: "Other",
              public_key: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))),
            },
    }));
    await session.ingest(messages.map(adaptMessengerMessage));
    expect(writes).not.toHaveBeenCalled();
    for (const keyUuid of unknown)
      expect(await realChatKeyStorage.readChatKey({ ...session.scope, keyUuid })).toBeNull();
    // An explicit historical request may now persist metadata for its selected UUID.
    const selected = unknown[0]!;
    await session.requestKey(selected);
    expect(
      await realChatKeyStorage.readChatKey({ ...session.scope, keyUuid: selected }),
    ).toMatchObject({ groupKey: null });
    session.dispose();
  });

  it("does not change stored keys when an announcement repeats a generation UUID", async () => {
    const f = await setup();
    const creator = await openSessionFor(f.admin);
    await creator.load();
    const oldScope = creator.scope;
    const original = await realChatKeyStorage.readChatKey(oldScope);
    creator.dispose();
    // Every read in one session observes the same current generation.
    const latest = {
      ...f.stream(ADMIN),
      current_encryption_key_uuid: crypto.randomUUID(),
    };
    f.publishKey(latest.current_encryption_key_uuid);
    const issuer = await openSessionFor(f.admin);
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
      },
    };
    await issuer.ingest([adaptMessengerMessage(badAnnouncement)]);
    expect(await realChatKeyStorage.readChatKey(oldScope)).toEqual(original);
    expect(createMessage).not.toHaveBeenCalled();
    issuer.dispose();
  });

  it("lets an issuer reject an unknown historical request without requiring its secret metadata", async () => {
    const f = await setup();
    const session = await openSessionFor(f.admin);
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
    expect(
      await realChatKeyStorage.readChatKey({ ...session.scope, keyUuid: unknownUuid }),
    ).toBeNull();
    expect(session.getGenerationState(unknownUuid)).toMatchObject({ access: "missing" });
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
    const key = f.stream(ADMIN).current_encryption_key_uuid!;
    const shared = {
      runtimeContext: f.admin,
      streamUuid: STREAM,
      topicUuid: TOPIC,
      expectedCurrentKey: { keyUuid: key },
      messengerStore: f.catalog(f.admin),
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
        },
      }),
    ).rejects.toThrow("invalid-key");
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("addresses unknown history generations by UUID without requiring announcement metadata", async () => {
    const f = await setup();
    const session = await openSessionFor(f.member);
    await session.load();
    const unknownUuid = crypto.randomUUID();
    await session.requestKey(unknownUuid);
    expect(createMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        payload: expect.objectContaining({ kind: "key_request", key_uuid: unknownUuid }),
      }),
    );
    session.dispose();
  });

  it("restores a staged creator key after a lost create response and serializes concurrent sends to distinct topics", async () => {
    const f = await setup();
    const session = await openSessionFor(f.admin);
    await session.load();
    expect(session.getState().access).toBe("ready");
    const scopes = { owner: f.admin, deviceId: session.device.deviceId };
    expect(await realChatKeyStorage.listStagedCreations(scopes)).toEqual([]);
    const writeCache = vi
      .spyOn(messengerMessageActionCache, "writeConversationMessagePage")
      .mockResolvedValue(undefined);
    const secondTopic = crypto.randomUUID();
    const sent = await Promise.all([
      session.send({ text: "first private text", topicUuid: TOPIC }),
      session.send({
        text: "second private text",
        topicUuid: secondTopic,
        includeStreamConversation: false,
      }),
    ]);
    expect(sent.every((result) => result.status === "applied")).toBe(true);
    expect(f.wire.map((message) => message.topic_uuid)).toEqual([TOPIC, secondTopic]);
    expect(JSON.stringify(f.wire)).not.toContain("private text");
    expect(await session.decrypt(adaptMessengerMessage(f.wire[0]!))).toBe("first private text");
    expect(await session.decrypt(adaptMessengerMessage(f.wire[1]!))).toBe("second private text");
    expect(writeCache.mock.calls.map(([, conversationId]) => conversationId)).toEqual([
      conversationIdForTopic(STREAM, TOPIC),
      conversationIdForStream(STREAM),
      conversationIdForTopic(STREAM, secondTopic),
    ]);
    await session.requestKey();
    expect(f.wire.at(-1)?.topic_uuid).toBe(TOPIC);
    expect(writeCache.mock.calls.slice(-2).map(([, conversationId]) => conversationId)).toEqual([
      conversationIdForTopic(STREAM, TOPIC),
      conversationIdForStream(STREAM),
    ]);
    session.dispose();
  });

  it("completes a grant received before request history for a legacy unbound pending request after reload", async () => {
    const f = await setup();
    const admin = await openSessionFor(f.admin);
    await admin.load();
    await admin.send({ text: "protected history", topicUuid: TOPIC });
    let member = await openSessionFor(f.member);
    await member.load();
    expect(await member.decrypt(adaptMessengerMessage(f.wire[0]!))).toBeNull();
    expect(member.getRights().canGrant).toBe(false);
    // Older pending records can await request-history correlation after a lost receipt.
    const writePending = realChatKeyStorage.writePendingRequest.bind(realChatKeyStorage);
    vi.spyOn(realChatKeyStorage, "writePendingRequest").mockImplementationOnce(
      (address, pending, options) =>
        writePending(address, { ...pending, requestMessageUuid: null }, options),
    );
    vi.spyOn(realChatKeyStorage, "bindPendingRequest").mockRejectedValueOnce(
      new Error("local binding lost"),
    );
    await expect(member.requestKey()).rejects.toThrow("storage-failed");
    const request = f.wire.at(-1)!;
    const pending = await realChatKeyStorage.listPendingRequests(member.scope);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.requestMessageUuid).toBeNull();
    member.dispose();
    member = await openSessionFor(f.member);
    await member.load();
    expect(member.getState().requestStatus).toBe("requested");
    await admin.ingest(f.wire.map(adaptMessengerMessage));
    await admin.grantKey(request.uuid);
    const keyChanged = vi.fn();
    const unsubscribeKeys = subscribeRealChatKeyChanges(keyChanged);
    try {
      await member.ingest([adaptMessengerMessage(f.wire.at(-1)!)]);
      expect(member.getState().access).not.toBe("ready");
      expect(keyChanged).not.toHaveBeenCalled();
      await member.ingest([adaptMessengerMessage(request)]);
      expect(keyChanged.mock.calls).toEqual([
        [
          {
            kind: "updated",
            ownerKey: workspaceRuntimeOwnerKey(f.member),
            deviceId: member.device.deviceId,
            streamUuid: STREAM,
            keyUuid: f.metadata.keyUuid,
          },
        ],
      ]);
    } finally {
      unsubscribeKeys();
    }
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
    const session = await openSessionFor(f.admin);
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
  it("adopts a store-only generation update without refreshing the stream or participants", async () => {
    const f = await setup();
    const session = await openSessionFor(f.admin);
    await session.load();
    const oldScope = session.scope;
    const nextUuid = crypto.randomUUID();
    const key = await realChatCryptoProvider.createGroupKey();
    if (!key.ok) throw new Error(key.reason);
    await realChatKeyStorage.writeChatKey(
      { ...oldScope, keyUuid: nextUuid },
      { groupKey: key.value },
    );
    vi.mocked(getStream).mockClear();
    vi.mocked(getStreamBindingsPage).mockClear();
    f.catalog(f.admin)
      .getState()
      .upsertStream(
        workspaceRuntimeOwnerKey(f.admin),
        adaptMessengerStream({
          ...f.stream(ADMIN),
          current_encryption_key_uuid: nextUuid,
        }),
      );
    await vi.waitFor(() => {
      expect(session.scope.keyUuid).toBe(nextUuid);
      expect(session.getState()).toMatchObject({
        access: "ready",
        sendKeyUuid: nextUuid,
        pending: false,
      });
    });
    expect(oldScope.keyUuid).toBe(f.metadata.keyUuid);
    expect(session.getGenerationState(oldScope.keyUuid)?.access).toBe("ready");
    expect(getStream).not.toHaveBeenCalled();
    expect(getStreamBindingsPage).not.toHaveBeenCalled();
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("observes issuer promotion, demotion and removal directly from the store", async () => {
    const f = await setup();
    const session = await openSessionFor(f.admin);
    await session.load();
    const owner = workspaceRuntimeOwnerKey(f.admin);
    const catalog = f.catalog(f.admin);
    const changed = vi.fn();
    session.subscribe(changed);
    vi.mocked(getStream).mockClear();
    vi.mocked(getStreamBindingsPage).mockClear();
    catalog.getState().upsertStreamBindings(owner, [memberBinding()]);
    expect(session.isIssuerAllowed(MEMBER)).toBe(false);
    catalog.getState().upsertStreamBindings(owner, [memberBinding("administrator")]);
    expect(session.isIssuerAllowed(MEMBER)).toBe(true);
    catalog.getState().upsertStreamBindings(owner, [memberBinding()]);
    expect(session.isIssuerAllowed(MEMBER)).toBe(false);
    catalog.getState().upsertStreamBindings(owner, [memberBinding("administrator")]);
    expect(session.isIssuerAllowed(MEMBER)).toBe(true);
    catalog.getState().removeStreamBinding(owner, memberBinding());
    expect(session.isIssuerAllowed(MEMBER)).toBe(false);
    await vi.waitFor(() => expect(changed).toHaveBeenCalled());
    expect(getStream).not.toHaveBeenCalled();
    expect(getStreamBindingsPage).not.toHaveBeenCalled();
  });

  it("uses the current participant's binding role while stream metadata still has the old role", async () => {
    const f = await setup();
    const session = await openSessionFor(f.member);
    await session.load();
    const catalog = f.catalog(f.member);
    const owner = workspaceRuntimeOwnerKey(f.member);
    vi.mocked(getStream).mockClear();
    vi.mocked(getStreamBindingsPage).mockClear();
    expect(session.getRights().canGrant).toBe(false);
    catalog.getState().upsertStreamBindings(owner, [memberBinding("administrator")]);
    expect(session.getRights()).toMatchObject({
      canGrant: true,
      canReject: true,
      canRotate: false,
    });
    expect(catalog.getState().streamsById[STREAM]?.role).toBe("member");
    catalog
      .getState()
      .upsertStream(owner, adaptMessengerStream({ ...f.stream(MEMBER), role: "administrator" }));
    catalog.getState().upsertStreamBindings(owner, [memberBinding()]);
    expect(session.getRights()).toMatchObject({
      canGrant: false,
      canReject: false,
      canRotate: false,
    });
    expect(catalog.getState().streamsById[STREAM]?.role).toBe("administrator");
    catalog.getState().upsertStreamBindings(owner, [memberBinding("administrator")]);
    expect(session.getRights().canGrant).toBe(true);
    catalog.getState().replaceStreamBindingsForStream(owner, STREAM, [adminBinding()]);
    expect(session.getRights()).toMatchObject({
      canGrant: false,
      canReject: false,
      canRotate: false,
    });
    expect(getStream).not.toHaveBeenCalled();
    expect(getStreamBindingsPage).not.toHaveBeenCalled();
  });

  it("reprocesses a previously unauthorized HPKE grant when a new administrator binding arrives", async () => {
    const f = await setup();
    const admin = await openSessionFor(f.admin);
    const member = await openSessionFor(f.member);
    await admin.load();
    await member.load();
    await member.requestKey();
    const request = f.wire.at(-1)!;
    await admin.ingest([adaptMessengerMessage(request)]);
    await admin.grantKey(request.uuid);
    const newIssuer = "88888888-8888-4888-8888-888888888888";
    const grant = adaptMessengerMessage({
      ...f.wire.at(-1)!,
      user_uuid: newIssuer,
      author_uuid: newIssuer,
    });
    await member.ingest([adaptMessengerMessage(request), grant]);
    expect(member.isIssuerAllowed(newIssuer)).toBe(false);
    expect(member.getState()).toMatchObject({ access: "metadata-only", sendKeyUuid: null });
    expect(await realChatKeyStorage.listPendingRequests(member.scope)).toHaveLength(1);
    vi.mocked(getStream).mockClear();
    vi.mocked(getStreamBindingsPage).mockClear();
    const catalog = f.catalog(f.member);
    const binding = {
      ...memberBinding("administrator"),
      uuid: crypto.randomUUID(),
      userUuid: newIssuer,
    };
    catalog.getState().upsertStreamBindings(workspaceRuntimeOwnerKey(f.member), [binding]);
    await vi.waitFor(() =>
      expect(member.getState()).toMatchObject({
        access: "ready",
        sendKeyUuid: f.metadata.keyUuid,
        pending: false,
      }),
    );
    expect(member.getKeyRequestOutcomes()).toMatchObject([{ status: "granted" }]);
    expect(await realChatKeyStorage.listPendingRequests(member.scope)).toEqual([]);
    catalog
      .getState()
      .upsertStreamBindings(workspaceRuntimeOwnerKey(f.member), [{ ...binding, role: "member" }]);
    expect(member.isIssuerAllowed(newIssuer)).toBe(false);
    expect(member.getKeyRequestOutcomes()).toMatchObject([{ status: "pending" }]);
    expect(getStream).not.toHaveBeenCalled();
    expect(getStreamBindingsPage).not.toHaveBeenCalled();
  });

  it("does not dispatch a grant after permission is revoked during HPKE encryption", async () => {
    const f = await setup();
    const admin = await openSessionFor(f.admin);
    const member = await openSessionFor(f.member);
    await admin.load();
    await member.load();
    await member.requestKey();
    const request = f.wire.at(-1)!;
    await admin.ingest([adaptMessengerMessage(request)]);
    const started = deferred<void>();
    const gate = deferred<void>();
    const encrypt = realChatCryptoProvider.encryptGroupKeyGrant;
    vi.spyOn(realChatCryptoProvider, "encryptGroupKeyGrant").mockImplementationOnce(
      async (input) => {
        started.resolve();
        await gate.promise;
        return encrypt(input);
      },
    );
    vi.mocked(createMessage).mockClear();
    const granting = admin.grantKey(request.uuid);
    const rejected = expect(granting).rejects.toThrow("forbidden");
    await started.promise;
    f.catalog(f.admin)
      .getState()
      .upsertStream(
        workspaceRuntimeOwnerKey(f.admin),
        adaptMessengerStream({ ...f.stream(ADMIN), owner: MEMBER, role: "member" }),
      );
    f.catalog(f.admin)
      .getState()
      .upsertStreamBindings(workspaceRuntimeOwnerKey(f.admin), [
        { ...adminBinding(), role: "member" },
      ]);
    gate.resolve();
    await rejected;
    expect(createMessage).not.toHaveBeenCalled();
    expect(admin.getKeyRequests().map((item) => item.uuid)).toEqual([request.uuid]);
  });

  it("does not fall back to stale administrator metadata after the current participant's binding is deleted", async () => {
    const f = await setup();
    const admin = await openSessionFor(f.admin);
    const member = await openSessionFor(f.member);
    await admin.load();
    await member.load();
    await member.requestKey();
    const original = f.wire.at(-1)!;
    await admin.ingest([adaptMessengerMessage(original)]);
    await admin.grantKey(original.uuid);
    await member.ingest(f.wire.map(adaptMessengerMessage));
    const catalog = f.catalog(f.member);
    catalog
      .getState()
      .upsertStream(
        workspaceRuntimeOwnerKey(f.member),
        adaptMessengerStream({ ...f.stream(MEMBER), role: "administrator" }),
      );
    catalog
      .getState()
      .upsertStreamBindings(workspaceRuntimeOwnerKey(f.member), [memberBinding("administrator")]);
    if (original.payload.kind !== "key_request") throw new Error("Missing request fixture");
    const request = {
      ...original,
      uuid: crypto.randomUUID(),
      payload: { ...original.payload, device_id: "new-device" },
    };
    await member.ingest([adaptMessengerMessage(request)]);
    expect(member.canGrantKey(request.uuid)).toBe(true);
    const started = deferred<void>();
    const gate = deferred<void>();
    const encrypt = realChatCryptoProvider.encryptGroupKeyGrant;
    vi.spyOn(realChatCryptoProvider, "encryptGroupKeyGrant").mockImplementationOnce(
      async (input) => {
        started.resolve();
        await gate.promise;
        return encrypt(input);
      },
    );
    vi.mocked(createMessage).mockClear();
    const granting = member.grantKey(request.uuid);
    const rejected = expect(granting).rejects.toThrow("forbidden");
    await started.promise;
    catalog.getState().removeStreamBinding(workspaceRuntimeOwnerKey(f.member), memberBinding());
    expect(catalog.getState().streamsById[STREAM]?.role).toBe("administrator");
    expect(member.getRights().canGrant).toBe(false);
    gate.resolve();
    await rejected;
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("keeps encryption bound to its generation and rejects dispatch when the stream changes mid-operation", async () => {
    const f = await setup();
    const session = await openSessionFor(f.admin);
    await session.load();
    const oldUuid = session.scope.keyUuid;
    const nextUuid = crypto.randomUUID();
    const key = await realChatCryptoProvider.createGroupKey();
    if (!key.ok) throw new Error(key.reason);
    await realChatKeyStorage.writeChatKey(
      { ...session.scope, keyUuid: nextUuid },
      { groupKey: key.value },
    );
    const started = deferred<void>();
    const gate = deferred<void>();
    const encrypt = realChatCryptoProvider.encryptMessage;
    const encryption = vi
      .spyOn(realChatCryptoProvider, "encryptMessage")
      .mockImplementationOnce(async (input) => {
        started.resolve();
        await gate.promise;
        return encrypt(input);
      });
    const sending = session.send({ text: "generation race", topicUuid: TOPIC });
    const rejected = expect(sending).rejects.toThrow("send-failed");
    await started.promise;
    const nextStream = { ...f.stream(ADMIN), current_encryption_key_uuid: nextUuid };
    f.catalog(f.admin)
      .getState()
      .upsertStream(workspaceRuntimeOwnerKey(f.admin), adaptMessengerStream(nextStream));
    gate.resolve();
    await rejected;
    expect(encryption.mock.calls[0]?.[0].context.keyUuid).toBe(oldUuid);
    expect(createMessage).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(session.getState()).toMatchObject({
        access: "ready",
        sendKeyUuid: nextUuid,
        pending: false,
      }),
    );
    await session.send({ text: "after reconciliation", topicUuid: TOPIC });
    expect(encryption.mock.calls.at(-1)?.[0].context.keyUuid).toBe(nextUuid);
    expect(f.wire.at(-1)?.payload).toMatchObject({ kind: "e2ee", key_uuid: nextUuid });
    expect(await session.decrypt(adaptMessengerMessage(f.wire.at(-1)!))).toBe(
      "after reconciliation",
    );
  });

  it("reconciles the latest store generation when another update arrives during local key loading", async () => {
    const f = await setup();
    const session = await openSessionFor(f.admin);
    await session.load();
    const oldScope = session.scope;
    const secondUuid = crypto.randomUUID();
    const thirdUuid = crypto.randomUUID();
    for (const keyUuid of [secondUuid, thirdUuid]) {
      const key = await realChatCryptoProvider.createGroupKey();
      if (!key.ok) throw new Error(key.reason);
      await realChatKeyStorage.writeChatKey({ ...oldScope, keyUuid }, { groupKey: key.value });
    }
    const started = deferred<void>();
    const gate = deferred<void>();
    const read = realChatKeyStorage.readChatKey.bind(realChatKeyStorage);
    let paused = false;
    vi.spyOn(realChatKeyStorage, "readChatKey").mockImplementation(async (scope) => {
      if (!paused && scope.keyUuid === secondUuid) {
        paused = true;
        started.resolve();
        await gate.promise;
      }
      return read(scope);
    });
    vi.mocked(getStream).mockClear();
    vi.mocked(getStreamBindingsPage).mockClear();
    const update = (keyUuid: string) =>
      f
        .catalog(f.admin)
        .getState()
        .upsertStream(
          workspaceRuntimeOwnerKey(f.admin),
          adaptMessengerStream({
            ...f.stream(ADMIN),
            current_encryption_key_uuid: keyUuid,
          }),
        );
    update(secondUuid);
    await started.promise;
    update(thirdUuid);
    expect(session.scope.keyUuid).toBe(thirdUuid);
    gate.resolve();
    await vi.waitFor(() =>
      expect(session.getState()).toMatchObject({
        access: "ready",
        sendKeyUuid: thirdUuid,
        pending: false,
      }),
    );
    expect(oldScope.keyUuid).toBe(f.metadata.keyUuid);
    expect(getStream).not.toHaveBeenCalled();
    expect(getStreamBindingsPage).not.toHaveBeenCalled();
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("selects the current generation when a default request was queued before the stream changed", async () => {
    const f = await setup();
    const session = await openSessionFor(f.member);
    const started = deferred<void>();
    const gate = deferred<void>();
    const lookup = realChatKeyStorage.readLastAvailableChatKey.bind(realChatKeyStorage);
    vi.spyOn(realChatKeyStorage, "readLastAvailableChatKey").mockImplementationOnce(
      async (scope) => {
        started.resolve();
        await gate.promise;
        return lookup(scope);
      },
    );
    const loading = session.load();
    await started.promise;
    const requesting = session.requestKey();
    const nextUuid = crypto.randomUUID();
    const nextStream = { ...f.stream(MEMBER), current_encryption_key_uuid: nextUuid };
    f.catalog(f.member)
      .getState()
      .upsertStream(workspaceRuntimeOwnerKey(f.member), adaptMessengerStream(nextStream));
    gate.resolve();
    await loading;
    await requesting;
    expect(f.wire.at(-1)?.payload).toMatchObject({ kind: "key_request", key_uuid: nextUuid });
    expect(
      await realChatKeyStorage.listPendingRequests({
        ...session.scope,
        keyUuid: f.metadata.keyUuid,
      }),
    ).toEqual([]);
  });

  it("retries failed local reconciliation on the next store update without a network refresh", async () => {
    const f = await setup();
    const session = await openSessionFor(f.admin);
    await session.load();
    const nextUuid = crypto.randomUUID();
    const key = await realChatCryptoProvider.createGroupKey();
    if (!key.ok) throw new Error(key.reason);
    await realChatKeyStorage.writeChatKey(
      { ...session.scope, keyUuid: nextUuid },
      { groupKey: key.value },
    );
    const read = realChatKeyStorage.readChatKey.bind(realChatKeyStorage);
    let failed = false;
    vi.spyOn(realChatKeyStorage, "readChatKey").mockImplementation(async (scope) => {
      if (!failed && scope.keyUuid === nextUuid) {
        failed = true;
        throw new Error("local storage temporarily unavailable");
      }
      return read(scope);
    });
    vi.mocked(getStream).mockClear();
    vi.mocked(getStreamBindingsPage).mockClear();
    const nextStream = adaptMessengerStream({
      ...f.stream(ADMIN),
      current_encryption_key_uuid: nextUuid,
    });
    const catalog = f.catalog(f.admin);
    catalog.getState().upsertStream(workspaceRuntimeOwnerKey(f.admin), nextStream);
    await vi.waitFor(() => {
      expect(failed).toBe(true);
      expect(session.getState()).toMatchObject({ pending: false, error: "unavailable" });
    });
    catalog.getState().upsertStream(workspaceRuntimeOwnerKey(f.admin), {
      ...nextStream,
      updatedAt: "2026-10-08T00:00:00Z",
    });
    await vi.waitFor(() =>
      expect(session.getState()).toMatchObject({
        access: "ready",
        sendKeyUuid: nextUuid,
        pending: false,
        error: null,
      }),
    );
    expect(getStream).not.toHaveBeenCalled();
    expect(getStreamBindingsPage).not.toHaveBeenCalled();
  });

  it("unsubscribes on dispose and cannot reconcile or dispatch after cleanup", async () => {
    const f = await setup();
    const catalog = f.catalog(f.admin);
    const subscribe = catalog.subscribe;
    const unsubscribed = vi.fn();
    vi.spyOn(catalog, "subscribe").mockImplementation((listener) => {
      const cleanup = subscribe(listener);
      return () => {
        unsubscribed();
        cleanup();
      };
    });
    const session = await openSessionFor(f.admin);
    await session.load();
    const changed = vi.fn();
    session.subscribe(changed);
    const read = vi.spyOn(realChatKeyStorage, "readChatKey");
    read.mockClear();
    session.dispose();
    expect(unsubscribed).toHaveBeenCalledOnce();
    changed.mockClear();
    catalog.getState().upsertStream(
      workspaceRuntimeOwnerKey(f.admin),
      adaptMessengerStream({
        ...f.stream(ADMIN),
        current_encryption_key_uuid: crypto.randomUUID(),
      }),
    );
    await expect(session.send({ text: "disposed", topicUuid: TOPIC })).rejects.toThrow("stale");
    expect(read).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("permanently rejects a session after the store owner leaves and returns", async () => {
    const f = await setup();
    const session = await openSessionFor(f.admin);
    await session.load();
    const catalog = f.catalog(f.admin);
    catalog.setState({ ownerKey: workspaceRuntimeOwnerKey(f.member) });
    catalog.setState({ ownerKey: workspaceRuntimeOwnerKey(f.admin) });
    expect(session.getState()).toMatchObject({
      access: "missing",
      error: "stale",
      sendKeyUuid: null,
    });
    expect(session.getRights().canGrant).toBe(false);
    vi.mocked(getStream).mockClear();
    await expect(session.send({ text: "owner ABA", topicUuid: TOPIC })).rejects.toThrow("stale");
    expect(getStream).not.toHaveBeenCalled();
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("opens on the current owned store key and roles while HTTP is unavailable", async () => {
    const f = await setup();
    const oldStream = f.stream(ADMIN);
    const nextUuid = crypto.randomUUID();
    const catalog = f.catalog(f.admin);
    const owner = workspaceRuntimeOwnerKey(f.admin);
    catalog.getState().upsertStream(
      owner,
      adaptMessengerStream({
        ...oldStream,
        owner: MEMBER,
        role: "member",
        current_encryption_key_uuid: nextUuid,
      }),
    );
    catalog.getState().upsertStreamBindings(owner, [{ ...adminBinding(), role: "member" }]);
    const session = await openSessionFor(f.admin);
    await session.load();
    expect(session.scope.keyUuid).toBe(nextUuid);
    expect(session.getRights()).toMatchObject({
      canGrant: false,
      canReject: false,
      canRotate: false,
    });
    expect(catalog.getState().streamsById[STREAM]?.ownerUuid).toBe(MEMBER);
    expect(getStream).not.toHaveBeenCalled();
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("initializes from the latest store generation when it changes during device identity loading", async () => {
    const f = await setup();
    const identity = await realChatKeyStorage.readDeviceIdentity(f.admin);
    if (!identity) throw new Error("Missing device identity fixture");
    const nextUuid = crypto.randomUUID();
    const key = await realChatCryptoProvider.createGroupKey();
    if (!key.ok) throw new Error(key.reason);
    await realChatKeyStorage.writeChatKey(
      { owner: f.admin, deviceId: identity.deviceId, streamUuid: STREAM, keyUuid: nextUuid },
      { groupKey: key.value },
    );
    const started = deferred<void>();
    const gate = deferred<void>();
    const read = realChatKeyStorage.readDeviceIdentity.bind(realChatKeyStorage);
    vi.spyOn(realChatKeyStorage, "readDeviceIdentity").mockImplementationOnce(async (owner) => {
      started.resolve();
      await gate.promise;
      return read(owner);
    });
    const opening = openRealChatSession({
      runtimeContext: f.admin,
      streamUuid: STREAM,
      getRuntimeContext: () => f.admin,
    });
    await started.promise;
    const nextStream = { ...f.stream(ADMIN), current_encryption_key_uuid: nextUuid };
    f.catalog(f.admin)
      .getState()
      .upsertStream(workspaceRuntimeOwnerKey(f.admin), adaptMessengerStream(nextStream));
    gate.resolve();
    const session = await opening;
    expect(session.scope.keyUuid).toBe(nextUuid);
    await session.load();
    expect(session.getState()).toMatchObject({ access: "ready", sendKeyUuid: nextUuid });
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("invalidates the session when the stream is removed from the current owner's store", async () => {
    const f = await setup();
    const session = await openSessionFor(f.admin);
    await session.load();
    f.catalog(f.admin).setState({ streamsById: {}, streamIds: [] });
    expect(session.getState()).toMatchObject({
      access: "missing",
      error: "stale",
      sendKeyUuid: null,
    });
    vi.mocked(getStream).mockClear();
    await expect(session.send({ text: "removed stream", topicUuid: TOPIC })).rejects.toThrow(
      "stale",
    );
    expect(getStream).not.toHaveBeenCalled();
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("does not open a session against an unowned or different owner's store", async () => {
    const f = await setup();
    const catalog = f.catalog(f.admin);
    for (const ownerKey of [null, workspaceRuntimeOwnerKey(f.member)]) {
      catalog.setState({ ownerKey });
      await expect(
        openRealChatSession({
          runtimeContext: f.admin,
          streamUuid: STREAM,
          getRuntimeContext: () => f.admin,
        }),
      ).rejects.toThrow("stale");
    }
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("keeps normal text sending available after a live management-role revocation", async () => {
    const f = await setup();
    const owner = workspaceRuntimeOwnerKey(f.admin);
    const catalog = f.catalog(f.admin);
    const session = await openSessionFor(f.admin);
    await session.load();
    catalog
      .getState()
      .upsertStream(
        owner,
        adaptMessengerStream({ ...f.stream(ADMIN), owner: MEMBER, role: "member" }),
      );
    catalog.getState().upsertStreamBindings(owner, [{ ...adminBinding(), role: "member" }]);
    expect(session.getRights()).toMatchObject({ canSend: true, canGrant: false, canRotate: false });
    const sent = await session.send({ text: "still a participant", topicUuid: TOPIC });
    expect(sent.status).toBe("applied");
    expect(catalog.getState().streamsById[STREAM]?.ownerUuid).toBe(MEMBER);
    expect(createMessage).toHaveBeenCalledOnce();
    expect(await session.decrypt(adaptMessengerMessage(f.wire.at(-1)!))).toBe(
      "still a participant",
    );
    session.dispose();
  });
});
