/**
 * Tests for Messenger API (messenger-auth module).
 */
import "./messenger.test.setup";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ElectronAPI = NonNullable<Window["electronAPI"]>;
type ElectronAuthExchange = NonNullable<ElectronAPI["auth"]>["exchangeDesktopFlowToken"];

const electronMocks = vi.hoisted(() => ({
  isElectron: vi.fn<() => boolean>(() => false),
  getElectronAPI: vi.fn<() => Window["electronAPI"] | null>(() => null),
}));

vi.mock("~/shared/lib/electron", () => ({
  isElectron: electronMocks.isElectron,
  getElectronAPI: electronMocks.getElectronAPI,
}));

import { exchangeDesktopFlowToken, fetchApiKey, fetchServerSettings } from "./messenger-auth";
import { getCachedSessionCsrfToken } from "./messenger-session-csrf.internal";
import { jsonResponse, mockFetch } from "./messenger.test.setup";
import { MessengerAuthError } from "./messenger.types";

function mockElectronAuthBridge(
  exchangeDesktopFlowToken: ElectronAuthExchange = vi.fn(),
): ElectronAuthExchange {
  electronMocks.isElectron.mockReturnValue(true);
  electronMocks.getElectronAPI.mockReturnValue({
    auth: { exchangeDesktopFlowToken },
  } as ElectronAPI);

  return exchangeDesktopFlowToken;
}

beforeEach(() => {
  electronMocks.isElectron.mockReset();
  electronMocks.isElectron.mockReturnValue(false);
  electronMocks.getElectronAPI.mockReset();
  electronMocks.getElectronAPI.mockReturnValue(null);
});

describe("fetchServerSettings", () => {
  it("returns settings on success", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        realm_name: "Test Realm",
        realm_icon: "/icon.png",
        external_authentication_methods: [
          { name: "google", display_name: "Google", login_url: "/google" },
        ],
      }),
    );

    const result = await fetchServerSettings("https://chat.example.com");
    expect(result).toEqual({
      realm_name: "Test Realm",
      realm_icon: "/icon.png",
      realm_uri: "",
      realm_url: "",
      external_authentication_methods: [
        { name: "google", display_name: "Google", login_url: "/google" },
      ],
    });
  });

  it("returns null on non-ok response", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 403));
    const result = await fetchServerSettings("https://chat.example.com");
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await fetchServerSettings("https://chat.example.com");
    expect(result).toBeNull();
  });

  it("returns null for empty realm URL", async () => {
    const result = await fetchServerSettings("  ");
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("defaults missing fields to empty strings/arrays", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}));
    const result = await fetchServerSettings("https://chat.example.com");
    expect(result).toEqual({
      realm_name: "",
      realm_icon: "",
      realm_uri: "",
      realm_url: "",
      external_authentication_methods: [],
    });
  });

  it("returns realm_url when present", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        realm_url: "https://canonical.chat.example.com",
        realm_name: "Org",
      }),
    );
    const result = await fetchServerSettings("https://gw.example.com");
    expect(result?.realm_url).toBe("https://canonical.chat.example.com");
    expect(result?.realm_uri).toBe("https://canonical.chat.example.com");
  });

  it("prefers realm_url over realm_uri when both present", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        realm_url: "https://preferred.example.com",
        realm_uri: "https://legacy.example.com",
      }),
    );
    const result = await fetchServerSettings("https://chat.example.com");
    expect(result?.realm_url).toBe("https://preferred.example.com");
  });

  it("strips /api/messenger/v1 suffix before constructing URL", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}));
    await fetchServerSettings("http://workspace.exordos.local/api/messenger/v1");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://workspace.exordos.local/api/messenger/v1/server_settings",
      undefined,
    );
  });

  it("strips /api/v1 suffix before constructing URL", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}));
    await fetchServerSettings("https://chat.example.com/api/v1");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://chat.example.com/api/messenger/v1/server_settings",
      undefined,
    );
  });

  it("skips request for malformed realm hostname ending with dot", async () => {
    const result = await fetchServerSettings("https://chat.example.com.");
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// fetchApiKey — unauthenticated POST
// ---------------------------------------------------------------------------

describe("fetchApiKey", () => {
  it("returns api_key on success", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ result: "success", api_key: "abc123", email: "user@test.com", user_id: 42 }),
    );

    const result = await fetchApiKey("https://chat.example.com", "user@test.com", "password");
    expect(result).toEqual({ api_key: "abc123", email: "user@test.com", user_id: 42 });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://chat.example.com/api/v1/fetch_api_key",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("defaults user_id to 0 when missing", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ result: "success", api_key: "abc", email: "u@t.com" }),
    );
    const result = await fetchApiKey("https://z.com", "u@t.com", "pw");
    expect(result.user_id).toBe(0);
  });

  it("throws MessengerAuthError on auth failure", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ result: "error", msg: "Invalid credentials", code: "AUTH_FAILED" }, 403),
    );
    await expect(fetchApiKey("https://z.com", "u@t.com", "bad")).rejects.toThrow(
      MessengerAuthError,
    );
  });

  it("throws MessengerAuthError on network error", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fetchApiKey("https://z.com", "u@t.com", "pw")).rejects.toThrow(MessengerAuthError);
  });

  it("throws MessengerAuthError on invalid JSON response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
      headers: new Headers(),
    });

    await expect(fetchApiKey("https://z.com", "u@t.com", "pw")).rejects.toThrow(MessengerAuthError);
  });
});

