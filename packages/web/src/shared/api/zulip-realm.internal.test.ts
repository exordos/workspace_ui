import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendUserUploadsPathPrefix,
  normalizeRealm,
  normalizeRealmSiteOriginForUploads,
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

describe("normalizeRealmSiteOriginForUploads with VITE_WORKSPACE_REST_API_PATH", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("strips /workspace/v1 when env REST path is only /workspace", async () => {
    vi.stubEnv("VITE_WORKSPACE_API_ORIGIN", "https://zulip.test");
    vi.stubEnv("VITE_WORKSPACE_REST_API_PATH", "/workspace");
    vi.resetModules();
    const { normalizeRealmSiteOriginForUploads: strip } = await import("./zulip-realm.internal");
    expect(strip("https://sys.example.com/workspace/v1")).toBe("https://sys.example.com");
  });
});
