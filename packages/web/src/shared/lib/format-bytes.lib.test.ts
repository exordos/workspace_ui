import { describe, expect, it } from "vitest";
import { formatBytes, formatKilobytes } from "./format-bytes.lib";

describe("formatBytes", () => {
  it("returns 0 B for non-positive values", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(-1)).toBe("0 B");
  });

  it("formats bytes and kilobytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.50 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.00 MB");
  });
});

describe("formatKilobytes", () => {
  it("converts kilobytes to formatted bytes", () => {
    expect(formatKilobytes(1024)).toBe("1.00 MB");
  });
});
