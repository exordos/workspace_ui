import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setInstanceProvider } from "~/shared/api/client";
import {
  openMessageCacheDb,
  resetMessageCacheDbSingletonForTests,
} from "~/shared/lib/message-cache-db";
import type { WorkspaceEvent } from "~/shared/types/workspace-event";
import {
  applyWorkspaceFileCacheEvent,
  buildWorkspaceFileCachePartition,
  clearWorkspaceFileCacheForInstance,
  clearWorkspaceFileCachePartition,
  fetchWorkspaceFileBlobCacheFirst,
  fetchWorkspaceFileBlobFromApi,
  getWorkspaceFileBlobCacheRowForTests,
  putWorkspaceFileMetadata,
  type WorkspaceFileCacheScope,
} from "./workspace-file-blob-cache";

const PROJECT_UUID = "11111111-1111-4111-8111-111111111111";
const USER_A_UUID = "22222222-2222-4222-8222-222222222222";
const USER_B_UUID = "33333333-3333-4333-8333-333333333333";
const FILE_UUID = "44444444-4444-4444-8444-444444444444";
const STREAM_UUID = "55555555-5555-4555-8555-555555555555";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function scope(userUuid = USER_A_UUID, instanceId = "instance-a"): WorkspaceFileCacheScope {
  const origin = "https://workspace.example.com";
  return {
    instanceId,
    origin,
    projectId: PROJECT_UUID,
    userUuid,
    partition: buildWorkspaceFileCachePartition(origin, PROJECT_UUID, userUuid),
  };
}

function resolved<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

function fileEvent(
  kind: "file.created" | "file.updated" | "file.deleted",
  hash = HASH_A,
): WorkspaceEvent {
  return {
    schema_version: 1,
    uuid: "66666666-6666-4666-8666-666666666666",
    epoch_version: 10,
    project_id: PROJECT_UUID,
    user_uuid: USER_A_UUID,
    object_type: "file",
    action: kind.split(".")[1]!,
    created_at: "2026-07-16T00:00:00Z",
    updated_at: "2026-07-16T00:00:00Z",
    payload: {
      kind,
      uuid: FILE_UUID,
      stream_uuid: STREAM_UUID,
      ...(kind === "file.deleted" ? {} : { hash }),
    },
  };
}

afterEach(async () => {
  setInstanceProvider(() => null);
  try {
    const db = await openMessageCacheDb();
    db.close();
  } catch {
    // no open DB
  }
  resetMessageCacheDbSingletonForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase("workspace-message-cache-v1");
    req.onerror = () => reject(req.error ?? new Error("indexedDB deleteDatabase error"));
    req.onsuccess = () => resolve();
  });
});

