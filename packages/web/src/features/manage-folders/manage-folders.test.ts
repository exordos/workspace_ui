/**
 * Tests for the folder management feature — CRUD operations on workspace folders.
 *
 * Covers store state transitions (edit mode, selection, status), and API
 * integration for create, update, and delete operations.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useManageFoldersStore } from "./manage-folders.model";

vi.mock("~/shared/api/client", () => ({
  workspaceApi: {
    get: vi.fn(),
    postJson: vi.fn(),
    putJson: vi.fn(),
    delete: vi.fn(),
  },
  refreshWorkspaceApiBase: vi.fn(),
}));

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

describe("useManageFoldersStore", () => {
  afterEach(() => {
    useManageFoldersStore.getState().reset();
    vi.restoreAllMocks();
  });

  async function setupDefaultMocks() {
    const { workspaceApi } = await import("~/shared/api/client");
    vi.mocked(workspaceApi.get).mockResolvedValue(folderGetResponse);
    vi.mocked(workspaceApi.postJson).mockResolvedValue(folderResponse);
    vi.mocked(workspaceApi.putJson).mockResolvedValue(folderResponse);
    vi.mocked(workspaceApi.delete).mockResolvedValue({
      ok: true,
      status: 204,
      data: null,
      headers: new Headers(),
      raw: new Response(),
      durationMs: 10,
    } as never);
  }

  describe("initial state", () => {
    it("starts with idle status and no selection", () => {
      const state = useManageFoldersStore.getState();
      expect(state.status).toBe("idle");
      expect(state.editMode).toBe("none");
      expect(state.selectedFolderId).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe("edit mode", () => {
    it("sets edit mode to create", () => {
      useManageFoldersStore.getState().setEditMode("create");
      expect(useManageFoldersStore.getState().editMode).toBe("create");
    });

    it("sets edit mode to edit", () => {
      useManageFoldersStore.getState().setEditMode("edit");
      expect(useManageFoldersStore.getState().editMode).toBe("edit");
    });

    it("clears error when changing edit mode", () => {
      useManageFoldersStore.setState({ error: "previous error" });
      useManageFoldersStore.getState().setEditMode("create");
      expect(useManageFoldersStore.getState().error).toBeNull();
    });
  });

  describe("folder selection", () => {
    it("selects a folder by id", () => {
      useManageFoldersStore.getState().selectFolder("folder-1");
      expect(useManageFoldersStore.getState().selectedFolderId).toBe("folder-1");
    });

    it("clears selection with null", () => {
      useManageFoldersStore.getState().selectFolder("folder-1");
      useManageFoldersStore.getState().selectFolder(null);
      expect(useManageFoldersStore.getState().selectedFolderId).toBeNull();
    });
  });

  describe("create", () => {
    it("creates a folder and returns result", async () => {
      await setupDefaultMocks();
      const result = await useManageFoldersStore.getState().create({ title: "New Folder" });
      expect(result).not.toBeNull();
      expect(result!.id).toBe("folder-1");
      expect(result!.title).toBe("New Folder");
      expect(useManageFoldersStore.getState().status).toBe("idle");
      expect(useManageFoldersStore.getState().editMode).toBe("none");
    });
  });

  describe("update", () => {
    it("updates a folder and returns result", async () => {
      await setupDefaultMocks();
      const result = await useManageFoldersStore
        .getState()
        .update("folder-1", { title: "Renamed" });
      expect(result).not.toBeNull();
      expect(useManageFoldersStore.getState().status).toBe("idle");
    });
  });

  describe("delete", () => {
    it("deletes a folder and clears selection", async () => {
      await setupDefaultMocks();
      useManageFoldersStore.getState().selectFolder("folder-1");
      const success = await useManageFoldersStore.getState().remove("folder-1");
      expect(success).toBe(true);
      expect(useManageFoldersStore.getState().status).toBe("idle");
      expect(useManageFoldersStore.getState().selectedFolderId).toBeNull();
    });
  });

  describe("reset", () => {
    it("resets all state to initial", () => {
      useManageFoldersStore.getState().setEditMode("create");
      useManageFoldersStore.getState().selectFolder("folder-1");
      useManageFoldersStore.getState().reset();

      const state = useManageFoldersStore.getState();
      expect(state.status).toBe("idle");
      expect(state.editMode).toBe("none");
      expect(state.selectedFolderId).toBeNull();
      expect(state.error).toBeNull();
    });
  });
});

// Direct API function tests — isolated from the store layer.
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
      } as never);

      const { deleteFolder } = await import("./manage-folders.api");
      const result = await deleteFolder("folder-1");

      expect(result).toBe(true);
      expect(workspaceApi.delete).toHaveBeenCalledWith("/v1/folders/folder-1");
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
      } as never);

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
