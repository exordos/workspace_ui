/**
 * Tests for the folder management feature — workspace folder API integration.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/shared/api/client", () => {
  const api = {
    get: vi.fn(),
    postJson: vi.fn(),
    putJson: vi.fn(),
    delete: vi.fn(),
  };
  return {
    workspaceApi: {
      ...api,
      getWithBase: vi.fn(
        (_base: string, path: string, params?: Record<string, string>, signal?: AbortSignal) =>
          api.get(path, params, signal),
      ),
      postJsonWithBase: vi.fn((_base: string, path: string, body: unknown) =>
        api.postJson(path, body),
      ),
      putJsonWithBase: vi.fn((_base: string, path: string, body: unknown) =>
        api.putJson(path, body),
      ),
      deleteWithBase: vi.fn((_base: string, path: string, body?: Record<string, string>) =>
        api.delete(path, body),
      ),
    },
    getWorkspaceApiBaseForCurrentInstance: vi.fn(() => "https://test.example.com"),
    refreshWorkspaceApiBase: vi.fn(),
  };
});

beforeEach(async () => {
  const { registerWorkspaceOrvalMutator } = await import("~/shared/api/workspace-orval-mutator");
  registerWorkspaceOrvalMutator();
});

const folderResponse = {
  ok: true as const,
  status: 200,
  data: {
    uuid: "folder-1",
    title: "New Folder",
    background_color_value: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  headers: new Headers(),
  raw: new Response(),
  durationMs: 30,
};

const folderGetResponse = {
  ok: true as const,
  status: 200,
  data: {
    uuid: "folder-1",
    title: "New Folder",
    background_color_value: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    unread_messages: [] as number[],
    system_type: "created" as const,
  },
  headers: new Headers(),
  raw: new Response(),
  durationMs: 20,
};

describe("manage-folders API", () => {
  beforeEach(async () => {
    const { registerWorkspaceOrvalMutator } = await import("~/shared/api/workspace-orval-mutator");
    registerWorkspaceOrvalMutator();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createFolder", () => {
    it("calls postJson with correct payload and maps response", async () => {
      const { workspaceApi } = await import("~/shared/api/client");
      vi.mocked(workspaceApi.postJson).mockResolvedValue(folderResponse);

      const { createFolder } = await import("./manage-folders.api");
      const result = await createFolder({ title: "Engineering" });

      expect(result).toEqual({
        id: "folder-1",
        title: "New Folder",
        backgroundColor: 0,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      });
      expect(workspaceApi.postJson).toHaveBeenCalledWith(
        "/v1/folders/",
        expect.objectContaining({
          title: "Engineering",
          background_color_value: 0,
        }),
      );
    });

    it("passes backgroundColor when provided", async () => {
      const { workspaceApi } = await import("~/shared/api/client");
      vi.mocked(workspaceApi.postJson).mockResolvedValue(folderResponse);

      const { createFolder } = await import("./manage-folders.api");
      await createFolder({ title: "Red Folder", backgroundColor: 0xff0000 });

      expect(workspaceApi.postJson).toHaveBeenCalledWith(
        "/v1/folders/",
        expect.objectContaining({
          title: "Red Folder",
          background_color_value: 0xff0000,
        }),
      );
    });

    it("returns null on API failure", async () => {
      const { workspaceApi } = await import("~/shared/api/client");
      vi.mocked(workspaceApi.postJson).mockResolvedValue({
        ok: false,
        status: 400,
        data: null,
      } as never);

      const { createFolder } = await import("./manage-folders.api");
      expect(await createFolder({ title: "Test" })).toBeNull();
    });

    it("returns null on network error", async () => {
      const { workspaceApi } = await import("~/shared/api/client");
      vi.mocked(workspaceApi.postJson).mockRejectedValue(new Error("Offline"));

      const { createFolder } = await import("./manage-folders.api");
      expect(await createFolder({ title: "Test" })).toBeNull();
    });

    it("rejects on empty title (guard)", async () => {
      const { createFolder } = await import("./manage-folders.api");
      await expect(createFolder({ title: "" })).rejects.toThrow();
    });
  });

  describe("updateFolder", () => {
    it("sends only provided fields in update payload", async () => {
      const { workspaceApi } = await import("~/shared/api/client");
      vi.mocked(workspaceApi.get).mockResolvedValue(folderGetResponse);
      vi.mocked(workspaceApi.putJson).mockResolvedValue(folderResponse);

      const { updateFolder } = await import("./manage-folders.api");
      await updateFolder("folder-1", { title: "Renamed" });

      expect(workspaceApi.get).toHaveBeenCalledWith("/v1/folders/folder-1", undefined, undefined);
      expect(workspaceApi.putJson).toHaveBeenCalledWith(
        "/v1/folders/folder-1",
        expect.objectContaining({
          title: "Renamed",
        }),
      );
    });

    it("omits read-only timestamps from update payload", async () => {
      const { workspaceApi } = await import("~/shared/api/client");
      vi.mocked(workspaceApi.get).mockResolvedValue(folderGetResponse);
      vi.mocked(workspaceApi.putJson).mockResolvedValue(folderResponse);
      vi.mocked(workspaceApi.putJson).mockClear();

      const { updateFolder } = await import("./manage-folders.api");
      await updateFolder("folder-1", { title: "Renamed" });

      const putJson = vi.mocked(workspaceApi.putJson);
      expect(putJson).toHaveBeenCalledTimes(1);
      const body = putJson.mock.calls[0]![1] as Record<string, unknown>;
      expect(body).not.toHaveProperty("updated_at");
      expect(body).not.toHaveProperty("created_at");
      expect(body).not.toHaveProperty("unread_messages");
    });

    it("sends backgroundColor when provided", async () => {
      const { workspaceApi } = await import("~/shared/api/client");
      vi.mocked(workspaceApi.get).mockResolvedValue(folderGetResponse);
      vi.mocked(workspaceApi.putJson).mockResolvedValue(folderResponse);

      const { updateFolder } = await import("./manage-folders.api");
      await updateFolder("folder-1", { backgroundColor: 0x00ff00 });

      expect(workspaceApi.putJson).toHaveBeenCalledWith(
        "/v1/folders/folder-1",
        expect.objectContaining({
          background_color_value: 0x00ff00,
        }),
      );
    });

    it("maps response to FolderItem", async () => {
      const { workspaceApi } = await import("~/shared/api/client");
      vi.mocked(workspaceApi.get).mockResolvedValue(folderGetResponse);
      vi.mocked(workspaceApi.putJson).mockResolvedValue(folderResponse);

      const { updateFolder } = await import("./manage-folders.api");
      const result = await updateFolder("folder-1", { title: "X" });

      expect(result).toEqual({
        id: "folder-1",
        title: "New Folder",
        backgroundColor: 0,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      });
    });

    it("returns null on API failure", async () => {
      const { workspaceApi } = await import("~/shared/api/client");
      vi.mocked(workspaceApi.get).mockResolvedValue(folderGetResponse);
      vi.mocked(workspaceApi.putJson).mockResolvedValue({
        ok: false,
        status: 404,
        data: null,
      } as never);

      const { updateFolder } = await import("./manage-folders.api");
      expect(await updateFolder("folder-1", { title: "X" })).toBeNull();
    });

    it("returns null on network error", async () => {
      const { workspaceApi } = await import("~/shared/api/client");
      vi.mocked(workspaceApi.get).mockResolvedValue(folderGetResponse);
      vi.mocked(workspaceApi.putJson).mockRejectedValue(new Error("Timeout"));

      const { updateFolder } = await import("./manage-folders.api");
      expect(await updateFolder("folder-1", { title: "X" })).toBeNull();
    });

    it("rejects on empty folderId (guard)", async () => {
      const { updateFolder } = await import("./manage-folders.api");
      await expect(updateFolder("", { title: "X" })).rejects.toThrow();
    });
  });

  describe("deleteFolder", () => {
    it("calls delete endpoint and returns true on success", async () => {
      const { workspaceApi } = await import("~/shared/api/client");
      vi.mocked(workspaceApi.delete).mockResolvedValue({
        ok: true,
        status: 204,
        data: null,
        headers: new Headers(),
        raw: new Response(),
        durationMs: 20,
      });

      const { deleteFolder } = await import("./manage-folders.api");
      const result = await deleteFolder("folder-1");

      expect(result).toBe(true);
      expect(workspaceApi.delete).toHaveBeenCalledWith("/v1/folders/folder-1", undefined);
    });

    it("returns false on API failure", async () => {
      const { workspaceApi } = await import("~/shared/api/client");
      vi.mocked(workspaceApi.delete).mockResolvedValue({
        ok: false,
        status: 404,
        data: null,
        headers: new Headers(),
        raw: new Response(),
        durationMs: 10,
      });

      const { deleteFolder } = await import("./manage-folders.api");
      expect(await deleteFolder("folder-1")).toBe(false);
    });

    it("returns false on network error", async () => {
      const { workspaceApi } = await import("~/shared/api/client");
      vi.mocked(workspaceApi.delete).mockRejectedValue(new Error("DNS error"));

      const { deleteFolder } = await import("./manage-folders.api");
      expect(await deleteFolder("folder-1")).toBe(false);
    });

    it("rejects on empty folderId (guard)", async () => {
      const { deleteFolder } = await import("./manage-folders.api");
      await expect(deleteFolder("")).rejects.toThrow();
    });
  });
});
