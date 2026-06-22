/**
 * Tests for Messenger gateway server discovery.
 */
import "./messenger.test.setup";
import { describe, expect, it } from "vitest";

import { fetchServerSettings } from "./messenger-auth";
import { jsonResponse, mockFetch } from "./messenger.test.setup";

describe("fetchServerSettings", () => {
  it("returns settings on success", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        realm_name: "Test Realm",
        realm_icon: "/icon.png",
      }),
    );

    const result = await fetchServerSettings("https://chat.example.com");
    expect(result).toEqual({
      realm_name: "Test Realm",
      realm_icon: "/icon.png",
      realm_uri: "",
      realm_url: "",
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://chat.example.com/api/messenger/v1/server_settings",
      undefined,
    );
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

  it("defaults missing fields to empty strings", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}));
    const result = await fetchServerSettings("https://chat.example.com");
    expect(result).toEqual({
      realm_name: "",
      realm_icon: "",
      realm_uri: "",
      realm_url: "",
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

  it("skips request for malformed realm hostname ending with dot", async () => {
    const result = await fetchServerSettings("https://chat.example.com.");
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
