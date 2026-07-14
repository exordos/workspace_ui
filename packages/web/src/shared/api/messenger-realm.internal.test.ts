import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendUserUploadsPathPrefix,
  normalizeRealm,
  normalizeRealmSiteOriginForUploads,
  shouldApplyUserUploadsPathPrefixForRealmBase,
} from "./messenger-realm.internal";

describe("appendUserUploadsPathPrefix", () => {
  it("appends prefix once", () => {
    expect(appendUserUploadsPathPrefix("https://h.t", "/api/workspace/v1")).toBe(
      "https://h.t/api/workspace/v1",
    );
  });

  it("does not duplicate when site already ends with prefix", () => {
    expect(appendUserUploadsPathPrefix("https://h.t/api/workspace/v1", "/api/workspace/v1")).toBe(
      "https://h.t/api/workspace/v1",
    );
  });
});

describe("normalizeRealmSiteOriginForUploads", () => {
  it("strips /api/workspace/v1 so user_uploads resolve at site root", () => {
    expect(normalizeRealmSiteOriginForUploads("https://sys.example.com/api/workspace/v1")).toBe(
      "https://sys.example.com",
    );
  });

  it("leaves plain realm host unchanged", () => {
    expect(normalizeRealmSiteOriginForUploads("https://chat.example.com")).toBe(
      "https://chat.example.com",
    );
  });

  it("returns empty for empty input", () => {
    expect(normalizeRealmSiteOriginForUploads("")).toBe("");
    expect(normalizeRealmSiteOriginForUploads("   ")).toBe("");
  });
});

describe("normalizeRealm + uploads strip (integration)", () => {
  it("produces site root after API and workspace strip", () => {
    const apiStripped = normalizeRealm("https://sys.example.com/api/workspace/v1/messenger");
    expect(apiStripped).toBe("https://sys.example.com");
    expect(normalizeRealmSiteOriginForUploads(apiStripped)).toBe("https://sys.example.com");
  });
});

describe("normalizeRealmSiteOriginForUploads with fixed WORKSPACE_REST_API_PATH", () => {
  it("strips the canonical /api/workspace/v1 mount", () => {
    expect(normalizeRealmSiteOriginForUploads("https://sys.example.com/api/workspace/v1")).toBe(
      "https://sys.example.com",
    );
  });
});

describe("shouldApplyUserUploadsPathPrefixForRealmBase", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is false for bare organization realm when gateway tail was not stripped", () => {
    expect(
      shouldApplyUserUploadsPathPrefixForRealmBase(
        "https://messenger.genesis-core.team",
        "https://messenger.genesis-core.team",
      ),
    ).toBe(false);
  });

  it("is false for bare organization realm when prefix set but gateway tail was not stripped", async () => {
    vi.stubEnv("VITE_WORKSPACE_API_ORIGIN", "https://messenger.test");
    vi.stubEnv("VITE_USER_UPLOADS_PATH_PREFIX", "/api/workspace/v1");
    vi.stubEnv("VITE_USER_UPLOADS_PREFIX_ON_REALM", "");
    vi.resetModules();
    const { shouldApplyUserUploadsPathPrefixForRealmBase: should } =
      await import("./messenger-realm.internal");
    expect(
      should("https://messenger.genesis-core.team", "https://messenger.genesis-core.team"),
    ).toBe(false);
  });

  it("is true when realm had gateway path stripped to site root", async () => {
    vi.stubEnv("VITE_WORKSPACE_API_ORIGIN", "https://messenger.test");
    vi.stubEnv("VITE_USER_UPLOADS_PATH_PREFIX", "/api/workspace/v1");
    vi.resetModules();
    const { shouldApplyUserUploadsPathPrefixForRealmBase: should } =
      await import("./messenger-realm.internal");
    expect(should("https://gw.example.com/api/workspace/v1", "https://gw.example.com")).toBe(true);
  });

  it("is true for bare realm when VITE_USER_UPLOADS_PREFIX_ON_REALM is true", async () => {
    vi.stubEnv("VITE_USER_UPLOADS_PREFIX_ON_REALM", "true");
    vi.resetModules();
    const { shouldApplyUserUploadsPathPrefixForRealmBase: should } =
      await import("./messenger-realm.internal");
    expect(
      should("https://messenger.genesis-core.team", "https://messenger.genesis-core.team"),
    ).toBe(true);
  });
});
