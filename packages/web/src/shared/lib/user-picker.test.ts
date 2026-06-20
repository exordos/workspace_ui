import { describe, expect, it } from "vitest";
import {
  buildUserPickerOptions,
  resolveUserPickerEmptyLabelKey,
  toggleUserPickerSelection,
} from "./user-picker";

describe("buildUserPickerOptions", () => {
  it("filters by query and excludes user ids", () => {
    const result = buildUserPickerOptions({
      candidates: [
        { userId: 1, fullName: "Alice", email: "alice@example.com" },
        { userId: 2, fullName: "Bob", email: "bob@example.com" },
      ],
      selectedUserIds: [],
      excludedUserIds: [1],
      query: "bo",
    });

    expect(result).toEqual([
      {
        userId: 2,
        fullName: "Bob",
        email: "bob@example.com",
        presence: null,
        statusLabel: null,
        isDisabled: false,
      },
    ]);
  });

  it("supports IAM UUID user ids and empty display names", () => {
    const aliceUuid = "00000000-0000-0000-0000-000000000002";
    const result = buildUserPickerOptions({
      candidates: [
        { userId: "00000000-0000-0000-0000-000000000001", fullName: "Me" },
        { userId: aliceUuid, fullName: "", email: "alice@example.com" },
      ],
      selectedUserIds: [],
      excludedUserIds: ["00000000-0000-0000-0000-000000000001"],
    });

    expect(result).toEqual([
      {
        userId: aliceUuid,
        fullName: "alice@example.com",
        email: "alice@example.com",
        presence: null,
        statusLabel: null,
        isDisabled: false,
      },
    ]);
  });

  it("keeps selected users first", () => {
    const result = buildUserPickerOptions({
      candidates: [
        { userId: 1, fullName: "Alice" },
        { userId: 2, fullName: "Bob" },
        { userId: 3, fullName: "Clara" },
      ],
      selectedUserIds: [3],
    });

    expect(result.map((row) => row.userId)).toEqual([3, 1, 2]);
  });
});

describe("resolveUserPickerEmptyLabelKey", () => {
  it("returns noOtherUsers when directory has only the current user", () => {
    expect(
      resolveUserPickerEmptyLabelKey({
        candidateCount: 1,
        visibleCount: 0,
        query: "",
        excludesCurrentUser: true,
      }),
    ).toBe("dm.noOtherUsers");
  });

  it("returns usersDirectoryEmpty when store has no candidates", () => {
    expect(
      resolveUserPickerEmptyLabelKey({
        candidateCount: 0,
        visibleCount: 0,
        query: "",
        excludesCurrentUser: true,
      }),
    ).toBe("dm.usersDirectoryEmpty");
  });
});

describe("toggleUserPickerSelection", () => {
  it("toggles and returns sorted ids", () => {
    expect(toggleUserPickerSelection([3, 1], 2)).toEqual([1, 2, 3]);
    expect(toggleUserPickerSelection([1, 2, 3], 2)).toEqual([1, 3]);
  });
});
