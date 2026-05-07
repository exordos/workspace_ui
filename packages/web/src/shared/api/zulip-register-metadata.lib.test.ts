import { describe, expect, it } from "vitest";
import {
  parseAvatarChangesDisabledFlag,
  parseMaxAvatarFileSizeMib,
  parseServerThumbnailFormats,
} from "./zulip-register-metadata.lib";

describe("parseServerThumbnailFormats", () => {
  it("returns undefined for non-array input", () => {
    expect(parseServerThumbnailFormats(undefined)).toBeUndefined();
    expect(parseServerThumbnailFormats(null)).toBeUndefined();
    expect(parseServerThumbnailFormats({})).toBeUndefined();
  });

  it("parses valid Zulip thumbnail format rows", () => {
    const parsed = parseServerThumbnailFormats([
      {
        name: "840x560.webp",
        max_width: 840,
        max_height: 560,
        format: "webp",
        animated: false,
      },
    ]);
    expect(parsed).toEqual([
      {
        name: "840x560.webp",
        max_width: 840,
        max_height: 560,
        format: "webp",
        animated: false,
      },
    ]);
  });

  it("drops invalid rows and returns undefined if none remain", () => {
    expect(parseServerThumbnailFormats([{ foo: 1 }])).toBeUndefined();
  });
});

describe("parseAvatarChangesDisabledFlag", () => {
  it("parses booleans", () => {
    expect(parseAvatarChangesDisabledFlag(true)).toBe(true);
    expect(parseAvatarChangesDisabledFlag(false)).toBe(false);
  });

  it("returns undefined for non-boolean values", () => {
    expect(parseAvatarChangesDisabledFlag(null)).toBeUndefined();
    expect(parseAvatarChangesDisabledFlag("true")).toBeUndefined();
    expect(parseAvatarChangesDisabledFlag(1)).toBeUndefined();
  });
});

describe("parseMaxAvatarFileSizeMib", () => {
  it("parses positive integers", () => {
    expect(parseMaxAvatarFileSizeMib(10)).toBe(10);
  });

  it("returns undefined for invalid values", () => {
    expect(parseMaxAvatarFileSizeMib(null)).toBeUndefined();
    expect(parseMaxAvatarFileSizeMib(0)).toBeUndefined();
    expect(parseMaxAvatarFileSizeMib(-1)).toBeUndefined();
    expect(parseMaxAvatarFileSizeMib(1.5)).toBeUndefined();
    expect(parseMaxAvatarFileSizeMib("20")).toBeUndefined();
  });
});
