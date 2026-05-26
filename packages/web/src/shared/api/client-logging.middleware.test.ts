import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLogHistory, getLogHistory, setMinLevel } from "~/shared/lib/logger";
import { loggingMiddleware } from "./client";
import type { ApiRequest, ApiResponse, NextFn } from "./client";

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
      url: "https://chat.example.com/api/v1/messages",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "type=stream&stream_id=10",
      meta: {},
    };

    await loggingMiddleware(req, next);

    const entry = getLogHistory().find((e) => e.scope === "api");
    expect(entry).toBeDefined();
    expect(entry!.message).toBe("POST /api/v1/messages");
    const data = entry!.data as Record<string, unknown>;
    expect(data.status).toBe(201);
    expect((data.params as Record<string, string>).stream_id).toBe("10");
  });
});
