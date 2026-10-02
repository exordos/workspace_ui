import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeOwner } from "~/entities/workspace-runtime/workspace-runtime.types";
import type {
  ChatDeviceIdentity,
  ChatKeyRequestCompletion,
  ChatKeyStorage,
  ChatKeyStorageAddress,
  ChatKeyStorageScope,
  ChatKeyStorageWriteOptions,
  CompleteChatKeyGrant,
  CompleteChatKeyReject,
  PendingChatKeyRequest,
  StagedChatCreation,
  StoredChatKey,
} from "./chat-key-storage.types";

export const CHAT_KEY_STORAGE_DB_NAME = "workspace-chat-secrets-v1";
const STORE_NAMES = [
  "devices",
  "keys",
  "requests",
  "completions",
  "creations",
  "creationReceipts",
] as const;
type StoreName = (typeof STORE_NAMES)[number];
interface Row<T> {
  id: string;
  address: string;
  value: T;
}

export class ChatKeyStorageError extends Error {
  constructor(readonly reason: "unavailable" | "invalid-record" | "conflict" | "missing-request") {
    super(reason);
    this.name = "ChatKeyStorageError";
  }
}

function ownerAddress(owner: WorkspaceRuntimeOwner): string {
  const key = workspaceRuntimeOwnerKey(owner);
  if (!key) throw new ChatKeyStorageError("invalid-record");
  return key;
}
function scopeAddress(scope: ChatKeyStorageScope): string {
  if (!scope.deviceId) throw new ChatKeyStorageError("invalid-record");
  return JSON.stringify([ownerAddress(scope.owner), scope.deviceId]);
}
function keyAddress(address: ChatKeyStorageAddress): string {
  if (!address.streamUuid || !address.keyUuid) throw new ChatKeyStorageError("invalid-record");
  return JSON.stringify([scopeAddress(address), address.streamUuid, address.keyUuid]);
}
function recordId(address: string, suffix: string): string {
  if (!suffix) throw new ChatKeyStorageError("invalid-record");
  return JSON.stringify([address, suffix]);
}
function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, i) => byte === right[i]);
}
function isBytes(value: unknown): value is Uint8Array {
  return (
    ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === "[object Uint8Array]"
  );
}
// IndexedDB structured clones can originate in another realm; normalize without instanceof.
function copyRecord<T>(value: T): T {
  function copy(input: unknown): unknown {
    if (isBytes(input)) return new Uint8Array(input);
    if (Array.isArray(input)) return input.map(copy);
    if (input !== null && typeof input === "object")
      return Object.fromEntries(Object.entries(input).map(([name, entry]) => [name, copy(entry)]));
    return input;
  }
  return copy(value) as T;
}
function validKey(key: StoredChatKey): void {
  if (
    !isBytes(key.fingerprint.bytes) ||
    key.fingerprint.bytes.length !== 32 ||
    (key.groupKey !== null && (!isBytes(key.groupKey.bytes) || key.groupKey.bytes.length !== 32))
  )
    throw new ChatKeyStorageError("invalid-record");
}
function compatibleKey(
  previous: StoredChatKey | undefined,
  incoming: StoredChatKey,
): StoredChatKey {
  validKey(incoming);
  if (previous === undefined)
    return { fingerprint: incoming.fingerprint, groupKey: incoming.groupKey };
  validKey(previous);
  if (
    !equalBytes(previous.fingerprint.bytes, incoming.fingerprint.bytes) ||
    (previous.groupKey !== null &&
      incoming.groupKey !== null &&
      !equalBytes(previous.groupKey.bytes, incoming.groupKey.bytes))
  )
    throw new ChatKeyStorageError("conflict");
  return { fingerprint: incoming.fingerprint, groupKey: incoming.groupKey ?? previous.groupKey };
}

/** A separate database prevents message-cache cleanup from destroying pending request secrets. */
export class IndexedDbChatKeyStorage implements ChatKeyStorage {
  private database: Promise<IDBDatabase> | null = null;
  constructor(private readonly databaseName = CHAT_KEY_STORAGE_DB_NAME) {}

  close(): void {
    const pending = this.database;
    this.database = null;
    void pending?.then(
      (db) => db.close(),
      () => undefined,
    );
  }

