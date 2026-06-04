import { describe, expect, it } from "vitest";
import {
  buildDmRouteSlugFromRecipients,
  isDmRouteSlugActive,
  parseDmRouteParticipantIds,
} from "./dm-route-slug.lib";

describe("parseDmRouteParticipantIds", () => {
  it("parses single-user slug with display name suffix", () => {
    expect(parseDmRouteParticipantIds("42-alice")).toEqual([42]);
  });

  it("parses numeric-only route segment", () => {
    expect(parseDmRouteParticipantIds("42")).toEqual([42]);
  });

  it("parses comma-separated group slug", () => {
    expect(parseDmRouteParticipantIds("7-bob,8-carol")).toEqual([7, 8]);
  });
});

describe("buildDmRouteSlugFromRecipients", () => {
  it("builds id-name slug for 1:1 excluding current user", () => {
    expect(
      buildDmRouteSlugFromRecipients(
        [
          { id: 42, full_name: "Alice" },
          { id: 7, full_name: "Me" },
        ],
        7,
      ),
    ).toBe("42-alice");
  });

  it("builds comma-separated slugs for group DM", () => {
    expect(
      buildDmRouteSlugFromRecipients(
        [
          { id: 7, full_name: "Bob" },
          { id: 8, full_name: "Carol" },
          { id: 9, full_name: "Me" },
        ],
        9,
      ),
    ).toBe("7-bob,8-carol");
  });
});

describe("isDmRouteSlugActive", () => {
  it("matches sidebar slug when route uses numeric ids only", () => {
    expect(isDmRouteSlugActive("42-alice", "42", 7)).toBe(true);
  });

  it("returns false for different conversations", () => {
    expect(isDmRouteSlugActive("42-alice", "77", 7)).toBe(false);
  });

  it("matches exact slug strings", () => {
    expect(isDmRouteSlugActive("42-alice", "42-alice", 7)).toBe(true);
  });
});
