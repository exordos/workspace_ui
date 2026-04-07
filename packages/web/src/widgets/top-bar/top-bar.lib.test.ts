import { describe, expect, it } from "vitest";
import { getSectionFromPathname } from "./top-bar.lib";

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
