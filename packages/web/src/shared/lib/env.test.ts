/**
 * Tests for the centralized environment variables module.
 *
 * The env module is the single access point for all VITE_* env vars.
 * It normalizes values (strips trailing slashes, provides defaults),
 * and warns in production when required vars are missing.
 * Incorrect env handling would break API connections or Jitsi integration.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Core env object shape and types
describe("env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // The env object must expose all keys that the rest of the app depends on
  it("exports an env object with expected keys", async () => {
    const { env } = await import("./env");

    expect(env).toHaveProperty("DEV");
    expect(env).toHaveProperty("PROD");
    expect(env).toHaveProperty("MODE");
    expect(env).toHaveProperty("WORKSPACE_API_ORIGIN");
    expect(env).toHaveProperty("ZULIP_API_PATH");
    expect(env).toHaveProperty("WORKSPACE_API_PATH");
    expect(env).toHaveProperty("WORKSPACE_API_BASE");
    expect(env).toHaveProperty("WORKSPACE_UPLOADS_ORIGIN");
    expect(env).toHaveProperty("JITSI_MEET_DOMAIN");
    expect(env).toHaveProperty("JITSI_MEET_BASE_URL");
    expect(env).toHaveProperty("CDN_URL");
    expect(env).toHaveProperty("BASE_URL");
    expect(env).toHaveProperty("CALENDAR_EMBED_URL");
    expect(env).toHaveProperty("MAIL_EMBED_URL");
    expect(env).toHaveProperty("CHAT_MESSAGES_PERSIST_INDEXEDDB");
    expect(env).toHaveProperty("CHAT_MESSAGES_SOURCE_INDEXEDDB");
  });

  // DEV/PROD flags drive conditional logic (e.g. log level, CSP, devtools)
  it("DEV and PROD are booleans", async () => {
    const { env } = await import("./env");
    expect(typeof env.DEV).toBe("boolean");
    expect(typeof env.PROD).toBe("boolean");
  });

  // MODE is "development", "production", or "test"
  it("MODE is a string", async () => {
    const { env } = await import("./env");
    expect(typeof env.MODE).toBe("string");
  });

  // Trailing slash in API origin would cause double-slash in URL construction
  it("WORKSPACE_API_ORIGIN is a string without trailing slash", async () => {
    const { env } = await import("./env");
    expect(typeof env.WORKSPACE_API_ORIGIN).toBe("string");
    if (env.WORKSPACE_API_ORIGIN) {
      expect(env.WORKSPACE_API_ORIGIN).not.toMatch(/\/$/);
    }
  });

  // Default API paths must match Zulip's standard — missing defaults would break API calls
  describe("default API paths (isolated from repo .env)", () => {
    beforeEach(() => {
      vi.stubEnv("VITE_WORKSPACE_API_ORIGIN", "https://zulip.test");
      vi.stubEnv("VITE_ZULIP_API_PATH", "");
      vi.stubEnv("VITE_WORKSPACE_API_PATH", "");
      vi.stubEnv("VITE_WORKSPACE_REST_API_PATH", "");
      vi.resetModules();
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it("ZULIP_API_PATH defaults to /api/v1", async () => {
      const { env } = await import("./env");
      expect(env.ZULIP_API_PATH).toBe("/api/v1");
    });

    it("WORKSPACE_API_PATH defaults to /api/v1", async () => {
      const { env } = await import("./env");
      expect(env.WORKSPACE_API_PATH).toBe("/api/v1");
    });
  });

  // When Jitsi is not configured, the base URL must be empty to disable call features
  it("JITSI_MEET_BASE_URL is empty when JITSI_MEET_DOMAIN is not set", async () => {
    const { env } = await import("./env");
    if (!env.JITSI_MEET_DOMAIN) {
      expect(env.JITSI_MEET_BASE_URL).toBe("");
    }
  });

  // Type safety: all string fields must actually be strings, not undefined or number
  it("all string fields are strings", async () => {
    const { env } = await import("./env");
    const stringKeys = [
      "MODE",
      "WORKSPACE_API_ORIGIN",
      "ZULIP_API_PATH",
      "WORKSPACE_API_PATH",
      "WORKSPACE_API_BASE",
      "WORKSPACE_UPLOADS_ORIGIN",
      "JITSI_MEET_DOMAIN",
      "JITSI_MEET_BASE_URL",
      "CDN_URL",
      "BASE_URL",
      "CALENDAR_EMBED_URL",
      "MAIL_EMBED_URL",
    ] as const;
    for (const key of stringKeys) {
      expect(typeof env[key]).toBe("string");
    }
  });
});

// Warning path: production builds should loudly report missing required env vars
describe("env required() warning path", () => {
  // Missing API origin in production is a deployment misconfiguration — must be logged
  it("logs console.error in production when required var is missing", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_WORKSPACE_API_ORIGIN", "");
    vi.resetModules();

    await import("./env");

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Missing required env var"));

    consoleSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  // Missing vars should return empty string (not undefined) so consumers can handle it
  it("returns empty string for missing required var", async () => {
    vi.stubEnv("VITE_WORKSPACE_API_ORIGIN", "");
    vi.resetModules();

    const { env } = await import("./env");
    expect(env.WORKSPACE_API_ORIGIN).toBe("");

    vi.unstubAllEnvs();
  });
});
