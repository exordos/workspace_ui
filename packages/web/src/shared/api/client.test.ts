// Тесты для middleware-пайплайна API-клиента и singleton-экземпляров `ApiClient`.
//
// API-клиент использует onion-модель middleware, как в Express/Koa:
// каждый middleware может изменить запрос, вызвать `next()` и затем изменить ответ.
// Тесты покрывают композицию middleware, подстановку auth, retry-логику,
// HTTP-методы, JSON-обработку и runtime-управление middleware.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZULIP_API_FETCH_TIMEOUT_MS } from "../config/constants";
import { wipeCredentials } from "../lib/auth-guard";
import type { Middleware, ApiRequest, ApiResponse, NextFn } from "./client";

vi.mock("../lib/logger", async (importOriginal) => {
  const { createPartialLoggerMock } = await import("~/test/logger-vitest-mock");
  return createPartialLoggerMock(importOriginal as () => Promise<typeof import("../lib/logger")>);
});

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
// Пайплайн middleware: проверяем базовый механизм композиции
// независимо от конкретных middleware. Каждый слой оборачивает следующий.
// ---------------------------------------------------------------------------

// Проверяем базовое поведение chaining и композиции middleware.
describe("Middleware pipeline", () => {
  // Порядок важен: `mw1` оборачивает `mw2`,
  // значит вызовы идут как `mw1:before → mw2:before → mw2:after → mw1:after`.
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

  // Auth middleware должен прокинуть заголовки до слоя fetch.
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

  // Short-circuit: middleware возвращается без `next()`, значит `fetch` не должен вызываться.
  it("middleware can short-circuit (cache hit)", async () => {
    const cached = createMockResponse({ data: { fromCache: true } });

    const cacheMw: Middleware = () => Promise.resolve(cached);
    const fetchFn = vi.fn();

    const res = await buildChain([cacheMw], fetchFn)(makeReq());

    expect(res.data).toEqual({ fromCache: true });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  // Post-processing: middleware может дополнить ответ после возврата из `next()`.
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

  // Error wrapping: middleware перехватывает нижележащую ошибку и пробрасывает ее с контекстом.
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

  // Metadata bag позволяет передавать данные в downstream middleware.
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

  // Интеграция: три middleware, например header, timing и retry,
  // должны собраться в единый пайплайн.
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
// Интеграция ApiClient: тестируем экспортируемые singleton `zulipApi` и `workspaceApi`
// с реальными middleware поверх stubbed fetch.
// ---------------------------------------------------------------------------

// Проверяем HTTP-методы, подстановку auth, retry-поведение и обработку ошибок.
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

  // `GET` должен кодировать параметры в query string и парсить JSON-ответ.
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

  // Подвисший ответ Zulip не должен бесконечно блокировать UI.
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

  // Long-poll `GET /events` держится сервером открытым,
  // поэтому generic REST deadline сюда подмешивать нельзя.
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

  // `POST` должен использовать `application/x-www-form-urlencoded`,
  // это соглашение Zulip API.
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

  // `PATCH` использует тот же form-encoded формат, что и `POST`.
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

  // `DELETE` без body не должен выставлять `Content-Type`,
  // чтобы не путать сервер.
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

  // `DELETE` с body, например для `/drafts`, должен отправлять form-encoded данные.
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

  // `postJson` нужен для endpoint'ов, которые ожидают JSON body.
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

  // `putJson` используется для update-endpoint'ов с JSON request body.
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

  // `postFormData` не должен ломать multipart-заголовки, которые выставляет браузер.
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

  // Auth middleware должен подставлять Basic credentials активного инстанса.
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

  // Нет активного инстанса — нет auth header, чтобы не отправить креды не туда.
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

  it("adds cached csrf header for session auth register requests", async () => {
    const { setCachedSessionCsrfToken } = await import("./zulip-session-csrf.internal");
    const { setInstanceProvider, zulipApi, refreshZulipApiBase } = await import("./client");
    setCachedSessionCsrfToken("https://zulip.test", "cached-oidc-csrf-token");
    setInstanceProvider(() => ({
      id: "i-session",
      realm: "https://zulip.test",
      email: "session-user@example.com",
      apiKey: "",
      authType: "session",
    }));
    refreshZulipApiBase();

    mockFetch.mockResolvedValueOnce(mockJsonResponse({ result: "success" }));

    await zulipApi.post("/register", { event_types: JSON.stringify(["message"]) });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-CSRFToken"]).toBe("cached-oidc-csrf-token");
    expect(init.credentials).toBe("include");
  });

  it("reads csrf token from Electron bridge when session cookie is not visible to document", async () => {
    const { setInstanceProvider, zulipApi, refreshZulipApiBase } = await import("./client");
    document.cookie = "__Host-csrftoken=; Max-Age=0";
    document.cookie = "csrftoken=; Max-Age=0";
    document.cookie = "csrf=; Max-Age=0";
    const electronApi = {
      auth: {
        getCsrfToken: vi.fn().mockResolvedValue("electron-csrf-token"),
      },
    };
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: electronApi,
    });
    setInstanceProvider(() => ({
      id: "i-session",
      realm: "https://electron-zulip.test",
      email: "session-user@example.com",
      apiKey: "",
      authType: "session",
    }));
    refreshZulipApiBase();

    mockFetch.mockResolvedValueOnce(mockJsonResponse({ result: "success" }));

    await zulipApi.post("/register", { event_types: JSON.stringify(["message"]) });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(electronApi.auth.getCsrfToken).toHaveBeenCalledWith({
      realm: "https://electron-zulip.test",
    });
    expect(headers["X-CSRFToken"]).toBe("electron-csrf-token");
    expect(init.credentials).toBe("include");
  });

  it("does not add cached csrf header to workspace postJson requests", async () => {
    const { setCachedSessionCsrfToken } = await import("./zulip-session-csrf.internal");
    const { setInstanceProvider, workspaceApi } = await import("./client");
    setCachedSessionCsrfToken("https://zulip.test", "cached-oidc-csrf-token");
    setInstanceProvider(() => ({
      id: "i-session",
      realm: "https://zulip.test",
      email: "session-user@example.com",
      apiKey: "",
      authType: "session",
    }));

    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true }));

    await workspaceApi.postJson("/v1/folders/", { name: "Inbox" });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-CSRFToken"]).toBeUndefined();
    expect(init.credentials).toBe("include");
  });

  it("does not add csrf header or call Electron bridge for workspace putJson requests", async () => {
    const { setInstanceProvider, workspaceApi } = await import("./client");
    const electronApi = {
      auth: {
        getCsrfToken: vi.fn().mockResolvedValue("electron-csrf-token"),
      },
    };
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: electronApi,
    });
    setInstanceProvider(() => ({
      id: "i-session",
      realm: "https://electron-zulip.test",
      email: "session-user@example.com",
      apiKey: "",
      authType: "session",
    }));

    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true }));

    await workspaceApi.putJson("/v1/folders/f1/items/i1", { order_index: 3 });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(electronApi.auth.getCsrfToken).not.toHaveBeenCalled();
    expect(headers["X-CSRFToken"]).toBeUndefined();
    expect(init.credentials).toBe("include");
  });

  // Retry middleware должен повторять запрос при 5xx и успешно завершаться после восстановления сервера.
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

    const setTimeoutSpy = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation((callback: TimerHandler, _delay?: number, ...args: unknown[]) => {
        if (typeof callback === "function") {
          callback(...args);
        }
        return 0 as unknown as ReturnType<typeof setTimeout>;
      });

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

  // После достижения max retries middleware должен сдаться и бросить ошибку.
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

  // Ошибки 4xx — это client error, retry здесь не поможет, поэтому выходим сразу.
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

  // В dev-режиме Workspace API использует относительный base path `/workspace/...`.
  // URL builder должен резолвить его через `window.location.origin`, а не падать с `Invalid URL`.
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

  // Лишние слэши в конце base URL приводят к двойным слэшам в пути, их нужно обрезать.
  it("setBaseUrl trims trailing slashes", async () => {
    const { zulipApi } = await import("./client");
    zulipApi.setBaseUrl("https://example.com///");
    expect(zulipApi.getBaseUrl()).toBe("https://example.com");
  });

  // Сетевые ошибки вроде `TypeError: Failed to fetch` считаем retryable,
  // потому что они обычно временные.
  it("retryMiddleware retries on network error and re-throws after exhausting retries", async () => {
    const { retryMiddleware } = await import("./client");

    const fetchFn = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const handler = buildChain([retryMiddleware], fetchFn);

    await expect(handler(makeReq())).rejects.toThrow("Failed to fetch");
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  // 4xx не должны ретраиться: это ошибка клиента, а не временный сбой.
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

  // Некоторые endpoint'ы возвращают plain text, например `/health`,
  // и это не должно ломаться на JSON parse.
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

    const res = await workspaceApi.getWithBase("https://zulip.test", "/v1/folders/folder-1/items/");

    expect(res.status).toBe(401);
    expect(vi.mocked(wipeCredentials)).not.toHaveBeenCalled();
    expect(onAuthError).not.toHaveBeenCalled();
    setAuthErrorHandler(null);
  });

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
// API методов `ApiClient`: `use`, `useBefore`, `removeMiddleware`.
// Это runtime-управление middleware для плагинов и feature flag.
// ---------------------------------------------------------------------------

