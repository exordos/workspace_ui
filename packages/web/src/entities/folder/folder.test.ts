/**
 * Tests for folder entity API — workspace folder listing and mapping.
 *
 * Covers the pure mapping utility mapWorkspaceFoldersToRail and the
 * async getFolders function with mocked workspace API transport.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceFolder } from "~/shared/api/workspace-client";
import { getFolders, mapWorkspaceFoldersToRail } from "~/shared/api/workspace-client";

const { workspaceApi, messengerApi } = vi.hoisted(() => {
  const get = vi.fn();
  const getWithBase = vi.fn(
    (_base: string, path: string, params?: Record<string, string>, signal?: AbortSignal) =>
      get(path, params, signal),
  );
  return {
    workspaceApi: {
      get,
      getWithBase: vi.fn(
        (_base: string, path: string, params?: Record<string, string>, signal?: AbortSignal) =>
          get(path, params, signal),
      ),
      getBaseUrl: vi.fn(() => "/api/messenger/v1"),
      setBaseUrl: vi.fn(),
    },
    messengerApi: {
      get,
      getWithBase,
      getBaseUrl: vi.fn(() => "/api/messenger/v1"),
      setBaseUrl: vi.fn(),
    },
  };
});

vi.mock("~/shared/api/client", () => ({
  workspaceApi,
  messengerApi,
  getCurrentInstance: () => ({
    id: "test-inst",
    realm: "https://messenger.test",
    login: "test@test.com",
    authType: "iam",
    iamAccessToken: "test",
    authType: "iam",
    iamAccessToken: "iam-token",
  }),
  getWorkspaceApiBaseForCurrentInstance: () => "https://messenger.test",
  getMessengerGatewayApiBaseForCurrentInstance: () => "/api/messenger/v1",
  setInstanceProvider: vi.fn(),
}));

function makeFolderPayload(overrides: Record<string, unknown> = {}): WorkspaceFolder {
  return {
    uuid: "f1",
    title: "Work",
    background_color_value: 0xff0000,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    unread_count: 0,
    system_type: "created",
    folder_items: [],
    ...overrides,
  };
}

// Pure mapping function — no mocks needed.
describe("mapWorkspaceFoldersToRail", () => {
  it("maps folders to rail format with correct fields", () => {
    const folders = [
      makeFolderPayload({ uuid: "f1", title: "Work", unread_count: 3 }),
      makeFolderPayload({ uuid: "f2", title: "Personal", unread_count: 0 }),
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

  it("sets badge to undefined when unread_count is zero", () => {
    const result = mapWorkspaceFoldersToRail([makeFolderPayload()]);
    expect(result[0]!.badge).toBeUndefined();
  });

  it("uses unread_count directly for badge", () => {
    const result = mapWorkspaceFoldersToRail([makeFolderPayload({ unread_count: 5 })]);
    expect(result[0]!.badge).toBe(5);
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
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns folders on successful messenger gateway response", async () => {
    const mockFolders = [makeFolderPayload({ uuid: "f1", title: "Work" })];
    messengerApi.getWithBase.mockResolvedValue({
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
    messengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: { error: "unexpected format" },
      raw: { statusText: "OK" },
    });

    const result = await getFolders();
    expect(result).toEqual([]);
  });

  it("throws on non-ok response", async () => {
    messengerApi.getWithBase.mockResolvedValue({
      ok: false,
      status: 500,
      data: null,
      raw: { statusText: "Internal Server Error" },
    });

    await expect(getFolders()).rejects.toThrow(/Workspace API error: 500/);
  });

  it("throws on network error", async () => {
    messengerApi.getWithBase.mockRejectedValue(new Error("Network failure"));

    await expect(getFolders()).rejects.toThrow("Network failure");
  });

  it("delegates to messengerApi.getWithBase with messenger gateway base and folders path", async () => {
    messengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: [],
      raw: { statusText: "OK" },
    });

    await getFolders();

    expect(messengerApi.getWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      "/folders/",
      undefined,
      undefined,
    );
  });
});
