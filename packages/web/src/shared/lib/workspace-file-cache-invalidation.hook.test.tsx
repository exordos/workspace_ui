import "fake-indexeddb/auto";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setInstanceProvider } from "~/shared/api/client";
import {
  openMessageCacheDb,
  resetMessageCacheDbSingletonForTests,
} from "~/shared/lib/message-cache-db";
import { useProtectedMediaDisplayUrl } from "~/shared/lib/protected-message-media.hook";
import {
  applyWorkspaceFileCacheEvent,
  resolveCurrentWorkspaceFileCacheScope,
} from "~/shared/lib/workspace-file-blob-cache";
import type { WorkspaceEvent } from "~/shared/types/workspace-event";

const PROJECT_UUID = "11111111-1111-4111-8111-111111111111";
const USER_UUID = "22222222-2222-4222-8222-222222222222";
const FILE_UUID = "33333333-3333-4333-8333-333333333333";
const STREAM_UUID = "44444444-4444-4444-8444-444444444444";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const PATH = `/api/workspace/v1/messenger/files/${FILE_UUID}/actions/download`;

function jwt(): string {
  return `e30.${btoa(JSON.stringify({ sub: USER_UUID, project_id: PROJECT_UUID }))}.signature`;
}

function fileUpdatedEvent(): WorkspaceEvent {
  return {
    schema_version: 1,
    uuid: "55555555-5555-4555-8555-555555555555",
    epoch_version: 12,
    project_id: PROJECT_UUID,
    user_uuid: USER_UUID,
    object_type: "file",
    action: "updated",
    created_at: "2026-07-16T00:00:00Z",
    updated_at: "2026-07-16T00:00:00Z",
    payload: {
      kind: "file.updated",
      uuid: FILE_UUID,
      stream_uuid: STREAM_UUID,
      hash: HASH_B,
    },
  };
}

afterEach(async () => {
  setInstanceProvider(() => null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  try {
    const db = await openMessageCacheDb();
    db.close();
  } catch {
    // no open DB
  }
  resetMessageCacheDbSingletonForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("workspace-message-cache-v1");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
});

describe("Workspace file display URL invalidation", () => {
  it("revokes the active object URL and loads the new revision after file.updated", async () => {
    setInstanceProvider(() => ({
      id: "instance-a",
      realm: "https://workspace.example.com",
      workspaceOrgOrigin: "https://workspace.example.com",
      login: "cassi",
      authType: "iam",
      iamAccessToken: jwt(),
    }));
    const createObjectURL = vi
      .fn()
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ hash: HASH_A, stream_uuid: STREAM_UUID }), {
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(new Response("first", { headers: { ETag: `"${HASH_A}"` } }))
        .mockResolvedValueOnce(new Response("second", { headers: { ETag: `"${HASH_B}"` } })),
    );

    const { result, unmount } = renderHook(() => useProtectedMediaDisplayUrl(PATH, "image"));
    await waitFor(() => expect(result.current).toBe("blob:first"));
    const scope = resolveCurrentWorkspaceFileCacheScope();
    expect(scope).not.toBeNull();

    await act(async () => {
      await applyWorkspaceFileCacheEvent(scope!, fileUpdatedEvent());
    });

    await waitFor(() => expect(result.current).toBe("blob:second"));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:first");
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:second");
  });
});
