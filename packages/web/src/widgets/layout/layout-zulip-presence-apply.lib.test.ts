import { describe, expect, it } from "vitest";
import type { RealmPresenceResponse } from "~/shared/api/zulip.types";
import { applyRealmPresenceResponseToUsers } from "./layout-zulip-presence-apply.lib";

describe("applyRealmPresenceResponseToUsers", () => {
  it("does not throw on error result", () => {
    const data: RealmPresenceResponse = { result: "error" };
    expect(() => applyRealmPresenceResponseToUsers(data)).not.toThrow();
  });

  it("does not throw when presences missing", () => {
    const data: RealmPresenceResponse = { result: "success" };
    expect(() => applyRealmPresenceResponseToUsers(data)).not.toThrow();
  });
});