// ---------------------------------------------------------------------------
// exchangeDesktopFlowToken — token-based external auth continuation
// ---------------------------------------------------------------------------

describe("exchangeDesktopFlowToken", () => {
  it("returns api_key auth payload when backend provides credentials", async () => {
    // The backend can return api_key right away, so session fallback is not needed.
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          result: "success",
          email: "user@example.com",
          api_key: "k123456",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          email: "user@example.com",
        }),
      );

    const result = await exchangeDesktopFlowToken(
      "https://chat.example.com",
      "desktop-login-token",
    );

    expect(result).toEqual({
      authType: "api_key",
      email: "user@example.com",
      apiKey: "k123456",
    });
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "https://chat.example.com/accounts/login/subdomain/desktop-login-token",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
  });

  it("falls back to session auth when exchange succeeds without api key payload", async () => {
    // If the response has no api_key, check the cookie session with /json/users/me.
    mockFetch.mockResolvedValueOnce(jsonResponse({ result: "success" })).mockResolvedValueOnce(
      jsonResponse({
        email: "session-user@example.com",
      }),
    );

    const result = await exchangeDesktopFlowToken("https://chat.example.com", "session-token");

    expect(result).toEqual({
      authType: "session",
      email: "session-user@example.com",
    });
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "https://chat.example.com/json/users/me",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
  });

  it("caches csrf token after renderer session auth exchange", async () => {
    document.cookie = "csrftoken=oidc-csrf-token";
    mockFetch.mockResolvedValueOnce(jsonResponse({ result: "success" })).mockResolvedValueOnce(
      jsonResponse({
        email: "session-user@example.com",
      }),
    );

    await exchangeDesktopFlowToken("https://chat.example.com", "session-token");

    expect(getCachedSessionCsrfToken("https://chat.example.com")).toBe("oidc-csrf-token");
    document.cookie = "csrftoken=; Max-Age=0";
  });

  it("throws MessengerAuthError when session verification fails", async () => {
    // Session auth must not be saved if the server did not confirm the current user.
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ result: "success" }))
      .mockResolvedValueOnce(jsonResponse({ msg: "Not logged in" }, 401));

    await expect(
      exchangeDesktopFlowToken("https://chat.example.com", "session-code-123"),
    ).rejects.toThrow(MessengerAuthError);
  });

  it("delegates to Electron auth bridge when running in desktop shell", async () => {
    // In Electron, the renderer must not touch cookies, so check that it uses the preload bridge.
    const bridgeExchange = mockElectronAuthBridge(
      vi.fn().mockResolvedValue({
        ok: true,
        data: {
          authType: "session",
          email: "session-user@example.com",
        },
      }),
    );
    const desktopFlowCode = "desktop-flow-code-123";

    const result = await exchangeDesktopFlowToken("https://chat.example.com", desktopFlowCode);

    expect(result).toEqual({
      authType: "session",
      email: "session-user@example.com",
    });
    expect(bridgeExchange).toHaveBeenCalledWith({
      realm: "https://chat.example.com",
      token: desktopFlowCode,
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws MessengerAuthError when Electron auth bridge returns failure", async () => {
    // The main process classifies the error; the renderer keeps the code and does not fall back to fetch.
    mockElectronAuthBridge(
      vi.fn().mockResolvedValue({
        ok: false,
        reason: "DESKTOP_FLOW_SESSION_FAILED",
        status: 401,
      }),
    );

    await expect(
      exchangeDesktopFlowToken("https://chat.example.com", "desktop-flow-code-123"),
    ).rejects.toMatchObject({
      code: "DESKTOP_FLOW_SESSION_FAILED",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws MessengerAuthError when exchange endpoint fails", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ result: "error", msg: "invalid token" }, 400));

    await expect(
      exchangeDesktopFlowToken("https://chat.example.com", "broken-token"),
    ).rejects.toThrow(MessengerAuthError);
  });
});

// ---------------------------------------------------------------------------
// registerQueue — authenticated POST via shared client
// ---------------------------------------------------------------------------
