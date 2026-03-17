import { describe, expect, it } from "vitest";
import { dmConversationKey } from "./dm-key";

describe("dmConversationKey", () => {
  it("builds a one-to-one key including the current user when the payload only contains the partner", () => {
    expect(dmConversationKey([{ id: 42 }], 7)).toBe("7,42");
  });

  it("keeps a self-DM key as a single user id", () => {
    expect(dmConversationKey([{ id: 7 }], 7)).toBe("7");
  });
});

describe("dmRouteKey", () => {
  it("builds a one-to-one route key including the current user", async () => {
    const { dmRouteKey } = await import("./dm-key");
    expect(dmRouteKey([42], 7)).toBe("7,42");
  });

  it("includes the current user for group-DM route keys", async () => {
    const { dmRouteKey } = await import("./dm-key");
    expect(dmRouteKey([42, 51], 7)).toBe("7,42,51");
  });

  it("does not duplicate the current user for self-DM routes", async () => {
    const { dmRouteKey } = await import("./dm-key");
    expect(dmRouteKey([7], 7)).toBe("7");
  });
});
