import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceFolder } from "./workspace-client";

const getCurrentInstance = vi.fn();
const getWorkspaceApiBaseForCurrentInstance = vi.fn(() => "https://zulip.genesis-core.tech");
let workspaceBaseUrl = "/workspace";

const workspaceApi = {
  get: vi.fn(),
  post: vi.fn(),
  getWithBase: vi.fn(
    (_base: string, path: string, params?: Record<string, string>, signal?: AbortSignal) =>
      workspaceApi.get(path, params, signal),
  ),
  postJson: vi.fn(),
  postJsonWithBase: vi.fn((_base: string, path: string, body: unknown) =>
    workspaceApi.postJson(path, body),
  ),
  putJson: vi.fn(),
  putJsonWithBase: vi.fn((_base: string, path: string, body: unknown) =>
    workspaceApi.putJson(path, body),
  ),
  delete: vi.fn(),
  deleteWithBase: vi.fn((_base: string, path: string, body?: Record<string, string>) =>
    workspaceApi.delete(path, body),
  ),
  postWithBase: vi.fn(
    (_base: string, path: string, body: Record<string, string>, signal?: AbortSignal) =>
      workspaceApi.post(path, body, signal),
  ),
  setBaseUrl: vi.fn((nextBase: string) => {
    workspaceBaseUrl = nextBase;
  }),
  getBaseUrl: vi.fn(() => workspaceBaseUrl),
};
type WorkspaceGetResponse = Awaited<ReturnType<typeof workspaceApi.get>>;

vi.mock("./client", () => ({
  workspaceApi,
  getCurrentInstance,
  getWorkspaceApiBaseForCurrentInstance,
}));