// Проверяем динамическую регистрацию и удаление middleware.
describe("ApiClient middleware management", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // `use()` позволяет плагинам добавлять middleware на лету,
  // значит они должны реально перехватывать запросы.
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

  // После удаления middleware он больше не должен перехватывать следующие запросы.
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

  it("uses the same dev target header for /external_content paths", async () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:5173" } });
    const { appendDevRealmMediaProxyHeaders, setInstanceProvider } = await import("./client");
    setInstanceProvider(() => ({
      id: "i1",
      realm: "https://zulip.realm.test",
      email: "u@t.com",
      apiKey: "k",
      workspaceOrgOrigin: "https://workspace.gateway.test",
    }));
    const out = appendDevRealmMediaProxyHeaders("/external_content/preview.png", {
      Authorization: "Basic x",
    });
    if (!import.meta.env.DEV) {
      expect(out["X-Workspace-Dev-Target-Origin"]).toBeUndefined();
      return;
    }
    expect(out["X-Workspace-Dev-Target-Origin"]).toBe("https://zulip.realm.test");
    setInstanceProvider(() => null);
  });

  it("uses the same dev target header for /avatar paths", async () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:5173" } });
    const { appendDevRealmMediaProxyHeaders, setInstanceProvider } = await import("./client");
    setInstanceProvider(() => ({
      id: "i1",
      realm: "https://zulip.realm.test",
      email: "u@t.com",
      apiKey: "k",
      workspaceOrgOrigin: "https://workspace.gateway.test",
    }));
    const out = appendDevRealmMediaProxyHeaders("/avatar/42.png", {
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
