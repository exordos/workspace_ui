import { describe, expect, it } from "vitest";
import { parseServerThumbnailFormats } from "./zulip-register-metadata.lib";

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
