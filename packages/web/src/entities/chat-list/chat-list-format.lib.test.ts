import { beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "~/i18n/i18n";
import { getDmPartnerName, resolvePersonalDmSidebarTitle } from "./chat-list-format.lib";

describe("getDmPartnerName", () => {
  beforeEach(() => {
    setLocale("en");
  });

  it("returns full_name when present", () => {
    expect(getDmPartnerName({ id: 5, full_name: "  Ada  " })).toBe("Ada");
  });

  it("returns email local part when full_name empty", () => {
    expect(getDmPartnerName({ id: 5, full_name: "", email: "bob@ex.com" })).toBe("bob");
  });

  it("returns dm.partner when only user id is known", () => {
    expect(getDmPartnerName({ id: 42, full_name: "", email: "" })).toBe("Partner");
  });

  it("returns dm.privateChat when no id and no name", () => {
    expect(getDmPartnerName({ full_name: "", email: "" })).toBe("Direct message");
  });
});

describe("resolvePersonalDmSidebarTitle", () => {
  beforeEach(() => {
    setLocale("en");
  });

  it("prefers hydrated profile full_name", () => {
    expect(
      resolvePersonalDmSidebarTitle({
        chatName: "Direct message",
        userFullName: "Carol",
        storeDisplayName: "Unknown",
      }),
    ).toBe("Carol");
  });

  it("uses store display name when profile empty and store is not Unknown", () => {
    expect(
      resolvePersonalDmSidebarTitle({
        chatName: "Direct message",
        userFullName: "",
        storeDisplayName: "Dan",
      }),
    ).toBe("Dan");
  });

  it("skips generic privateChat chatName and falls back to partner", () => {
    expect(
      resolvePersonalDmSidebarTitle({
        chatName: "Direct message",
        userFullName: "",
        storeDisplayName: "Unknown",
      }),
    ).toBe("Partner");
  });

  it("keeps non-placeholder chatName when store is Unknown", () => {
    expect(
      resolvePersonalDmSidebarTitle({
        chatName: "Eve",
        userFullName: "",
        storeDisplayName: "Unknown",
      }),
    ).toBe("Eve");
  });
});
