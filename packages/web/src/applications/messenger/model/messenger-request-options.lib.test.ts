import { afterEach, describe, expect, it, vi } from "vitest";
import * as workspaceAuth from "~/entities/workspace-auth/workspace-auth.lib";
import {
  useWorkspaceAuthStore,
  type WorkspaceAuthSession,
} from "~/entities/workspace-auth/workspace-auth.model";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  getBinaryResult,
  getJsonResult,
  sendFormDataResult,
} from "~/shared/api/messenger-transport.internal";
import {
  buildMessengerRequestOptions,
  buildWorkspaceRequestOptions,
} from "./messenger-request-options.lib";

function createRuntimeContext(
  overrides: Partial<WorkspaceRuntimeContext> = {},
): WorkspaceRuntimeContext {
  return {
    accountId: "account-a",
    instanceId: "instance-a",
    organizationId: "org-a",
    organizationOrigin: "https://org-a.example.com",
    projectId: "project-a",
    userUuid: "user-a",
    accessToken: "access-token-a",
    runtimeGeneration: 1,
    ...overrides,
  };
}

function createAuthSession(overrides: Partial<WorkspaceAuthSession> = {}): WorkspaceAuthSession {
  return {
    ...createRuntimeContext(),
    login: "user@example.com",
    profile: {
      uuid: "user-a",
      username: "User A",
      firstName: null,
      lastName: null,
      email: "user@example.com",
    },
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function binaryResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/octet-stream" },
  });
}

function authorizationHeaders(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>): string[] {
  return fetchMock.mock.calls.map(
    ([, init]) => new Headers(init?.headers).get("Authorization") ?? "",
  );
}

function resetWorkspaceAuthStore(): void {
  useWorkspaceAuthStore.setState({
    sessions: [],
    currentAccountId: null,
    runtimeGeneration: 0,
  });
}