  private open(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined")
      return Promise.reject(new ChatKeyStorageError("unavailable"));
    if (this.database !== null) return this.database;
    const pending = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      let blocked = false;
      request.onupgradeneeded = () => {
        for (const name of STORE_NAMES) {
          const store = request.result.createObjectStore(name, { keyPath: "id" });
          store.createIndex("address", "address");
        }
      };
      request.onerror = () => reject(request.error ?? new ChatKeyStorageError("unavailable"));
      request.onblocked = () => {
        blocked = true;
        reject(new ChatKeyStorageError("unavailable"));
      };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) {
          db.close();
          return;
        }
        if (STORE_NAMES.some((name) => !db.objectStoreNames.contains(name))) {
          db.close();
          reject(new ChatKeyStorageError("invalid-record"));
          return;
        }
        db.onversionchange = () => {
          db.close();
          this.database = null;
        };
        resolve(db);
      };
    });
    this.database = pending;
    void pending.catch(() => {
      if (this.database === pending) this.database = null;
    });
    return pending;
  }

  private async read<T>(storeName: StoreName, id: string): Promise<T | null> {
    const db = await this.open();
    return new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const request = tx.objectStore(storeName).get(id) as IDBRequest<Row<T> | undefined>;
      tx.oncomplete = () =>
        resolve(request.result === undefined ? null : copyRecord(request.result.value));
      tx.onabort = () => reject(tx.error ?? new ChatKeyStorageError("unavailable"));
      tx.onerror = () => undefined;
    });
  }

  private async mutate(
    stores: readonly StoreName[],
    options: ChatKeyStorageWriteOptions | undefined,
    operation: (
      tx: IDBTransaction,
      finish: (write: () => void) => void,
      fail: (error: unknown) => void,
    ) => void,
  ): Promise<boolean> {
    const capturedOptions = options === undefined ? undefined : { isCurrent: options.isCurrent };
    const db = await this.open();
    if (capturedOptions?.isCurrent?.() === false) return false;
    return new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction([...stores], "readwrite");
      let skipped = false;
      let failure: unknown;
      const fail = (error: unknown) => {
        failure = error;
        tx.abort();
      };
      const finish = (write: () => void) => {
        try {
          // The last read callback and all writes share one transaction; no await crosses this fence.
          if (capturedOptions?.isCurrent?.() === false) {
            skipped = true;
            tx.abort();
            return;
          }
          write();
          if (capturedOptions?.isCurrent?.() === false) {
            skipped = true;
            tx.abort();
            return;
          }
          tx.commit();
        } catch (error) {
          fail(error);
        }
      };
      tx.oncomplete = () => resolve(true);
      tx.onabort = () =>
        skipped
          ? resolve(false)
          : reject(failure instanceof Error ? failure : new ChatKeyStorageError("unavailable"));
      tx.onerror = () => undefined;
      try {
        operation(tx, finish, fail);
      } catch (error) {
        fail(error);
      }
    });
  }

  readDeviceIdentity(owner: WorkspaceRuntimeOwner): Promise<ChatDeviceIdentity | null> {
    return this.read("devices", ownerAddress(owner));
  }
  writeDeviceIdentity(
    owner: WorkspaceRuntimeOwner,
    identity: ChatDeviceIdentity,
    options?: ChatKeyStorageWriteOptions,
  ): Promise<boolean> {
    if (!identity.deviceId || !identity.deviceName)
      return Promise.reject(new ChatKeyStorageError("invalid-record"));
    const id = ownerAddress(owner);
    const capturedIdentity = copyRecord(identity);
    return this.mutate(["devices"], options, (tx, finish, fail) => {
      const store = tx.objectStore("devices");
      const request = store.get(id) as IDBRequest<Row<ChatDeviceIdentity> | undefined>;
      request.onsuccess = () => {
        const previous = request.result?.value;
        if (previous !== undefined && previous.deviceId !== capturedIdentity.deviceId) {
          fail(new ChatKeyStorageError("conflict"));
          return;
        }
        finish(() => {
          store.put({ id, address: id, value: previous ?? capturedIdentity });
        });
      };
    }).catch((error: unknown) => {
      if (error instanceof ChatKeyStorageError && error.reason === "conflict") return false;
      throw error;
    });
  }

  readChatKey(address: ChatKeyStorageAddress): Promise<StoredChatKey | null> {
    return this.read("keys", keyAddress(address));
  }
  writeChatKey(
    address: ChatKeyStorageAddress,
    key: StoredChatKey,
    options?: ChatKeyStorageWriteOptions,
  ): Promise<boolean> {
    const id = keyAddress(address);
    const capturedKey = copyRecord(key);
    return this.mutate(["keys"], options, (tx, finish, fail) => {
      const store = tx.objectStore("keys");
      const request = store.get(id) as IDBRequest<Row<StoredChatKey> | undefined>;
      request.onsuccess = () => {
        try {
          const value = compatibleKey(request.result?.value, capturedKey);
          finish(() => {
            store.put({ id, address: id, value });
          });
        } catch (error) {
          fail(error);
        }
      };
    });
  }
  removeChatKey(
    address: ChatKeyStorageAddress,
    options?: ChatKeyStorageWriteOptions,
  ): Promise<boolean> {
    return this.mutate(["keys"], options, (tx, finish) =>
      finish(() => {
        tx.objectStore("keys").delete(keyAddress(address));
      }),
    );
  }
  readPendingRequest(
    address: ChatKeyStorageAddress,
    localRequestId: string,
  ): Promise<PendingChatKeyRequest | null> {
    return this.read("requests", recordId(keyAddress(address), localRequestId));
  }
  async listPendingRequests(
    address: ChatKeyStorageAddress,
  ): Promise<readonly PendingChatKeyRequest[]> {
    const capturedAddress = keyAddress(address);
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("requests", "readonly");
      const request = tx
        .objectStore("requests")
        .index("address")
        .getAll(capturedAddress) as IDBRequest<Row<PendingChatKeyRequest>[]>;
      tx.oncomplete = () => resolve(request.result.map((row) => copyRecord(row.value)));
      tx.onabort = () => reject(tx.error ?? new ChatKeyStorageError("unavailable"));
      tx.onerror = () => undefined;
    });
  }
  writePendingRequest(
    address: ChatKeyStorageAddress,
    pending: PendingChatKeyRequest,
    options?: ChatKeyStorageWriteOptions,
  ): Promise<boolean> {
    if (
      pending.privateKey.length !== 32 ||
      pending.publicKey.bytes.length !== 32 ||
      !Number.isFinite(pending.createdAt)
    )
      return Promise.reject(new ChatKeyStorageError("invalid-record"));
    const scope = keyAddress(address);
    const capturedPending = copyRecord(pending);
    const id = recordId(scope, capturedPending.localRequestId);
    return this.mutate(["requests", "completions"], options, (tx, finish, fail) => {
      const previous = tx.objectStore("requests").get(id) as IDBRequest<
        Row<PendingChatKeyRequest> | undefined
      >;
      const terminal = tx.objectStore("completions").get(id);
      terminal.onsuccess = () => {
        const old = previous.result?.value;
        if (
          terminal.result !== undefined ||
          (old !== undefined &&
            (!equalBytes(old.privateKey, capturedPending.privateKey) ||
              !equalBytes(old.publicKey.bytes, capturedPending.publicKey.bytes) ||
              old.requestMessageUuid !== capturedPending.requestMessageUuid))
        ) {
          fail(new ChatKeyStorageError("conflict"));
          return;
        }
        finish(() => {
          tx.objectStore("requests").put({ id, address: scope, value: capturedPending });
        });
      };
    });
  }
  bindPendingRequest(
    address: ChatKeyStorageAddress,
    localRequestId: string,
    requestMessageUuid: string,
    options?: ChatKeyStorageWriteOptions,
  ): Promise<boolean> {
    const scope = keyAddress(address);
    const id = recordId(scope, localRequestId);
    return this.mutate(["requests"], options, (tx, finish, fail) => {
      const store = tx.objectStore("requests");
      const request = store.get(id) as IDBRequest<Row<PendingChatKeyRequest> | undefined>;
      request.onsuccess = () => {
        const old = request.result?.value;
        if (old === undefined) {
          fail(new ChatKeyStorageError("missing-request"));
          return;
        }
        if (
          !requestMessageUuid ||
          (old.requestMessageUuid !== null && old.requestMessageUuid !== requestMessageUuid)
        ) {
          fail(new ChatKeyStorageError("conflict"));
          return;
        }
        finish(() => {
          store.put({ id, address: scope, value: { ...old, requestMessageUuid } });
        });
      };
    });
  }
  readRequestCompletion(
    address: ChatKeyStorageAddress,
    localRequestId: string,
  ): Promise<ChatKeyRequestCompletion | null> {
    return this.read("completions", recordId(keyAddress(address), localRequestId));
  }
  async readRequestCompletionByMessageUuid(
    address: ChatKeyStorageAddress,
    requestMessageUuid: string,
  ): Promise<ChatKeyRequestCompletion | null> {
    const capturedAddress = keyAddress(address);
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("completions", "readonly");
      const request = tx
        .objectStore("completions")
        .index("address")
        .getAll(capturedAddress) as IDBRequest<Row<ChatKeyRequestCompletion>[]>;
      tx.oncomplete = () =>
        resolve(
          copyRecord(
            request.result.find((row) => row.value.requestMessageUuid === requestMessageUuid)
              ?.value ?? null,
          ),
        );
      tx.onabort = () => reject(tx.error ?? new ChatKeyStorageError("unavailable"));
      tx.onerror = () => undefined;
    });
  }
  completeGrant(
    address: ChatKeyStorageAddress,
    grant: CompleteChatKeyGrant,
    options?: ChatKeyStorageWriteOptions,
  ): Promise<boolean> {
    return this.complete(address, grant, "granted", options);
  }
  completeReject(
    address: ChatKeyStorageAddress,
    rejection: CompleteChatKeyReject,
    options?: ChatKeyStorageWriteOptions,
  ): Promise<boolean> {
    return this.complete(address, rejection, "rejected", options);
  }
  private complete(
    address: ChatKeyStorageAddress,
    completion: CompleteChatKeyGrant | CompleteChatKeyReject,
    outcome: ChatKeyRequestCompletion["outcome"],
    options?: ChatKeyStorageWriteOptions,
  ): Promise<boolean> {
    const scope = keyAddress(address);
    const capturedCompletion = copyRecord(completion);
    const id = recordId(scope, capturedCompletion.localRequestId);
    return this.mutate(["requests", "completions", "keys"], options, (tx, finish, fail) => {
      const pending = tx.objectStore("requests").get(id) as IDBRequest<
        Row<PendingChatKeyRequest> | undefined
      >;
      const terminal = tx.objectStore("completions").get(id) as IDBRequest<
        Row<ChatKeyRequestCompletion> | undefined
      >;
      const key = tx.objectStore("keys").get(scope) as IDBRequest<Row<StoredChatKey> | undefined>;
      key.onsuccess = () => {
        try {
          const oldCompletion = terminal.result?.value;
          if (oldCompletion !== undefined) {
            if (
              oldCompletion.outcome !== outcome ||
              oldCompletion.requestMessageUuid !== capturedCompletion.requestMessageUuid ||
              oldCompletion.responseMessageUuid !== capturedCompletion.responseMessageUuid
            )
              throw new ChatKeyStorageError("conflict");
            finish(() => undefined);
            return;
          }
          if (pending.result === undefined) throw new ChatKeyStorageError("missing-request");
          if (
            pending.result.value.requestMessageUuid !== capturedCompletion.requestMessageUuid ||
            !capturedCompletion.responseMessageUuid
          )
            throw new ChatKeyStorageError("conflict");
          const groupKey =
            outcome === "granted" && "groupKey" in capturedCompletion
              ? compatibleKey(key.result?.value, {
                  fingerprint: capturedCompletion.fingerprint,
                  groupKey: capturedCompletion.groupKey,
                })
              : null;
          const receipt: ChatKeyRequestCompletion = {
            localRequestId: capturedCompletion.localRequestId,
            requestMessageUuid: capturedCompletion.requestMessageUuid,
            responseMessageUuid: capturedCompletion.responseMessageUuid,
            outcome,
          };
          finish(() => {
            if (groupKey !== null)
              tx.objectStore("keys").put({ id: scope, address: scope, value: groupKey });
            tx.objectStore("completions").put({ id, address: scope, value: receipt });
            tx.objectStore("requests").delete(id);
          });
        } catch (error) {
          fail(error);
        }
      };
    });
  }
  readStagedCreation(
    scope: ChatKeyStorageScope,
    creationId: string,
  ): Promise<StagedChatCreation | null> {
    return this.read("creations", recordId(scopeAddress(scope), creationId));
  }
  async listStagedCreations(scope: ChatKeyStorageScope): Promise<readonly StagedChatCreation[]> {
    const address = scopeAddress(scope);
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("creations", "readonly");
      const request = tx.objectStore("creations").index("address").getAll(address) as IDBRequest<
        Row<StagedChatCreation>[]
      >;
      tx.oncomplete = () => {
        try {
          const values = request.result.map((row) => copyRecord(row.value));
          for (const value of values) validKey(value);
          resolve(values);
        } catch (error) {
          reject(error instanceof Error ? error : new ChatKeyStorageError("invalid-record"));
        }
      };
      tx.onabort = () => reject(tx.error ?? new ChatKeyStorageError("unavailable"));
      tx.onerror = () => undefined;
    });
  }
  writeStagedCreation(
    scope: ChatKeyStorageScope,
    creation: StagedChatCreation,
    options?: ChatKeyStorageWriteOptions,
  ): Promise<boolean> {
    const address = scopeAddress(scope);
    const id = recordId(address, creation.creationId);
    const capturedCreation = copyRecord(creation);
    validKey(capturedCreation);
    if (!capturedCreation.keyUuid) return Promise.reject(new ChatKeyStorageError("invalid-record"));
    return this.mutate(["creations"], options, (tx, finish, fail) => {
      const request = tx.objectStore("creations").get(id) as IDBRequest<
        Row<StagedChatCreation> | undefined
      >;
      request.onsuccess = () => {
        try {
          if (
            request.result !== undefined &&
            request.result.value.keyUuid !== capturedCreation.keyUuid
          )
            throw new ChatKeyStorageError("conflict");
          compatibleKey(request.result?.value, capturedCreation);
          finish(() => {
            tx.objectStore("creations").put({ id, address, value: capturedCreation });
          });
        } catch (error) {
          fail(error);
        }
      };
    });
  }
  finalizeCreation(
    scope: ChatKeyStorageScope,
    creationId: string,
    streamUuid: string,
    options?: ChatKeyStorageWriteOptions,
  ): Promise<boolean> {
    const capturedScope = { owner: { ...scope.owner }, deviceId: scope.deviceId };
    const id = recordId(scopeAddress(capturedScope), creationId);
    return this.mutate(["creations", "keys", "creationReceipts"], options, (tx, finish, fail) => {
      const request = tx.objectStore("creations").get(id) as IDBRequest<
        Row<StagedChatCreation> | undefined
      >;
      const receipt = tx.objectStore("creationReceipts").get(id) as IDBRequest<
        Row<{ streamUuid: string; keyUuid: string }> | undefined
      >;
      receipt.onsuccess = () => {
        const creation = request.result?.value;
        if (creation === undefined) {
          if (receipt.result?.value.streamUuid !== streamUuid) {
            fail(new ChatKeyStorageError("missing-request"));
            return;
          }
          finish(() => undefined);
          return;
        }
        const target = keyAddress({ ...capturedScope, streamUuid, keyUuid: creation.keyUuid });
        const old = tx.objectStore("keys").get(target) as IDBRequest<
          Row<StoredChatKey> | undefined
        >;
        old.onsuccess = () => {
          try {
            const value = compatibleKey(old.result?.value, creation);
            finish(() => {
              tx.objectStore("keys").put({ id: target, address: target, value });
              tx.objectStore("creations").delete(id);
              tx.objectStore("creationReceipts").put({
                id,
                address: scopeAddress(capturedScope),
                value: { streamUuid, keyUuid: creation.keyUuid },
              });
            });
          } catch (error) {
            fail(error);
          }
        };
      };
    });
  }
}
