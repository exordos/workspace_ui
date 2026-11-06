import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDeviceName } from "~/shared/lib/device-name.lib";
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
import type {
  ChatKeyStorage,
  StoredChatKey,
  PendingChatKeyRequest,
  ChatKeyRequestCompletion,
} from "./chat-key-storage.types";

vi.mock("~/shared/lib/device-name.lib", () => ({ getDeviceName: vi.fn() }));

beforeEach(() => {
  vi.mocked(getDeviceName).mockReset().mockResolvedValue("MacBook");
});

const ok = <T>(value: T): ChatCryptoResult<T> => ({ ok: true, value });
const devicePair = { publicKey: { bytes: new Uint8Array([1]) }, privateKey: new Uint8Array([1]) };
const groupKey = { bytes: new Uint8Array(32).fill(2) };
const chatPair = { groupKey };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function fixture(initialKey: StoredChatKey | null = { ...chatPair, groupKey: null }) {
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
  let requesterAllowed = true;
  let rights: ChatE2eeControllerRights = {
    canRequest: true,
    canGrant: true,
    canReject: true,
    canRotate: true,
    canSend: true,
  };
  const provider: ChatCryptoProvider = {
    createRequestKeyPair: vi.fn(() => Promise.resolve(ok(devicePair))),
    createGroupKey: vi.fn(() => Promise.resolve(ok(groupKey))),
    encryptMessage: vi.fn(() => Promise.resolve(ok({ bytes: new Uint8Array([3]) }))),
    decryptMessage: vi.fn(() => Promise.resolve(ok(new Uint8Array([4])))),
    encryptGroupKeyGrant: vi.fn(() => Promise.resolve(ok({ bytes: new Uint8Array([5]) }))),
    decryptGroupKeyGrant: vi.fn(() => Promise.resolve(ok(groupKey))),
  };
  const pending = new Map<string, PendingChatKeyRequest>([
    [
      "request",
      { localRequestId: "request", requestMessageUuid: "request", ...devicePair, createdAt: 1 },
    ],
  ]);
  const completions = new Map<string, ChatKeyRequestCompletion>();
  const storage: ChatKeyStorage = {
    listChatKeys: vi.fn().mockResolvedValue([]),
    readChatKeyDeletionRevision: vi.fn().mockResolvedValue(0),
    readLastAvailableChatKey: vi.fn().mockResolvedValue(null),
    readDeviceIdentity: vi.fn(() => Promise.resolve(null)),
    writeDeviceIdentity: vi.fn(() => Promise.resolve(true)),
    readChatKey: vi.fn(() => Promise.resolve(key)),
    readChatKeySnapshots: vi.fn((addresses) =>
      Promise.resolve(addresses.map(() => ({ key, deletionRevision: 0 }))),
    ),
    writeChatKey: vi.fn((_address, next, options) => {
      if (options?.isCurrent?.() === false) return Promise.resolve(false);
      key = { ...next, groupKey: next.groupKey ?? key?.groupKey ?? null };
      return Promise.resolve(true);
    }),
    removeChatKey: vi.fn(() => {
      key = null;
      return Promise.resolve(true);
    }),
    listPendingRequests: vi.fn(() => Promise.resolve([...pending.values()])),
    writePendingRequest: vi.fn((_address, request, options) => {
      if (options?.isCurrent?.() === false) return Promise.resolve(false);
      pending.set(request.localRequestId, request);
      return Promise.resolve(true);
    }),
    bindPendingRequest: vi.fn((_address, id, uuid, options) => {
      if (options?.isCurrent?.() === false) return Promise.resolve(false);
      const request = pending.get(id);
      if (!request) return Promise.resolve(false);
      pending.set(id, { ...request, requestMessageUuid: uuid });
      return Promise.resolve(true);
    }),
    readRequestCompletion: vi.fn((_address, id) => Promise.resolve(completions.get(id) ?? null)),
    readRequestCompletionByMessageUuid: vi.fn((_address, uuid) =>
      Promise.resolve(
        [...completions.values()].find((receipt) => receipt.requestMessageUuid === uuid) ?? null,
      ),
    ),
    completeGrant: vi.fn((_address, grant, options) => {
      if (
        options?.isCurrent?.() === false ||
        !pending.has(grant.localRequestId) ||
        completions.has(grant.localRequestId)
      )
        return Promise.resolve(false);
      key = { groupKey: grant.groupKey };
      pending.delete(grant.localRequestId);
      completions.set(grant.localRequestId, {
        localRequestId: grant.localRequestId,
        requestMessageUuid: grant.requestMessageUuid,
        responseMessageUuid: grant.responseMessageUuid,
        outcome: "granted",
      });
      return Promise.resolve(true);
    }),
    completeReject: vi.fn((_address, reject, options) => {
      if (
        options?.isCurrent?.() === false ||
        !pending.has(reject.localRequestId) ||
        completions.has(reject.localRequestId)
      )
        return Promise.resolve(false);
      pending.delete(reject.localRequestId);
      completions.set(reject.localRequestId, { ...reject, outcome: "rejected" });
      return Promise.resolve(true);
    }),
    listStagedCreations: vi.fn(() => Promise.resolve([])),
    writeStagedCreation: vi.fn(() => Promise.resolve(false)),
    finalizeCreation: vi.fn(() => Promise.resolve(false)),
  };
  const sendPayload = vi.fn(
    (
      payload: ChatE2eeMessage["payload"],
      isCurrent: () => boolean,
      canonicalMessageUuid?: string,
    ): Promise<ChatE2eeMessage> => {
      if (!isCurrent()) throw new Error("stale");
      return Promise.resolve({
        uuid: canonicalMessageUuid ?? "sent",
        streamUuid: scope.streamUuid,
        authorUuid: scope.owner.userUuid,
        payload,
      });
    },
  );
  const controller = new ChatE2eeController({
    scope,
    device: { deviceId: scope.deviceId, deviceName: "MacBook" },
    provider,
    storage,
    getCurrentScope: () => current,
    getRights: () => rights,
    isIssuerAllowed: () => issuerAllowed,
    isAnnouncerAllowed: () => announcerAllowed,
    isRequesterAllowed: () => requesterAllowed,
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
    pending,
    completions,
    setCurrent: (next: ChatE2eeControllerScope | null) => {
      current = next;
    },
    setRights: (next: Partial<ChatE2eeControllerRights>) => {
      rights = { ...rights, ...next };
    },
    setIssuerAllowed: (next: boolean) => {
      issuerAllowed = next;
    },
    setRequesterAllowed: (next: boolean) => {
      requesterAllowed = next;
    },
    setAnnouncerAllowed: (next: boolean) => {
      announcerAllowed = next;
    },
  };
}

describe("ChatE2eeController", () => {
  it("reuses one durable key request across fragment envelopes in the same generation", async () => {
    const f = fixture();
    f.pending.clear();
    expect((await f.controller.requestKey({ bytes: new Uint8Array([1]) })).ok).toBe(true);
    expect((await f.controller.requestKey({ bytes: new Uint8Array([2]) })).ok).toBe(true);
    expect(f.pending.size).toBe(1);
    expect(f.provider.createRequestKeyPair).toHaveBeenCalledOnce();
    expect(f.sendPayload.mock.calls[0]?.[2]).toBe(f.sendPayload.mock.calls[1]?.[2]);
    expect(f.sendPayload.mock.calls[0]?.[0]).toEqual(f.sendPayload.mock.calls[1]?.[0]);
    expect(f.sendPayload.mock.calls[0]?.[0]).not.toHaveProperty("target_message_uuid");
  });

  it.each(["missing-key", "forbidden", "stale", "wrong-generation", "deletion-race"] as const)(
    "rechecks %s before retrying a prepared encrypted payload",
    async (condition) => {
      const f = fixture(chatPair);
      const payload = {
        kind: "e2ee" as const,
        keyUuid: f.scope.keyUuid,
        content: { bytes: new Uint8Array([3]) },
      };
      if (condition === "missing-key") await f.storage.removeChatKey(f.scope);
      if (condition === "forbidden") f.setRights({ canSend: false });
      if (condition === "stale") f.setCurrent({ ...f.scope, runtimeGeneration: 2 });
      if (condition === "wrong-generation") payload.keyUuid = "another-key";
      if (condition === "deletion-race") {
        vi.mocked(f.storage.readChatKeyDeletionRevision)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(1);
      }
      expect(
        await f.controller.encryptMessage(new Uint8Array([42]), f.sendPayload, payload),
      ).toEqual({
        ok: false,
        reason:
          condition === "wrong-generation"
            ? "invalid-key"
            : condition === "deletion-race"
              ? "missing-key"
              : condition,
      });
      expect(f.sendPayload).not.toHaveBeenCalled();
      expect(f.provider.encryptMessage).not.toHaveBeenCalled();
    },
  );

  it.each(["encrypt", "grant"] as const)(
    "stops an already-read key operation after durable deletion before broadcast: %s",
    async (operation) => {
      const f = fixture(chatPair);
      const started = deferred<void>();
      const gate = deferred<void>();
      const envelope = { bytes: new Uint8Array([3]) };
      const waitForEnvelope = async () => {
        started.resolve();
        await gate.promise;
        return ok(envelope);
      };
      vi.mocked(f.provider.encryptMessage).mockImplementation(waitForEnvelope);
      vi.mocked(f.provider.encryptGroupKeyGrant).mockImplementation(waitForEnvelope);
      const pending =
        operation === "encrypt"
          ? f.controller.encryptMessage(new Uint8Array([42]), f.sendPayload)
          : f.controller.grantKey(f.request);
      await started.promise;
      vi.mocked(f.storage.readChatKeyDeletionRevision).mockResolvedValue(1);
      gate.resolve();
      expect(await pending).toEqual({ ok: false, reason: "missing-key" });
      expect(f.sendPayload).not.toHaveBeenCalled();
      expect(f.controller.getState().access).toBe("missing");
    },
  );

  it("reuses only a repair for the same failed ciphertext and original key", async () => {
    const f = fixture({ groupKey });
    vi.mocked(f.provider.decryptMessage).mockResolvedValue({
      ok: false,
      reason: "invalid-ciphertext",
    });
    const first = await f.controller.requestKey({ bytes: new Uint8Array([8]) });
    const second = await f.controller.requestKey({ bytes: new Uint8Array([9]) });
    const retry = await f.controller.requestKey({ bytes: new Uint8Array([9]) });
    if (!first.ok || !second.ok || !retry.ok) throw new Error("Request failed");
    expect(second.value.uuid).not.toBe(first.value.uuid);
    expect(retry.value.uuid).toBe(second.value.uuid);
    expect(f.pending.get(second.value.uuid)?.recovery?.envelope.bytes).toEqual(new Uint8Array([9]));
    expect(f.pending.has(first.value.uuid)).toBe(true);
  });

  it("requests repair with an existing key and validates the replacement against the failed message", async () => {
    const f = fixture({ groupKey });
    const envelope = { bytes: new Uint8Array([8]) };
    const replacement = { bytes: new Uint8Array(32).fill(7) };
    vi.mocked(f.provider.decryptMessage)
      .mockResolvedValueOnce({ ok: false, reason: "invalid-ciphertext" })
      .mockResolvedValueOnce(ok(new Uint8Array([4])));
    const requested = await f.controller.requestKey(envelope);
    if (!requested.ok) throw new Error(requested.reason);
    const pending = f.pending.get(requested.value.uuid);
    expect(pending?.recovery).toEqual({ envelope, previousGroupKey: groupKey });
    expect(f.readKey()).toEqual({ groupKey });
    vi.mocked(f.provider.decryptGroupKeyGrant).mockResolvedValue(ok(replacement));
    expect(
      await f.controller.ingestKeyMessage({
        ...f.grant,
        payload: { ...f.grant.payload, requestMessageUuid: requested.value.uuid },
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(f.readKey()).toEqual({ groupKey: replacement });
    expect(f.provider.decryptMessage).toHaveBeenLastCalledWith({
      groupKey: replacement,
      envelope,
      context: f.scope,
    });
    expect(f.storage.completeGrant).toHaveBeenCalledWith(
      f.scope,
      expect.objectContaining({ replaceExistingKey: true }),
      expect.anything(),
    );
  });

  it("accepts the same key again even when the selected message is damaged", async () => {
    const f = fixture({ groupKey });
    vi.mocked(f.provider.decryptMessage).mockResolvedValue({
      ok: false,
      reason: "invalid-ciphertext",
    });
    const requested = await f.controller.requestKey({ bytes: new Uint8Array([8]) });
    if (!requested.ok) throw new Error(requested.reason);
    expect(
      await f.controller.ingestKeyMessage({
        ...f.grant,
        payload: { ...f.grant.payload, requestMessageUuid: requested.value.uuid },
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(f.readKey()).toEqual({ groupKey });
    expect(f.provider.decryptMessage).toHaveBeenCalledTimes(1);
    expect(f.pending.has(requested.value.uuid)).toBe(false);
  });

  it("retains the old key after failed replacement validation and allows a fresh manual request", async () => {
    const f = fixture({ groupKey });
    const envelope = { bytes: new Uint8Array([8]) };
    vi.mocked(f.provider.decryptMessage).mockResolvedValue({
      ok: false,
      reason: "invalid-ciphertext",
    });
    const requested = await f.controller.requestKey(envelope);
    if (!requested.ok) throw new Error(requested.reason);
    vi.mocked(f.provider.decryptGroupKeyGrant).mockResolvedValue(
      ok({ bytes: new Uint8Array(32).fill(7) }),
    );
    const grant = {
      ...f.grant,
      payload: { ...f.grant.payload, requestMessageUuid: requested.value.uuid },
    };
    expect(await f.controller.ingestKeyMessage(grant)).toEqual({
      ok: false,
      reason: "invalid-ciphertext",
    });
    expect(f.readKey()).toEqual({ groupKey });
    expect(f.storage.completeGrant).not.toHaveBeenCalled();
    const retry = await f.controller.requestKey(envelope);
    if (!retry.ok) throw new Error(retry.reason);
    expect(retry.value.uuid).not.toBe(requested.value.uuid);
    await f.controller.ingestKeyMessage(grant);
    expect(f.pending.has(retry.value.uuid)).toBe(true);
  });

  it("does not repair a readable message or commit validation after an owner switch", async () => {
    const readable = fixture({ groupKey });
    const envelope = { bytes: new Uint8Array([8]) };
    expect(await readable.controller.requestKey(envelope)).toEqual({
      ok: false,
      reason: "invalid-message",
    });
    expect(readable.sendPayload).not.toHaveBeenCalled();
    const f = fixture({ groupKey });
    const validation = deferred<ChatCryptoResult<Uint8Array>>();
    vi.mocked(f.provider.decryptMessage)
      .mockResolvedValueOnce({ ok: false, reason: "invalid-ciphertext" })
      .mockImplementationOnce(() => validation.promise);
    const requested = await f.controller.requestKey(envelope);
    if (!requested.ok) throw new Error(requested.reason);
    vi.mocked(f.provider.decryptGroupKeyGrant).mockResolvedValue(
      ok({ bytes: new Uint8Array(32).fill(7) }),
    );
    const receiving = f.controller.ingestKeyMessage({
      ...f.grant,
      payload: { ...f.grant.payload, requestMessageUuid: requested.value.uuid },
    });
    await vi.waitFor(() => expect(f.provider.decryptMessage).toHaveBeenCalledTimes(2));
    f.setCurrent(null);
    validation.resolve(ok(new Uint8Array([4])));
    expect(await receiving).toEqual({ ok: false, reason: "stale" });
    expect(f.readKey()).toEqual({ groupKey });
    expect(f.storage.completeGrant).not.toHaveBeenCalled();
    expect(f.pending.has(requested.value.uuid)).toBe(true);
  });

  it("waits for an out-of-order request and stores a verified grant once across duplicates", async () => {
    const f = fixture();
    expect(await f.controller.ingestKeyMessage(f.grant)).toEqual({ ok: true, value: undefined });
    expect(f.provider.decryptGroupKeyGrant).toHaveBeenCalledTimes(1);
    await f.controller.ingestKeyMessage(f.request);
    await Promise.all([
      f.controller.ingestKeyMessage(f.grant),
      f.controller.ingestKeyMessage(f.grant),
    ]);
    expect(f.provider.decryptGroupKeyGrant).toHaveBeenCalledTimes(1);
    expect(f.storage.completeGrant).toHaveBeenCalledTimes(1);
    expect(f.readKey()?.groupKey).toEqual(groupKey);
    expect(f.controller.getState()).toMatchObject({
      access: "ready",
      requestStatus: "grant-received",
    });
  });

  it("accepts a matched grant without requiring a key announcement fingerprint", async () => {
    const f = fixture(null);
    await f.controller.ingestKeyMessage(f.request);
    await f.controller.ingestKeyMessage(f.grant);
    expect(f.provider.decryptGroupKeyGrant).toHaveBeenCalledTimes(1);
    await f.controller.ingestKeyMessage({
      uuid: "announcement",
      streamUuid: "chat",
      authorUuid: "issuer",
      payload: { kind: "key_announced", keyUuid: "generation" },
    });
    expect(f.readKey()?.groupKey).toEqual(groupKey);
  });

  it("does not revive an old grant when owner A returns after B with a newer generation", async () => {
    const f = fixture();
    const decrypted = deferred<ChatCryptoResult<typeof groupKey>>();
    const started = deferred<void>();
    vi.mocked(f.provider.decryptGroupKeyGrant).mockImplementation(() => {
      started.resolve();
      return decrypted.promise;
    });
    await f.controller.ingestKeyMessage(f.request);
    const operation = f.controller.ingestKeyMessage(f.grant);
    await started.promise;
    f.setCurrent({ ...f.scope, owner: { ...f.scope.owner, accountId: "b" }, runtimeGeneration: 2 });
    f.setCurrent({ ...f.scope, runtimeGeneration: 3 });
    decrypted.resolve(ok(groupKey));
    expect(await operation).toEqual({ ok: false, reason: "stale" });
    expect(f.storage.writeChatKey).not.toHaveBeenCalled();
    expect(f.controller.getState().access).toBe("missing");
  });

  it.each([
    { deviceId: "other-device" },
    { streamUuid: "other-chat" },
    { keyUuid: "other-generation" },
  ])("invalidates a pending encryption when its scope changes: %j", async (change) => {
    const f = fixture(chatPair);
    const encrypted = deferred<ChatCryptoResult<{ bytes: Uint8Array }>>();
    const started = deferred<void>();
    vi.mocked(f.provider.encryptMessage).mockImplementation(() => {
      started.resolve();
      return encrypted.promise;
    });
    const operation = f.controller.encryptMessage(new Uint8Array([42]), f.sendPayload);
    await started.promise;
    f.setCurrent({ ...f.scope, ...change });
    encrypted.resolve(ok({ bytes: new Uint8Array([3]) }));
    expect(await operation).toEqual({ ok: false, reason: "stale" });
    expect(f.sendPayload).not.toHaveBeenCalled();
  });

  it("guards a delayed durable commit and never stores an old runtime grant", async () => {
    const f = fixture();
    const commit = deferred<void>();
    const started = deferred<void>();
    let committed = false;
    vi.mocked(f.storage.completeGrant).mockImplementation(async (_address, _key, options) => {
      started.resolve();
      await commit.promise;
      if (options?.isCurrent?.()) committed = true;
      return committed;
    });
    await f.controller.ingestKeyMessage(f.request);
    const operation = f.controller.ingestKeyMessage(f.grant);
    await started.promise;
    f.setCurrent({ ...f.scope, runtimeGeneration: 3 });
    commit.resolve();
    expect(await operation).toEqual({ ok: false, reason: "stale" });
    expect(committed).toBe(false);
    expect(f.readKey()?.groupKey).toBeNull();
  });

  it("rechecks issuer authorization at durable commit", async () => {
    const f = fixture();
    const commit = deferred<void>();
    const started = deferred<void>();
    let committed = false;
    vi.mocked(f.storage.completeGrant).mockImplementation(async (_address, _key, options) => {
      started.resolve();
      await commit.promise;
      committed = options?.isCurrent?.() ?? false;
      return committed;
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
    vi.mocked(f.provider.encryptGroupKeyGrant).mockImplementation(() => {
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
    vi.mocked(f.provider.decryptGroupKeyGrant).mockResolvedValueOnce({
      ok: false,
      reason: "unavailable",
    });
    expect(await f.controller.ingestKeyMessage(f.grant)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(f.readKey()?.groupKey).toBeNull();
    expect(f.controller.getState().access).toBe("missing");
    expect(await f.controller.ingestKeyMessage(f.grant)).toEqual({ ok: true, value: undefined });
    expect(f.controller.getState().access).toBe("ready");
  });

  it.each(["account", "public-key"] as const)(
    "rejects a colliding device ID with a different %s",
    async (mismatch) => {
      const f = fixture();
      const request =
        mismatch === "account"
          ? { ...f.request, authorUuid: "another-account" }
          : {
              ...f.request,
              payload: { ...f.request.payload, publicKey: { bytes: new Uint8Array([99]) } },
            };
      await f.controller.ingestKeyMessage(request);
      expect(await f.controller.ingestKeyMessage(f.grant)).toEqual({
        ok: false,
        reason: "invalid-message",
      });
      expect(f.provider.decryptGroupKeyGrant).not.toHaveBeenCalled();
      expect(f.storage.completeGrant).not.toHaveBeenCalled();
    },
  );

  it("discards a queued invalid response without blocking the later valid grant", async () => {
    const f = fixture();
    await f.controller.ingestKeyMessage({
      ...f.grant,
      uuid: "bad-grant",
      payload: { ...f.grant.payload, recipientDeviceId: "another-device" },
    });
    await f.controller.ingestKeyMessage(f.grant);
    expect(await f.controller.ingestKeyMessage(f.request)).toEqual({ ok: true, value: undefined });
    expect(f.readKey()?.groupKey).toEqual(groupKey);
    expect(f.provider.decryptGroupKeyGrant).toHaveBeenCalledTimes(1);
    expect(await f.controller.ingestKeyMessage(f.request)).toEqual({ ok: true, value: undefined });
  });

  it("continues a pending batch when one grant temporarily cannot be decrypted", async () => {
    const f = fixture(null);
    await f.controller.ingestKeyMessage({ ...f.grant, uuid: "unavailable-grant" });
    await f.controller.ingestKeyMessage(f.grant);
    vi.mocked(f.provider.decryptGroupKeyGrant).mockResolvedValueOnce({
      ok: false,
      reason: "unavailable",
    });
    await f.controller.ingestKeyMessage({
      uuid: "announcement",
      streamUuid: "chat",
      authorUuid: "issuer",
      payload: { kind: "key_announced", keyUuid: "generation" },
    });
    expect(f.readKey()?.groupKey).toEqual(groupKey);
    expect(f.provider.decryptGroupKeyGrant).toHaveBeenCalledTimes(1);
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
    expect(f.readKey()?.groupKey).toEqual(groupKey);
    expect(f.controller.getState()).toMatchObject({ access: "ready", requestStatus: "idle" });
    expect(f.storage.removeChatKey).not.toHaveBeenCalled();
  });

  it("a late metadata-only read cannot downgrade a grant that has just been committed", async () => {
    const f = fixture();
    const staleRead = deferred<StoredChatKey | null>();
    vi.mocked(f.storage.readChatKey).mockImplementationOnce(() => staleRead.promise);
    const loading = f.controller.loadKey();
    await f.controller.ingestKeyMessage(f.request);
    await f.controller.ingestKeyMessage(f.grant);
    staleRead.resolve({ groupKey: null });
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
    expect(f.readKey()?.groupKey).toBeNull();
    expect(getDeviceName).not.toHaveBeenCalled();
    expect(f.sendPayload.mock.calls[0]?.[0]).toMatchObject({ deviceName: "MacBook" });
  });

  it("resolves the current name for each new request without changing device identity or stored keys", async () => {
    const f = fixture(chatPair);
    f.pending.clear();
    vi.mocked(getDeviceName)
      .mockResolvedValueOnce("Mac · Chrome — Web")
      .mockResolvedValueOnce("Renamed Mac — Desktop");

    const first = await f.controller.requestKey();
    expect(first.ok).toBe(true);
    const uuid = [...f.pending.values()][0]?.requestMessageUuid;
    if (!uuid) throw new Error("missing pending");
    await f.controller.ingestKeyMessage({
      ...f.grant,
      payload: {
        kind: "key_reject",
        keyUuid: f.scope.keyUuid,
        requestMessageUuid: uuid,
        senderDeviceId: "issuer-device",
        recipientDeviceId: f.scope.deviceId,
      },
    });
    const second = await f.controller.requestKey();
    expect(second.ok).toBe(true);

    expect(getDeviceName).toHaveBeenCalledTimes(2);
    expect(f.sendPayload.mock.calls.map(([payload]) => payload)).toMatchObject([
      { deviceId: "device", deviceName: "Mac · Chrome — Web" },
      { deviceId: "device", deviceName: "Renamed Mac — Desktop" },
    ]);
    expect(f.readKey()).toEqual(chatPair);
    expect(f.storage.writeDeviceIdentity).not.toHaveBeenCalled();
    expect(f.storage.writeChatKey).not.toHaveBeenCalled();
    expect(f.storage.removeChatKey).not.toHaveBeenCalled();
  });

  it.each(["owner", "generation", "logout", "rights"] as const)(
    "does not prepare or send a request after %s changes while resolving the name",
    async (change) => {
      const f = fixture();
      f.pending.clear();
      const name = deferred<string>();
      vi.mocked(getDeviceName).mockReturnValueOnce(name.promise);
      const requested = f.controller.requestKey();
      await vi.waitFor(() => expect(getDeviceName).toHaveBeenCalledOnce());
      if (change === "owner")
        f.setCurrent({ ...f.scope, owner: { ...f.scope.owner, accountId: "other" } });
      if (change === "generation") f.setCurrent({ ...f.scope, runtimeGeneration: 2 });
      if (change === "logout") f.setCurrent(null);
      if (change === "rights") f.setRights({ canRequest: false });
      name.resolve("Mac · Chrome — Web");

      expect(await requested).toEqual({
        ok: false,
        reason: change === "rights" ? "forbidden" : "stale",
      });
      expect(f.provider.createRequestKeyPair).not.toHaveBeenCalled();
      expect(f.storage.writePendingRequest).not.toHaveBeenCalled();
      expect(f.sendPayload).not.toHaveBeenCalled();
      expect(f.storage.writeDeviceIdentity).not.toHaveBeenCalled();
      expect(f.storage.writeChatKey).not.toHaveBeenCalled();
    },
  );

  it("requires the symmetric group secret for grants and messages", async () => {
    const f = fixture();
    expect(await f.controller.grantKey(f.request)).toEqual({ ok: false, reason: "missing-key" });
    expect(await f.controller.encryptMessage(new Uint8Array([42]), f.sendPayload)).toEqual({
      ok: false,
      reason: "missing-key",
    });
    expect(f.sendPayload).not.toHaveBeenCalled();
  });

  it("rechecks requester membership after encrypting a grant and before rejecting", async () => {
    const f = fixture(chatPair);
    const encrypted = deferred<ChatCryptoResult<{ bytes: Uint8Array }>>();
    const started = deferred<void>();
    vi.mocked(f.provider.encryptGroupKeyGrant).mockImplementationOnce(() => {
      started.resolve();
      return encrypted.promise;
    });
    const granting = f.controller.grantKey(f.request);
    await started.promise;
    f.setRequesterAllowed(false);
    encrypted.resolve(ok({ bytes: new Uint8Array([5]) }));
    expect(await granting).toEqual({ ok: false, reason: "forbidden" });
    expect(await f.controller.rejectKey(f.request)).toEqual({ ok: false, reason: "forbidden" });
    expect(f.sendPayload).not.toHaveBeenCalled();
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
        payload: { kind: "key_announced", keyUuid: "generation" },
      }),
    ).toEqual({ ok: false, reason: "forbidden" });
    expect(f.storage.writeChatKey).not.toHaveBeenCalled();
  });
  it("persists a fresh request pair before dispatch and reuses it after an ambiguous POST failure", async () => {
    const f = fixture();
    f.pending.clear();
    vi.mocked(getDeviceName).mockResolvedValueOnce("Mac · Chrome — Web");
    f.sendPayload.mockImplementationOnce((_payload, _guard, uuid) => {
      const pending = [...f.pending.values()][0];
      expect(pending?.localRequestId).toBe(uuid);
      expect(pending?.requestMessageUuid).toBeNull();
      expect(pending?.privateKey).toEqual(devicePair.privateKey);
      expect(pending?.deviceName).toBe("Mac · Chrome — Web");
      throw new Error("response lost");
    });
    expect(await f.controller.requestKey()).toEqual({ ok: false, reason: "send-failed" });
    const first = [...f.pending.values()][0];
    expect(first).toBeDefined();
    vi.mocked(getDeviceName).mockResolvedValue("Changed name — Desktop");
    expect((await f.controller.requestKey()).ok).toBe(true);
    expect(getDeviceName).toHaveBeenCalledOnce();
    expect(f.sendPayload.mock.calls[0]?.[0]).toEqual(f.sendPayload.mock.calls[1]?.[0]);
    expect(f.provider.createRequestKeyPair).toHaveBeenCalledTimes(1);
    expect(f.sendPayload.mock.calls[0]?.[2]).toBe(f.sendPayload.mock.calls[1]?.[2]);
    expect(f.pending.size).toBe(1);
  });

  it("deduplicates concurrent requests and creates a fresh pair only after terminal rejection", async () => {
    const f = fixture();
    f.pending.clear();
    const requests = await Promise.all([f.controller.requestKey(), f.controller.requestKey()]);
    expect(requests.every((result) => result.ok)).toBe(true);
    expect(f.provider.createRequestKeyPair).toHaveBeenCalledTimes(1);
    const uuid = [...f.pending.values()][0]?.requestMessageUuid;
    if (!uuid) throw new Error("missing pending");
    await f.controller.ingestKeyMessage({
      ...f.grant,
      payload: {
        kind: "key_reject",
        keyUuid: "generation",
        requestMessageUuid: uuid,
        senderDeviceId: "issuer-device",
        recipientDeviceId: "device",
      },
    });
    expect(f.pending.size).toBe(0);
    expect((await f.controller.requestKey()).ok).toBe(true);
    expect(f.provider.createRequestKeyPair).toHaveBeenCalledTimes(2);
    expect([...f.pending.values()][0]?.requestMessageUuid).not.toBe(uuid);
  });

  it("retains the private request key if durable grant completion fails", async () => {
    const f = fixture();
    vi.mocked(f.storage.completeGrant).mockRejectedValueOnce(new Error("disk failed"));
    expect(await f.controller.ingestKeyMessage(f.grant)).toEqual({
      ok: false,
      reason: "storage-failed",
    });
    expect(f.pending.get("request")?.privateKey).toEqual(devicePair.privateKey);
    expect(f.readKey()?.groupKey).toBeNull();
    expect((await f.controller.ingestKeyMessage(f.grant)).ok).toBe(true);
    expect(f.pending.size).toBe(0);
    expect(f.completions.get("request")?.outcome).toBe("granted");
  });

  it("recovers an unbound request from exact own history and refuses a colliding public key", async () => {
    const f = fixture();
    f.pending.set("request", {
      localRequestId: "request",
      requestMessageUuid: null,
      ...devicePair,
      createdAt: 1,
    });
    await f.controller.ingestKeyMessage({
      ...f.request,
      payload: { ...f.request.payload, publicKey: { bytes: new Uint8Array([99]) } },
    });
    expect(f.pending.get("request")?.requestMessageUuid).toBeNull();
    expect((await f.controller.ingestKeyMessage(f.request)).ok).toBe(true);
    expect(f.pending.get("request")?.requestMessageUuid).toBe("request");
    expect((await f.controller.ingestKeyMessage(f.grant)).ok).toBe(true);
  });

  it("keeps canonical retries separate from the public request UUID", async () => {
    const f = fixture();
    f.pending.clear();
    f.sendPayload.mockImplementation((payload) =>
      Promise.resolve({ uuid: "public-request", streamUuid: "chat", authorUuid: "u", payload }),
    );
    const first = await f.controller.requestKey();
    expect(first).toMatchObject({ ok: true, value: { uuid: "public-request" } });
    const prepared = [...f.pending.values()][0];
    expect(prepared?.requestMessageUuid).toBe("public-request");
    expect(prepared?.localRequestId).not.toBe("public-request");
    expect((await f.controller.requestKey()).ok).toBe(true);
    expect(f.sendPayload.mock.calls.map((call) => call[2])).toEqual([
      prepared?.localRequestId,
      prepared?.localRequestId,
    ]);
    expect(f.provider.createRequestKeyPair).toHaveBeenCalledOnce();
    expect(
      (
        await f.controller.ingestKeyMessage({
          ...f.grant,
          payload: { ...f.grant.payload, requestMessageUuid: "public-request" },
        })
      ).ok,
    ).toBe(true);
    expect(f.controller.getState().access).toBe("ready");
    expect(f.pending.size).toBe(0);
  });

  it("recovers a legacy canonical binding from own history and drains an earlier grant", async () => {
    const f = fixture();
    const response = {
      ...f.grant,
      payload: { ...f.grant.payload, requestMessageUuid: "public-request" },
    };
    expect((await f.controller.ingestKeyMessage(response)).ok).toBe(true);
    expect(f.controller.getState().access).toBe("missing");
    await f.controller.ingestKeyMessage({
      ...f.request,
      uuid: "public-request",
      payload: { ...f.request.payload, publicKey: { bytes: new Uint8Array([99]) } },
    });
    expect(f.pending.get("request")?.requestMessageUuid).toBe("request");
    expect((await f.controller.ingestKeyMessage({ ...f.request, uuid: "public-request" })).ok).toBe(
      true,
    );
    expect(f.controller.getState().access).toBe("ready");
    expect(f.provider.decryptGroupKeyGrant).toHaveBeenCalledOnce();
    expect(f.sendPayload).not.toHaveBeenCalled();
  });

  it.each(["author", "device", "public-key", "already-bound"])(
    "does not repair a legacy binding from a mismatched %s request",
    async (mismatch) => {
      const f = fixture();
      const expected = mismatch === "already-bound" ? "other-public" : "request";
      if (mismatch === "already-bound") {
        const pending = f.pending.get("request")!;
        f.pending.set("request", { ...pending, requestMessageUuid: expected });
      }
      await f.controller.ingestKeyMessage({
        ...f.request,
        uuid: "public-request",
        authorUuid: mismatch === "author" ? "other-user" : f.request.authorUuid,
        payload: {
          ...f.request.payload,
          deviceId: mismatch === "device" ? "other-device" : f.request.payload.deviceId,
          publicKey:
            mismatch === "public-key" ? { bytes: new Uint8Array([99]) } : devicePair.publicKey,
        },
      });
      expect(f.pending.get("request")?.requestMessageUuid).toBe(expected);
      expect(f.storage.bindPendingRequest).not.toHaveBeenCalled();
      expect(f.readKey()?.groupKey).toBeNull();
    },
  );

  it("does not dispatch a request if persisting its private key fails", async () => {
    const f = fixture();
    f.pending.clear();
    vi.mocked(f.storage.writePendingRequest).mockRejectedValue(new Error("storage unavailable"));
    expect(await f.controller.requestKey()).toEqual({ ok: false, reason: "storage-failed" });
    expect(f.sendPayload).not.toHaveBeenCalled();
  });

  it("a guarded announcement skipped by storage does not manufacture access metadata", async () => {
    const f = fixture(null);
    vi.mocked(f.storage.writeChatKey).mockResolvedValue(false);
    expect(
      await f.controller.ingestKeyMessage({
        uuid: "announcement",
        streamUuid: "chat",
        authorUuid: "issuer",
        payload: { kind: "key_announced", keyUuid: "generation" },
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(f.controller.getState().access).toBe("missing");
  });

  it("accepts several pending requests from different controllers and retries the oldest without losing other pairs", async () => {
    const f = fixture();
    f.pending.set("second", {
      localRequestId: "second",
      requestMessageUuid: "second",
      publicKey: { bytes: new Uint8Array([9]) },
      privateKey: new Uint8Array([9]),
      createdAt: 2,
    });
    expect((await f.controller.requestKey()).ok).toBe(true);
    expect(f.sendPayload.mock.calls[0]?.[2]).toBe("request");
    expect(f.pending.size).toBe(2);
    expect(
      (
        await f.controller.ingestKeyMessage({
          ...f.grant,
          payload: { ...f.grant.payload, requestMessageUuid: "second" },
        })
      ).ok,
    ).toBe(true);
    expect(f.pending.has("second")).toBe(false);
    expect(f.pending.has("request")).toBe(true);
  });

  it("deduplicates a recovered grant across a new controller when local and server request IDs differ", async () => {
    const f = fixture();
    f.pending.clear();
    f.pending.set("local", {
      localRequestId: "local",
      requestMessageUuid: null,
      ...devicePair,
      createdAt: 1,
    });
    await f.controller.ingestKeyMessage(f.request);
    expect((await f.controller.ingestKeyMessage(f.grant)).ok).toBe(true);
    f.controller.invalidate();
    const restored = new ChatE2eeController({
      scope: f.scope,
      device: { deviceId: "device", deviceName: "MacBook" },
      provider: f.provider,
      storage: f.storage,
      getCurrentScope: () => f.scope,
      getRights: () => ({
        canRequest: true,
        canGrant: true,
        canReject: true,
        canRotate: false,
        canSend: true,
      }),
      isIssuerAllowed: () => true,
      isAnnouncerAllowed: () => true,
      sendPayload: f.sendPayload,
    });
    await restored.loadKey();
    expect((await restored.ingestKeyMessage(f.grant)).ok).toBe(true);
    expect(f.provider.decryptGroupKeyGrant).toHaveBeenCalledTimes(1);
    expect(f.storage.completeGrant).toHaveBeenCalledTimes(1);
    expect(restored.getState().access).toBe("ready");
  });

  it("does not claim a grant succeeded when a rejection won the durable completion race", async () => {
    const f = fixture();
    vi.mocked(f.storage.completeGrant).mockImplementationOnce((_address, grant) => {
      f.pending.delete(grant.localRequestId);
      f.completions.set(grant.localRequestId, {
        localRequestId: grant.localRequestId,
        requestMessageUuid: grant.requestMessageUuid,
        responseMessageUuid: grant.responseMessageUuid,
        outcome: "rejected",
      });
      return Promise.resolve(false);
    });
    expect(await f.controller.ingestKeyMessage(f.grant)).toEqual({
      ok: false,
      reason: "invalid-message",
    });
    expect(f.readKey()?.groupKey).toBeNull();
    expect(f.controller.getState().requestStatus).not.toBe("grant-received");
  });

  it("rejects a transport response with modified request metadata while retaining the durable pair", async () => {
    const f = fixture();
    f.sendPayload.mockImplementationOnce((payload, _guard, uuid) => {
      if (payload.kind !== "key_request") throw new Error("wrong fixture");
      return Promise.resolve({
        uuid: uuid ?? "request",
        streamUuid: "chat",
        authorUuid: "u",
        payload: { ...payload, deviceName: "tampered" },
      });
    });
    expect(await f.controller.requestKey()).toEqual({ ok: false, reason: "invalid-message" });
    expect(f.pending.get("request")?.privateKey).toEqual(devicePair.privateKey);
  });
});
