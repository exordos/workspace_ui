import { describe, expect, it } from "vitest";
import { buildUserPickerOptions, toggleUserPickerSelection } from "./user-picker";

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

  it("supports workspace uuid candidates", () => {
    const result = buildUserPickerOptions({
      candidates: [
        { userId: "user-b", fullName: "Bob", email: "bob@example.com", presenceStatus: "active" },
        { userId: "user-a", fullName: "Alice", email: "alice@example.com" },
      ],
      selectedUserIds: ["user-b"],
      excludedUserIds: ["user-a"],
    });

    expect(result).toEqual([
      {
        userId: "user-b",
        fullName: "Bob",
        email: "bob@example.com",
        presence: "active",
        statusLabel: null,
        isDisabled: false,
      },
    ]);
  });
});

describe("toggleUserPickerSelection", () => {
  it("toggles and returns sorted ids", () => {
    expect(toggleUserPickerSelection([3, 1], 2)).toEqual([1, 2, 3]);
    expect(toggleUserPickerSelection([1, 2, 3], 2)).toEqual([1, 3]);
  });
});
