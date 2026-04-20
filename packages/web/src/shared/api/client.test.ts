/**
 * Tests for the API client middleware pipeline and ApiClient singletons.
 *
 * The API client uses an onion-model middleware chain (like Express/Koa):
 * each middleware can transform the request, call next(), and transform the
 * response. Tests cover middleware composition, auth injection, retry logic,
 * HTTP methods (GET/POST/PATCH/DELETE), JSON handling, and middleware management.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZULIP_API_FETCH_TIMEOUT_MS } from "../config/constants";
import { wipeCredentials } from "../lib/auth-guard";
import type { Middleware, ApiRequest, ApiResponse, NextFn } from "./client";

vi.mock("../lib/logger", () => ({
  logApiCall: vi.fn(),
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../lib/env", () => ({
  env: {
    WORKSPACE_API_BASE: "https://workspace.test/api/v1",
    WORKSPACE_REST_API_PATH: "",
    ZULIP_API_PATH: "/api/v1",
  },
}));

vi.mock("../lib/auth-guard", async () => {
  const actual = await vi.importActual("../lib/auth-guard");
  return {
    ...actual,
    wipeCredentials: vi.fn(),
  };
});

function createMockResponse(overrides: Partial<ApiResponse> = {}): ApiResponse {
  return {
    status: 200,
    ok: true,
    headers: new Headers(),
    data: { result: "success" },
    raw: new Response(),
    durationMs: 0,
    ...overrides,
  };
}

function buildChain(middlewares: Middleware[], finalFn: NextFn): NextFn {
  let handler = finalFn;
  for (let i = middlewares.length - 1; i >= 0; i--) {
    const mw = middlewares[i]!;
    const next = handler;
    handler = (r: ApiRequest) => mw(r, next);
  }
  return handler;
}

function makeReq(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    method: "GET",
    url: "https://example.com/test",
    headers: {},
    meta: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Middleware pipeline — verifies the core composition engine independent of
// any specific middleware. Each middleware wraps the next, forming an onion.
// ---------------------------------------------------------------------------

// Tests the fundamental middleware chaining and composition behaviors.
describe("Middleware pipeline", () => {
  // Order matters: mw1 wraps mw2, so mw1:before → mw2:before → mw2:after → mw1:after.
  it("executes middleware in order (onion model)", async () => {
    const order: string[] = [];

    const mw1: Middleware = async (req, next) => {
      order.push("mw1:before");
      const res = await next(req);
      order.push("mw1:after");
      return res;
    };

    const mw2: Middleware = async (req, next) => {
      order.push("mw2:before");
      const res = await next(req);
      order.push("mw2:after");
      return res;
    };

    const fetchFn = vi.fn().mockResolvedValue(createMockResponse());
    const handler = buildChain([mw1, mw2], fetchFn);
    await handler(makeReq());

    expect(order).toEqual(["mw1:before", "mw2:before", "mw2:after", "mw1:after"]);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  // Auth middleware injects headers — verify they reach the fetch layer.
  it("middleware can inject headers", async () => {
    const authMw: Middleware = async (req, next) => {
      req.headers.Authorization = "Basic abc";
      return next(req);
    };

    const captured: Record<string, string>[] = [];
    const fetchFn = vi.fn().mockImplementation((req: ApiRequest) => {
      captured.push({ ...req.headers });
      return Promise.resolve(createMockResponse());
    });

    await buildChain([authMw], fetchFn)(makeReq());

    expect(captured[0]).toHaveProperty("Authorization", "Basic abc");
  });

  // Short-circuit: middleware returns without calling next() — fetch is never called.
  it("middleware can short-circuit (cache hit)", async () => {
    const cached = createMockResponse({ data: { fromCache: true } });

    const cacheMw: Middleware = () => Promise.resolve(cached);
    const fetchFn = vi.fn();

    const res = await buildChain([cacheMw], fetchFn)(makeReq());

    expect(res.data).toEqual({ fromCache: true });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  // Post-processing: middleware enriches the response after next() returns.
  it("middleware can transform response", async () => {
    const addFieldMw: Middleware = async (req, next) => {
      const res = await next(req);
      return {
        ...res,
        data: { ...(res.data as Record<string, unknown>), enriched: true },
      };
    };

    const fetchFn = vi.fn().mockResolvedValue(createMockResponse({ data: { original: true } }));

    const res = await buildChain([addFieldMw], fetchFn)(makeReq());
    const data = res.data as Record<string, boolean>;

    expect(data.original).toBe(true);
    expect(data.enriched).toBe(true);
  });

  // Error wrapping: middleware catches downstream errors and re-throws with context.
  it("middleware can wrap errors", async () => {
    const errorMw: Middleware = async (req, next) => {
      try {
        return await next(req);
      } catch (err) {
        throw new Error(`Wrapped: ${(err as Error).message}`, { cause: err });
      }
    };

    const fetchFn = vi.fn().mockRejectedValue(new Error("Network fail"));

    await expect(buildChain([errorMw], fetchFn)(makeReq())).rejects.toThrow(
      "Wrapped: Network fail",
    );
  });

  // Metadata bag allows middleware to pass data to downstream middleware.
  it("supports request metadata", async () => {
    const tagMw: Middleware = async (req, next) => {
      req.meta.tagged = true;
      return next(req);
    };

    let capturedMeta: Record<string, unknown> = {};
    const fetchFn = vi.fn().mockImplementation((req: ApiRequest) => {
      capturedMeta = { ...req.meta };
      return Promise.resolve(createMockResponse());
    });

    await buildChain([tagMw], fetchFn)(makeReq());

    expect(capturedMeta.tagged).toBe(true);
  });

  // Integration: three middleware (header, timing, retry) compose into a single pipeline.
  it("three middleware compose correctly", async () => {
    const addHeader: Middleware = async (req, next) => {
      req.headers["X-Request-Id"] = "123";
      return next(req);
    };

    const timing: Middleware = async (req, next) => {
      const res = await next(req);
      return { ...res, durationMs: 42 };
    };

    const retry: Middleware = async (req, next) => {
      try {
        return await next(req);
      } catch {
        return next(req);
      }
    };

    let callCount = 0;
    const fetchFn = vi.fn().mockImplementation((req: ApiRequest) => {
      callCount++;
      if (callCount === 1) throw new Error("transient");
      expect(req.headers["X-Request-Id"]).toBe("123");
      return Promise.resolve(createMockResponse());
    });

    const res = await buildChain([addHeader, timing, retry], fetchFn)(makeReq());

    expect(callCount).toBe(2);
    expect(res.durationMs).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// ApiClient integration — tests the exported zulipApi / workspaceApi singletons
// with real middleware (auth, retry, logging) against a stubbed fetch.
// ---------------------------------------------------------------------------

// Verifies HTTP methods, auth injection, retry behavior, and error handling.
describe("ApiClient (via zulipApi / workspaceApi)", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    vi.mocked(wipeCredentials).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockJsonResponse(data: unknown, status = 200) {
    const body = JSON.stringify(data);
    return new Response(body, {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // GET must encode params in query string and parse JSON response.
  it("GET sends method and URL, returns parsed JSON", async () => {
    const { setInstanceProvider, zulipApi, refreshZulipApiBase } = await import("./client");
    setInstanceProvider(() => ({
      id: "i1",
      realm: "https://zulip.test",
      email: "u@t.com",
      apiKey: "key123",
    }));
    refreshZulipApiBase();

    mockFetch.mockResolvedValueOnce(mockJsonResponse({ result: "success", messages: [] }));

    const res = await zulipApi.get("/messages", { anchor: "newest" });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/messages");
    expect(url).toContain("anchor=newest");
    expect(init.method).toBe("GET");
    const headers = init.headers as Record<string, string>;
    expect(headers["Cache-Control"]).toBeUndefined();
    expect(headers.Pragma).toBeUndefined();
    expect(init.cache).toBe("no-store");
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ result: "success", messages: [] });
  });

  // Hung Zulip responses must not block the UI indefinitely.
  it("zulipApi aborts a hung fetch after ZULIP_API_FETCH_TIMEOUT_MS", async () => {
    vi.useFakeTimers();
    try {
      const { setInstanceProvider, zulipApi, refreshZulipApiBase } = await import("./client");
      setInstanceProvider(() => ({
        id: "i1",
        realm: "https://zulip.test",
        email: "u@t.com",
        apiKey: "key123",
      }));
      refreshZulipApiBase();

      mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          const s = init?.signal;
          if (s?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          s?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      });

      const pending = zulipApi.get("/messages", { anchor: "newest" });
      const assertRejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
      await vi.advanceTimersByTimeAsync(ZULIP_API_FETCH_TIMEOUT_MS);
      await assertRejected;
      expect(mockFetch).toHaveBeenCalledOnce();
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  // Long-poll GET /events is held open by the server; do not merge the REST deadline signal.
  it("zulipApi GET /events skips wall-clock fetch timeout", async () => {
    const { setInstanceProvider, zulipApi, refreshZulipApiBase } = await import("./client");
    setInstanceProvider(() => ({
      id: "i1",
      realm: "https://zulip.test",
      email: "u@t.com",
      apiKey: "key123",
    }));
    refreshZulipApiBase();

    mockFetch.mockResolvedValueOnce(mockJsonResponse({ result: "success", events: [] }));
    await zulipApi.get("/events", { queue_id: "q-1", last_event_id: "0" });
    const [, initNoCaller] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(initNoCaller.signal).toBeUndefined();

    const user = new AbortController();
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ result: "success", events: [] }));
    await zulipApi.get("/events", { queue_id: "q-1", last_event_id: "1" }, user.signal);
    const [, initWithCaller] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(initWithCaller.signal).toBe(user.signal);
  });

  // POST must use application/x-www-form-urlencoded (Zulip API convention).
  it("POST sends form-encoded body", async () => {
    const { setInstanceProvider, zulipApi, refreshZulipApiBase } = await import("./client");
    setInstanceProvider(() => ({
      id: "i1",
      realm: "https://zulip.test",
      email: "u@t.com",
      apiKey: "key123",
    }));
    refreshZulipApiBase();

    mockFetch.mockResolvedValueOnce(mockJsonResponse({ result: "success", id: 42 }));

    const res = await zulipApi.post("/messages", { type: "stream", content: "hello" });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.headers).toHaveProperty("Content-Type", "application/x-www-form-urlencoded");
    expect(init.body).toContain("type=stream");
    expect(init.body).toContain("content=hello");
    expect(res.data).toEqual({ result: "success", id: 42 });
  });

  // PATCH uses the same form-encoded format as POST.
  it("PATCH sends form-encoded body", async () => {
    const { setInstanceProvider, zulipApi, refreshZulipApiBase } = await import("./client");
    setInstanceProvider(() => ({
      id: "i1",
      realm: "https://zulip.test",
      email: "u@t.com",
      apiKey: "key123",
    }));
    refreshZulipApiBase();

    mockFetch.mockResolvedValueOnce(mockJsonResponse({ result: "success" }));

    await zulipApi.patch("/settings", { full_name: "Test" });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PATCH");
    expect(init.body).toContain("full_name=Test");
  });

  // DELETE without body must omit Content-Type to avoid server confusion.
  it("DELETE without body sends no Content-Type", async () => {
    const { setInstanceProvider, zulipApi, refreshZulipApiBase } = await import("./client");
    setInstanceProvider(() => ({
      id: "i1",
      realm: "https://zulip.test",
      email: "u@t.com",
      apiKey: "key123",
    }));
    refreshZulipApiBase();

    mockFetch.mockResolvedValueOnce(mockJsonResponse({ result: "success" }));

    await zulipApi.delete("/messages/42");

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });

  // DELETE with body (e.g. /drafts) must send form-encoded data.
  it("DELETE with body sends form-encoded", async () => {
    const { setInstanceProvider, zulipApi, refreshZulipApiBase } = await import("./client");
    setInstanceProvider(() => ({
      id: "i1",
      realm: "https://zulip.test",
      email: "u@t.com",
      apiKey: "key123",
    }));
    refreshZulipApiBase();

    mockFetch.mockResolvedValueOnce(mockJsonResponse({ result: "success" }));

    await zulipApi.delete("/drafts/1", { draft_id: "1" });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("DELETE");
    expect(init.body).toContain("draft_id=1");
  });

  // postJson is an alternative to POST for endpoints expecting JSON bodies.
  it("postJson sends JSON body with application/json content type", async () => {
    const { setInstanceProvider, zulipApi, refreshZulipApiBase } = await import("./client");
    setInstanceProvider(() => ({
      id: "i1",
      realm: "https://zulip.test",
      email: "u@t.com",
      apiKey: "key123",
    }));
    refreshZulipApiBase();

    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true }));

    await zulipApi.postJson("/custom", { key: "value" });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toHaveProperty("Content-Type", "application/json");
    expect(init.body).toBe(JSON.stringify({ key: "value" }));
  });

  // putJson is used for update endpoints expecting JSON request bodies.
  it("putJson sends JSON body with application/json content type", async () => {
    const { setInstanceProvider, workspaceApi } = await import("./client");
    setInstanceProvider(() => ({
      id: "i1",
      realm: "https://workspace.test",
      email: "u@t.com",
      apiKey: "key123",
    }));

    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true }));

    await workspaceApi.putJson("/v1/folders/f1/items/i1", { order_index: 3 });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PUT");
    expect(init.headers).toHaveProperty("Content-Type", "application/json");
    expect(init.body).toBe(JSON.stringify({ order_index: 3 }));
  });

  it("getWithBase builds URL from explicit base without changing workspaceApi baseUrl", async () => {
    const { setInstanceProvider, workspaceApi } = await import("./client");
    setInstanceProvider(() => ({
      id: "i1",
      realm: "https://zulip.test",
      email: "u@t.com",
      apiKey: "key123",
    }));

    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true, folders: [] }));

    const before = workspaceApi.getBaseUrl();
    const res = await workspaceApi.getWithBase("https://org.example.com/workspace", "/v1/folders/");
    const after = workspaceApi.getBaseUrl();

    expect(res.ok).toBe(true);
    expect(before).toBe(after);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://org.example.com/workspace/v1/folders/");
  });

  // postFormData must preserve browser-managed multipart headers.
  it("postFormData sends FormData body without explicit Content-Type", async () => {
    const { setInstanceProvider, zulipApi, refreshZulipApiBase } = await import("./client");
    setInstanceProvider(() => ({
      id: "i1",
      realm: "https://zulip.test",
      email: "u@t.com",
      apiKey: "key123",
    }));
    refreshZulipApiBase();

    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true }));

    const form = new FormData();
    form.append("file", new File(["data"], "test.txt"));

    await (
      zulipApi as typeof zulipApi & {
        postFormData: (path: string, form: FormData) => Promise<unknown>;
      }
    ).postFormData("/user_uploads", form);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(init.body).toBe(form);
    expect(headers["Content-Type"]).toBeUndefined();
  });

  // Auth middleware must inject Basic credentials from the active instance.
  it("authMiddleware injects Basic auth header from current instance", async () => {
    const { setInstanceProvider, zulipApi, refreshZulipApiBase } = await import("./client");
    setInstanceProvider(() => ({
      id: "i1",
      realm: "https://zulip.test",
      email: "user@test.com",
      apiKey: "abc",
    }));
    refreshZulipApiBase();

    mockFetch.mockResolvedValueOnce(mockJsonResponse({ result: "success" }));

    await zulipApi.get("/test");

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Basic /);
  });

  // No instance = no auth header — prevents sending credentials to wrong server.
  it("authMiddleware does not inject header when no instance selected", async () => {
    const { setInstanceProvider, workspaceApi } = await import("./client");
    setInstanceProvider(() => null);

    mockFetch.mockResolvedValueOnce(mockJsonResponse({ result: "success" }));

    await workspaceApi.get("/health");

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("uses /json API path and cookie credentials for session auth instances", async () => {
    const { setInstanceProvider, zulipApi, refreshZulipApiBase } = await import("./client");
    setInstanceProvider(() => ({
      id: "i-session",
      realm: "https://zulip.test",
      email: "session-user@example.com",
      apiKey: "",
      authType: "session",
    }));
    refreshZulipApiBase();

    mockFetch.mockResolvedValueOnce(mockJsonResponse({ result: "success" }));

    await zulipApi.get("/messages");

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/json/messages");
    expect(init.credentials).toBe("include");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("adds csrf header for session auth non-GET requests", async () => {
    const { setInstanceProvider, zulipApi, refreshZulipApiBase } = await import("./client");
    document.cookie = "csrftoken=session-csrf-token";
    setInstanceProvider(() => ({
      id: "i-session",
      realm: "https://zulip.test",
      email: "session-user@example.com",
      apiKey: "",
      authType: "session",
    }));
    refreshZulipApiBase();

    mockFetch.mockResolvedValueOnce(mockJsonResponse({ result: "success" }));

    await zulipApi.post("/messages", { type: "stream", content: "hello" });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-CSRFToken"]).toBe("session-csrf-token");
    expect(init.credentials).toBe("include");
    document.cookie = "csrftoken=; Max-Age=0";
  });

  // Retry middleware must retry on 5xx and succeed when the server recovers.
  it("retryMiddleware retries on 503 and eventually succeeds", async () => {
    const { retryMiddleware } = await import("./client");

    let callCount = 0;
    const fetchFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          createMockResponse({
            status: 503,
            ok: false,
            headers: new Headers({ "Retry-After": "0" }),
          }),
        );
      }
      return Promise.resolve(createMockResponse({ status: 200, ok: true }));
    });

    const handler = buildChain([retryMiddleware], fetchFn);
    const res = await handler(makeReq());

    expect(res.ok).toBe(true);
    expect(callCount).toBe(2);
  });

  it("retryMiddleware falls back to progressive delay for malformed Retry-After", async () => {
    const { retryMiddleware } = await import("./client");

    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      callback: TimerHandler,
      _delay?: number,
      ...args: unknown[]
    ) => {
      if (typeof callback === "function") {
        callback(...args);
      }
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout);

    let callCount = 0;
    const fetchFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          createMockResponse({
            status: 503,
            ok: false,
            headers: new Headers({ "Retry-After": "10ms" }),
          }),
        );
      }
      return Promise.resolve(createMockResponse({ status: 200, ok: true }));
    });

    const handler = buildChain([retryMiddleware], fetchFn);
    const res = await handler(makeReq());

    expect(res.ok).toBe(true);
    expect(callCount).toBe(2);
    const firstDelay = setTimeoutSpy.mock.calls[0]?.[1];
    expect(firstDelay).toBe(1000);
  });

  // After max retries, the middleware must give up and throw.
  it("retryMiddleware throws after exhausting retries on persistent error", async () => {
    const { retryMiddleware } = await import("./client");

    const fetchFn = vi.fn().mockResolvedValue(
      createMockResponse({
        status: 502,
        ok: false,
        headers: new Headers({ "Retry-After": "0" }),
      }),
    );

    const handler = buildChain([retryMiddleware], fetchFn);

    await expect(handler(makeReq())).rejects.toThrow("HTTP 502");
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  // 4xx errors are client errors — retrying won't help, so return immediately.
  it("non-retryable 4xx status is returned immediately without retry", async () => {
    const { setInstanceProvider, zulipApi, refreshZulipApiBase } = await import("./client");
    setInstanceProvider(() => ({
      id: "i1",
      realm: "https://zulip.test",
      email: "u@t.com",
      apiKey: "key123",
    }));
    refreshZulipApiBase();

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ msg: "Not found" }), { status: 404 }),
    );

    const res = await zulipApi.get("/nonexistent");

    expect(res.status).toBe(404);
    expect(res.ok).toBe(false);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  // Dev-mode workspace API uses a relative base path (/workspace/...).
  // Url builder must resolve it against window.location.origin instead of throwing Invalid URL.
  it("resolves relative workspace base URLs against window origin", async () => {
    const { workspaceApi, setInstanceProvider } = await import("./client");
    setInstanceProvider(() => null);
    workspaceApi.setBaseUrl("/workspace");

    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true }));

    await expect(workspaceApi.get("/v1/services/")).resolves.toMatchObject({ ok: true });
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/workspace/v1/services/");
  });

  // Trailing slashes in base URL cause double-slash paths — must be trimmed.
  it("setBaseUrl trims trailing slashes", async () => {
    const { zulipApi } = await import("./client");
    zulipApi.setBaseUrl("https://example.com///");
    expect(zulipApi.getBaseUrl()).toBe("https://example.com");
  });

  // Network errors (TypeError: Failed to fetch) are retryable — they indicate transient failures.
  it("retryMiddleware retries on network error and re-throws after exhausting retries", async () => {
    const { retryMiddleware } = await import("./client");

    const fetchFn = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const handler = buildChain([retryMiddleware], fetchFn);

    await expect(handler(makeReq())).rejects.toThrow("Failed to fetch");
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  // 4xx must not be retried — it's a client error, not transient.
  it("retryMiddleware does not retry on 4xx errors", async () => {
    const { retryMiddleware } = await import("./client");

    const fetchFn = vi.fn().mockResolvedValue(createMockResponse({ status: 404, ok: false }));

    const handler = buildChain([retryMiddleware], fetchFn);
    const res = await handler(makeReq());

    expect(res.status).toBe(404);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("wipes credentials and calls auth-error handler on protected 401", async () => {
    const { setInstanceProvider, zulipApi, refreshZulipApiBase, setAuthErrorHandler } =
      await import("./client");
    const onAuthError = vi.fn();

    setInstanceProvider(() => ({
      id: "i1",
      realm: "https://zulip.test",
      email: "u@t.com",
      apiKey: "key123",
    }));
    setAuthErrorHandler(onAuthError);
    refreshZulipApiBase();

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ msg: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await zulipApi.get("/messages");

    expect(res.status).toBe(401);
    expect(vi.mocked(wipeCredentials)).toHaveBeenCalledTimes(1);
    expect(onAuthError).toHaveBeenCalledTimes(1);
    setAuthErrorHandler(null);
  });

  it("does not trigger auth-error handling for excluded auth paths", async () => {
    const { setInstanceProvider, zulipApi, refreshZulipApiBase, setAuthErrorHandler } =
      await import("./client");
    const onAuthError = vi.fn();

    setInstanceProvider(() => ({
      id: "i1",
      realm: "https://zulip.test",
      email: "u@t.com",
      apiKey: "key123",
    }));
    setAuthErrorHandler(onAuthError);
    refreshZulipApiBase();

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ msg: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await zulipApi.post("/fetch_api_key", {
      username: "u@t.com",
      password: "pass",
    });

    expect(res.status).toBe(401);
    expect(vi.mocked(wipeCredentials)).not.toHaveBeenCalled();
    expect(onAuthError).not.toHaveBeenCalled();
    setAuthErrorHandler(null);
  });

  it("does not wipe credentials on GET workspace /v1/folders/ 401", async () => {
    const { setInstanceProvider, workspaceApi, setAuthErrorHandler } = await import("./client");
    const onAuthError = vi.fn();

    setInstanceProvider(() => ({
      id: "i1",
      realm: "https://zulip.test",
      email: "u@t.com",
      apiKey: "key123",
    }));
    setAuthErrorHandler(onAuthError);

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await workspaceApi.get("/v1/folders/");

    expect(res.status).toBe(401);
    expect(vi.mocked(wipeCredentials)).not.toHaveBeenCalled();
    expect(onAuthError).not.toHaveBeenCalled();
    setAuthErrorHandler(null);
  });

  it("does not wipe credentials on GET workspace folder items 401", async () => {
    const { setInstanceProvider, workspaceApi, setAuthErrorHandler } = await import("./client");
    const onAuthError = vi.fn();

    setInstanceProvider(() => ({
      id: "i1",
      realm: "https://zulip.test",
      email: "u@t.com",
      apiKey: "key123",
    }));
    setAuthErrorHandler(onAuthError);

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await workspaceApi.getWithBase(
      "https://zulip.test",
      "/v1/folders/folder-1/items/",
    );

    expect(res.status).toBe(401);
    expect(vi.mocked(wipeCredentials)).not.toHaveBeenCalled();
    expect(onAuthError).not.toHaveBeenCalled();
    setAuthErrorHandler(null);
  });

  // Some endpoints return plain text (e.g. /health) — must not crash on JSON parse.
  it("handles non-JSON response body gracefully", async () => {
    const { setInstanceProvider, zulipApi, refreshZulipApiBase } = await import("./client");
    setInstanceProvider(() => ({
      id: "i1",
      realm: "https://zulip.test",
      email: "u@t.com",
      apiKey: "key123",
    }));
    refreshZulipApiBase();

    mockFetch.mockResolvedValueOnce(new Response("plain text", { status: 200 }));

    const res = await zulipApi.get("/health");

    expect(res.ok).toBe(true);
    expect(res.data).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ApiClient method API: use / useBefore / removeMiddleware — runtime middleware
// management for plugins and feature flags.
// ---------------------------------------------------------------------------

// Verifies dynamic middleware registration and removal.
describe("ApiClient middleware management", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // use() allows plugins to add middleware at runtime — must intercept requests.
  it("use() appends a custom middleware that intercepts requests", async () => {
    const { setInstanceProvider, zulipApi, refreshZulipApiBase } = await import("./client");
    setInstanceProvider(() => ({
      id: "i1",
      realm: "https://zulip.test",
      email: "u@t.com",
      apiKey: "k",
    }));
    refreshZulipApiBase();

    let intercepted = false;
    const customMw: Middleware = async (req, next) => {
      intercepted = true;
      req.headers["X-Custom"] = "yes";
      return next(req);
    };

    zulipApi.use(customMw);

    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await zulipApi.get("/test");

    expect(intercepted).toBe(true);
    const headers = (mockFetch.mock.calls[0] as [string, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(headers["X-Custom"]).toBe("yes");

    zulipApi.removeMiddleware(customMw);
  });

  // Middleware removal must stop it from intercepting subsequent requests.
  it("removeMiddleware() removes a previously added middleware", async () => {
    const { zulipApi } = await import("./client");

    let called = false;
    const mw: Middleware = async (req, next) => {
      called = true;
      return next(req);
    };

    zulipApi.use(mw);
    zulipApi.removeMiddleware(mw);

    const { setInstanceProvider, refreshZulipApiBase } = await import("./client");
    setInstanceProvider(() => ({
      id: "i1",
      realm: "https://zulip.test",
      email: "u@t.com",
      apiKey: "k",
    }));
    refreshZulipApiBase();

    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await zulipApi.get("/test");

    expect(called).toBe(false);
  });
});

describe("zulipRateLimitGateMiddleware", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
    const { resetZulipRateLimitGateForTests } = await import("~/shared/lib/zulip-rate-limit-gate");
    resetZulipRateLimitGateForTests();
  });

  afterEach(async () => {
    vi.useRealTimers();
    const { resetZulipRateLimitGateForTests } = await import("~/shared/lib/zulip-rate-limit-gate");
    resetZulipRateLimitGateForTests();
  });

  it("waits before calling next again after a JSON RATE_LIMIT_HIT response", async () => {
    const { zulipRateLimitGateMiddleware } = await import("./client");
    const fetchFn = vi.fn().mockResolvedValue(
      createMockResponse({
        data: { result: "error", code: "RATE_LIMIT_HIT", msg: "limit", "retry-after": 0.5 },
      }),
    );
    const chain = buildChain([zulipRateLimitGateMiddleware], fetchFn);

    await chain(makeReq());
    expect(fetchFn).toHaveBeenCalledTimes(1);

    const second = chain(makeReq());
    await vi.advanceTimersByTimeAsync(400);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(200);
    await second;
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe("appendDevUserUploadsProxyHeaders", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns unchanged headers when no instance supplies a dev upload target", async () => {
    const { appendDevUserUploadsProxyHeaders, setInstanceProvider } = await import("./client");
    setInstanceProvider(() => null);
    const headers = { Authorization: "Basic x" };
    expect(appendDevUserUploadsProxyHeaders("/user_uploads/1/a.png", headers)).toBe(headers);
  });

  it("uses Zulip realm origin as target, not workspace gateway", async () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:5173" } });
    const { appendDevUserUploadsProxyHeaders, setInstanceProvider } = await import("./client");
    setInstanceProvider(() => ({
      id: "i1",
      realm: "https://zulip.realm.test",
      email: "u@t.com",
      apiKey: "k",
      workspaceOrgOrigin: "https://workspace.gateway.test",
    }));
    const out = appendDevUserUploadsProxyHeaders("/user_uploads/1/a.png", {
      Authorization: "Basic x",
    });
    if (!import.meta.env.DEV) {
      expect(out["X-Workspace-Dev-Target-Origin"]).toBeUndefined();
      return;
    }
    expect(out["X-Workspace-Dev-Target-Origin"]).toBe("https://zulip.realm.test");
    setInstanceProvider(() => null);
  });
});
