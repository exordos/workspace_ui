import { describe, expect, it } from "vitest";
import { formatGroupSettingDisplay } from "./zulip-group-setting-display.lib";

describe("formatGroupSettingDisplay", () => {
  const options = {
    resolveGroupName: (id: number) => (id === 9 ? "Administrators" : undefined),
    unknownGroupLabel: "Group",
    directMembersLabel: (count: number) => `${count} users`,
  };

  it("resolves a numeric group id to a group name", () => {
    expect(formatGroupSettingDisplay(9, options)).toBe("Administrators");
  });

  it("falls back to unknown label for missing group names", () => {
    expect(formatGroupSettingDisplay(42, options)).toBe("Group #42");
  });

  it("formats direct members and subgroups", () => {
    expect(
      formatGroupSettingDisplay({ direct_members: [1, 2], direct_subgroups: [9] }, options),
    ).toBe("Administrators, 2 users");
  });
});