describe("workspace-client", () => {
  beforeEach(async () => {
    vi.resetModules();
    workspaceBaseUrl = "/workspace";
    getCurrentInstance.mockReturnValue({
      id: "instance-1",
      realm: "https://zulip.genesis-core.tech",
      email: "user@example.com",
      apiKey: "api-key",
    });
    const { registerWorkspaceOrvalMutator } = await import("./workspace-orval-mutator");
    registerWorkspaceOrvalMutator();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("delegates folder listing to workspaceApi.getWithBase using org workspace base", async () => {
    workspaceApi.get.mockResolvedValue({
      ok: true,
      data: [{ uuid: "f1", title: "Work", unread_messages: [] }],
    });

    const { getFolders } = await import("./workspace-client");
    await getFolders();

    expect(getWorkspaceApiBaseForCurrentInstance).toHaveBeenCalled();
    expect(workspaceApi.getWithBase).toHaveBeenCalledWith(
      "https://zulip.genesis-core.tech",
      "/v1/folders/",
      undefined,
      undefined,
    );
  });

  it("getFolders keeps folders when unread_messages is omitted or null", async () => {
    workspaceApi.get.mockResolvedValue({
      ok: true,
      data: [
        {
          uuid: "f-no-unread",
          title: "NoUnreadField",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          system_type: "created",
        },
        {
          uuid: "f-null-unread",
          title: "NullUnread",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          system_type: "created",
          unread_messages: null,
        },
      ],
    });

    const { getFolders } = await import("./workspace-client");
    const folders = await getFolders();

    expect(folders).toHaveLength(2);
    expect(folders.map((f) => f.uuid).sort()).toEqual(["f-no-unread", "f-null-unread"].sort());
  });

  it("maps folder rail badge as total unread messages count", async () => {
    const { mapWorkspaceFoldersToRail } = await import("./workspace-client");
    const mapped = mapWorkspaceFoldersToRail([
      {
        uuid: "f-1",
        title: "Work",
        background_color_value: 0xff8438,
        created_at: "2026-03-17T00:00:00Z",
        updated_at: "2026-03-17T00:00:00Z",
        system_type: "created",
        unread_messages: [
          { count: 4 },
          { unread_message_ids: [11, 12, 13] },
          { message_ids: [14, 15] },
        ],
      } as unknown as WorkspaceFolder,
    ]);

    expect(mapped[0]).toMatchObject({
      id: "f-1",
      label: "Work",
      badge: 9,
    });
  });

  it("maps services from workspaceApi.get response", async () => {
    workspaceApi.get.mockResolvedValue({
      ok: true,
      data: [
        {
          uuid: "svc-1",
          name: "Dashboard",
          description: "Internal dashboard",
          service_url: "https://services.example.com/dashboard",
          icon: "https://services.example.com/icon.svg",
        },
      ],
    });

    const { getWorkspaceServices } = await import("./workspace-client");
    await expect(getWorkspaceServices()).resolves.toEqual([
      {
        id: "svc-1",
        name: "Dashboard",
        description: "Internal dashboard",
        url: "https://services.example.com/dashboard",
        iconUrl: "https://services.example.com/icon.svg",
      },
    ]);
    expect(workspaceApi.get).toHaveBeenCalledWith("/v1/services/", undefined, undefined);
  });

  it("fails fast for services and does not switch base on 404", async () => {
    workspaceApi.get.mockResolvedValue({
      ok: false,
      status: 404,
      raw: { statusText: "Not Found" },
      data: [],
    });

    const { getWorkspaceServices } = await import("./workspace-client");
    await expect(getWorkspaceServices()).rejects.toThrow("Workspace API error: 404 Not Found");

    expect(workspaceApi.get).toHaveBeenCalledTimes(1);
    expect(workspaceApi.setBaseUrl).not.toHaveBeenCalled();
  });

  it("coalesces identical in-flight folder requests by path", async () => {
    let resolveGet: (value: WorkspaceGetResponse) => void = () => {};
    workspaceApi.get.mockImplementation(() => {
      return new Promise<WorkspaceGetResponse>((resolve) => {
        resolveGet = resolve;
      });
    });

    const { getFolders } = await import("./workspace-client");
    const firstRequest = getFolders();
    const secondRequest = getFolders();

    expect(workspaceApi.getWithBase).toHaveBeenCalledTimes(1);

    resolveGet({
      ok: true,
      status: 200,
      raw: { statusText: "OK" },
      data: [
        {
          uuid: "folder-shared",
          title: "All",
          background_color_value: 7,
          unread_messages: [],
          created_at: "2026-03-14T00:00:00Z",
          updated_at: "2026-03-14T00:00:00Z",
          system_type: "all",
        },
      ],
    });

    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
      [
        {
          uuid: "folder-shared",
          title: "All",
          background_color_value: 7,
          unread_messages: [],
          created_at: "2026-03-14T00:00:00Z",
          updated_at: "2026-03-14T00:00:00Z",
          system_type: "all",
        },
      ],
      [
        {
          uuid: "folder-shared",
          title: "All",
          background_color_value: 7,
          unread_messages: [],
          created_at: "2026-03-14T00:00:00Z",
          updated_at: "2026-03-14T00:00:00Z",
          system_type: "all",
        },
      ],
    ]);
    expect(workspaceApi.setBaseUrl).not.toHaveBeenCalled();
  });

  it("filters out services with invalid URLs", async () => {
    const scriptProtocol = "javascript";
    const unsafeUrl = `${scriptProtocol}:alert(1)`;
    workspaceApi.get.mockResolvedValue({
      ok: true,
      data: [
        {
          uuid: "svc-invalid",
          name: "Invalid",
          description: "Bad url",
          service_url: unsafeUrl,
          icon: "https://services.example.com/icon.svg",
        },
      ],
    });

    const { getWorkspaceServices } = await import("./workspace-client");
    await expect(getWorkspaceServices()).resolves.toEqual([]);
  });

  it("maps folder items from folders list payload via mapWorkspaceFolderItems", async () => {
    const { mapWorkspaceFolderItems } = await import("./workspace-client");
    const items = mapWorkspaceFolderItems({
      uuid: "folder-1",
      created_at: "2026-03-14T00:00:00Z",
      updated_at: "2026-03-14T00:00:00Z",
      title: "Work",
      background_color_value: 0,
      system_type: "created",
      unread_messages: [],
      items: [
        {
          uuid: "item-1",
          chat_id: 42,
          chat_type: "private",
          order_index: 2,
          pinned_at: "2026-03-14T01:00:00Z",
          created_at: "2026-03-14T00:00:00Z",
          updated_at: "2026-03-14T02:00:00Z",
        },
      ],
    });
    expect(items).toEqual([
      {
        uuid: "item-1",
        chatId: "42",
        folderUuid: "folder-1",
        orderIndex: 2,
        pinnedAt: "2026-03-14T01:00:00Z",
        createdAt: "2026-03-14T00:00:00Z",
        updatedAt: "2026-03-14T02:00:00Z",
      },
    ]);
  });

  it("encodes stream folder items as canonical stream chat ids using chat_type", async () => {
    const { mapWorkspaceFolderItems } = await import("./workspace-client");
    const items = mapWorkspaceFolderItems({
      uuid: "folder-1",
      created_at: "2026-03-14T00:00:00Z",
      updated_at: "2026-03-14T00:00:00Z",
      title: "Channels",
      background_color_value: 0,
      system_type: "created",
      unread_messages: [],
      items: [
        {
          uuid: "item-11",
          chat_id: 11,
          chat_type: "stream",
          order_index: 0,
          created_at: "2026-03-14T00:00:00Z",
          updated_at: "2026-03-14T00:00:00Z",
        },
      ],
    });
    expect(items[0]?.chatId).toBe("stream:11:general");
  });

  it("delegates folder assignment to workspaceApi.postJson", async () => {
    workspaceApi.postJson.mockResolvedValue({ ok: true, data: {} });

    const { addChatToFolder } = await import("./workspace-client");
    await expect(addChatToFolder("folder-1", "dm:42")).resolves.toBe(true);

    expect(workspaceApi.postJson).toHaveBeenCalledWith(
      "/v1/folders/folder-1/items/",
      expect.objectContaining({
        chat_id: 42,
        chat_type: "private",
      }),
    );
    expect(workspaceApi.setBaseUrl).not.toHaveBeenCalled();
  });

  it("does not retry folder assignment on path errors", async () => {
    workspaceApi.postJson.mockResolvedValue({
      ok: false,
      status: 404,
      data: {},
    });

    const { addChatToFolder } = await import("./workspace-client");
    await expect(addChatToFolder("folder-1", "stream:1:general")).resolves.toBe(false);

    expect(workspaceApi.postJson).toHaveBeenCalledTimes(1);
    expect(workspaceApi.postJson).toHaveBeenCalledWith(
      "/v1/folders/folder-1/items/",
      expect.objectContaining({
        chat_id: 1,
        chat_type: "stream",
      }),
    );
    expect(workspaceApi.setBaseUrl).not.toHaveBeenCalled();
  });

  it("returns false when chat id cannot be mapped to API integer", async () => {
    const { addChatToFolder } = await import("./workspace-client");
    await expect(addChatToFolder("folder-1", "dm:abc")).resolves.toBe(false);
    expect(workspaceApi.postJson).not.toHaveBeenCalled();
  });

  it("delegates folder item removal to workspaceApi.delete", async () => {
    workspaceApi.delete.mockResolvedValue({ ok: true, data: null });

    const { removeChatFromFolder } = await import("./workspace-client");
    await expect(removeChatFromFolder("folder-1", "item-1")).resolves.toBe(true);

    expect(workspaceApi.delete).toHaveBeenCalledWith(
      "/v1/folders/folder-1/items/item-1",
      undefined,
    );
    expect(workspaceApi.setBaseUrl).not.toHaveBeenCalled();
  });

  it("delegates folder item reorder updates to get then putJson", async () => {
    workspaceApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      raw: { statusText: "OK" },
      data: {
        uuid: "item-1",
        chat_id: 42,
        folder_uuid: "folder-1",
        order_index: 1,
        pinned_at: null,
        created_at: "2026-03-14T00:00:00Z",
        updated_at: "2026-03-14T01:00:00Z",
      },
    });
    workspaceApi.putJson.mockResolvedValue({ ok: true, data: {} });

    const { updateFolderItemOrder } = await import("./workspace-client");
    await expect(updateFolderItemOrder("folder-1", "item-1", 3)).resolves.toBe(true);

    expect(workspaceApi.get).toHaveBeenCalledWith(
      "/v1/folders/folder-1/items/item-1",
      undefined,
      undefined,
    );
    expect(workspaceApi.putJson).toHaveBeenCalledWith(
      "/v1/folders/folder-1/items/item-1",
      expect.objectContaining({
        order_index: 3,
        chat_id: 42,
      }),
    );
    expect(workspaceApi.setBaseUrl).not.toHaveBeenCalled();
  });

  it("returns false for addChatToFolder when folder or chat id is blank", async () => {
    const { addChatToFolder } = await import("./workspace-client");

    await expect(addChatToFolder("", "dm:42")).resolves.toBe(false);
    await expect(addChatToFolder("folder-1", "   ")).resolves.toBe(false);
    expect(workspaceApi.postJson).not.toHaveBeenCalled();
  });

  it("returns false for removeChatFromFolder when folder or item id is blank", async () => {
    const { removeChatFromFolder } = await import("./workspace-client");

    await expect(removeChatFromFolder(" ", "item-1")).resolves.toBe(false);
    await expect(removeChatFromFolder("folder-1", "")).resolves.toBe(false);
    expect(workspaceApi.delete).not.toHaveBeenCalled();
  });

  it("returns false for updateFolderItemOrder when ids or order are invalid", async () => {
    const { updateFolderItemOrder } = await import("./workspace-client");

    await expect(updateFolderItemOrder(" ", "item-1", 0)).resolves.toBe(false);
    await expect(updateFolderItemOrder("folder-1", " ", 0)).resolves.toBe(false);
    await expect(updateFolderItemOrder("folder-1", "item-1", -1)).resolves.toBe(false);
    await expect(updateFolderItemOrder("folder-1", "item-1", 1.5)).resolves.toBe(false);
    expect(workspaceApi.putJson).not.toHaveBeenCalled();
  });
});
