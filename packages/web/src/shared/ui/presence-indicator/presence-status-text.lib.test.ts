import { describe, expect, it } from "vitest";
import { resolvePresenceStatusTextClass } from "./presence-status-text.lib";

describe("resolvePresenceStatusTextClass", () => {
  it("maps online to call-green (Figma #26c038)", () => {
    expect(resolvePresenceStatusTextClass("active")).toBe("text-call-green");
  });

  it("maps away to indicator-orange", () => {
    expect(resolvePresenceStatusTextClass("idle")).toBe("text-indicator-orange");
  });

  it("maps do-not-disturb to call-red", () => {
    expect(resolvePresenceStatusTextClass("do_not_disturb")).toBe("text-call-red");
  });

  it("maps offline and null to muted text", () => {
    expect(resolvePresenceStatusTextClass("offline")).toBe("text-text-muted");
    expect(resolvePresenceStatusTextClass(null)).toBe("text-text-muted");
    expect(resolvePresenceStatusTextClass(undefined)).toBe("text-text-muted");
  });
});
