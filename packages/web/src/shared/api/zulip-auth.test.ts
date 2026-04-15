/**
 * Tests for Zulip API (zulip-auth module).
 */
import "./zulip.test.setup";
import { describe, expect, it } from "vitest";
import { exchangeDesktopFlowToken, fetchApiKey, fetchServerSettings } from "./zulip-auth";
import { jsonResponse, mockFetch } from "./zulip.test.setup";
import { ZulipAuthError } from "./zulip.types";

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

    const result = await fetchServerSettings("https://zulip.example.com");
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
    const result = await fetchServerSettings("https://zulip.example.com");
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await fetchServerSettings("https://zulip.example.com");
    expect(result).toBeNull();
  });

  it("returns null for empty realm URL", async () => {
    const result = await fetchServerSettings("  ");
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("defaults missing fields to empty strings/arrays", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}));
    const result = await fetchServerSettings("https://zulip.example.com");
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
        realm_url: "https://canonical.zulip.example.com",
        realm_name: "Org",
      }),
    );
    const result = await fetchServerSettings("https://gw.example.com");
    expect(result?.realm_url).toBe("https://canonical.zulip.example.com");
    expect(result?.realm_uri).toBe("https://canonical.zulip.example.com");
  });

  it("prefers realm_url over realm_uri when both present", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        realm_url: "https://preferred.example.com",
        realm_uri: "https://legacy.example.com",
      }),
    );
    const result = await fetchServerSettings("https://zulip.example.com");
    expect(result?.realm_url).toBe("https://preferred.example.com");
  });

  it("strips /api/v1 suffix before constructing URL", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}));
    await fetchServerSettings("https://zulip.example.com/api/v1");
    expect(mockFetch).toHaveBeenCalledWith("https://zulip.example.com/api/v1/server_settings");
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

    const result = await fetchApiKey("https://zulip.example.com", "user@test.com", "password");
    expect(result).toEqual({ api_key: "abc123", email: "user@test.com", user_id: 42 });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://zulip.example.com/api/v1/fetch_api_key",
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

  it("throws ZulipAuthError on auth failure", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ result: "error", msg: "Invalid credentials", code: "AUTH_FAILED" }, 403),
    );
    await expect(fetchApiKey("https://z.com", "u@t.com", "bad")).rejects.toThrow(ZulipAuthError);
  });

  it("throws ZulipAuthError on network error", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fetchApiKey("https://z.com", "u@t.com", "pw")).rejects.toThrow(ZulipAuthError);
  });

  it("throws ZulipAuthError on invalid JSON response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
      headers: new Headers(),
    } as unknown as Response);

    await expect(fetchApiKey("https://z.com", "u@t.com", "pw")).rejects.toThrow(ZulipAuthError);
  });
});

// ---------------------------------------------------------------------------
// exchangeDesktopFlowToken — token-based external auth continuation
// ---------------------------------------------------------------------------

describe("exchangeDesktopFlowToken", () => {
  it("returns api_key auth payload when backend provides credentials", async () => {
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
      "https://zulip.example.com",
      "desktop-login-token",
    );

    expect(result).toEqual({
      authType: "api_key",
      email: "user@example.com",
      apiKey: "k123456",
    });
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "https://zulip.example.com/accounts/login/subdomain/desktop-login-token",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
  });

  it("falls back to session auth when exchange succeeds without api key payload", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ result: "success" })).mockResolvedValueOnce(
      jsonResponse({
        email: "session-user@example.com",
      }),
    );

    const result = await exchangeDesktopFlowToken("https://zulip.example.com", "session-token");

    expect(result).toEqual({
      authType: "session",
      email: "session-user@example.com",
    });
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "https://zulip.example.com/json/users/me",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
  });

  it("throws ZulipAuthError when exchange endpoint fails", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ result: "error", msg: "invalid token" }, 400));

    await expect(
      exchangeDesktopFlowToken("https://zulip.example.com", "broken-token"),
    ).rejects.toThrow(ZulipAuthError);
  });
});

// ---------------------------------------------------------------------------
// registerQueue — authenticated POST via shared client
// ---------------------------------------------------------------------------
