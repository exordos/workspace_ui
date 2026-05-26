import { describe, expect, it } from "vitest";
import {
  backendBypassDevProxyPrefixes,
  backendBypassNavigateFallbackDenylist,
  zulipApiDevProxyPrefix,
} from "./backend-bypass-paths";

describe("backendBypassNavigateFallbackDenylist", () => {
  it("excludes /accounts and /api from SPA navigate fallback", () => {
    const denylist = backendBypassNavigateFallbackDenylist();
    expect(denylist.some((re) => re.test("/accounts/login/google/"))).toBe(true);
    expect(denylist.some((re) => re.test("/api/v1/server_settings"))).toBe(true);
    expect(denylist.some((re) => re.test("/json/messages"))).toBe(true);
  });

  it("does not exclude SPA routes (inbox, feed, activity)", () => {
    const denylist = backendBypassNavigateFallbackDenylist();
    expect(denylist.some((re) => re.test("/inbox"))).toBe(false);
    expect(denylist.some((re) => re.test("/feed"))).toBe(false);
    expect(denylist.some((re) => re.test("/activity/starred"))).toBe(false);
  });

  it("covers user_uploads, user_avatars, avatar, thumbnail, external_content", () => {
    const denylist = backendBypassNavigateFallbackDenylist();
    expect(denylist.some((re) => re.test("/user_uploads/1/abc.png"))).toBe(true);
    expect(denylist.some((re) => re.test("/user_avatars/42.png"))).toBe(true);
    expect(denylist.some((re) => re.test("/avatar/42"))).toBe(true);
    expect(denylist.some((re) => re.test("/thumbnail/abc"))).toBe(true);
    expect(denylist.some((re) => re.test("/external_content/img"))).toBe(true);
  });

  it("covers /complete/oidc/, /login, /workspace, /legacy, /lk", () => {
    const denylist = backendBypassNavigateFallbackDenylist();
    expect(denylist.some((re) => re.test("/complete/oidc/"))).toBe(true);
    expect(denylist.some((re) => re.test("/login"))).toBe(true);
    expect(denylist.some((re) => re.test("/workspace/v1/foo"))).toBe(true);
    expect(denylist.some((re) => re.test("/legacy/anything"))).toBe(true);
    expect(denylist.some((re) => re.test("/lk"))).toBe(true);
    expect(denylist.some((re) => re.test("/lk/profile"))).toBe(true);
  });
});

describe("zulipApiDevProxyPrefix", () => {
  it("returns first segment of configured Zulip API path", () => {
    expect(zulipApiDevProxyPrefix("/api/v1")).toBe("/api");
    expect(zulipApiDevProxyPrefix("/custom/zulip/v1")).toBe("/custom");
  });
});

describe("backendBypassDevProxyPrefixes", () => {
  it("includes accounts, json, avatar, login and the zulip api prefix", () => {
    const prefixes = backendBypassDevProxyPrefixes("/api/v1");
    expect(prefixes).toContain("/accounts");
    expect(prefixes).toContain("/api");
    expect(prefixes).toContain("/json");
    expect(prefixes).toContain("/avatar");
    expect(prefixes).toContain("/user_avatars");
    expect(prefixes).toContain("/legacy");
    expect(prefixes).toContain("/complete");
    expect(prefixes).toContain("/login");
  });

  it("excludes prefixes that have dedicated proxy entries in vite.config.ts", () => {
    const prefixes = backendBypassDevProxyPrefixes("/api/v1");
    expect(prefixes).not.toContain("/workspace");
    expect(prefixes).not.toContain("/user_uploads");
    expect(prefixes).not.toContain("/external_content");
  });

  it("returns deduplicated prefixes", () => {
    const prefixes = backendBypassDevProxyPrefixes("/api/v1");
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});
