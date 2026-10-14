import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  vi.restoreAllMocks();
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
};

describe("durable chat key storage", () => {
  it("lists only actual local keys scoped to the complete owner, device and stream, newest first", async () => {
    const { storage, name } = setup();
    const clock = vi.spyOn(Date, "now").mockReturnValue(100);
    await storage.writeChatKey(address, key);
    clock.mockReturnValue(200);
    await storage.writeChatKey({ ...address, keyUuid: "z-newer" }, key);
    await storage.writeChatKey({ ...address, keyUuid: "a-newer" }, key);
    await storage.writeChatKey({ ...address, keyUuid: "placeholder" }, { groupKey: null });
    const variants = [
      ...["accountId", "instanceId", "organizationId", "projectId", "userUuid"].map((field) => ({
        ...address,
        owner: { ...address.owner, [field]: "other" },
      })),
      ...["deviceId", "streamUuid"].map((field) => ({ ...address, [field]: "other" })),
    ];
    clock.mockReturnValue(300);
    for (const variant of variants) await storage.writeChatKey(variant, key);
    storage.close();
    const reopened = new IndexedDbChatKeyStorage(name);
    stores.push(reopened);
    expect(await reopened.listChatKeys(address)).toEqual([
      { keyUuid: "a-newer", receivedAt: 200 },
      { keyUuid: "z-newer", receivedAt: 200 },
      { keyUuid: address.keyUuid, receivedAt: 100 },
    ]);
    for (const variant of variants)
      expect(await reopened.listChatKeys(variant)).toEqual([
        { keyUuid: address.keyUuid, receivedAt: 300 },
      ]);
    expect(await reopened.listChatKeys({ ...address, streamUuid: "empty" })).toEqual([]);
  });

  it("retains first local receipt dates across identical writes, sending selection and explicit repair", async () => {
    const { storage } = setup();
    const clock = vi.spyOn(Date, "now").mockReturnValue(100);
    await storage.writeChatKey(address, key);
    clock.mockReturnValue(200);
    await storage.writeChatKey(address, key, { forSending: true, onlyIfPresent: true });
    await storage.writeChatKey(address, { groupKey: null });
    await storage.writePendingRequest(address, {
      ...pending,
      recovery: {
        envelope: { bytes: new Uint8Array([7]) },
        previousGroupKey: key.groupKey!,
      },
    });
    await storage.completeGrant(address, {
      ...grant,
      groupKey: { bytes: new Uint8Array(32).fill(8) },
      replaceExistingKey: true,
    });
    expect(await storage.listChatKeys(address)).toEqual([
      { keyUuid: address.keyUuid, receivedAt: 100 },
    ]);
  });

  it("keeps legacy receipt dates unknown after subsequent storage refreshes", async () => {
    const { storage, name } = setup();
    await storage.writeChatKey(address, key);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("open failed"));
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("keys", "readwrite");
        const rows = transaction.objectStore("keys").openCursor();
        rows.onsuccess = () => {
          const cursor = rows.result;
          if (!cursor) return;
          const row = cursor.value as { receivedAt?: number };
          delete row.receivedAt;
          cursor.update(row);
          cursor.continue();
        };
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error ?? new Error("update failed"));
      });
    } finally {
      database.close();
    }
    await storage.writeChatKey(address, key, { forSending: true });
    await storage.writePendingRequest(address, pending);
    await storage.completeGrant(address, grant);
    expect(await storage.listChatKeys(address)).toEqual([
      { keyUuid: address.keyUuid, receivedAt: null },
    ]);
  });

  it("dates the first actual grant and a finalized creation instead of their metadata placeholder", async () => {
    const { storage } = setup();
    const clock = vi.spyOn(Date, "now").mockReturnValue(100);
    await storage.writeChatKey(address, { groupKey: null });
    await storage.writePendingRequest(address, pending);
    clock.mockReturnValue(200);
    await storage.completeGrant(address, grant);
    await storage.writeStagedCreation(address, {
      creationId: "creation",
      keyUuid: "created",
      groupKey: key.groupKey!,
    });
    clock.mockReturnValue(300);
    await storage.finalizeCreation(address, "creation", address.streamUuid);
    expect(await storage.listChatKeys(address)).toEqual([
      { keyUuid: "created", receivedAt: 300 },
      { keyUuid: address.keyUuid, receivedAt: 200 },
    ]);
  });

  it("atomically deletes one local generation and its recovery copies while preventing late grants", async () => {
    const { storage, name } = setup();
    const other = new IndexedDbChatKeyStorage(name);
    stores.push(other);
    const otherGeneration = { ...address, keyUuid: "other" };
    const otherDevice = { ...address, deviceId: "other" };
    const otherOwner = { ...address, owner: { ...address.owner, accountId: "other" } };
    for (const variant of [address, otherGeneration, otherDevice, otherOwner]) {
      await storage.writeChatKey(variant, key);
      await storage.writePendingRequest(variant, {
        ...pending,
        recovery: {
          envelope: { bytes: new Uint8Array([7]) },
          previousGroupKey: key.groupKey!,
        },
      });
    }
    await storage.writePendingRequest(address, {
      ...pending,
      localRequestId: "second",
      requestMessageUuid: "second-request",
    });
    await storage.removeChatKey(address);
    expect(await other.readChatKey(address)).toBeNull();
    expect(await other.listPendingRequests(address)).toEqual([]);
    await expect(other.completeGrant(address, grant)).rejects.toMatchObject({
      reason: "missing-request",
    });
    expect(await storage.readChatKey(address)).toBeNull();
    for (const variant of [otherGeneration, otherDevice, otherOwner]) {
      expect(await other.readChatKey(variant)).toEqual(key);
      expect(await other.listPendingRequests(variant)).toHaveLength(1);
    }
    // A deliberate new request can obtain the same generation after deletion.
    await storage.writePendingRequest(address, { ...pending, localRequestId: "fresh" });
    await storage.completeGrant(address, { ...grant, localRequestId: "fresh" });
    expect(await storage.readChatKey(address)).toEqual(key);
  });

  it("rolls back both deletion and pending-request cleanup if ownership becomes stale", async () => {
    const { storage } = setup();
    await storage.writeChatKey(address, key);
    await storage.writePendingRequest(address, pending);
    let checks = 0;
    expect(await storage.removeChatKey(address, { isCurrent: () => ++checks < 3 })).toBe(false);
    expect(await storage.readChatKey(address)).toEqual(key);
    expect(await storage.listPendingRequests(address)).toEqual([pending]);
  });

  it("does not resurrect a deleted sending key using stale metadata", async () => {
    const { storage } = setup();
    await storage.writeChatKey(address, key);
    const stale = await storage.readChatKey(address);
    await storage.removeChatKey(address);
    expect(
      await storage.writeChatKey(address, stale!, { forSending: true, onlyIfPresent: true }),
    ).toBe(false);
    expect(await storage.listChatKeys(address)).toEqual([]);
  });

  it("fences provider-prepared requests after another connection deletes before notification", async () => {
    const { storage, name } = setup();
    const other = new IndexedDbChatKeyStorage(name);
    stores.push(other);
    const clock = vi.spyOn(Date, "now").mockReturnValue(100);
    await storage.writeChatKey(address, key);
    const preparedRevision = await other.readChatKeyDeletionRevision(address);
    expect(preparedRevision).toBe(0);
    await storage.removeChatKey(address);
    // The other tab still considers its controller current while broadcast delivery is delayed.
    expect(
      await other.writePendingRequest(
        address,
        {
          ...pending,
          recovery: {
            envelope: { bytes: new Uint8Array([7]) },
            previousGroupKey: key.groupKey!,
          },
        },
        { isCurrent: () => true, expectedDeletionRevision: preparedRevision },
      ),
    ).toBe(false);
    expect(await other.listPendingRequests(address)).toEqual([]);
    await expect(other.completeGrant(address, grant)).rejects.toMatchObject({
      reason: "missing-request",
    });
    expect(await other.readChatKey(address)).toBeNull();
    await other.writeChatKey(address, { groupKey: null });
    const freshRevision = await other.readChatKeyDeletionRevision(address);
    expect(freshRevision).toBe(1);
    expect(
      await other.writePendingRequest(address, pending, {
        expectedDeletionRevision: freshRevision,
      }),
    ).toBe(true);
    clock.mockReturnValue(200);
    await other.completeGrant(address, grant);
    await other.writeChatKey(address, key, { forSending: true, onlyIfPresent: true });
    expect(await other.readChatKeyDeletionRevision(address)).toBe(1);
    expect(await other.listChatKeys(address)).toEqual([
      { keyUuid: address.keyUuid, receivedAt: 200 },
    ]);
    await storage.removeChatKey(address);
    expect(await other.readChatKeyDeletionRevision(address)).toBe(2);
  });

  it("preserves deletion fences across finalized creations and reopened connections", async () => {
    const { storage, name } = setup();
    await storage.removeChatKey(address);
    await storage.writeStagedCreation(address, {
      creationId: "creation",
      keyUuid: address.keyUuid,
      groupKey: key.groupKey!,
    });
    await storage.finalizeCreation(address, "creation", address.streamUuid);
    storage.close();
    const reopened = new IndexedDbChatKeyStorage(name);
    stores.push(reopened);
    expect(await reopened.readChatKeyDeletionRevision(address)).toBe(1);
    expect(await reopened.readChatKey(address)).toEqual(key);
    expect(await reopened.listStagedCreations(address)).toEqual([]);
  });

  it("restores the last sending generation without promoting a later historical grant or another scope", async () => {
    const { storage, name } = setup();
    const newer = { ...address, keyUuid: "newer" };
    await storage.writeChatKey(address, key, { forSending: true });
    await storage.writeChatKey(newer, key, { forSending: true });
    await storage.writeChatKey(address, key);
    await storage.writeChatKey({ ...address, keyUuid: "historical" }, key);
    await storage.writeChatKey({ ...address, streamUuid: "other-stream" }, key, {
      forSending: true,
    });
    await storage.writeChatKey({ ...address, deviceId: "other-device" }, key, { forSending: true });
    await storage.writeChatKey(
      { ...address, owner: { ...address.owner, accountId: "other" } },
      key,
      { forSending: true },
    );
    await storage.writeChatKey(
      { ...address, keyUuid: "unavailable-current" },
      { groupKey: null },
      { forSending: true },
    );
    storage.close();
    const reopened = new IndexedDbChatKeyStorage(name);
    stores.push(reopened);
    expect(await reopened.readLastAvailableChatKey(address)).toEqual({
      keyUuid: "newer",
      groupKey: key.groupKey,
    });
    await reopened.removeChatKey(newer);
    expect(await reopened.readLastAvailableChatKey(address)).toEqual({
      keyUuid: address.keyUuid,
      groupKey: key.groupKey,
    });
    expect(await reopened.readLastAvailableChatKey({ ...address, streamUuid: "empty" })).toBeNull();
  });

  it("restores an explicit repair and atomically replaces only its generation", async () => {
    const { storage, name } = setup();
    const recovery = { envelope: { bytes: new Uint8Array([7]) }, previousGroupKey: key.groupKey! };
    const replacement = { bytes: new Uint8Array(32).fill(8) };
    const otherAddress = { ...address, keyUuid: "other-generation" };
    await storage.writeChatKey(address, key);
    await storage.writeChatKey(otherAddress, key);
    await storage.writePendingRequest(address, { ...pending, recovery });
    storage.close();
    const reopened = new IndexedDbChatKeyStorage(name);
    stores.push(reopened);
    expect((await reopened.readPendingRequest(address, pending.localRequestId))?.recovery).toEqual(
      recovery,
    );
    const repairingGrant = { ...grant, groupKey: replacement, replaceExistingKey: true };
    expect(await reopened.completeGrant(address, repairingGrant)).toBe(true);
    expect(await reopened.completeGrant(address, repairingGrant)).toBe(true);
    expect(await reopened.readChatKey(address)).toEqual({ groupKey: replacement });
    expect(await reopened.readChatKey(otherAddress)).toEqual(key);
    expect(await reopened.readPendingRequest(address, pending.localRequestId)).toBeNull();
  });

  it("does not let a delayed repair overwrite a different key saved by another connection", async () => {
    const { storage, name } = setup();
    const other = new IndexedDbChatKeyStorage(name);
    stores.push(other);
    const recovery = { envelope: { bytes: new Uint8Array([7]) }, previousGroupKey: key.groupKey! };
    await storage.writeChatKey(address, key);
    await storage.writePendingRequest(address, { ...pending, recovery });
    await other.writePendingRequest(address, {
      ...pending,
      recovery,
      localRequestId: "other",
      requestMessageUuid: "other-request",
    });
    const winner = { bytes: new Uint8Array(32).fill(8) };
    await other.completeGrant(address, {
      ...grant,
      localRequestId: "other",
      requestMessageUuid: "other-request",
      groupKey: winner,
      replaceExistingKey: true,
    });
    await expect(
      storage.completeGrant(address, {
        ...grant,
        groupKey: { bytes: new Uint8Array(32).fill(6) },
        replaceExistingKey: true,
      }),
    ).rejects.toMatchObject({ reason: "conflict" });
    expect(await storage.readChatKey(address)).toEqual({ groupKey: winner });
    expect(await storage.readPendingRequest(address, pending.localRequestId)).not.toBeNull();
    // An ordinary delayed grant also cannot roll back a repaired generation.
    await expect(storage.completeGrant(address, grant)).rejects.toMatchObject({
      reason: "conflict",
    });
    expect(
      await storage.completeGrant(address, {
        ...grant,
        groupKey: winner,
        replaceExistingKey: true,
      }),
    ).toBe(true);
  });

  it("does not authorize replacement for an ordinary request", async () => {
    const { storage } = setup();
    await storage.writeChatKey(address, key);
    await storage.writePendingRequest(address, pending);
    await expect(
      storage.completeGrant(address, {
        ...grant,
        groupKey: { bytes: new Uint8Array(32).fill(8) },
        replaceExistingKey: true,
      }),
    ).rejects.toMatchObject({ reason: "conflict" });
    expect(await storage.readChatKey(address)).toEqual(key);
    expect(await storage.readPendingRequest(address, pending.localRequestId)).toEqual(pending);
  });

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

  it("preserves an existing secret on metadata-only refresh and rejects a conflicting secret", async () => {
    const { storage } = setup();
    await storage.writeChatKey(address, key);
    await storage.writeChatKey(address, { groupKey: null });
    expect(await storage.readChatKey(address)).toEqual(key);
    await expect(
      storage.writeChatKey(address, { groupKey: { bytes: new Uint8Array(32).fill(8) } }),
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

  it("repairs a legacy canonical binding once without replacing its private key", async () => {
    const { storage } = setup();
    await storage.writePendingRequest(address, { ...pending, requestMessageUuid: "local" });
    await storage.bindPendingRequest(address, "local", "public-request");
    expect((await storage.listPendingRequests(address))[0]).toEqual({
      ...pending,
      requestMessageUuid: "public-request",
    });
    await expect(
      storage.bindPendingRequest(address, "local", "other-public-request"),
    ).rejects.toMatchObject({ reason: "conflict" });
    expect((await storage.listPendingRequests(address))[0]?.requestMessageUuid).toBe(
      "public-request",
    );
  });

  it("moves a staged creation secret to the returned stream atomically", async () => {
    const { storage } = setup();
    const creation = {
      creationId: "creation",
      keyUuid: address.keyUuid,
      groupKey: key.groupKey!,
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
