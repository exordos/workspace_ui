/**
 * Tests for the Draft API — Zulip Drafts endpoint functions.
 *
 * Each function uses zulipApi (middleware client) for HTTP calls
 * and guard.* for input validation. Tests cover success paths,
 * error handling, and guard validation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResponse } from "~/shared/api/client";
import { fetchDrafts, createDraft, updateDraftOnServer, deleteDraftOnServer } from "./draft.api";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

vi.mock("~/shared/api/client", () => ({
  zulipApi: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

vi.mock("~/shared/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  logApiCall: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function apiOk(data: unknown): ApiResponse {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    data,
    raw: new Response(),
    durationMs: 5,
  };
}

function apiFail(status = 400): ApiResponse {
  return {
    ok: false,
    status,
    headers: new Headers(),
    data: { msg: "error" },
    raw: new Response(),
    durationMs: 5,
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockPatch.mockReset();
  mockDelete.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// fetchDrafts
// ---------------------------------------------------------------------------

describe("fetchDrafts", () => {
  it("returns mapped drafts on success", async () => {
    mockGet.mockResolvedValue(
      apiOk({
        drafts: [
          { id: 1, type: "stream", to: [10], topic: "general", content: "hello", timestamp: 100 },
          { id: 2, type: "private", to: [42], topic: "", content: "hi", timestamp: 200 },
        ],
      }),
    );

    const result = await fetchDrafts();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 1,
      type: "stream",
      to: [10],
      topic: "general",
      content: "hello",
      timestamp: 100,
    });
    expect(result[1]!.type).toBe("private");
  });

  it("rejects on non-ok response", async () => {
    mockGet.mockResolvedValue(apiFail(500));
    await expect(fetchDrafts()).rejects.toThrow(/status 500/);
  });

  it("rejects on network error", async () => {
    mockGet.mockRejectedValue(new Error("Network error"));
    await expect(fetchDrafts()).rejects.toThrow("Network error");
  });

  it("handles missing drafts field", async () => {
    mockGet.mockResolvedValue(apiOk({}));
    expect(await fetchDrafts()).toEqual([]);
  });

  it("defaults missing topic to empty string", async () => {
    mockGet.mockResolvedValue(
      apiOk({ drafts: [{ id: 1, type: "stream", to: [10], content: "x", timestamp: 0 }] }),
    );
    const result = await fetchDrafts();
    expect(result[0]!.topic).toBe("");
  });
});

// ---------------------------------------------------------------------------
// createDraft
// ---------------------------------------------------------------------------

describe("createDraft", () => {
  it("returns draft ID on success", async () => {
    mockPost.mockResolvedValue(apiOk({ ids: [42] }));
    const id = await createDraft({ type: "stream", to: [10], topic: "test", content: "hello" });
    expect(id).toBe(42);
  });

  it("returns null on non-ok response", async () => {
    mockPost.mockResolvedValue(apiFail(400));
    const id = await createDraft({ type: "stream", to: [10], topic: "test", content: "hello" });
    expect(id).toBeNull();
  });

  it("returns null on network error", async () => {
    mockPost.mockRejectedValue(new Error("Offline"));
    const id = await createDraft({ type: "stream", to: [10], topic: "test", content: "hello" });
    expect(id).toBeNull();
  });

  it("returns null when ids array is empty", async () => {
    mockPost.mockResolvedValue(apiOk({ ids: [] }));
    const id = await createDraft({ type: "stream", to: [10], topic: "test", content: "hello" });
    expect(id).toBeNull();
  });

  it("throws for invalid draft type", async () => {
    await expect(
      createDraft({ type: "invalid" as "stream", to: [10], topic: "test", content: "x" }),
    ).rejects.toThrow();
  });

  it("throws for empty to array", async () => {
    await expect(
      createDraft({ type: "stream", to: [], topic: "test", content: "x" }),
    ).rejects.toThrow(/non-empty array/);
  });

  it("validates stream IDs for stream type", async () => {
    await expect(
      createDraft({ type: "stream", to: [-1], topic: "test", content: "x" }),
    ).rejects.toThrow(/Invalid streamId/);
  });

  it("validates user IDs for private type", async () => {
    await expect(
      createDraft({ type: "private", to: [0], topic: "", content: "x" }),
    ).rejects.toThrow(/Invalid userId/);
  });
});

// ---------------------------------------------------------------------------
// updateDraftOnServer
// ---------------------------------------------------------------------------

describe("updateDraftOnServer", () => {
  it("returns true on success", async () => {
    mockPatch.mockResolvedValue(apiOk({}));
    const result = await updateDraftOnServer(1, {
      type: "stream",
      to: [10],
      topic: "test",
      content: "updated",
    });
    expect(result).toBe(true);
  });

  it("returns false on non-ok response", async () => {
    mockPatch.mockResolvedValue(apiFail(500));
    const result = await updateDraftOnServer(1, {
      type: "stream",
      to: [10],
      topic: "test",
      content: "updated",
    });
    expect(result).toBe(false);
  });

  it("returns false on network error", async () => {
    mockPatch.mockRejectedValue(new Error("Offline"));
    const result = await updateDraftOnServer(1, {
      type: "stream",
      to: [10],
      topic: "test",
      content: "updated",
    });
    expect(result).toBe(false);
  });

  it("throws for invalid draft id (0)", async () => {
    await expect(
      updateDraftOnServer(0, { type: "stream", to: [10], topic: "test", content: "x" }),
    ).rejects.toThrow(/Invalid messageId/);
  });

  it("throws for invalid type", async () => {
    await expect(
      updateDraftOnServer(1, { type: "bad" as "stream", to: [10], topic: "test", content: "x" }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// deleteDraftOnServer
// ---------------------------------------------------------------------------

describe("deleteDraftOnServer", () => {
  it("uses DELETE /drafts/{id} endpoint", async () => {
    mockDelete.mockResolvedValue(apiOk({}));

    await expect(deleteDraftOnServer(5)).resolves.toBe(true);
    expect(mockDelete).toHaveBeenCalledWith("/drafts/5");
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("returns true on success", async () => {
    mockDelete.mockResolvedValue(apiOk({}));
    const result = await deleteDraftOnServer(1);
    expect(result).toBe(true);
  });

  it("returns false on non-ok response", async () => {
    mockDelete.mockResolvedValue(apiFail(500));
    expect(await deleteDraftOnServer(1)).toBe(false);
  });

  it("returns false on network error", async () => {
    mockDelete.mockRejectedValue(new Error("Offline"));
    expect(await deleteDraftOnServer(1)).toBe(false);
  });

  it("throws for invalid draft id", async () => {
    await expect(deleteDraftOnServer(0)).rejects.toThrow(/Invalid messageId/);
  });

  it("throws for negative id", async () => {
    await expect(deleteDraftOnServer(-5)).rejects.toThrow(/Invalid messageId/);
  });
});
