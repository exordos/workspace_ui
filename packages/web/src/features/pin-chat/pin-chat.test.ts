/**
 * Tests for pin/unpin feature.
 *
 * Verifies that chats can be pinned/unpinned within folders,
 * and that the pinned state is correctly tracked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePinStore } from "./pin-chat.model";

vi.mock("~/shared/api/client", () => ({
  refreshWorkspaceApiBase: vi.fn(),
  workspaceApi: {
    post: vi.fn(),
  },
}));

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
  it("setFromServer loads pinned chats", () => {
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
        pinnedAt: "2026-03-14T00:00:00Z",
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

  // Clear resets everything
  it("clear resets all state", () => {
    usePinStore.getState().pinChat("f1", "c1");
    usePinStore.getState().clear();
    expect(usePinStore.getState().isPinned("f1", "c1")).toBe(false);
    expect(usePinStore.getState().getPinnedChatIds("f1")).toHaveLength(0);
  });

  // Pinning the same chat twice is idempotent
  it("pinChat is idempotent", () => {
    usePinStore.getState().pinChat("f1", "c1");
    usePinStore.getState().pinChat("f1", "c1");
    expect(usePinStore.getState().getPinnedChatIds("f1")).toHaveLength(1);
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
  });
});
