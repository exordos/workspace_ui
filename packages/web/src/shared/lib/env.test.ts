/**
 * Tests for the centralized environment variables module.
 *
 * The env module is the single access point for all VITE_* env vars.
 * It normalizes values (strips trailing slashes, provides defaults),
 * `VITE_WORKSPACE_API_ORIGIN` is optional (empty string when unset).
 * Incorrect env handling would break API connections or Jitsi integration.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WORKSPACE_API_PATH,
  WORKSPACE_GATEWAY_V1_PATH,
  WORKSPACE_REST_API_PATH,
  ZULIP_API_PATH,
} from "~/shared/config/workspace-api-layout";

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
    expect(env).toHaveProperty("WORKSPACE_REST_API_PATH");
    expect(env).toHaveProperty("USER_UPLOADS_PATH_PREFIX");
    expect(env).toHaveProperty("USER_UPLOADS_PREFIX_ON_ZULIP_REALM");
    expect(env).toHaveProperty("WORKSPACE_API_BASE");
    expect(env).toHaveProperty("WORKSPACE_UPLOADS_ORIGIN");
    expect(env).toHaveProperty("JITSI_MEET_DOMAIN");
    expect(env).toHaveProperty("JITSI_MEET_BASE_URL");
    expect(env).toHaveProperty("CDN_URL");
    expect(env).toHaveProperty("BASE_URL");
    expect(env).toHaveProperty("CALENDAR_EMBED_URL");
    expect(env).toHaveProperty("MAIL_EMBED_URL");
    expect(env).toHaveProperty("CHAT_MESSAGES_PERSIST_INDEXEDDB");
    expect(env).toHaveProperty("METADATA_CHAT_BOOTSTRAP_ENABLED");
    expect(env).toHaveProperty("METADATA_DM_BACKFILL_ENABLED");
    expect(env).toHaveProperty("MESSAGE_FLOW_DEBUG");
    expect(env).toHaveProperty("CHAT_LIST_FLOW_DEBUG");
    expect(env).toHaveProperty("TOP_BAR_CALLS_NAV");
    expect(env).toHaveProperty("TOP_BAR_SERVICES_NAV");
  });

  // DEV/PROD flags drive conditional logic (e.g. log level, CSP, devtools)
  it("DEV and PROD are booleans", async () => {
    const { env } = await import("./env");
    expect(typeof env.DEV).toBe("boolean");
    expect(typeof env.PROD).toBe("boolean");
    expect(typeof env.METADATA_CHAT_BOOTSTRAP_ENABLED).toBe("boolean");
    expect(typeof env.METADATA_DM_BACKFILL_ENABLED).toBe("boolean");
    expect(typeof env.USER_UPLOADS_PREFIX_ON_ZULIP_REALM).toBe("boolean");
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

  describe("fixed API paths (not from VITE_*)", () => {
    it("re-exports layout constants", async () => {
      const { env } = await import("./env");
      expect(env.ZULIP_API_PATH).toBe(ZULIP_API_PATH);
      expect(env.WORKSPACE_API_PATH).toBe(WORKSPACE_API_PATH);
      expect(env.WORKSPACE_REST_API_PATH).toBe(WORKSPACE_REST_API_PATH);
      expect(env.USER_UPLOADS_PATH_PREFIX).toBe(WORKSPACE_GATEWAY_V1_PATH);
    });

    it("ignores legacy VITE_ZULIP_API_PATH / VITE_WORKSPACE_API_PATH", async () => {
      vi.stubEnv("VITE_ZULIP_API_PATH", "/custom");
      vi.stubEnv("VITE_WORKSPACE_API_PATH", "/custom");
      vi.resetModules();
      const { env } = await import("./env");
      expect(env.ZULIP_API_PATH).toBe("/api/v1");
      expect(env.WORKSPACE_API_PATH).toBe("/workspace/v1");
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
      "WORKSPACE_REST_API_PATH",
      "USER_UPLOADS_PATH_PREFIX",
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

  it("TOP_BAR_CALLS_NAV and TOP_BAR_SERVICES_NAV respect their VITE_* vars independently", async () => {
    vi.stubEnv("VITE_WORKSPACE_API_ORIGIN", "https://zulip.test");
    vi.resetModules();
    const { env: envDefault } = await import("./env");
    expect(envDefault.TOP_BAR_CALLS_NAV).toBe(false);
    expect(envDefault.TOP_BAR_SERVICES_NAV).toBe(false);

    vi.stubEnv("VITE_TOP_BAR_CALLS_NAV", "true");
    vi.resetModules();
    const { env: envCalls } = await import("./env");
    expect(envCalls.TOP_BAR_CALLS_NAV).toBe(true);
    expect(envCalls.TOP_BAR_SERVICES_NAV).toBe(false);

    vi.stubEnv("VITE_TOP_BAR_SERVICES_NAV", "1");
    vi.resetModules();
    const { env: envBoth } = await import("./env");
    expect(envBoth.TOP_BAR_CALLS_NAV).toBe(true);
    expect(envBoth.TOP_BAR_SERVICES_NAV).toBe(true);
  });
});

describe("VITE_WORKSPACE_API_ORIGIN optional", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns empty string when unset", async () => {
    vi.stubEnv("VITE_WORKSPACE_API_ORIGIN", "");
    vi.resetModules();
    const { env } = await import("./env");
    expect(env.WORKSPACE_API_ORIGIN).toBe("");
    expect(env.WORKSPACE_UPLOADS_ORIGIN).toBe("");
  });
});