describe("workspace-file-blob-cache", () => {
  it("fetches a protected avatar once and serves its second render from IDB", async () => {
    const payload = btoa(JSON.stringify({ sub: USER_A_UUID, project_id: PROJECT_UUID }));
    setInstanceProvider(() => ({
      id: "instance-avatar",
      realm: "https://workspace.example.com",
      workspaceOrgOrigin: "https://workspace.example.com",
      login: "cassi",
      authType: "iam",
      iamAccessToken: `e30.${payload}.signature`,
    }));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ uuid: FILE_UUID, hash: HASH_A, stream_uuid: null }), {
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("avatar", {
          headers: { ETag: `"${HASH_A}"`, "Content-Type": "image/jpeg" },
        }),
      );
    const path = `/api/workspace/v1/messenger/files/${FILE_UUID}/actions/download`;

    const first = await fetchWorkspaceFileBlobFromApi(path, {
      fetchImpl: fetchImpl as typeof fetch,
      headers: { Authorization: "Bearer opaque" },
    });
    const second = await fetchWorkspaceFileBlobFromApi(path, {
      fetchImpl: fetchImpl as typeof fetch,
      headers: { Authorization: "Bearer opaque" },
    });

    expect(first?.type).toBe("image/jpeg");
    expect(await second?.text()).toBe("avatar");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("serves the second read from IDB and coalesces concurrent first downloads", async () => {
    const metadata = vi.fn(() => resolved({ hash: HASH_A, streamUuid: STREAM_UUID }));
    let release!: (response: Response) => void;
    const binary = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );

    const request = {
      scope: scope(),
      fileUuid: FILE_UUID,
      fetchMetadata: metadata,
      fetchBinary: binary,
    };
    const first = fetchWorkspaceFileBlobCacheFirst(request);
    const concurrent = fetchWorkspaceFileBlobCacheFirst(request);
    await vi.waitFor(() => expect(binary).toHaveBeenCalledTimes(1));
    release(
      new Response("payload", {
        status: 200,
        headers: { ETag: `"${HASH_A}"`, "Content-Type": "text/plain" },
      }),
    );

    expect(await first).not.toBeNull();
    expect(await concurrent).not.toBeNull();
    expect(metadata).toHaveBeenCalledTimes(1);

    const cached = await fetchWorkspaceFileBlobCacheFirst(request);
    expect(await cached?.text()).toBe("payload");
    expect(binary).toHaveBeenCalledTimes(1);
  });

  it("isolates identical file UUID and revision between IAM users", async () => {
    const binaryA = vi.fn(() =>
      resolved(new Response("account-a", { headers: { ETag: `"${HASH_A}"` } })),
    );
    const metadata = () => resolved({ hash: HASH_A, streamUuid: STREAM_UUID });
    await fetchWorkspaceFileBlobCacheFirst({
      scope: scope(USER_A_UUID),
      fileUuid: FILE_UUID,
      fetchMetadata: metadata,
      fetchBinary: binaryA,
    });

    const binaryB = vi.fn(() =>
      resolved(new Response("account-b", { headers: { ETag: `"${HASH_A}"` } })),
    );
    const result = await fetchWorkspaceFileBlobCacheFirst({
      scope: scope(USER_B_UUID, "instance-b"),
      fileUuid: FILE_UUID,
      fetchMetadata: metadata,
      fetchBinary: binaryB,
    });

    expect(await result?.text()).toBe("account-b");
    expect(binaryB).toHaveBeenCalledTimes(1);
  });

  it("never caches non-2xx and evicts an existing file on 403", async () => {
    const account = scope();
    await fetchWorkspaceFileBlobCacheFirst({
      scope: account,
      fileUuid: FILE_UUID,
      fetchMetadata: () => resolved({ hash: HASH_A, streamUuid: STREAM_UUID }),
      fetchBinary: () => resolved(new Response("ok", { headers: { ETag: `"${HASH_A}"` } })),
    });
    expect(await getWorkspaceFileBlobCacheRowForTests(account, FILE_UUID, HASH_A)).not.toBeNull();

    await putWorkspaceFileMetadata(account, {
      fileUuid: FILE_UUID,
      hash: HASH_B,
      streamUuid: STREAM_UUID,
    });
    const result = await fetchWorkspaceFileBlobCacheFirst({
      scope: account,
      fileUuid: FILE_UUID,
      fetchMetadata: () => resolved({ hash: HASH_B, streamUuid: STREAM_UUID }),
      fetchBinary: () => resolved(new Response("forbidden", { status: 403 })),
    });

    expect(result).toBeNull();
    expect(await getWorkspaceFileBlobCacheRowForTests(account, FILE_UUID, HASH_A)).toBeNull();
    expect(await getWorkspaceFileBlobCacheRowForTests(account, FILE_UUID, HASH_B)).toBeNull();
  });

  it("immediately evicts all protected blobs after the removed user receives stream.deleted", async () => {
    const account = scope();
    await fetchWorkspaceFileBlobCacheFirst({
      scope: account,
      fileUuid: FILE_UUID,
      fetchMetadata: () => resolved({ hash: HASH_A, streamUuid: STREAM_UUID }),
      fetchBinary: () => resolved(new Response("secret", { headers: { ETag: `"${HASH_A}"` } })),
    });

    await applyWorkspaceFileCacheEvent(account, {
      ...fileEvent("file.deleted"),
      object_type: "stream",
      action: "deleted",
      payload: { kind: "stream.deleted", uuid: STREAM_UUID },
    });

    expect(await getWorkspaceFileBlobCacheRowForTests(account, FILE_UUID, HASH_A)).toBeNull();
  });

  it("file.updated replaces metadata revision and evicts stale bytes", async () => {
    const account = scope();
    await fetchWorkspaceFileBlobCacheFirst({
      scope: account,
      fileUuid: FILE_UUID,
      fetchMetadata: () => resolved({ hash: HASH_A, streamUuid: STREAM_UUID }),
      fetchBinary: () => resolved(new Response("old", { headers: { ETag: `"${HASH_A}"` } })),
    });

    await applyWorkspaceFileCacheEvent(account, fileEvent("file.updated", HASH_B));

    expect(await getWorkspaceFileBlobCacheRowForTests(account, FILE_UUID, HASH_A)).toBeNull();
    const binary = vi.fn(() => resolved(new Response("new", { headers: { ETag: `"${HASH_B}"` } })));
    const next = await fetchWorkspaceFileBlobCacheFirst({
      scope: account,
      fileUuid: FILE_UUID,
      fetchMetadata: () => resolved({ hash: HASH_B, streamUuid: STREAM_UUID }),
      fetchBinary: binary,
    });
    expect(await next?.text()).toBe("new");
    expect(binary).toHaveBeenCalledTimes(1);
  });

  it("clears only the removed account instance partition", async () => {
    const a = scope(USER_A_UUID, "instance-a");
    const b = scope(USER_B_UUID, "instance-b");
    for (const account of [a, b]) {
      await fetchWorkspaceFileBlobCacheFirst({
        scope: account,
        fileUuid: FILE_UUID,
        fetchMetadata: () => resolved({ hash: HASH_A, streamUuid: null }),
        fetchBinary: () =>
          resolved(new Response(account.userUuid, { headers: { ETag: `"${HASH_A}"` } })),
      });
    }

    await clearWorkspaceFileCacheForInstance("instance-a");

    expect(await getWorkspaceFileBlobCacheRowForTests(a, FILE_UUID, HASH_A)).toBeNull();
    expect(await getWorkspaceFileBlobCacheRowForTests(b, FILE_UUID, HASH_A)).not.toBeNull();
  });

  it("clears a re-added account by stable partition even when its local instance id changed", async () => {
    const oldLogin = scope(USER_A_UUID, "old-instance");
    const newLogin = scope(USER_A_UUID, "new-instance");
    const binary = vi.fn(() =>
      resolved(new Response("persisted", { headers: { ETag: `"${HASH_A}"` } })),
    );
    await fetchWorkspaceFileBlobCacheFirst({
      scope: oldLogin,
      fileUuid: FILE_UUID,
      fetchMetadata: () => resolved({ hash: HASH_A, streamUuid: STREAM_UUID }),
      fetchBinary: binary,
    });
    expect(
      await fetchWorkspaceFileBlobCacheFirst({
        scope: newLogin,
        fileUuid: FILE_UUID,
        fetchMetadata: () => resolved({ hash: HASH_A, streamUuid: STREAM_UUID }),
        fetchBinary: binary,
      }),
    ).not.toBeNull();
    expect(binary).toHaveBeenCalledTimes(1);

    await clearWorkspaceFileCachePartition(newLogin);

    expect(await getWorkspaceFileBlobCacheRowForTests(oldLogin, FILE_UUID, HASH_A)).toBeNull();
  });

  it("does not let an in-flight response repopulate a partition after logout", async () => {
    const account = scope();
    let release!: (response: Response) => void;
    const pending = fetchWorkspaceFileBlobCacheFirst({
      scope: account,
      fileUuid: FILE_UUID,
      fetchMetadata: () => resolved({ hash: HASH_A, streamUuid: STREAM_UUID }),
      fetchBinary: async () =>
        await new Promise<Response>((resolve) => {
          release = resolve;
        }),
    });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));

    await clearWorkspaceFileCachePartition(account);
    release(new Response("late", { headers: { ETag: `"${HASH_A}"` } }));

    expect(await pending).toBeNull();
    expect(await getWorkspaceFileBlobCacheRowForTests(account, FILE_UUID, HASH_A)).toBeNull();
  });
});
