/**
 * Tests for the folder management feature — messenger gateway folder API integration.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const messengerApi = vi.hoisted(() => ({
  getWithBase: vi.fn(),
  postJsonWithBase: vi.fn(),
  putJsonWithBase: vi.fn(),
  deleteWithBase: vi.fn(),
}));

vi.mock("~/shared/api/client", () => ({
  messengerApi,
  getMessengerGatewayApiBaseForCurrentInstance: vi.fn(() => "/api/workspace/v1/messenger"),
}));

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
    unread_count: 0,
    folder_items: [],
    system_type: "created" as const,
  },
  headers: new Headers(),
  raw: new Response(),
  durationMs: 20,
};

describe("manage-folders API", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("createFolder", () => {
    it("calls postJsonWithBase with correct payload and maps response", async () => {
      vi.mocked(messengerApi.postJsonWithBase).mockResolvedValue(folderResponse);

      const { createFolder } = await import("./manage-folders.api");
      const result = await createFolder({ title: "Engineering" });

      expect(result).toEqual({
        id: "folder-1",
        title: "New Folder",
        backgroundColor: 0,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      });
      expect(messengerApi.postJsonWithBase).toHaveBeenCalledWith(
        "/api/workspace/v1/messenger",
        "/folders/",
        expect.objectContaining({
          title: "Engineering",
          background_color_value: 0,
        }),
      );
    });

    it("passes backgroundColor when provided", async () => {
      vi.mocked(messengerApi.postJsonWithBase).mockResolvedValue(folderResponse);

      const { createFolder } = await import("./manage-folders.api");
      await createFolder({ title: "Red Folder", backgroundColor: 0xff0000 });

      expect(messengerApi.postJsonWithBase).toHaveBeenCalledWith(
        "/api/workspace/v1/messenger",
        "/folders/",
        expect.objectContaining({
          title: "Red Folder",
          background_color_value: 0xff0000,
        }),
      );
    });

    it("returns null on API failure", async () => {
      vi.mocked(messengerApi.postJsonWithBase).mockResolvedValue({
        ok: false,
        status: 400,
        data: null,
      });

      const { createFolder } = await import("./manage-folders.api");
      expect(await createFolder({ title: "Test" })).toBeNull();
    });

    it("returns null on network error", async () => {
      vi.mocked(messengerApi.postJsonWithBase).mockRejectedValue(new Error("Offline"));

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
      vi.mocked(messengerApi.getWithBase).mockResolvedValue(folderGetResponse);
      vi.mocked(messengerApi.putJsonWithBase).mockResolvedValue(folderResponse);

      const { updateFolder } = await import("./manage-folders.api");
      await updateFolder("folder-1", { title: "Renamed" });

      expect(messengerApi.getWithBase).toHaveBeenCalledWith(
        "/api/workspace/v1/messenger",
        "/folders/folder-1",
        undefined,
        undefined,
      );
      expect(messengerApi.putJsonWithBase).toHaveBeenCalledWith(
        "/api/workspace/v1/messenger",
        "/folders/folder-1",
        expect.objectContaining({
          title: "Renamed",
        }),
      );
    });

    it("omits read-only timestamps from update payload", async () => {
      vi.mocked(messengerApi.getWithBase).mockResolvedValue(folderGetResponse);
      vi.mocked(messengerApi.putJsonWithBase).mockResolvedValue(folderResponse);
      vi.mocked(messengerApi.putJsonWithBase).mockClear();

      const { updateFolder } = await import("./manage-folders.api");
      await updateFolder("folder-1", { title: "Renamed" });

      const putJsonWithBase = vi.mocked(messengerApi.putJsonWithBase);
      expect(putJsonWithBase).toHaveBeenCalledTimes(1);
      const body = putJsonWithBase.mock.calls[0]![2] as Record<string, unknown>;
      expect(body).not.toHaveProperty("updated_at");
      expect(body).not.toHaveProperty("created_at");
      expect(body).not.toHaveProperty("unread_count");
      expect(body).not.toHaveProperty("folder_items");
    });

    it("sends backgroundColor when provided", async () => {
      vi.mocked(messengerApi.getWithBase).mockResolvedValue(folderGetResponse);
      vi.mocked(messengerApi.putJsonWithBase).mockResolvedValue(folderResponse);

      const { updateFolder } = await import("./manage-folders.api");
      await updateFolder("folder-1", { backgroundColor: 0x00ff00 });

      expect(messengerApi.putJsonWithBase).toHaveBeenCalledWith(
        "/api/workspace/v1/messenger",
        "/folders/folder-1",
        expect.objectContaining({
          background_color_value: 0x00ff00,
        }),
      );
    });

    it("maps response to FolderItem", async () => {
      vi.mocked(messengerApi.getWithBase).mockResolvedValue(folderGetResponse);
      vi.mocked(messengerApi.putJsonWithBase).mockResolvedValue(folderResponse);

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
      vi.mocked(messengerApi.getWithBase).mockResolvedValue(folderGetResponse);
      vi.mocked(messengerApi.putJsonWithBase).mockResolvedValue({
        ok: false,
        status: 404,
        data: null,
      });

      const { updateFolder } = await import("./manage-folders.api");
      expect(await updateFolder("folder-1", { title: "X" })).toBeNull();
    });

    it("returns null on network error", async () => {
      vi.mocked(messengerApi.getWithBase).mockResolvedValue(folderGetResponse);
      vi.mocked(messengerApi.putJsonWithBase).mockRejectedValue(new Error("Timeout"));

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
      vi.mocked(messengerApi.deleteWithBase).mockResolvedValue({
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
      expect(messengerApi.deleteWithBase).toHaveBeenCalledWith(
        "/api/workspace/v1/messenger",
        "/folders/folder-1",
      );
    });

    it("returns false on API failure", async () => {
      vi.mocked(messengerApi.deleteWithBase).mockResolvedValue({
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
      vi.mocked(messengerApi.deleteWithBase).mockRejectedValue(new Error("DNS error"));

      const { deleteFolder } = await import("./manage-folders.api");
      expect(await deleteFolder("folder-1")).toBe(false);
    });

    it("rejects on empty folderId (guard)", async () => {
      const { deleteFolder } = await import("./manage-folders.api");
      await expect(deleteFolder("")).rejects.toThrow();
    });
  });
});
