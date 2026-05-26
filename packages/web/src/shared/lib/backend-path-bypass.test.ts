import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalLocation = window.location;

function stubLocation(href: string, replaceMock?: (next: string) => void): void {
  const url = new URL(href);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      href,
      pathname: url.pathname,
      search: url.search,
      replace: replaceMock ?? vi.fn(),
    },
  });
}

describe("bypassSpaForBackendPath", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns false for SPA paths", async () => {
    const { bypassSpaForBackendPath } = await import("./backend-path-bypass");
    stubLocation("https://app.example.com/inbox");
    expect(bypassSpaForBackendPath()).toBe(false);
  });

  it("triggers bypass on /login (backend takes priority over SPA login route)", async () => {
    const replace = vi.fn();
    stubLocation("https://app.example.com/login", replace);
    vi.stubGlobal("navigator", {
      serviceWorker: { getRegistrations: vi.fn().mockResolvedValue([]) },
    });
    const { bypassSpaForBackendPath } = await import("./backend-path-bypass");
    expect(bypassSpaForBackendPath()).toBe(true);
  });

  it("triggers bypass on /complete/oidc/, /workspace, /user_avatars, /legacy, /lk", async () => {
    const { bypassSpaForBackendPath } = await import("./backend-path-bypass");
    for (const path of [
      "/complete/oidc/",
      "/workspace/v1/foo",
      "/user_avatars/1.png",
      "/legacy/x",
      "/lk",
      "/lk/profile",
    ]) {
      const replace = vi.fn();
      stubLocation(`https://app.example.com${path}`, replace);
      vi.stubGlobal("navigator", {
        serviceWorker: { getRegistrations: vi.fn().mockResolvedValue([]) },
      });
      expect(bypassSpaForBackendPath(), `path=${path}`).toBe(true);
    }
  });

  it("returns false for the root path", async () => {
    const { bypassSpaForBackendPath } = await import("./backend-path-bypass");
    stubLocation("https://app.example.com/");
    expect(bypassSpaForBackendPath()).toBe(false);
  });

  it("unregisters SW and reloads on a backend path", async () => {
    const replace = vi.fn();
    stubLocation("https://app.example.com/accounts/login/google/", replace);
    const unregister = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistrations: vi.fn().mockResolvedValue([{ unregister }]),
      },
    });

    const { bypassSpaForBackendPath } = await import("./backend-path-bypass");
    expect(bypassSpaForBackendPath()).toBe(true);

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(
      "https://app.example.com/accounts/login/google/?__spa_bypass__=1",
    );
  });

  it("shows a balancer-misconfig hint when bypass already attempted", async () => {
    const replace = vi.fn();
    stubLocation("https://app.example.com/accounts/login/google/?__spa_bypass__=1", replace);

    const { bypassSpaForBackendPath } = await import("./backend-path-bypass");
    expect(bypassSpaForBackendPath()).toBe(true);
    expect(replace).not.toHaveBeenCalled();

    const root = document.getElementById("root");
    expect(root?.textContent).toContain("Balancer misconfiguration");
    expect(root?.textContent).toContain("/accounts/login/google/");
  });
});
