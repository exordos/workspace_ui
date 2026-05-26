import { describe, expect, it } from "vitest";
import type { ApiRequest } from "~/shared/api/client";
import { extractLoggableRequestParams } from "./logger-request-params.lib";

function makeReq(overrides: Partial<ApiRequest> & Pick<ApiRequest, "method" | "url">): ApiRequest {
  return {
    headers: {},
    meta: {},
    ...overrides,
  };
}

describe("extractLoggableRequestParams", () => {
  it("returns req.params for GET when set", () => {
    const params = extractLoggableRequestParams(
      makeReq({
        method: "GET",
        url: "https://chat.example.com/api/v1/messages",
        params: { anchor: "newest", num_before: "50" },
      }),
    );

    expect(params).toEqual({ anchor: "newest", num_before: "50" });
  });

  it("parses query string from url when params absent", () => {
    const params = extractLoggableRequestParams(
      makeReq({
        method: "GET",
        url: "https://chat.example.com/api/v1/messages?anchor=newest&num_before=50",
      }),
    );

    expect(params).toEqual({ anchor: "newest", num_before: "50" });
  });

  it("parses urlencoded body", () => {
    const params = extractLoggableRequestParams(
      makeReq({
        method: "POST",
        url: "https://chat.example.com/api/v1/messages",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "type=stream&stream_id=10&topic=general",
      }),
    );

    expect(params).toEqual({ type: "stream", stream_id: "10", topic: "general" });
  });

  it("redacts sensitive fields and truncates long content", () => {
    const longContent = `hello ${"x".repeat(250)}`;
    const params = extractLoggableRequestParams(
      makeReq({
        method: "POST",
        url: "https://chat.example.com/api/v1/messages",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `type=direct&content=${encodeURIComponent(longContent)}&password=secret`,
      }),
    ) as Record<string, string>;

    expect(params.password).toBe("[REDACTED]");
    expect(params.content).toMatch(/…$/);
    expect(params.content?.length ?? 0).toBeLessThanOrEqual(203);
  });

  it("parses JSON body", () => {
    const params = extractLoggableRequestParams(
      makeReq({
        method: "POST",
        url: "https://chat.example.com/v1/folders/",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Work" }),
      }),
    );

    expect(params).toEqual({ title: "Work" });
  });

  it("returns FormData placeholder", () => {
    const form = new FormData();
    form.append("file", new Blob(["x"]), "a.txt");

    const params = extractLoggableRequestParams(
      makeReq({
        method: "POST",
        url: "https://chat.example.com/api/v1/users/me/avatar",
        body: form,
      }),
    );

    expect(params).toEqual({ body: "[FormData]" });
  });

  it("limits long-poll events params to queue fields", () => {
    const params = extractLoggableRequestParams(
      makeReq({
        method: "GET",
        url: "https://chat.example.com/api/v1/events?queue_id=q1&last_event_id=5&timeout=90&dont_care=1",
      }),
    );

    expect(params).toEqual({
      queue_id: "q1",
      last_event_id: "5",
      timeout: "90",
    });
  });

  it("returns undefined when no params", () => {
    expect(
      extractLoggableRequestParams(
        makeReq({
          method: "GET",
          url: "https://chat.example.com/api/v1/streams",
        }),
      ),
    ).toBeUndefined();
  });
});
