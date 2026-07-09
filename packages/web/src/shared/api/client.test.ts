import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Middleware } from "./client";

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

describe("workspaceApi client", () => {
  beforeEach(async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse({ ok: true }))),
    );
    const { setAuthErrorHandler, setInstanceProvider, workspaceApi } = await import("./client");
    setAuthErrorHandler(null);
    setInstanceProvider(() => null);
    workspaceApi.setBaseUrl("https://workspace.example.com/api");
  });

  afterEach(async () => {
    const { setAuthErrorHandler, setInstanceProvider } = await import("./client");
    setAuthErrorHandler(null);
    setInstanceProvider(() => null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("builds GET URLs with params and parses JSON responses", async () => {
    const { workspaceApi } = await import("./client");

    const res = await workspaceApi.get("/health", { probe: "1" });

    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      "https://workspace.example.com/api/health?probe=1",
      expect.objectContaining({ method: "GET", credentials: "same-origin" }),
    );
  });

  it("sends JSON bodies without legacy Basic auth", async () => {
    const { setInstanceProvider, workspaceApi } = await import("./client");
    setInstanceProvider(() => ({
      id: "inst",
      realm: "https://realm.example.com",
      email: "user@example.com",
      apiKey: "",
    }));

    await workspaceApi.postJson("/items", { name: "demo" });

    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.body).toBe(JSON.stringify({ name: "demo" }));
  });

  it("supports form and delete helpers on the Workspace client", async () => {
    const { workspaceApi } = await import("./client");

    await workspaceApi.post("/form", { key: "value" });
    await workspaceApi.delete("/items/1", { force: "true" });

    const postInit = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    const deleteInit = vi.mocked(fetch).mock.calls[1]?.[1] as RequestInit;
    expect(postInit.body).toBe("key=value");
    expect(deleteInit.method).toBe("DELETE");
    expect(deleteInit.body).toBe("force=true");
  });

  it("allows adding and removing custom middleware", async () => {
    const { workspaceApi } = await import("./client");
    const seen: string[] = [];
    const middleware: Middleware = async (req, next) => {
      seen.push(req.url);
      req.headers["X-Test"] = "1";
      return next(req);
    };

    workspaceApi.use(middleware);
    await workspaceApi.get("/with-middleware");
    workspaceApi.removeMiddleware(middleware);
    await workspaceApi.get("/without-middleware");

    expect(seen).toEqual(["https://workspace.example.com/api/with-middleware"]);
    expect((vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({
      "X-Test": "1",
    });
    expect((vi.mocked(fetch).mock.calls[1]?.[1] as RequestInit).headers).not.toMatchObject({
      "X-Test": "1",
    });
  });

  it("keeps refreshWorkspaceApiBase as the only base refresh entrypoint", async () => {
    const { refreshWorkspaceApiBase, workspaceApi } = await import("./client");

    workspaceApi.setBaseUrl("https://changed.example.com");
    refreshWorkspaceApiBase();

    expect(workspaceApi.getBaseUrl()).toBe("/workspace");
  });

  it("invokes the auth error handler for non-allowlisted 401 responses without wiping credentials", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: "expired" }, { status: 401 }));
    const { setAuthErrorHandler, setInstanceProvider, workspaceApi } = await import("./client");
    const handler = vi.fn();
    setInstanceProvider(() => ({
      id: "inst",
      realm: "https://realm.example.com",
      email: "user@example.com",
      apiKey: "",
    }));
    setAuthErrorHandler(handler);

    const res = await workspaceApi.get("/legacy-compatible-path");

    expect(res.status).toBe(401);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
