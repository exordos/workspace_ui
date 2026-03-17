import { describe, expect, it, vi } from "vitest";
import {
  loadFolderAssignments,
  toggleFolderAssignment,
  type FolderAssignment,
} from "./sidebar-folder-assignment.lib";

describe("loadFolderAssignments", () => {
  it("excludes system all folder from assignment rows", async () => {
    const api = {
      getFolders: vi.fn().mockResolvedValue([
        {
          uuid: "f-all",
          title: "All",
          created_at: "",
          updated_at: "",
          background_color_value: 1,
          unread_messages: [],
          system_type: "all",
        },
        {
          uuid: "f-work",
          title: "Work",
          created_at: "",
          updated_at: "",
          background_color_value: 2,
          unread_messages: [],
          system_type: "created",
        },
      ]),
      getFolderItems: vi.fn().mockResolvedValue([]),
      addChatToFolder: vi.fn(),
      removeChatFromFolder: vi.fn(),
    };

    const result = await loadFolderAssignments("stream-10", api);

    expect(result).toEqual([{ folderUuid: "f-work", label: "Work", itemUuid: null }]);
    expect(api.getFolderItems).toHaveBeenCalledTimes(1);
    expect(api.getFolderItems).toHaveBeenCalledWith("f-work");
  });

  it("maps assignment item UUIDs for each folder", async () => {
    const api = {
      getFolders: vi.fn().mockResolvedValue([
        {
          uuid: "f-1",
          title: "All",
          created_at: "",
          updated_at: "",
          background_color_value: 1,
          unread_messages: [],
          system_type: "all",
        },
        {
          uuid: "f-2",
          title: "Work",
          created_at: "",
          updated_at: "",
          background_color_value: 2,
          unread_messages: [],
          system_type: "created",
        },
      ]),
      getFolderItems: vi.fn().mockResolvedValueOnce([
        {
          uuid: "i-2",
          chatId: "stream-20",
          folderUuid: "f-2",
          orderIndex: 0,
          pinnedAt: null,
          createdAt: "",
          updatedAt: "",
        },
      ]),
      addChatToFolder: vi.fn(),
      removeChatFromFolder: vi.fn(),
    };

    const result = await loadFolderAssignments("stream-10", api);

    expect(result).toEqual([{ folderUuid: "f-2", label: "Work", itemUuid: null }]);
  });

  it("treats stream:id and stream:id:general as the same assignment", async () => {
    const api = {
      getFolders: vi.fn().mockResolvedValue([
        {
          uuid: "f-2",
          title: "Work",
          created_at: "",
          updated_at: "",
          background_color_value: 2,
          unread_messages: [],
          system_type: "created",
        },
      ]),
      getFolderItems: vi.fn().mockResolvedValueOnce([
        {
          uuid: "i-2",
          chatId: "stream:11",
          folderUuid: "f-2",
          orderIndex: 0,
          pinnedAt: null,
          createdAt: "",
          updatedAt: "",
        },
      ]),
      addChatToFolder: vi.fn(),
      removeChatFromFolder: vi.fn(),
    };

    const result = await loadFolderAssignments("stream:11:general", api);

    expect(result).toEqual([{ folderUuid: "f-2", label: "Work", itemUuid: "i-2" }]);
  });

  it("treats numeric chat_id as matching stream:id:general", async () => {
    const api = {
      getFolders: vi.fn().mockResolvedValue([
        {
          uuid: "f-2",
          title: "Work",
          created_at: "",
          updated_at: "",
          background_color_value: 2,
          unread_messages: [],
          system_type: "created",
        },
      ]),
      getFolderItems: vi.fn().mockResolvedValueOnce([
        {
          uuid: "i-2",
          chatId: "11",
          folderUuid: "f-2",
          orderIndex: 0,
          pinnedAt: null,
          createdAt: "",
          updatedAt: "",
        },
      ]),
      addChatToFolder: vi.fn(),
      removeChatFromFolder: vi.fn(),
    };

    const result = await loadFolderAssignments("stream:11:general", api);

    expect(result).toEqual([{ folderUuid: "f-2", label: "Work", itemUuid: "i-2" }]);
  });

  it("keeps folder row when item request fails", async () => {
    const api = {
      getFolders: vi.fn().mockResolvedValue([
        {
          uuid: "f-2",
          title: "Work",
          created_at: "",
          updated_at: "",
          background_color_value: 2,
          unread_messages: [],
          system_type: "created",
        },
      ]),
      getFolderItems: vi.fn().mockRejectedValue(new Error("network")),
      addChatToFolder: vi.fn(),
      removeChatFromFolder: vi.fn(),
    };

    const result = await loadFolderAssignments("stream-10", api);

    expect(result).toEqual([{ folderUuid: "f-2", label: "Work", itemUuid: null }]);
  });
});

