import { describe, expect, it } from "vitest";
import {
  areCustomProfileDataEqual,
  getCustomProfileFieldLines,
  parseZulipPersonPickerUserIds,
} from "~/shared/lib/user-profile-fields.lib";
import type { RealmProfileFieldDefinition } from "~/shared/lib/zulip-profile-fields-map.lib";

describe("getCustomProfileFieldLines", () => {
  it("returns empty for nullish input", () => {
    expect(getCustomProfileFieldLines(undefined)).toEqual([]);
    expect(getCustomProfileFieldLines(null)).toEqual([]);
  });

  it("orders numeric field ids before lexicographic fallbacks", () => {
    const lines = getCustomProfileFieldLines({
      "10": { value: "ten" },
      "2": { value: "two" },
      zz: { value: "z" },
    });
    expect(lines.map((l) => l.fieldKey)).toEqual(["2", "10", "zz"]);
  });

  it("prefers sanitized rendered_value over plain value", () => {
    const lines = getCustomProfileFieldLines({
      "1": {
        value: "Plain",
        rendered_value: "<p><strong>Bold</strong></p>",
      },
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.plainText).toBeNull();
    expect(lines[0]!.html).toContain("Bold");
    expect(lines[0]!.html).not.toContain("<script");
  });

  it("falls back to plain value when rendered is empty after sanitization", () => {
    const lines = getCustomProfileFieldLines({
      "1": { value: "Only text", rendered_value: "<script>x</script>" },
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.html).toBeNull();
    expect(lines[0]!.plainText).toBe("Only text");
  });

  it("uses plain value when rendered is absent", () => {
    const lines = getCustomProfileFieldLines({
      "3": { value: "Job title" },
    });
    expect(lines[0]!.plainText).toBe("Job title");
    expect(lines[0]!.html).toBeNull();
  });

  it("resolves manager person-picker to profile user id when definitions match", () => {
    const defs: RealmProfileFieldDefinition[] = [
      { id: 2, name: "Руководитель", type: 6, order: 1 },
    ];
    const lines = getCustomProfileFieldLines(
      { "2": { value: "[99]" } },
      undefined,
      defs,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]!.managerProfileUserId).toBe(99);
    expect(lines[0]!.html).toBeNull();
  });

  it("extracts manager user id from rendered user mention HTML", () => {
    const defs: RealmProfileFieldDefinition[] = [
      { id: 2, name: "Manager", type: 1, order: 1 },
    ];
    const lines = getCustomProfileFieldLines(
      {
        "2": {
          value: "x",
          rendered_value:
            '<span class="user-mention" data-user-id="42">@lead</span>',
        },
      },
      undefined,
      defs,
    );
    expect(lines[0]!.managerProfileUserId).toBe(42);
  });
});

describe("parseZulipPersonPickerUserIds", () => {
  it("parses JSON array string from Zulip API", () => {
    expect(parseZulipPersonPickerUserIds("[11]")).toEqual([11]);
  });

  it("parses plain numeric string", () => {
    expect(parseZulipPersonPickerUserIds(" 42 ")).toEqual([42]);
  });
});

describe("areCustomProfileDataEqual", () => {
  it("treats both sides absent as equal", () => {
    expect(areCustomProfileDataEqual(undefined, undefined)).toBe(true);
    expect(areCustomProfileDataEqual(undefined, null)).toBe(true);
  });

  it("distinguishes absent from empty object", () => {
    expect(areCustomProfileDataEqual(undefined, {})).toBe(false);
  });

  it("compares field entries deeply", () => {
    const a = { "1": { value: "x", rendered_value: "<p>x</p>" } };
    expect(areCustomProfileDataEqual(a, { ...a })).toBe(true);
    expect(areCustomProfileDataEqual(a, { "1": { value: "y", rendered_value: "<p>x</p>" } })).toBe(
      false,
    );
  });
});
