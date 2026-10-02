import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { IndexedDbChatKeyStorage } from "./chat-key-storage-idb.lib";
import type {
  ChatKeyStorageAddress,
  PendingChatKeyRequest,
  StoredChatKey,
} from "./chat-key-storage.types";

const address: ChatKeyStorageAddress = {
  owner: {
    accountId: "account",
    instanceId: "instance",
    organizationId: "org",
    projectId: "project",
    userUuid: "user",
  },
  deviceId: "device",
  streamUuid: "stream",
  keyUuid: "generation",
};
const key: StoredChatKey = {
  fingerprint: { bytes: new Uint8Array(32).fill(7) },
  groupKey: { bytes: new Uint8Array(32).fill(9) },
};
const pending: PendingChatKeyRequest = {
  localRequestId: "local",
  requestMessageUuid: "request",
  publicKey: { bytes: new Uint8Array(32).fill(2) },
  privateKey: new Uint8Array(32).fill(3),
  createdAt: 100,
};
const stores: IndexedDbChatKeyStorage[] = [];
const databases: string[] = [];
function setup() {
  const name = `e2ee-test-${crypto.randomUUID()}`;
  const storage = new IndexedDbChatKeyStorage(name);
  stores.push(storage);
  databases.push(name);
  return { storage, name };
}
afterEach(async () => {
  for (const store of stores.splice(0)) store.close();
  for (const name of databases.splice(0))
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("delete failed"));
    });
});
const grant = {
  localRequestId: "local",
  requestMessageUuid: "request",
  responseMessageUuid: "response",
  groupKey: key.groupKey!,
  fingerprint: key.fingerprint,
};

