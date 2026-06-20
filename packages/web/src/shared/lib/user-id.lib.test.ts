import { describe, expect, it } from "vitest";
import { isIamUserUuid, userIdStorageKey, userIdsEqual } from "./user-id.lib";

describe("user-id.lib", () => {
  it("detects IAM UUIDs", () => {
    expect(isIamUserUuid("00000000-0000-0000-0000-000000000001")).toBe(true);
    expect(isIamUserUuid("42")).toBe(false);
  });

  it("normalizes storage keys", () => {
    expect(userIdStorageKey(42)).toBe("42");
    expect(userIdStorageKey("00000000-0000-0000-0000-000000000001")).toBe(
      "00000000-0000-0000-0000-000000000001",
    );
  });

  it("compares ids by storage key", () => {
    expect(userIdsEqual(42, 42)).toBe(true);
    expect(
      userIdsEqual("00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000001"),
    ).toBe(true);
    expect(userIdsEqual(42, "42")).toBe(false);
  });
});
