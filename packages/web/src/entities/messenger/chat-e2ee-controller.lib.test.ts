import { describe, expect, it, vi } from "vitest";
import { ChatE2eeController } from "./chat-e2ee-controller.lib";
import type { ChatCryptoProvider, ChatCryptoResult } from "./chat-crypto-provider.types";
import type {
  ChatE2eeControllerRights,
  ChatE2eeControllerScope,
} from "./chat-e2ee-controller.types";
import type {
  ChatE2eeMessage,
  ChatKeyGrantPayload,
  ChatKeyRequestPayload,
} from "./chat-e2ee.types";
import type { ChatKeyStorage, StoredChatKey } from "./chat-key-storage.types";

const ok = <T>(value: T): ChatCryptoResult<T> => ({ ok: true, value });
const devicePair = { publicKey: { bytes: new Uint8Array([1]) }, privateKey: "device-private" };
const chatPair = { publicKey: { bytes: new Uint8Array([2]) }, privateKey: "chat-private" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function fixture(initialKey: StoredChatKey<string> | null = { ...chatPair, privateKey: null }) {
  const scope: ChatE2eeControllerScope = {
    owner: { accountId: "a", instanceId: "i", organizationId: "o", projectId: "p", userUuid: "u" },
    runtimeGeneration: 1,
    deviceId: "device",
    streamUuid: "chat",
    keyUuid: "generation",
  };
  let current: ChatE2eeControllerScope | null = scope;
  let key = initialKey;
  let issuerAllowed = true;
  let announcerAllowed = true;
  let rights: ChatE2eeControllerRights = {
    canRequest: true,
    canGrant: true,
    canReject: true,
    canRotate: true,
    canSend: true,
  };
  const provider: ChatCryptoProvider<string> = {
    createDeviceKeyPair: vi.fn(() => Promise.resolve(ok(devicePair))),
    createChatKeyPair: vi.fn(() => Promise.resolve(ok(chatPair))),
    encryptMessage: vi.fn(() => Promise.resolve(ok({ bytes: new Uint8Array([3]) }))),
    decryptMessage: vi.fn(() => Promise.resolve(ok(new Uint8Array([4])))),
    encryptChatKeyGrant: vi.fn(() => Promise.resolve(ok({ bytes: new Uint8Array([5]) }))),
    decryptChatKeyGrant: vi.fn(() => Promise.resolve(ok(chatPair))),
  };
  const storage: ChatKeyStorage<string> = {
    readDeviceIdentity: vi.fn(() => Promise.resolve(null)),
    writeDeviceIdentity: vi.fn(() => Promise.resolve()),
    readChatKey: vi.fn(() => Promise.resolve(key)),
    writeChatKey: vi.fn((_address, next, options) => {
      if (options?.isCurrent() === false) return Promise.resolve();
      key = next;
      return Promise.resolve();
    }),
    removeChatKey: vi.fn(() => {
      key = null;
      return Promise.resolve();
    }),
  };
  const sendPayload = vi.fn(
    (payload: ChatE2eeMessage["payload"], isCurrent: () => boolean): Promise<ChatE2eeMessage> => {
      if (!isCurrent()) throw new Error("stale");
      return Promise.resolve({
        uuid: "sent",
        streamUuid: scope.streamUuid,
        authorUuid: scope.owner.userUuid,
        payload,
      });
    },
  );
  const controller = new ChatE2eeController({
    scope,
    device: { deviceId: scope.deviceId, deviceName: "MacBook", keyPair: devicePair },
    provider,
    storage,
    getCurrentScope: () => current,
    getRights: () => rights,
    isIssuerAllowed: () => issuerAllowed,
    isAnnouncerAllowed: () => announcerAllowed,
    sendPayload,
  });
  const request: ChatE2eeMessage<ChatKeyRequestPayload> = {
    uuid: "request",
    streamUuid: scope.streamUuid,
    authorUuid: scope.owner.userUuid,
    payload: {
      kind: "key_request",
      keyUuid: scope.keyUuid,
      deviceId: scope.deviceId,
      deviceName: "MacBook",
      publicKey: devicePair.publicKey,
    },
  };
  const grant: ChatE2eeMessage<ChatKeyGrantPayload> = {
    uuid: "grant",
    streamUuid: scope.streamUuid,
    authorUuid: "issuer",
    payload: {
      kind: "key_grant",
      keyUuid: scope.keyUuid,
      requestMessageUuid: request.uuid,
      senderDeviceId: "issuer-device",
      recipientDeviceId: scope.deviceId,
      content: { bytes: new Uint8Array([5]) },
    },
  };
  return {
    controller,
    provider,
    storage,
    sendPayload,
    scope,
    request,
    grant,
    readKey: () => key,
    setCurrent: (next: ChatE2eeControllerScope | null) => {
      current = next;
    },
    setRights: (next: Partial<ChatE2eeControllerRights>) => {
      rights = { ...rights, ...next };
    },
    setIssuerAllowed: (next: boolean) => {
      issuerAllowed = next;
    },
    setAnnouncerAllowed: (next: boolean) => {
      announcerAllowed = next;
    },
  };
}

describe("ChatE2eeController", () => {
  it("waits for an out-of-order request and stores a verified grant once across duplicates", async () => {
    const f = fixture();
    expect(await f.controller.ingestKeyMessage(f.grant)).toEqual({ ok: true, value: undefined });
    expect(f.provider.decryptChatKeyGrant).not.toHaveBeenCalled();
    await f.controller.ingestKeyMessage(f.request);
    await Promise.all([
      f.controller.ingestKeyMessage(f.grant),
      f.controller.ingestKeyMessage(f.grant),
    ]);
    expect(f.provider.decryptChatKeyGrant).toHaveBeenCalledTimes(1);
    expect(f.storage.writeChatKey).toHaveBeenCalledTimes(1);
    expect(f.readKey()?.privateKey).toBe("chat-private");
    expect(f.controller.getState()).toMatchObject({
      access: "ready",
      requestStatus: "grant-received",
    });
  });

  it("waits for a key announcement before decrypting an otherwise matched grant", async () => {
    const f = fixture(null);
    await f.controller.ingestKeyMessage(f.request);
    await f.controller.ingestKeyMessage(f.grant);
    expect(f.provider.decryptChatKeyGrant).not.toHaveBeenCalled();
    await f.controller.ingestKeyMessage({
      uuid: "announcement",
      streamUuid: "chat",
      authorUuid: "issuer",
      payload: { kind: "key_announced", keyUuid: "generation", publicKey: chatPair.publicKey },
    });
    expect(f.readKey()?.privateKey).toBe("chat-private");
  });

  it("rejects a provider result with a different public key without storing its private key", async () => {
    const f = fixture();
    vi.mocked(f.provider.decryptChatKeyGrant).mockResolvedValue(
      ok({ publicKey: { bytes: new Uint8Array([99]) }, privateKey: "wrong-private" }),
    );
    await f.controller.ingestKeyMessage(f.request);
    expect(await f.controller.ingestKeyMessage(f.grant)).toEqual({
      ok: false,
      reason: "invalid-key",
    });
    expect(f.storage.writeChatKey).not.toHaveBeenCalled();
    expect(f.readKey()?.privateKey).toBeNull();
  });

  it("does not revive an old grant when owner A returns after B with a newer generation", async () => {
    const f = fixture();
    const decrypted = deferred<ChatCryptoResult<typeof chatPair>>();
    const started = deferred<void>();
    vi.mocked(f.provider.decryptChatKeyGrant).mockImplementation(() => {
      started.resolve();
      return decrypted.promise;
    });
    await f.controller.ingestKeyMessage(f.request);
    const operation = f.controller.ingestKeyMessage(f.grant);
    await started.promise;
    f.setCurrent({ ...f.scope, owner: { ...f.scope.owner, accountId: "b" }, runtimeGeneration: 2 });
    f.setCurrent({ ...f.scope, runtimeGeneration: 3 });
    decrypted.resolve(ok(chatPair));
    expect(await operation).toEqual({ ok: false, reason: "stale" });
    expect(f.storage.writeChatKey).not.toHaveBeenCalled();
    expect(f.controller.getState().access).toBe("missing");
  });

  it.each([
    { deviceId: "other-device" },
    { streamUuid: "other-chat" },
    { keyUuid: "other-generation" },
  ])("invalidates a pending decryption when its scope changes: %j", async (change) => {
    const f = fixture(chatPair);
    const decrypted = deferred<ChatCryptoResult<Uint8Array>>();
    const started = deferred<void>();
    vi.mocked(f.provider.decryptMessage).mockImplementation(() => {
      started.resolve();
      return decrypted.promise;
    });
    const operation = f.controller.decryptMessage({
      uuid: "ciphertext",
      streamUuid: "chat",
      authorUuid: "author",
      payload: { kind: "e2ee", keyUuid: "generation", content: { bytes: new Uint8Array([3]) } },
    });
    await started.promise;
    f.setCurrent({ ...f.scope, ...change });
    decrypted.resolve(ok(new Uint8Array([42])));
    expect(await operation).toEqual({ ok: false, reason: "stale" });
  });

  it("guards a delayed durable commit and never stores an old runtime grant", async () => {
    const f = fixture();
    const commit = deferred<void>();
    const started = deferred<void>();
    let committed = false;
    vi.mocked(f.storage.writeChatKey).mockImplementation(async (_address, _key, options) => {
      started.resolve();
      await commit.promise;
      if (options?.isCurrent()) committed = true;
    });
    await f.controller.ingestKeyMessage(f.request);
    const operation = f.controller.ingestKeyMessage(f.grant);
    await started.promise;
    f.setCurrent({ ...f.scope, runtimeGeneration: 3 });
    commit.resolve();
    expect(await operation).toEqual({ ok: false, reason: "stale" });
    expect(committed).toBe(false);
    expect(f.readKey()?.privateKey).toBeNull();
  });

  it("rechecks issuer authorization at durable commit", async () => {
    const f = fixture();
    const commit = deferred<void>();
    const started = deferred<void>();
    let committed = false;
    vi.mocked(f.storage.writeChatKey).mockImplementation(async (_address, _key, options) => {
      started.resolve();
      await commit.promise;
      committed = options?.isCurrent() ?? false;
    });
    await f.controller.ingestKeyMessage(f.request);
    const operation = f.controller.ingestKeyMessage(f.grant);
    await started.promise;
    f.setIssuerAllowed(false);
    commit.resolve();
    expect(await operation).toEqual({ ok: false, reason: "forbidden" });
    expect(committed).toBe(false);
  });

  it("rechecks issuance rights after crypto finishes and does not send a revoked grant", async () => {
    const f = fixture(chatPair);
    const encrypted = deferred<ChatCryptoResult<{ bytes: Uint8Array }>>();
    const started = deferred<void>();
    vi.mocked(f.provider.encryptChatKeyGrant).mockImplementation(() => {
      started.resolve();
      return encrypted.promise;
    });
    const operation = f.controller.grantKey(f.request);
    await started.promise;
    f.setRights({ canGrant: false });
    encrypted.resolve(ok({ bytes: new Uint8Array([5]) }));
    expect(await operation).toEqual({ ok: false, reason: "forbidden" });
    expect(f.sendPayload).not.toHaveBeenCalled();
  });

  it("keeps a failed provider retryable and never treats delivery as access", async () => {
    const f = fixture();
    await f.controller.ingestKeyMessage(f.request);
    vi.mocked(f.provider.decryptChatKeyGrant).mockResolvedValueOnce({
      ok: false,
      reason: "unavailable",
    });
    expect(await f.controller.ingestKeyMessage(f.grant)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(f.readKey()?.privateKey).toBeNull();
    expect(f.controller.getState().access).toBe("public-only");
    expect(await f.controller.ingestKeyMessage(f.grant)).toEqual({ ok: true, value: undefined });
    expect(f.controller.getState().access).toBe("ready");
  });

  it("does not accept a request for another account even when its device ID collides", async () => {
    const f = fixture();
    await f.controller.ingestKeyMessage({ ...f.request, authorUuid: "another-account" });
    expect(await f.controller.ingestKeyMessage(f.grant)).toEqual({
      ok: false,
      reason: "invalid-message",
    });
    expect(f.provider.decryptChatKeyGrant).not.toHaveBeenCalled();
  });

  it("does not accept a colliding device ID with a different request public key", async () => {
    const f = fixture();
    await f.controller.ingestKeyMessage({
      ...f.request,
      payload: { ...f.request.payload, publicKey: { bytes: new Uint8Array([99]) } },
    });
    expect(await f.controller.ingestKeyMessage(f.grant)).toEqual({
      ok: false,
      reason: "invalid-message",
    });
    expect(f.provider.decryptChatKeyGrant).not.toHaveBeenCalled();
    expect(f.storage.writeChatKey).not.toHaveBeenCalled();
  });

  it("discards a queued invalid response without blocking the later valid grant", async () => {
    const f = fixture();
    await f.controller.ingestKeyMessage({
      ...f.grant,
      uuid: "bad-grant",
      payload: { ...f.grant.payload, recipientDeviceId: "another-device" },
    });
    await f.controller.ingestKeyMessage(f.grant);
    expect(await f.controller.ingestKeyMessage(f.request)).toEqual({
      ok: false,
      reason: "invalid-message",
    });
    expect(f.readKey()?.privateKey).toBe("chat-private");
    expect(f.provider.decryptChatKeyGrant).toHaveBeenCalledTimes(1);
    expect(await f.controller.ingestKeyMessage(f.request)).toEqual({ ok: true, value: undefined });
  });

  it("continues a pending batch when one grant temporarily cannot be decrypted", async () => {
    const f = fixture();
    await f.controller.ingestKeyMessage({ ...f.grant, uuid: "unavailable-grant" });
    await f.controller.ingestKeyMessage(f.grant);
    vi.mocked(f.provider.decryptChatKeyGrant).mockResolvedValueOnce({
      ok: false,
      reason: "unavailable",
    });
    await f.controller.ingestKeyMessage(f.request);
    expect(f.readKey()?.privateKey).toBe("chat-private");
    expect(f.provider.decryptChatKeyGrant).toHaveBeenCalledTimes(2);
  });

  it("a refusal does not remove an already stored private key", async () => {
    const f = fixture(chatPair);
    await f.controller.loadKey();
    await f.controller.ingestKeyMessage(f.request);
    await f.controller.ingestKeyMessage({
      ...f.grant,
      payload: {
        kind: "key_reject",
        keyUuid: f.grant.payload.keyUuid,
        requestMessageUuid: f.grant.payload.requestMessageUuid,
        senderDeviceId: f.grant.payload.senderDeviceId,
        recipientDeviceId: f.grant.payload.recipientDeviceId,
      },
    });
    expect(f.readKey()?.privateKey).toBe("chat-private");
    expect(f.controller.getState()).toMatchObject({ access: "ready", requestStatus: "idle" });
    expect(f.storage.removeChatKey).not.toHaveBeenCalled();
  });

  it("a late public-only read cannot downgrade a grant that has just been committed", async () => {
    const f = fixture();
    const staleRead = deferred<StoredChatKey<string> | null>();
    vi.mocked(f.storage.readChatKey).mockImplementationOnce(() => staleRead.promise);
    const loading = f.controller.loadKey();
    await f.controller.ingestKeyMessage(f.request);
    await f.controller.ingestKeyMessage(f.grant);
    staleRead.resolve({ publicKey: chatPair.publicKey, privateKey: null });
    await loading;
    expect(f.controller.getState().access).toBe("ready");
  });

  it("sends key requests and rejects without inventing private keys", async () => {
    const f = fixture();
    const requested = await f.controller.requestKey();
    expect(requested.ok).toBe(true);
    expect(f.controller.getState().requestStatus).toBe("requested");
    const rejected = await f.controller.rejectKey(f.request);
    expect(rejected.ok).toBe(true);
    expect(f.sendPayload.mock.calls.map(([payload]) => payload.kind)).toEqual([
      "key_request",
      "key_reject",
    ]);
    expect(f.readKey()?.privateKey).toBeNull();
  });

  it("blocks grants without private keys and uses a public key for encrypted sends", async () => {
    const f = fixture();
    expect(await f.controller.grantKey(f.request)).toEqual({ ok: false, reason: "missing-key" });
    const sent = await f.controller.encryptMessage(new Uint8Array([42]));
    expect(sent.ok).toBe(true);
    expect(f.sendPayload.mock.calls[0]?.[0].kind).toBe("e2ee");
  });

  it("invalidation permanently closes an instance even if the same scope returns", async () => {
    const f = fixture(chatPair);
    await f.controller.loadKey();
    f.controller.invalidate();
    f.setCurrent(f.scope);
    expect(await f.controller.requestKey()).toEqual({ ok: false, reason: "stale" });
    expect(f.controller.getState().access).toBe("missing");
    expect(f.sendPayload).not.toHaveBeenCalled();
  });

  it("requires separate announcement authorization even if the author may grant keys", async () => {
    const f = fixture(null);
    f.setAnnouncerAllowed(false);
    expect(
      await f.controller.ingestKeyMessage({
        uuid: "announcement",
        streamUuid: "chat",
        authorUuid: "issuer",
        payload: { kind: "key_announced", keyUuid: "generation", publicKey: chatPair.publicKey },
      }),
    ).toEqual({ ok: false, reason: "forbidden" });
    expect(f.storage.writeChatKey).not.toHaveBeenCalled();
  });
});
