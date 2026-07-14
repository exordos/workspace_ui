import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLogHistory, getLogHistory, setMinLevel } from "~/shared/lib/logger";
import { loggingMiddleware } from "./client";
import type { ApiRequest, ApiResponse, NextFn } from "./client";

const STREAM_UUID_10 = "00000000-0000-4000-8000-000000000010";

function createMockResponse(overrides: Partial<ApiResponse> = {}): ApiResponse {
  return {
    status: 200,
    ok: true,
    headers: new Headers(),
    data: {},
    raw: new Response(),
    durationMs: 0,
    ...overrides,
  };
}

describe("loggingMiddleware", () => {
  beforeEach(() => {
    clearLogHistory();
    setMinLevel("debug");
  });

  it("logs request params and status", async () => {
    const next: NextFn = vi.fn().mockResolvedValue(createMockResponse({ status: 201 }));
    const req: ApiRequest = {
      method: "POST",
      url: "https://chat.example.com/api/workspace/v1/messenger/messages",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `type=stream&stream_uuid=${STREAM_UUID_10}`,
      meta: {},
    };

    await loggingMiddleware(req, next);

    const entry = getLogHistory().find((e) => e.scope === "api");
    expect(entry).toBeDefined();
    expect(entry!.message).toBe("POST /api/workspace/v1/messenger/messages");
    const data = entry!.data as Record<string, unknown>;
    expect(data.status).toBe(201);
    expect((data.params as Record<string, string>).stream_uuid).toBe(STREAM_UUID_10);
  });

  it("does not log aborted requests as API failures", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    const next: NextFn = vi.fn().mockRejectedValue(abortError);
    const controller = new AbortController();
    controller.abort();
    const req: ApiRequest = {
      method: "GET",
      url: "https://chat.example.com/api/workspace/v1/messenger/messages",
      headers: {},
      meta: {},
      signal: controller.signal,
    };

    await expect(loggingMiddleware(req, next)).rejects.toBe(abortError);
    expect(getLogHistory().filter((entry) => entry.scope === "api")).toEqual([]);
  });
});
