import { describe, expect, it } from "vitest";
import {
  buildStickerMarkdown,
  buildStickerReferenceUrn,
  buildStickerUrn,
  isStickerMessage,
  parseStickerFromContent,
  parseStickerUrn,
} from "./sticker.api";

const STICKER_1_ID = "11111111-1111-4111-8111-111111111111";
const STICKER_1_URN = `urn:sticker:${STICKER_1_ID}`;
const STICKER_1_MARKDOWN = `![sticker](${STICKER_1_URN})`;
describe("sticker URN", () => {
  it("builds a provider-neutral URN from a Workspace UUID", () => {
    expect(buildStickerUrn(STICKER_1_ID)).toBe(STICKER_1_URN);
    expect(buildStickerUrn(STICKER_1_ID.toUpperCase())).toBe(STICKER_1_URN);
  });

  it("parses Workspace UUID references", () => {
    expect(parseStickerUrn(STICKER_1_URN)).toEqual({
      kind: "workspace",
      stickerId: STICKER_1_ID,
    });
    expect(parseStickerUrn(STICKER_1_URN.toUpperCase())).toEqual({
      kind: "workspace",
      stickerId: STICKER_1_ID,
    });
    expect(parseStickerUrn("urn:sticker:provider:external-id")).toBeNull();
    expect(parseStickerUrn(`${STICKER_1_URN}?extra=value`)).toBeNull();
  });

  it("builds a reference URN from a Workspace UUID", () => {
    expect(buildStickerReferenceUrn({ kind: "workspace", stickerId: STICKER_1_ID })).toBe(
      STICKER_1_URN,
    );
  });

  it("rejects a non-UUID sticker ID", () => {
    expect(() => buildStickerUrn("invalid-id")).toThrow("Workspace UUID");
  });
});

describe("buildStickerMarkdown", () => {
  it("keeps provider IDs and media URLs out of the wire format", () => {
    expect(
      buildStickerMarkdown({ reference: { kind: "workspace", stickerId: STICKER_1_ID } }),
    ).toBe(STICKER_1_MARKDOWN);
  });
});

describe("parseStickerFromContent", () => {
  it("parses valid sticker markdown", () => {
    expect(parseStickerFromContent(STICKER_1_MARKDOWN)).toEqual({
      kind: "workspace",
      stickerId: STICKER_1_ID,
    });
  });

  it("rejects external provider Markdown", () => {
    expect(parseStickerFromContent("![sticker](urn:sticker:provider:external-id)")).toBeNull();
  });

  it("returns null for regular text", () => {
    expect(parseStickerFromContent("Hello world")).toBeNull();
  });

  it("returns null for regular image markdown", () => {
    expect(parseStickerFromContent("![alt](url.png)")).toBeNull();
  });

  it("does not classify mixed content as a sticker message", () => {
    expect(parseStickerFromContent(`Check this out ${STICKER_1_MARKDOWN}`)).toBeNull();
  });
});

describe("isStickerMessage", () => {
  it("returns true for sticker-only content", () => {
    expect(isStickerMessage(STICKER_1_MARKDOWN)).toBe(true);
  });

  it("returns true with whitespace", () => {
    expect(isStickerMessage(`  ${STICKER_1_MARKDOWN}  `)).toBe(true);
  });

  it("returns false for mixed content", () => {
    expect(isStickerMessage(`Hello ${STICKER_1_MARKDOWN}`)).toBe(false);
  });

  it("returns false for regular text", () => {
    expect(isStickerMessage("Just a message")).toBe(false);
  });
});
