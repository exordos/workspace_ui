/**
 * Tests for pin/unpin feature.
 *
 * Verifies that chats can be pinned/unpinned within folders,
 * and that the pinned state is correctly tracked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePinStore } from "./pin-chat.model";

vi.mock("~/shared/api/client", () => {
  const api = { post: vi.fn() };
  return {
    refreshWorkspaceApiBase: vi.fn(),
    getWorkspaceApiBaseForCurrentInstance: vi.fn(() => "https://test.example.com"),
    workspaceApi: {
      post: api.post,
      postWithBase: vi.fn(
        (base: string, path: string, body: Record<string, string>, signal?: AbortSignal) =>
          api.post(path, body, signal),
      ),
    },
  };
});

describe("usePinStore", () => {
  afterEach(() => {
    usePinStore.getState().clear();
  });

  // Pinning adds a chat to the pinned set
  it("pinChat adds to pinned set", () => {
    usePinStore.getState().pinChat("folder-1", "chat-42");
    expect(usePinStore.getState().isPinned("folder-1", "chat-42")).toBe(true);
  });

  // Unpinning removes it
  it("unpinChat removes from pinned set", () => {
    usePinStore.getState().pinChat("folder-1", "chat-42");
    usePinStore.getState().unpinChat("folder-1", "chat-42");
    expect(usePinStore.getState().isPinned("folder-1", "chat-42")).toBe(false);
  });

  // Pinning is per-folder — same chat can be pinned in one folder but not another
  it("pin is scoped to folder", () => {
    usePinStore.getState().pinChat("folder-1", "chat-42");
    expect(usePinStore.getState().isPinned("folder-1", "chat-42")).toBe(true);
    expect(usePinStore.getState().isPinned("folder-2", "chat-42")).toBe(false);
  });

  // getPinnedChatIds returns all pinned chats for a folder
  it("getPinnedChatIds returns correct IDs", () => {
    usePinStore.getState().pinChat("f1", "c1");
    usePinStore.getState().pinChat("f1", "c2");
    usePinStore.getState().pinChat("f2", "c3");

    const f1Pins = usePinStore.getState().getPinnedChatIds("f1");
    expect(f1Pins).toContain("c1");
    expect(f1Pins).toContain("c2");
    expect(f1Pins).not.toContain("c3");
  });

  // Bulk initialization from server data
  it("setFromServer loads pinned chats sorted by pinned_at descending", () => {
    usePinStore.getState().setFromServer([
      {
        folderUuid: "f1",
        folderItemUuid: "item-10",
        chatId: "c10",
        orderIndex: 1,
        pinnedAt: "2026-03-14T00:00:00Z",
      },
      {
        folderUuid: "f1",
        folderItemUuid: "item-20",
        chatId: "c20",
        orderIndex: 0,
        pinnedAt: "2026-03-14T01:00:00Z",
      },
      {
        folderUuid: "f2",
        folderItemUuid: "item-30",
        chatId: "c30",
        orderIndex: 0,
        pinnedAt: "2026-03-14T00:00:00Z",
      },
    ]);

    expect(usePinStore.getState().isPinned("f1", "c10")).toBe(true);
    expect(usePinStore.getState().isPinned("f1", "c20")).toBe(true);
    expect(usePinStore.getState().isPinned("f2", "c30")).toBe(true);
    expect(usePinStore.getState().getPinnedChatIds("f1")).toEqual(["c20", "c10"]);
  });

  it("isPinned matches alias-equivalent chat ids", () => {
    usePinStore.getState().setFromServer([
      {
        folderUuid: "f1",
        folderItemUuid: "item-11",
        chatId: "11",
        orderIndex: 0,
        pinnedAt: "2026-03-14T00:00:00Z",
      },
    ]);
    expect(usePinStore.getState().isPinned("f1", "stream:11:general")).toBe(true);
    expect(usePinStore.getState().getPinnedSortIndex("f1", "stream:11:general")).toBe(0);
  });

  it("setFromServer keeps folder item mapping and ignores non-pinned rows", () => {
    usePinStore.getState().setFromServer([
      {
        folderUuid: "f1",
        folderItemUuid: "item-10",
        chatId: "c10",
        orderIndex: 0,
        pinnedAt: null,
      },
    ]);

    expect(usePinStore.getState().isPinned("f1", "c10")).toBe(false);
    expect(usePinStore.getState().getPinnedChatIds("f1")).toHaveLength(0);
    expect(usePinStore.getState().getFolderItemUuid("f1", "c10")).toBe("item-10");
  });

  it("setFromServer with empty array does not wipe existing pin state", () => {
    usePinStore.getState().setFromServer([
      {
        folderUuid: "f1",
        folderItemUuid: "item-1",
        chatId: "dm:42",
        orderIndex: 0,
        pinnedAt: "2026-03-14T10:00:00Z",
      },
    ]);
    usePinStore.getState().setFromServer([]);
    expect(usePinStore.getState().isPinned("f1", "dm:42")).toBe(true);
    expect(usePinStore.getState().getFolderItemUuid("f1", "dm:42")).toBe("item-1");
  });

  // Clear resets everything
  it("clear resets all state", () => {
    usePinStore.getState().pinChat("f1", "c1");
    usePinStore.getState().clear();
    expect(usePinStore.getState().isPinned("f1", "c1")).toBe(false);
    expect(usePinStore.getState().getPinnedChatIds("f1")).toHaveLength(0);
  });

  it("getPinnedChatIds returns stable array until folder pins change", () => {
    usePinStore.getState().pinChat("f1", "c1");
    const first = usePinStore.getState().getPinnedChatIds("f1");
    const second = usePinStore.getState().getPinnedChatIds("f1");
    expect(first).toBe(second);

    usePinStore.getState().pinChat("f1", "c2");
    const afterAdd = usePinStore.getState().getPinnedChatIds("f1");
    expect(afterAdd).not.toBe(first);
    expect(afterAdd.length).toBe(2);
  });

  // Pinning the same chat twice is idempotent
  it("pinChat is idempotent", () => {
    usePinStore.getState().pinChat("f1", "c1");
    usePinStore.getState().pinChat("f1", "c1");
    expect(usePinStore.getState().getPinnedChatIds("f1")).toHaveLength(1);
  });

  it("getFolderItemUuid resolves alias-equivalent chat ids", () => {
    usePinStore.getState().setFromServer([
      {
        folderUuid: "folder-1",
        folderItemUuid: "item-11",
        chatId: "11",
        orderIndex: 0,
        pinnedAt: null,
      },
    ]);
    expect(usePinStore.getState().getFolderItemUuid("folder-1", "stream:11:general")).toBe(
      "item-11",
    );
  });

  it("getFolderItemUuid uses O(1) canonical map lookup for dm id order", () => {
    usePinStore.getState().setFromServer([
      {
        folderUuid: "f1",
        folderItemUuid: "item-dm",
        chatId: "dm:21,7",
        orderIndex: 0,
        pinnedAt: null,
      },
    ]);
    expect(usePinStore.getState().getFolderItemUuid("f1", "dm:7,21")).toBe("item-dm");
  });
});

// Pin/unpin API — calls Workspace API for folder-scoped pinning.
describe("pin-chat API", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { registerWorkspaceOrvalMutator } = await import("~/shared/api/workspace-orval-mutator");
    registerWorkspaceOrvalMutator();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockOk = {
    ok: true,
    status: 200,
    data: {},
    headers: new Headers(),
    raw: new Response(),
    durationMs: 15,
  };

  const mockFail = {
    ok: false,
    status: 400,
    data: null,
    headers: new Headers(),
    raw: new Response(),
    durationMs: 10,
  };

  describe("pinChatInFolder", () => {
    it("calls correct endpoint and returns true on success", async () => {
      const { workspaceApi } = await import("~/shared/api/client");
      vi.mocked(workspaceApi.post).mockResolvedValue(mockOk);

      const { pinChatInFolder } = await import("./pin-chat.api");
      const result = await pinChatInFolder("folder-abc", "item-xyz");

      expect(result).toBe(true);
      expect(workspaceApi.post).toHaveBeenCalledWith(
        "/v1/folders/folder-abc/items/item-xyz/actions/pin/invoke",
        {},
        undefined,
      );
    });

    it("returns false on API failure", async () => {
      const { workspaceApi } = await import("~/shared/api/client");
      vi.mocked(workspaceApi.post).mockResolvedValue(mockFail);

      const { pinChatInFolder } = await import("./pin-chat.api");
      expect(await pinChatInFolder("f1", "i1")).toBe(false);
    });

    it("returns false on network error", async () => {
      const { workspaceApi } = await import("~/shared/api/client");
      vi.mocked(workspaceApi.post).mockRejectedValue(new Error("Connection refused"));

      const { pinChatInFolder } = await import("./pin-chat.api");
      expect(await pinChatInFolder("f1", "i1")).toBe(false);
    });

    it("rejects on empty folderUuid (guard)", async () => {
      const { pinChatInFolder } = await import("./pin-chat.api");
      await expect(pinChatInFolder("", "i1")).rejects.toThrow();
    });

    it("rejects on empty folderItemUuid (guard)", async () => {
      const { pinChatInFolder } = await import("./pin-chat.api");
      await expect(pinChatInFolder("f1", "")).rejects.toThrow();
    });

    it("returns false for optimistic folder item uuid", async () => {
      const { pinChatInFolder } = await import("./pin-chat.api");
      expect(await pinChatInFolder("f1", "__folder_assignment_pending__:f1:dm:1")).toBe(false);
    });
  });

  describe("unpinChatInFolder", () => {
    it("calls correct endpoint and returns true on success", async () => {
      const { workspaceApi } = await import("~/shared/api/client");
      vi.mocked(workspaceApi.post).mockResolvedValue(mockOk);

      const { unpinChatInFolder } = await import("./pin-chat.api");
      const result = await unpinChatInFolder("folder-abc", "item-xyz");

      expect(result).toBe(true);
      expect(workspaceApi.post).toHaveBeenCalledWith(
        "/v1/folders/folder-abc/items/item-xyz/actions/unpin/invoke",
        {},
        undefined,
      );
    });

    it("returns false on API failure", async () => {
      const { workspaceApi } = await import("~/shared/api/client");
      vi.mocked(workspaceApi.post).mockResolvedValue(mockFail);

      const { unpinChatInFolder } = await import("./pin-chat.api");
      expect(await unpinChatInFolder("f1", "i1")).toBe(false);
    });

    it("returns false on network error", async () => {
      const { workspaceApi } = await import("~/shared/api/client");
      vi.mocked(workspaceApi.post).mockRejectedValue(new Error("Timeout"));

      const { unpinChatInFolder } = await import("./pin-chat.api");
      expect(await unpinChatInFolder("f1", "i1")).toBe(false);
    });

    it("returns false for optimistic folder item uuid", async () => {
      const { unpinChatInFolder } = await import("./pin-chat.api");
      expect(await unpinChatInFolder("f1", "__folder_assignment_pending__:f1:dm:1")).toBe(false);
    });
  });
});
