import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentInstance = vi.fn();
let workspaceBaseUrl = "/workspace-api/api/v1";
const WORKSPACE_BASE_CACHE_KEY = "workspace.api.resolved-base.v1";

const workspaceApi = {
  get: vi.fn(),
  postJson: vi.fn(),
  putJson: vi.fn(),
  delete: vi.fn(),
  setBaseUrl: vi.fn((nextBase: string) => {
    workspaceBaseUrl = nextBase;
  }),
  getBaseUrl: vi.fn(() => workspaceBaseUrl),
};
type WorkspaceGetResponse = Awaited<ReturnType<typeof workspaceApi.get>>;

vi.mock("./client", () => ({
  workspaceApi,
  getCurrentInstance,
}));

describe("workspace-client", () => {
  beforeEach(() => {
    vi.resetModules();
    workspaceBaseUrl = "/workspace-api/api/v1";
    localStorage.removeItem(WORKSPACE_BASE_CACHE_KEY);
    getCurrentInstance.mockReturnValue({
      id: "instance-1",
      realm: "https://zulip.genesis-core.tech",
      email: "user@example.com",
      apiKey: "api-key",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(WORKSPACE_BASE_CACHE_KEY);
  });

  it("delegates folder listing to workspaceApi.get", async () => {
    workspaceApi.get.mockResolvedValue({
      ok: true,
      data: [{ uuid: "f1", title: "Work", unread_messages: [] }],
    });

    const { getFolders } = await import("./workspace-client");
    await getFolders();

    expect(workspaceApi.get).toHaveBeenCalledWith("/folders/");
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
      },
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
    expect(workspaceApi.get).toHaveBeenCalledWith("/services/");
  });

  it("retries services with /workspace/v1 base when /api/v1 returns 404", async () => {
    workspaceApi.get.mockImplementation(() => {
      const base = workspaceApi.getBaseUrl();
      if (base.endsWith("/api/v1")) {
        return { ok: false, status: 404, raw: { statusText: "Not Found" }, data: [] };
      }
      if (base.endsWith("/workspace/v1")) {
        return {
          ok: true,
          status: 200,
          raw: { statusText: "OK" },
          data: [
            {
              uuid: "svc-2",
              name: "HR",
              description: "HR portal",
              service_url: "https://services.example.com/hr",
              icon: "https://services.example.com/hr.svg",
            },
          ],
        };
      }
      return { ok: false, status: 500, raw: { statusText: "Unexpected" }, data: [] };
    });

    const { getWorkspaceServices } = await import("./workspace-client");
    await expect(getWorkspaceServices()).resolves.toEqual([
      {
        id: "svc-2",
        name: "HR",
        description: "HR portal",
        url: "https://services.example.com/hr",
        iconUrl: "https://services.example.com/hr.svg",
      },
    ]);

    expect(workspaceApi.setBaseUrl).toHaveBeenCalledWith("/workspace-api/workspace/v1");
  });

  it("falls back to workspace subdomain when proxy origin keeps returning 404", async () => {
    workspaceBaseUrl = "https://zulip.genesis-core.tech/api/v1";

    workspaceApi.get.mockImplementation((path: string) => {
      const base = workspaceApi.getBaseUrl();
      if (base === "https://workspace.genesis-core.tech/workspace/v1") {
        return {
          ok: true,
          status: 200,
          raw: { statusText: "OK" },
          data: [
            {
              uuid: "svc-3",
              name: "Wiki",
              description: "Internal wiki",
              service_url: "https://services.example.com/wiki",
              icon: "",
            },
          ],
        };
      }
      if (path === "/services/") {
        return { ok: false, status: 404, raw: { statusText: "Not Found" }, data: [] };
      }
      return { ok: false, status: 500, raw: { statusText: "Unexpected" }, data: [] };
    });

    const { getWorkspaceServices } = await import("./workspace-client");
    await expect(getWorkspaceServices()).resolves.toEqual([
      {
        id: "svc-3",
        name: "Wiki",
        description: "Internal wiki",
        url: "https://services.example.com/wiki",
        iconUrl: null,
      },
    ]);

    expect(workspaceApi.setBaseUrl).toHaveBeenCalledWith(
      "https://workspace.genesis-core.tech/workspace/v1",
    );
  });

  it("coalesces fallback base resolution across concurrent requests", async () => {
    const requestLog: { path: string; base: string }[] = [];
    workspaceApi.get.mockImplementation((path: string) => {
      const base = workspaceApi.getBaseUrl();
      requestLog.push({ path, base });

      if (base.endsWith("/api/v1")) {
        return { ok: false, status: 404, raw: { statusText: "Not Found" }, data: [] };
      }

      if (base.endsWith("/workspace/v1") && path === "/services/") {
        return {
          ok: true,
          status: 200,
          raw: { statusText: "OK" },
          data: [
            {
              uuid: "svc-concurrent",
              name: "Portal",
              description: "Concurrent resolution service",
              service_url: "https://services.example.com/portal",
              icon: "",
            },
          ],
        };
      }

      if (base.endsWith("/workspace/v1") && path === "/folders/") {
        return {
          ok: true,
          status: 200,
          raw: { statusText: "OK" },
          data: [
            {
              uuid: "folder-concurrent",
              title: "All",
              background_color_value: 42,
              unread_messages: [],
              created_at: "2026-03-14T00:00:00Z",
              updated_at: "2026-03-14T00:00:00Z",
              system_type: "all",
            },
          ],
        };
      }

      return { ok: false, status: 500, raw: { statusText: "Unexpected" }, data: [] };
    });

    const { getWorkspaceServices, getFolders } = await import("./workspace-client");
    const [services, folders] = await Promise.all([getWorkspaceServices(), getFolders()]);

    expect(services).toHaveLength(1);
    expect(folders).toHaveLength(1);

    const apiV1Calls = requestLog.filter((entry) => entry.base.endsWith("/api/v1"));
    expect(apiV1Calls).toHaveLength(1);
    expect(apiV1Calls[0]?.path).toBe("/services/");
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

    expect(workspaceApi.get).toHaveBeenCalledTimes(1);

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
  });

  it("coalesces identical in-flight folder requests after base is resolved", async () => {
    let resolveFolders: (value: WorkspaceGetResponse) => void = () => {};
    let folderCalls = 0;

    workspaceApi.get.mockImplementation((path: string) => {
      if (path === "/services/") {
        return {
          ok: true,
          status: 200,
          raw: { statusText: "OK" },
          data: [
            {
              uuid: "svc-resolved",
              name: "Resolved",
              description: "resolve base first",
              service_url: "https://services.example.com/resolved",
              icon: "",
            },
          ],
        };
      }

      if (path === "/folders/") {
        folderCalls += 1;
        return new Promise<WorkspaceGetResponse>((resolve) => {
          resolveFolders = resolve;
        });
      }

      return { ok: false, status: 500, raw: { statusText: "Unexpected" }, data: [] };
    });

    const { getWorkspaceServices, getFolders } = await import("./workspace-client");
    await getWorkspaceServices();

    const firstRequest = getFolders();
    const secondRequest = getFolders();

    expect(folderCalls).toBe(1);

    resolveFolders({
      ok: true,
      status: 200,
      raw: { statusText: "OK" },
      data: [
        {
          uuid: "folder-resolved",
          title: "All",
          background_color_value: 8,
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
          uuid: "folder-resolved",
          title: "All",
          background_color_value: 8,
          unread_messages: [],
          created_at: "2026-03-14T00:00:00Z",
          updated_at: "2026-03-14T00:00:00Z",
          system_type: "all",
        },
      ],
      [
        {
          uuid: "folder-resolved",
          title: "All",
          background_color_value: 8,
          unread_messages: [],
          created_at: "2026-03-14T00:00:00Z",
          updated_at: "2026-03-14T00:00:00Z",
          system_type: "all",
        },
      ],
    ]);
  });

  it("prefers cached workspace base before probing default path", async () => {
    localStorage.setItem(
      WORKSPACE_BASE_CACHE_KEY,
      JSON.stringify({
        "instance-1": "/workspace-api/workspace/v1",
      }),
    );
    const requestLog: { path: string; base: string }[] = [];
    workspaceApi.get.mockImplementation((path: string) => {
      const base = workspaceApi.getBaseUrl();
      requestLog.push({ path, base });

      if (base.endsWith("/workspace/v1")) {
        return {
          ok: true,
          status: 200,
          raw: { statusText: "OK" },
          data: [
            {
              uuid: "svc-cached",
              name: "Cached Base",
              description: "Cached endpoint",
              service_url: "https://services.example.com/cached",
              icon: "",
            },
          ],
        };
      }

      return { ok: false, status: 404, raw: { statusText: "Not Found" }, data: [] };
    });

    const { getWorkspaceServices } = await import("./workspace-client");
    await expect(getWorkspaceServices()).resolves.toEqual([
      {
        id: "svc-cached",
        name: "Cached Base",
        description: "Cached endpoint",
        url: "https://services.example.com/cached",
        iconUrl: null,
      },
    ]);

    expect(requestLog[0]?.base).toBe("/workspace-api/workspace/v1");
    expect(requestLog.some((entry) => entry.base.endsWith("/api/v1"))).toBe(false);
  });

  it("ignores cached workspace base from an unexpected absolute origin", async () => {
    localStorage.setItem(
      WORKSPACE_BASE_CACHE_KEY,
      JSON.stringify({
        "instance-1": "https://attacker.example.com/workspace/v1",
      }),
    );
    const requestLog: { path: string; base: string }[] = [];
    workspaceApi.get.mockImplementation((path: string) => {
      const base = workspaceApi.getBaseUrl();
      requestLog.push({ path, base });

      if (base === "/workspace-api/api/v1") {
        return {
          ok: true,
          status: 200,
          raw: { statusText: "OK" },
          data: [
            {
              uuid: "svc-default",
              name: "Default Base",
              description: "Uses trusted default base",
              service_url: "https://services.example.com/default",
              icon: "",
            },
          ],
        };
      }

      return { ok: false, status: 500, raw: { statusText: "Unexpected" }, data: [] };
    });

    const { getWorkspaceServices } = await import("./workspace-client");
    await expect(getWorkspaceServices()).resolves.toEqual([
      {
        id: "svc-default",
        name: "Default Base",
        description: "Uses trusted default base",
        url: "https://services.example.com/default",
        iconUrl: null,
      },
    ]);

    expect(requestLog[0]?.base).toBe("/workspace-api/api/v1");
    expect(requestLog.some((entry) => entry.base.includes("attacker.example.com"))).toBe(false);
  });

  it("ignores cached workspace base with an unexpected relative path suffix", async () => {
    localStorage.setItem(
      WORKSPACE_BASE_CACHE_KEY,
      JSON.stringify({
        "instance-1": "/workspace-api/evil/v1",
      }),
    );
    const requestLog: { path: string; base: string }[] = [];
    workspaceApi.get.mockImplementation((path: string) => {
      const base = workspaceApi.getBaseUrl();
      requestLog.push({ path, base });

      if (base === "/workspace-api/api/v1") {
        return {
          ok: true,
          status: 200,
          raw: { statusText: "OK" },
          data: [
            {
              uuid: "svc-relative",
              name: "Relative Default",
              description: "Rejects poisoned relative cache",
              service_url: "https://services.example.com/relative",
              icon: "",
            },
          ],
        };
      }

      return { ok: false, status: 500, raw: { statusText: "Unexpected" }, data: [] };
    });

    const { getWorkspaceServices } = await import("./workspace-client");
    await expect(getWorkspaceServices()).resolves.toEqual([
      {
        id: "svc-relative",
        name: "Relative Default",
        description: "Rejects poisoned relative cache",
        url: "https://services.example.com/relative",
        iconUrl: null,
      },
    ]);

    expect(requestLog[0]?.base).toBe("/workspace-api/api/v1");
    expect(requestLog.some((entry) => entry.base.includes("/evil/"))).toBe(false);
  });

  it("persists resolved fallback base for subsequent bootstrap", async () => {
    workspaceApi.get.mockImplementation(() => {
      const base = workspaceApi.getBaseUrl();
      if (base.endsWith("/api/v1")) {
        return { ok: false, status: 404, raw: { statusText: "Not Found" }, data: [] };
      }
      if (base.endsWith("/workspace/v1")) {
        return {
          ok: true,
          status: 200,
          raw: { statusText: "OK" },
          data: [
            {
              uuid: "svc-persisted",
              name: "Persisted Base",
              description: "Persist endpoint",
              service_url: "https://services.example.com/persisted",
              icon: "",
            },
          ],
        };
      }
      return { ok: false, status: 500, raw: { statusText: "Unexpected" }, data: [] };
    });

    const { getWorkspaceServices } = await import("./workspace-client");
    await expect(getWorkspaceServices()).resolves.toEqual([
      {
        id: "svc-persisted",
        name: "Persisted Base",
        description: "Persist endpoint",
        url: "https://services.example.com/persisted",
        iconUrl: null,
      },
    ]);

    expect(localStorage.getItem(WORKSPACE_BASE_CACHE_KEY)).toContain(
      '"instance-1":"/workspace-api/workspace/v1"',
    );
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

  it("maps folder items from workspaceApi.get response", async () => {
    workspaceApi.get.mockResolvedValue({
      ok: true,
      data: [
        {
          uuid: "item-1",
          chat_id: "dm:42",
          folder_uuid: "folder-1",
          order_index: 2,
          pinned_at: "2026-03-14T01:00:00Z",
          created_at: "2026-03-14T00:00:00Z",
          updated_at: "2026-03-14T02:00:00Z",
        },
      ],
    });

    const { getFolderItems } = await import("./workspace-client");
    await expect(getFolderItems("folder-1")).resolves.toEqual([
      {
        uuid: "item-1",
        chatId: "dm:42",
        folderUuid: "folder-1",
        orderIndex: 2,
        pinnedAt: "2026-03-14T01:00:00Z",
        createdAt: "2026-03-14T00:00:00Z",
        updatedAt: "2026-03-14T02:00:00Z",
      },
    ]);
    expect(workspaceApi.get).toHaveBeenCalledWith("/folders/folder-1/items/");
  });

  it("prefers /api/v1 folder items endpoint when global base was switched to legacy /workspace/v1", async () => {
    workspaceBaseUrl = "/workspace-api/workspace/v1";
    workspaceApi.get.mockImplementation((path: string) => {
      const base = workspaceApi.getBaseUrl();
      if (path !== "/folders/folder-1/items/") {
        return { ok: false, status: 404, raw: { statusText: "Not Found" }, data: [] };
      }
      if (base.endsWith("/api/v1")) {
        return {
          ok: true,
          status: 200,
          raw: { statusText: "OK" },
          data: [
            {
              uuid: "item-1",
              chat_id: "stream:1:general",
              folder_uuid: "folder-1",
              order_index: 0,
              pinned_at: null,
              created_at: "2026-03-17T00:00:00Z",
              updated_at: "2026-03-17T00:00:00Z",
            },
          ],
        };
      }
      return {
        ok: true,
        status: 200,
        raw: { statusText: "OK" },
        data: [
          {
            uuid: "legacy-item",
            chat_id: 1,
            folder_uuid: "folder-1",
            order_index: 0,
            pinned_at: null,
            created_at: "2026-03-17T00:00:00Z",
            updated_at: "2026-03-17T00:00:00Z",
          },
        ],
      };
    });

    const { getFolderItems } = await import("./workspace-client");
    await expect(getFolderItems("folder-1")).resolves.toEqual([
      {
        uuid: "item-1",
        chatId: "stream:1:general",
        folderUuid: "folder-1",
        orderIndex: 0,
        pinnedAt: null,
        createdAt: "2026-03-17T00:00:00Z",
        updatedAt: "2026-03-17T00:00:00Z",
      },
    ]);

    expect(workspaceApi.setBaseUrl).toHaveBeenCalledWith("/workspace-api/api/v1");
    expect(workspaceApi.setBaseUrl).toHaveBeenLastCalledWith("/workspace-api/workspace/v1");
  });

  it("delegates folder assignment to workspaceApi.postJson", async () => {
    workspaceApi.postJson.mockResolvedValue({ ok: true, data: {} });

    const { addChatToFolder } = await import("./workspace-client");
    await expect(addChatToFolder("folder-1", "dm:42")).resolves.toBe(true);

    expect(workspaceApi.postJson).toHaveBeenCalledWith("/folders/folder-1/items/", {
      chat_id: "dm:42",
    });
  });

  it("prefers /api/v1 folder assignment endpoint when global base was switched to legacy /workspace/v1", async () => {
    workspaceBaseUrl = "/workspace-api/workspace/v1";
    workspaceApi.postJson.mockImplementation(() => {
      const base = workspaceApi.getBaseUrl();
      if (base.endsWith("/api/v1")) {
        return { ok: true, status: 201, data: {} };
      }
      return {
        ok: false,
        status: 400,
        data: {
          type: "TypeError",
          code: 400,
          message: "Invalid type value 'stream:1:general' for 'Integer'.",
        },
      };
    });

    const { addChatToFolder } = await import("./workspace-client");
    await expect(addChatToFolder("folder-1", "stream:1:general")).resolves.toBe(true);

    expect(workspaceApi.postJson).toHaveBeenCalledWith("/folders/folder-1/items/", {
      chat_id: "stream:1:general",
    });
    expect(workspaceApi.setBaseUrl).toHaveBeenCalledWith("/workspace-api/api/v1");
    expect(workspaceApi.setBaseUrl).toHaveBeenLastCalledWith("/workspace-api/workspace/v1");
  });

  it("retries folder assignment with numeric chat_id on integer type mismatch", async () => {
    workspaceApi.postJson
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        data: {
          type: "TypeError",
          code: 400,
          message: "Invalid type value 'stream:1:general' for 'Integer'.",
        },
      })
      .mockResolvedValueOnce({ ok: true, status: 201, data: {} });

    const { addChatToFolder } = await import("./workspace-client");
    await expect(addChatToFolder("folder-1", "stream:1:general")).resolves.toBe(true);

    expect(workspaceApi.postJson).toHaveBeenNthCalledWith(1, "/folders/folder-1/items/", {
      chat_id: "stream:1:general",
    });
    expect(workspaceApi.postJson).toHaveBeenNthCalledWith(2, "/folders/folder-1/items/", {
      chat_id: 1,
    });
  });

  it("delegates folder item removal to workspaceApi.delete", async () => {
    workspaceApi.delete.mockResolvedValue({ ok: true, data: null });

    const { removeChatFromFolder } = await import("./workspace-client");
    await expect(removeChatFromFolder("folder-1", "item-1")).resolves.toBe(true);

    expect(workspaceApi.delete).toHaveBeenCalledWith("/folders/folder-1/items/item-1");
  });

  it("delegates folder item reorder updates to workspaceApi.putJson", async () => {
    workspaceApi.putJson.mockResolvedValue({ ok: true, data: {} });

    const { updateFolderItemOrder } = await import("./workspace-client");
    await expect(updateFolderItemOrder("folder-1", "item-1", 3)).resolves.toBe(true);

    expect(workspaceApi.putJson).toHaveBeenCalledWith("/folders/folder-1/items/item-1", {
      order_index: 3,
    });
  });

  it("rejects getFolderItems when folder uuid is blank", async () => {
    const { getFolderItems } = await import("./workspace-client");

    await expect(getFolderItems("   ")).rejects.toThrow(/folderUuid must be a non-empty string/i);
    expect(workspaceApi.get).not.toHaveBeenCalled();
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
