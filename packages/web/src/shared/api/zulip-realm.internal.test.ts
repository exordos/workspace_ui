import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendUserUploadsPathPrefix,
  normalizeRealm,
  normalizeRealmSiteOriginForUploads,
  shouldApplyUserUploadsPathPrefixForRealmBase,
} from "./zulip-realm.internal";

describe("appendUserUploadsPathPrefix", () => {
  it("appends prefix once", () => {
    expect(appendUserUploadsPathPrefix("https://h.t", "/workspace/v1")).toBe(
      "https://h.t/workspace/v1",
    );
  });

  it("does not duplicate when site already ends with prefix", () => {
    expect(appendUserUploadsPathPrefix("https://h.t/workspace/v1", "/workspace/v1")).toBe(
      "https://h.t/workspace/v1",
    );
  });
});

describe("normalizeRealmSiteOriginForUploads", () => {
  it("strips /workspace/v1 so user_uploads resolve at site root", () => {
    expect(normalizeRealmSiteOriginForUploads("https://sys.example.com/workspace/v1")).toBe(
      "https://sys.example.com",
    );
  });

  it("strips /workspace when not using /v1 suffix", () => {
    expect(normalizeRealmSiteOriginForUploads("https://sys.example.com/workspace")).toBe(
      "https://sys.example.com",
    );
  });

  it("leaves plain realm host unchanged", () => {
    expect(normalizeRealmSiteOriginForUploads("https://zulip.example.com")).toBe(
      "https://zulip.example.com",
    );
  });

  it("returns empty for empty input", () => {
    expect(normalizeRealmSiteOriginForUploads("")).toBe("");
    expect(normalizeRealmSiteOriginForUploads("   ")).toBe("");
  });
});

describe("normalizeRealm + uploads strip (integration)", () => {
  it("produces site root after API and workspace strip", () => {
    const apiStripped = normalizeRealm("https://sys.example.com/workspace/v1/api/v1");
    expect(apiStripped).toBe("https://sys.example.com/workspace/v1");
    expect(normalizeRealmSiteOriginForUploads(apiStripped)).toBe("https://sys.example.com");
  });
});

describe("normalizeRealmSiteOriginForUploads with fixed WORKSPACE_REST_API_PATH", () => {
  it("strips /workspace/v1 when REST mount is /workspace", () => {
    expect(normalizeRealmSiteOriginForUploads("https://sys.example.com/workspace/v1")).toBe(
      "https://sys.example.com",
    );
  });
});

describe("shouldApplyUserUploadsPathPrefixForRealmBase", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is false for bare Zulip realm when gateway tail was not stripped", () => {
    expect(
      shouldApplyUserUploadsPathPrefixForRealmBase(
        "https://zulip.genesis-core.team",
        "https://zulip.genesis-core.team",
      ),
    ).toBe(false);
  });

  it("is false for bare Zulip realm when prefix set but gateway tail was not stripped", async () => {
    vi.stubEnv("VITE_WORKSPACE_API_ORIGIN", "https://zulip.test");
    vi.stubEnv("VITE_USER_UPLOADS_PATH_PREFIX", "/workspace/v1");
    vi.stubEnv("VITE_USER_UPLOADS_PREFIX_ON_ZULIP_REALM", "");
    vi.resetModules();
    const { shouldApplyUserUploadsPathPrefixForRealmBase: should } =
      await import("./zulip-realm.internal");
    expect(should("https://zulip.genesis-core.team", "https://zulip.genesis-core.team")).toBe(
      false,
    );
  });

  it("is true when realm had gateway path stripped to site root", async () => {
    vi.stubEnv("VITE_WORKSPACE_API_ORIGIN", "https://zulip.test");
    vi.stubEnv("VITE_USER_UPLOADS_PATH_PREFIX", "/workspace/v1");
    vi.resetModules();
    const { shouldApplyUserUploadsPathPrefixForRealmBase: should } =
      await import("./zulip-realm.internal");
    expect(should("https://gw.example.com/workspace/v1", "https://gw.example.com")).toBe(true);
  });

  it("is true for bare realm when VITE_USER_UPLOADS_PREFIX_ON_ZULIP_REALM is true", async () => {
    vi.stubEnv("VITE_USER_UPLOADS_PREFIX_ON_ZULIP_REALM", "true");
    vi.resetModules();
    const { shouldApplyUserUploadsPathPrefixForRealmBase: should } =
      await import("./zulip-realm.internal");
    expect(should("https://zulip.genesis-core.team", "https://zulip.genesis-core.team")).toBe(true);
  });
});