async function waitForCondition(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

function withDevEnv<T>(dev: boolean, fn: () => T): T {
  const original = import.meta.env.DEV;
  (import.meta.env as Record<string, unknown>).DEV = dev;
  try {
    return fn();
  } finally {
    (import.meta.env as Record<string, unknown>).DEV = original;
  }
}

describe("messenger request options", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetWorkspaceAuthStore();
  });

  it("builds messenger request options from runtime context", () => {
    const controller = new AbortController();

    expect(
      buildMessengerRequestOptions(createRuntimeContext(), undefined, controller.signal),
    ).toMatchObject({
      accessToken: "access-token-a",
      devTargetOrigin: "https://org-a.example.com",
      projectId: "project-a",
      signal: controller.signal,
    });
    expect(
      buildMessengerRequestOptions(createRuntimeContext(), undefined, controller.signal)
        .getAccessToken,
    ).toEqual(expect.any(Function));
  });

  it("uses organization messenger base url outside dev builds", () => {
    expect(
      withDevEnv(false, () =>
        buildMessengerRequestOptions(
          createRuntimeContext({ organizationOrigin: "https://org-a.example.com/" }),
        ),
      ),
    ).toMatchObject({
      baseUrl: "https://org-a.example.com/api/workspace/v1/messenger",
    });
  });

  it("uses the Workspace base for common API calls outside dev builds", () => {
    expect(
      withDevEnv(false, () =>
        buildWorkspaceRequestOptions(
          createRuntimeContext({ organizationOrigin: "https://org-a.example.com/" }),
        ),
      ),
    ).toMatchObject({
      baseUrl: "https://org-a.example.com/api/workspace/v1",
    });
  });

  it("keeps explicit overrides for project and dev target origin", () => {
    expect(
      buildMessengerRequestOptions(createRuntimeContext(), {
        baseUrl: "/custom-api",
        devTargetOrigin: "https://override.example.com",
        fetchImpl: fetch,
        projectId: "project-b",
      }),
    ).toMatchObject({
      accessToken: "access-token-a",
      baseUrl: "/custom-api",
      devTargetOrigin: "https://override.example.com",
      fetchImpl: fetch,
      projectId: "project-b",
    });
  });

  it("refreshes once after REST 401 and retries with the new authorization header", async () => {
    resetWorkspaceAuthStore();
    useWorkspaceAuthStore.setState({
      sessions: [createAuthSession({ accessToken: "old-token" })],
      currentAccountId: "account-a",
      runtimeGeneration: 1,
    });
    const ensureFreshSpy = vi
      .spyOn(workspaceAuth, "ensureFreshWorkspaceSession")
      .mockImplementation((accountId, options = {}) => {
        if (options.force === true) {
          useWorkspaceAuthStore.getState().updateTokens(accountId, {
            accessToken: "new-token",
          });
        }
        return Promise.resolve(createAuthSession({ accessToken: findStoredToken(accountId) }));
      });
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockImplementation((_input, init) => {
      const authorization = new Headers(init?.headers).get("Authorization");
      if (authorization === "Bearer new-token") {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      return Promise.resolve(jsonResponse({ detail: "expired" }, 401));
    });

    await expect(
      getJsonResult(
        "/streams/",
        buildMessengerRequestOptions(createRuntimeContext(), { fetchImpl: fetchMock }),
      ),
    ).resolves.toMatchObject({ data: { ok: true } });

    expect(authorizationHeaders(fetchMock)).toEqual(["Bearer old-token", "Bearer new-token"]);
    expect(ensureFreshSpy.mock.calls.map(([, options]) => options?.force === true)).toEqual([
      false,
      true,
    ]);
  });

  it("retries auth-type 403 once and does not retry ordinary forbidden responses", async () => {
    resetWorkspaceAuthStore();
    useWorkspaceAuthStore.setState({
      sessions: [createAuthSession({ accessToken: "old-token" })],
      currentAccountId: "account-a",
      runtimeGeneration: 1,
    });
    vi.spyOn(workspaceAuth, "ensureFreshWorkspaceSession").mockImplementation(
      (accountId, options = {}) => {
        if (options.force === true) {
          useWorkspaceAuthStore.getState().updateTokens(accountId, { accessToken: "new-token" });
        }
        return Promise.resolve(createAuthSession({ accessToken: findStoredToken(accountId) }));
      },
    );
    const authFetchMock = vi.fn<typeof fetch>();
    authFetchMock.mockImplementation((_input, init) => {
      const authorization = new Headers(init?.headers).get("Authorization");
      return Promise.resolve(
        authorization === "Bearer new-token"
          ? jsonResponse({ ok: true })
          : jsonResponse({ auth_type: "expired" }, 403),
      );
    });

    await expect(
      getJsonResult(
        "/streams/",
        buildMessengerRequestOptions(createRuntimeContext(), { fetchImpl: authFetchMock }),
      ),
    ).resolves.toMatchObject({ data: { ok: true } });

    const forbiddenFetchMock = vi.fn<typeof fetch>();
    forbiddenFetchMock.mockResolvedValue(jsonResponse({ detail: "forbidden" }, 403));

    await expect(
      getJsonResult(
        "/streams/",
        buildMessengerRequestOptions(createRuntimeContext(), { fetchImpl: forbiddenFetchMock }),
      ),
    ).rejects.toMatchObject({ status: 403, data: { detail: "forbidden" } });
    expect(forbiddenFetchMock).toHaveBeenCalledTimes(1);
  });

  it("deduplicates parallel forced refreshes for the same session", async () => {
    resetWorkspaceAuthStore();
    useWorkspaceAuthStore.setState({
      sessions: [createAuthSession({ accessToken: "old-token" })],
      currentAccountId: "account-a",
      runtimeGeneration: 1,
    });
    let resolveForcedRefresh = (): void => {
      throw new Error("Expected forced refresh resolver to be initialized");
    };
    let forceRefreshCount = 0;
    const forcedRefresh = new Promise<WorkspaceAuthSession>((resolve) => {
      resolveForcedRefresh = () => {
        useWorkspaceAuthStore.getState().updateTokens("account-a", {
          accessToken: "new-token",
        });
        resolve(createAuthSession({ accessToken: "new-token" }));
      };
    });
    vi.spyOn(workspaceAuth, "ensureFreshWorkspaceSession").mockImplementation(
      (accountId, options = {}) => {
        if (options.force === true) {
          forceRefreshCount += 1;
          return forcedRefresh;
        }
        return Promise.resolve(createAuthSession({ accessToken: findStoredToken(accountId) }));
      },
    );
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockImplementation((_input, init) => {
      const authorization = new Headers(init?.headers).get("Authorization");
      return Promise.resolve(
        authorization === "Bearer new-token"
          ? jsonResponse({ ok: true })
          : jsonResponse({ detail: "expired" }, 401),
      );
    });
    const options = buildMessengerRequestOptions(createRuntimeContext(), { fetchImpl: fetchMock });

    const firstRequest = getJsonResult("/streams/", options);
    const secondRequest = getJsonResult("/users/", options);
    await waitForCondition(() => forceRefreshCount === 1);

    expect(forceRefreshCount).toBe(1);
    resolveForcedRefresh();
    await expect(Promise.all([firstRequest, secondRequest])).resolves.toHaveLength(2);
    expect(authorizationHeaders(fetchMock)).toEqual([
      "Bearer old-token",
      "Bearer old-token",
      "Bearer new-token",
      "Bearer new-token",
    ]);
  });

  it("uses the refreshed token for upload and download requests", async () => {
    resetWorkspaceAuthStore();
    useWorkspaceAuthStore.setState({
      sessions: [createAuthSession({ accessToken: "fresh-token" })],
      currentAccountId: "account-a",
      runtimeGeneration: 1,
    });
    vi.spyOn(workspaceAuth, "ensureFreshWorkspaceSession").mockResolvedValue(
      createAuthSession({ accessToken: "fresh-token" }),
    );
    const uploadFetchMock = vi.fn<typeof fetch>();
    uploadFetchMock.mockResolvedValue(jsonResponse({ uuid: "file-uuid" }));
    const form = new FormData();
    form.append("file", new File(["body"], "report.txt", { type: "text/plain" }));

    await sendFormDataResult(
      "/files/",
      buildMessengerRequestOptions(createRuntimeContext({ accessToken: "old-token" }), {
        fetchImpl: uploadFetchMock,
      }),
      form,
    );

    const downloadFetchMock = vi.fn<typeof fetch>();
    downloadFetchMock.mockResolvedValue(binaryResponse("file-bytes"));
    await getBinaryResult(
      "/files/file-uuid/actions/download",
      buildMessengerRequestOptions(createRuntimeContext({ accessToken: "old-token" }), {
        fetchImpl: downloadFetchMock,
      }),
    );

    expect(authorizationHeaders(uploadFetchMock)).toEqual(["Bearer fresh-token"]);
    expect(authorizationHeaders(downloadFetchMock)).toEqual(["Bearer fresh-token"]);
  });

  it("uses the runtime account id instead of the active account id", async () => {
    resetWorkspaceAuthStore();
    useWorkspaceAuthStore.setState({
      sessions: [
        createAuthSession({ accountId: "account-current", accessToken: "current-token" }),
        createAuthSession({ accountId: "account-bg", accessToken: "background-token" }),
      ],
      currentAccountId: "account-current",
      runtimeGeneration: 1,
    });
    const ensureFreshSpy = vi
      .spyOn(workspaceAuth, "ensureFreshWorkspaceSession")
      .mockImplementation((accountId) =>
        Promise.resolve(createAuthSession({ accountId, accessToken: findStoredToken(accountId) })),
      );
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await getJsonResult(
      "/events/",
      buildMessengerRequestOptions(
        createRuntimeContext({ accountId: "account-bg", accessToken: "stale-bg-token" }),
        { fetchImpl: fetchMock },
      ),
    );

    expect(ensureFreshSpy).toHaveBeenCalledWith("account-bg", {
      force: false,
      signal: undefined,
    });
    expect(authorizationHeaders(fetchMock)).toEqual(["Bearer background-token"]);
  });
});

function findStoredToken(accountId: string): string {
  return (
    useWorkspaceAuthStore.getState().sessions.find((session) => session.accountId === accountId)
      ?.accessToken ?? ""
  );
}
