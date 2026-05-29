/**
 * Tests for folder entity API — workspace folder listing and mapping.
 *
 * Covers the pure mapping utility mapWorkspaceFoldersToRail and the
 * async getFolders function with mocked workspace API transport.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceFolder } from "~/shared/api/workspace-client";
import { getFolders, mapWorkspaceFoldersToRail } from "~/shared/api/workspace-client";

const { workspaceApi } = vi.hoisted(() => {
  const get = vi.fn();
  return {
    workspaceApi: {
      get,
      getWithBase: vi.fn(
        (_base: string, path: string, params?: Record<string, string>, signal?: AbortSignal) =>
          get(path, params, signal),
      ),
      getBaseUrl: vi.fn(() => "/api/v1"),
      setBaseUrl: vi.fn(),
    },
  };
});

vi.mock("~/shared/api/client", () => ({
  workspaceApi,
  getCurrentInstance: () => ({
    id: "test-inst",
    realm: "https://zulip.test",
    email: "test@test.com",
    apiKey: "test",
  }),
  getWorkspaceApiBaseForCurrentInstance: () => "https://zulip.test",
  setInstanceProvider: vi.fn(),
}));

function makeFolderPayload(overrides: Record<string, unknown> = {}): WorkspaceFolder {
  return {
    uuid: "f1",
    title: "Work",
    background_color_value: 0xff0000,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    unread_messages: [],
    system_type: "created",
    ...overrides,
  };
}

// Pure mapping function — no mocks needed.
describe("mapWorkspaceFoldersToRail", () => {
  it("maps folders to rail format with correct fields", () => {
    const folders = [
      makeFolderPayload({ uuid: "f1", title: "Work", unread_messages: [1, 2, 3] }),
      makeFolderPayload({ uuid: "f2", title: "Personal", unread_messages: [] }),
    ];

    const result = mapWorkspaceFoldersToRail(folders);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "f1",
      label: "Work",
      backgroundColor: 0xff0000,
      badge: 3,
      systemType: "created",
    });
    expect(result[1]).toEqual({
      id: "f2",
      label: "Personal",
      backgroundColor: 0xff0000,
      badge: undefined,
      systemType: "created",
    });
  });

  it("returns empty array for empty input", () => {
    expect(mapWorkspaceFoldersToRail([])).toEqual([]);
  });

  it("sets badge to undefined when no unread messages", () => {
    const result = mapWorkspaceFoldersToRail([makeFolderPayload()]);
    expect(result[0]!.badge).toBeUndefined();
  });

  it("counts unread_messages array length for badge", () => {
    const result = mapWorkspaceFoldersToRail([
      makeFolderPayload({ unread_messages: [10, 20, 30, 40, 50] }),
    ]);
    expect(result[0]!.badge).toBe(5);
  });

  it("sums unread messages from object payloads for badge", () => {
    const result = mapWorkspaceFoldersToRail([
      makeFolderPayload({
        unread_messages: [
          { count: 3 },
          { unread_message_ids: [1, 2, 3, 4] },
          { message_ids: [10, 11] },
        ],
      }),
    ]);
    expect(result[0]!.badge).toBe(9);
  });

  it("maps system all folders with explicit system type", () => {
    const result = mapWorkspaceFoldersToRail([
      makeFolderPayload({
        uuid: "all-folder",
        title: "All",
        system_type: "all",
      }),
    ]);

    expect(result[0]).toEqual({
      id: "all-folder",
      label: "All",
      backgroundColor: 0xff0000,
      badge: undefined,
      systemType: "all",
    });
  });

  it("preserves folder order from input", () => {
    const folders = [
      makeFolderPayload({ uuid: "z-last", title: "Zebra" }),
      makeFolderPayload({ uuid: "a-first", title: "Alpha" }),
    ];
    const result = mapWorkspaceFoldersToRail(folders);
    expect(result[0]!.id).toBe("z-last");
    expect(result[1]!.id).toBe("a-first");
  });
});

// Async fetch with mocked globals.
describe("getFolders", () => {
  beforeEach(async () => {
    const { registerWorkspaceOrvalMutator } = await import("~/shared/api/workspace-orval-mutator");
    registerWorkspaceOrvalMutator();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns folders on successful workspace API response", async () => {
    const mockFolders = [makeFolderPayload({ uuid: "f1", title: "Work" })];
    workspaceApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: mockFolders,
      raw: { statusText: "OK" },
    });

    const result = await getFolders();

    expect(result).toHaveLength(1);
    expect(result[0]!.uuid).toBe("f1");
    expect(result[0]!.title).toBe("Work");
  });

  it("returns empty array when response is not an array", async () => {
    workspaceApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { error: "unexpected format" },
      raw: { statusText: "OK" },
    });

    const result = await getFolders();
    expect(result).toEqual([]);
  });

  it("throws on non-ok response", async () => {
    workspaceApi.get.mockResolvedValue({
      ok: false,
      status: 500,
      data: null,
      raw: { statusText: "Internal Server Error" },
    });

    await expect(getFolders()).rejects.toThrow(/Workspace API error: 500/);
  });

  it("throws on network error", async () => {
    workspaceApi.get.mockRejectedValue(new Error("Network failure"));

    await expect(getFolders()).rejects.toThrow("Network failure");
  });

  it("delegates to workspaceApi.getWithBase with org workspace base and folders path", async () => {
    workspaceApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: [],
      raw: { statusText: "OK" },
    });

    await getFolders();

    expect(workspaceApi.getWithBase).toHaveBeenCalledWith(
      "https://zulip.test",
      "/v1/folders/",
      undefined,
      undefined,
    );
  });
});
