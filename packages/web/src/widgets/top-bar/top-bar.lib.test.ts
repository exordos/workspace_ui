import { describe, expect, it } from "vitest";
import { getSectionFromPathname, getTopBarSectionNavItems, resolveTopBarActiveSection } from "./top-bar.lib";
import type { TopBarSection } from "./top-bar.types";

describe("getSectionFromPathname", () => {
  it("resolves chat section for chat routes", () => {
    expect(getSectionFromPathname("/stream/general")).toBe("chat");
    expect(getSectionFromPathname("/org/acme/dm/12")).toBe("chat");
  });

  it("resolves top-level utility sections", () => {
    expect(getSectionFromPathname("/calendar")).toBe("calendar");
    expect(getSectionFromPathname("/mail")).toBe("mail");
    expect(getSectionFromPathname("/calls")).toBe("calls");
    expect(getSectionFromPathname("/services")).toBe("services");
    expect(getSectionFromPathname("/all-services")).toBe("services");
  });

  it("supports org-scoped services routes", () => {
    expect(getSectionFromPathname("/org/acme/services")).toBe("services");
    expect(getSectionFromPathname("/org/acme/all-services")).toBe("services");
  });
});

describe("getTopBarSectionNavItems", () => {
  it("omits calls and services when both flags are off", () => {
    const items = getTopBarSectionNavItems({ showCallsNav: false, showServicesNav: false });
    expect(items.map((i) => i.id)).toEqual(["chat", "calendar", "mail"]);
  });

  it("includes only calls when showCallsNav is on", () => {
    const items = getTopBarSectionNavItems({ showCallsNav: true, showServicesNav: false });
    expect(items.map((i) => i.id)).toEqual(["chat", "calendar", "mail", "calls"]);
  });

  it("includes only services when showServicesNav is on", () => {
    const items = getTopBarSectionNavItems({ showCallsNav: false, showServicesNav: true });
    expect(items.map((i) => i.id)).toEqual(["chat", "calendar", "mail", "services"]);
  });

  it("includes calls and services when both flags are on", () => {
    const items = getTopBarSectionNavItems({ showCallsNav: true, showServicesNav: true });
    expect(items.map((i) => i.id)).toEqual(["chat", "calendar", "mail", "calls", "services"]);
  });
});

describe("resolveTopBarActiveSection", () => {
  it("keeps pathname section when it is visible in the nav", () => {
    const visible = new Set<TopBarSection>(["chat", "calls"]);
    expect(resolveTopBarActiveSection("calls", visible)).toBe("calls");
  });

  it("falls back to chat when pathname section is hidden", () => {
    const visible = new Set<TopBarSection>(["chat", "calendar", "mail"]);
    expect(resolveTopBarActiveSection("calls", visible)).toBe("chat");
    expect(resolveTopBarActiveSection("services", visible)).toBe("chat");
  });
});