describe("durable chat key storage", () => {
  it("restores pending secret and stable device labels through a new connection", async () => {
    const { storage, name } = setup();
    await storage.writeDeviceIdentity(address.owner, { deviceId: "device", deviceName: "Laptop" });
    await storage.writePendingRequest(address, pending);
    storage.close();
    const reopened = new IndexedDbChatKeyStorage(name);
    stores.push(reopened);
    expect(await reopened.readPendingRequest(address, "local")).toEqual(pending);
    expect(await reopened.readDeviceIdentity(address.owner)).toEqual({
      deviceId: "device",
      deviceName: "Laptop",
    });
    expect(await reopened.readChatKey(address)).toBeNull();
  });

  it("preserves the first device identity when two connections initialize concurrently", async () => {
    const { storage, name } = setup();
    const other = new IndexedDbChatKeyStorage(name);
    stores.push(other);
    const first = { deviceId: "first-device", deviceName: "First" };
    const second = { deviceId: "second-device", deviceName: "Second" };
    const results = await Promise.allSettled([
      storage.writeDeviceIdentity(address.owner, first),
      other.writeDeviceIdentity(address.owner, second),
    ]);
    expect(results).toEqual([
      { status: "fulfilled", value: true },
      { status: "fulfilled", value: false },
    ]);
    expect(await other.readDeviceIdentity(address.owner)).toEqual(first);
    await storage.writeDeviceIdentity(address.owner, { ...first, deviceName: "Changed" });
    expect(await storage.readDeviceIdentity(address.owner)).toEqual(first);
  });

  it("atomically saves the group key and terminal receipt while removing only the completed request secret", async () => {
    const { storage } = setup();
    await storage.writePendingRequest(address, pending);
    await storage.writePendingRequest(address, {
      ...pending,
      localRequestId: "other",
      requestMessageUuid: "other-request",
    });
    expect(await storage.completeGrant(address, grant)).toBe(true);
    expect(await storage.readChatKey(address)).toEqual(key);
    expect(await storage.readPendingRequest(address, "local")).toBeNull();
    expect(await storage.readPendingRequest(address, "other")).not.toBeNull();
    expect(await storage.readRequestCompletion(address, "local")).toEqual({
      localRequestId: "local",
      requestMessageUuid: "request",
      responseMessageUuid: "response",
      outcome: "granted",
    });
    expect(await storage.completeGrant(address, grant)).toBe(true);
    await expect(storage.writePendingRequest(address, pending)).rejects.toMatchObject({
      reason: "conflict",
    });
  });

  it("retains a pending secret when the key conflicts instead of partially completing the grant", async () => {
    const { storage } = setup();
    await storage.writePendingRequest(address, pending);
    await storage.writeChatKey(address, key);
    await expect(
      storage.completeGrant(address, { ...grant, groupKey: { bytes: new Uint8Array(32).fill(8) } }),
    ).rejects.toMatchObject({ reason: "conflict" });
    expect(await storage.readPendingRequest(address, "local")).toEqual(pending);
    expect(await storage.readRequestCompletion(address, "local")).toBeNull();
    expect(await storage.readChatKey(address)).toEqual(key);
  });

  it("rolls back key, receipt and deletion when runtime invalidates at the commit fence", async () => {
    const { storage } = setup();
    await storage.writePendingRequest(address, pending);
    let checks = 0;
    expect(await storage.completeGrant(address, grant, { isCurrent: () => ++checks < 3 })).toBe(
      false,
    );
    expect(await storage.readChatKey(address)).toBeNull();
    expect(await storage.readRequestCompletion(address, "local")).toBeNull();
    expect(await storage.readPendingRequest(address, "local")).toEqual(pending);
  });

  it("rejects a mismatched request and accepts a terminal rejection without removing a previously available group key", async () => {
    const { storage } = setup();
    await storage.writePendingRequest(address, pending);
    await storage.writeChatKey(address, key);
    await expect(
      storage.completeReject(address, { ...grant, requestMessageUuid: "wrong" }),
    ).rejects.toMatchObject({ reason: "conflict" });
    expect(await storage.readPendingRequest(address, "local")).not.toBeNull();
    await storage.completeReject(address, grant);
    expect(await storage.readPendingRequest(address, "local")).toBeNull();
    expect(await storage.readChatKey(address)).toEqual(key);
    expect((await storage.readRequestCompletion(address, "local"))?.outcome).toBe("rejected");
    await expect(storage.completeGrant(address, grant)).rejects.toMatchObject({
      reason: "conflict",
    });
  });

  it("does not write a group key when a rejection carries structural extra fields", async () => {
    const { storage } = setup();
    await storage.writePendingRequest(address, pending);
    await storage.completeReject(address, grant);
    expect(await storage.readChatKey(address)).toBeNull();
    expect(await storage.readPendingRequest(address, "local")).toBeNull();
  });

  it("snapshots mutable input before database opening and normalizes cloned byte arrays", async () => {
    const { storage } = setup();
    const input = {
      ...pending,
      privateKey: new Uint8Array(pending.privateKey),
      publicKey: { bytes: new Uint8Array(pending.publicKey.bytes) },
    };
    const mutableAddress = { ...address, owner: { ...address.owner } };
    const writing = storage.writePendingRequest(mutableAddress, input);
    input.privateKey.fill(0);
    input.publicKey.bytes.fill(0);
    mutableAddress.owner.userUuid = "other";
    await writing;
    const restored = await storage.readPendingRequest(address, "local");
    expect(restored).toEqual(pending);
    expect(restored?.privateKey).toBeInstanceOf(Uint8Array);
    restored?.privateKey.fill(0);
    expect(await storage.readPendingRequest(address, "local")).toEqual(pending);
  });

  it("serializes competing connections so exactly one terminal outcome wins", async () => {
    const { storage, name } = setup();
    const other = new IndexedDbChatKeyStorage(name);
    stores.push(other);
    await storage.writePendingRequest(address, pending);
    const results = await Promise.allSettled([
      storage.completeGrant(address, grant),
      other.completeReject(address, grant),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await storage.readPendingRequest(address, "local")).toBeNull();
    const receipt = await storage.readRequestCompletion(address, "local");
    expect(receipt?.outcome).toBe("granted");
    expect(await storage.readChatKey(address)).toEqual(key);
  });

  it("isolates account, instance, organization, project, user, device, stream and generation", async () => {
    const { storage } = setup();
    await storage.writeChatKey(address, key);
    await storage.writePendingRequest(address, pending);
    const variants = [
      ...["accountId", "instanceId", "organizationId", "projectId", "userUuid"].map((field) => ({
        ...address,
        owner: { ...address.owner, [field]: "other" },
      })),
      ...["deviceId", "streamUuid", "keyUuid"].map((field) => ({ ...address, [field]: "other" })),
    ];
    for (const variant of variants) {
      expect(await storage.readChatKey(variant)).toBeNull();
      expect(await storage.listPendingRequests(variant)).toEqual([]);
    }
  });

  it("preserves an existing secret on metadata-only refresh and rejects conflicting metadata", async () => {
    const { storage } = setup();
    await storage.writeChatKey(address, key);
    await storage.writeChatKey(address, { fingerprint: key.fingerprint, groupKey: null });
    expect(await storage.readChatKey(address)).toEqual(key);
    await expect(
      storage.writeChatKey(address, { fingerprint: { bytes: new Uint8Array(32) }, groupKey: null }),
    ).rejects.toMatchObject({ reason: "conflict" });
    expect(await storage.readChatKey(address)).toEqual(key);
  });

  it("binds a prepared request exactly once and retains all pending requests without a TTL", async () => {
    const { storage } = setup();
    await storage.writePendingRequest(address, {
      ...pending,
      requestMessageUuid: null,
      createdAt: 0,
    });
    await storage.bindPendingRequest(address, "local", "server-uuid");
    await storage.bindPendingRequest(address, "local", "server-uuid");
    await expect(storage.bindPendingRequest(address, "local", "different")).rejects.toMatchObject({
      reason: "conflict",
    });
    expect((await storage.listPendingRequests(address))[0]?.requestMessageUuid).toBe("server-uuid");
    expect((await storage.listPendingRequests(address))[0]?.privateKey).toEqual(pending.privateKey);
  });

  it("moves a staged creation secret to the returned stream atomically", async () => {
    const { storage } = setup();
    const creation = {
      creationId: "creation",
      keyUuid: address.keyUuid,
      groupKey: key.groupKey!,
      fingerprint: key.fingerprint,
    };
    await storage.writeStagedCreation(address, creation);
    expect(
      await storage.finalizeCreation(address, "creation", address.streamUuid, {
        isCurrent: () => false,
      }),
    ).toBe(false);
    expect(await storage.readStagedCreation(address, "creation")).toEqual(creation);
    expect(await storage.readChatKey(address)).toBeNull();
    await storage.finalizeCreation(address, "creation", address.streamUuid);
    expect(await storage.readStagedCreation(address, "creation")).toBeNull();
    expect((await storage.readChatKey(address))?.groupKey).toEqual(key.groupKey);
    expect(await storage.finalizeCreation(address, "creation", address.streamUuid)).toBe(true);
    await expect(
      storage.finalizeCreation(address, "creation", "different-stream"),
    ).rejects.toMatchObject({ reason: "missing-request" });
  });

  it("discovers staged creation secrets after reload without knowing their local IDs", async () => {
    const { storage, name } = setup();
    const creation = {
      creationId: "creation",
      keyUuid: address.keyUuid,
      groupKey: key.groupKey!,
      fingerprint: key.fingerprint,
    };
    await storage.writeStagedCreation(address, creation);
    storage.close();
    const reopened = new IndexedDbChatKeyStorage(name);
    stores.push(reopened);
    expect(await reopened.listStagedCreations(address)).toEqual([creation]);
    expect(await reopened.listStagedCreations({ ...address, deviceId: "other" })).toEqual([]);
  });

  it("rejects invalid secret sizes and has no memory fallback if IndexedDB is unavailable", async () => {
    const { storage } = setup();
    await expect(
      storage.writePendingRequest(address, { ...pending, privateKey: new Uint8Array(31) }),
    ).rejects.toMatchObject({ reason: "invalid-record" });
    await expect(
      storage.writeChatKey(address, { ...key, groupKey: { bytes: new Uint8Array(31) } }),
    ).rejects.toMatchObject({ reason: "invalid-record" });
    const db = globalThis.indexedDB;
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: undefined });
    try {
      await expect(storage.readChatKey(address)).rejects.toMatchObject({ reason: "unavailable" });
    } finally {
      Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: db });
    }
  });
});
