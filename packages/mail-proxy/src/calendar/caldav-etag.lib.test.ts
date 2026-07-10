import { describe, expect, it } from "vitest";
import { formatEtagForIfMatch, normalizeStoredEtag } from "./caldav-etag.lib";

describe("caldav-etag.lib", () => {
  it("strips strong etag quotes for storage", () => {
    expect(normalizeStoredEtag('"abc-123"')).toBe("abc-123");
  });

  it("strips weak etag prefix and quotes for storage", () => {
    expect(normalizeStoredEtag('W/"weak-etag"')).toBe("weak-etag");
  });

  it("formats unquoted etag for If-Match", () => {
    expect(formatEtagForIfMatch("abc-123")).toBe('"abc-123"');
  });

  it("preserves already quoted etag for If-Match", () => {
    expect(formatEtagForIfMatch('"abc-123"')).toBe('"abc-123"');
  });
});
