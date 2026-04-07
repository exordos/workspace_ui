import { afterEach, describe, expect, it } from "vitest";
import {
  buildOrgRouteIdFromRealm,
  extractOrgRouteFromPathname,
  isOrgRoutePublicPath,
  replaceOrgRouteInPath,
  setCurrentOrgRouteIdResolver,
  withCurrentOrgRoute,
  withOrgRoutePrefix,
} from "./org-route";

afterEach(() => {
  window.history.replaceState({}, "", "/");
  setCurrentOrgRouteIdResolver(null);
});

describe("org-route", () => {
  it("builds stable org route id from realm host", () => {
    expect(buildOrgRouteIdFromRealm("https://chat.example.com")).toBe("chat.example.com");
  });

  it("includes port in org route id when present", () => {
    expect(buildOrgRouteIdFromRealm("https://localhost:9991")).toBe("localhost-9991");
  });

  it("extracts org route id and scoped pathname", () => {
    expect(extractOrgRouteFromPathname("/org/chat.example.com/stream/10-general")).toEqual({
      orgId: "chat.example.com",
      scopedPathname: "/stream/10-general",
    });
  });

  it("returns scoped root when pathname has only org prefix", () => {
    expect(extractOrgRouteFromPathname("/org/chat.example.com")).toEqual({
      orgId: "chat.example.com",
      scopedPathname: "/",
    });
  });

  it("does not throw for malformed encoded org ids", () => {
    expect(extractOrgRouteFromPathname("/org/%E0%A4%A/stream/10-general")).toEqual({
      orgId: "%E0%A4%A",
      scopedPathname: "/stream/10-general",
    });
  });

  it("prefixes path with org route id and keeps query/hash", () => {
    expect(withOrgRoutePrefix("/dm/42?msg=17#x", "chat.example.com")).toBe(
      "/org/chat.example.com/dm/42?msg=17#x",
    );
  });

  it("replaces existing org route id in path", () => {
    expect(
      replaceOrgRouteInPath("/org/a.example.com/stream/10-general?msg=3", "b.example.com"),
    ).toBe("/org/b.example.com/stream/10-general?msg=3");
  });

  it("detects login and paste-token as public routes", () => {
    expect(isOrgRoutePublicPath("/login")).toBe(true);
    expect(isOrgRoutePublicPath("/paste-token")).toBe(true);
    expect(isOrgRoutePublicPath("/stream/10-general")).toBe(false);
  });

  it("uses configured current org resolver when available", () => {
    setCurrentOrgRouteIdResolver(() => "chat.example.com");
    expect(withCurrentOrgRoute("/stream/10-general")).toBe(
      "/org/chat.example.com/stream/10-general",
    );
  });
});