describe("toggleFolderAssignment", () => {
  it("removes assignment when item UUID exists", async () => {
    const api = {
      getFolders: vi.fn(),
      getFolderItems: vi.fn(),
      addChatToFolder: vi.fn(),
      removeChatFromFolder: vi.fn().mockResolvedValue(true),
    };
    const assignment: FolderAssignment = { folderUuid: "f-1", label: "All", itemUuid: "i-1" };

    const result = await toggleFolderAssignment("stream-10", assignment, api);

    expect(api.removeChatFromFolder).toHaveBeenCalledWith("f-1", "i-1");
    expect(result).toEqual({ ok: true, nextItemUuid: null, removed: true });
  });

  it("adds assignment and resolves created item UUID", async () => {
    const api = {
      getFolders: vi.fn(),
      getFolderItems: vi.fn().mockResolvedValue([
        {
          uuid: "i-9",
          chatId: "stream-10",
          folderUuid: "f-2",
          orderIndex: 0,
          pinnedAt: null,
          createdAt: "",
          updatedAt: "",
        },
      ]),
      addChatToFolder: vi.fn().mockResolvedValue(true),
      removeChatFromFolder: vi.fn(),
    };
    const assignment: FolderAssignment = { folderUuid: "f-2", label: "Work", itemUuid: null };

    const result = await toggleFolderAssignment("stream-10", assignment, api);

    expect(api.addChatToFolder).toHaveBeenCalledWith("f-2", "stream-10");
    expect(result).toEqual({ ok: true, nextItemUuid: "i-9", removed: false });
  });

  it("resolves created stream item when server returns stream:id without topic suffix", async () => {
    const api = {
      getFolders: vi.fn(),
      getFolderItems: vi.fn().mockResolvedValue([
        {
          uuid: "i-9",
          chatId: "stream:11",
          folderUuid: "f-2",
          orderIndex: 0,
          pinnedAt: null,
          createdAt: "",
          updatedAt: "",
        },
      ]),
      addChatToFolder: vi.fn().mockResolvedValue(true),
      removeChatFromFolder: vi.fn(),
    };
    const assignment: FolderAssignment = {
      folderUuid: "f-2",
      label: "Work",
      itemUuid: null,
    };

    const result = await toggleFolderAssignment("stream:11:general", assignment, api);

    expect(api.addChatToFolder).toHaveBeenCalledWith("f-2", "stream:11:general");
    expect(result).toEqual({ ok: true, nextItemUuid: "i-9", removed: false });
  });

  it("resolves created stream item when server returns numeric chat_id", async () => {
    const api = {
      getFolders: vi.fn(),
      getFolderItems: vi.fn().mockResolvedValue([
        {
          uuid: "i-9",
          chatId: "11",
          folderUuid: "f-2",
          orderIndex: 0,
          pinnedAt: null,
          createdAt: "",
          updatedAt: "",
        },
      ]),
      addChatToFolder: vi.fn().mockResolvedValue(true),
      removeChatFromFolder: vi.fn(),
    };
    const assignment: FolderAssignment = {
      folderUuid: "f-2",
      label: "Work",
      itemUuid: null,
    };

    const result = await toggleFolderAssignment("stream:11:general", assignment, api);

    expect(api.addChatToFolder).toHaveBeenCalledWith("f-2", "stream:11:general");
    expect(result).toEqual({ ok: true, nextItemUuid: "i-9", removed: false });
  });

  it("returns failed state when add operation fails", async () => {
    const api = {
      getFolders: vi.fn(),
      getFolderItems: vi.fn(),
      addChatToFolder: vi.fn().mockResolvedValue(false),
      removeChatFromFolder: vi.fn(),
    };
    const assignment: FolderAssignment = { folderUuid: "f-2", label: "Work", itemUuid: null };

    const result = await toggleFolderAssignment("stream-10", assignment, api);

    expect(result).toEqual({ ok: false, nextItemUuid: null, removed: false });
    expect(api.getFolderItems).not.toHaveBeenCalled();
  });
});
