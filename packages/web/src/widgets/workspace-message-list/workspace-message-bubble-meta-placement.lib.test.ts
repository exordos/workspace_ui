import { describe, expect, it } from "vitest";
import { resolveWorkspaceBubbleMetaPlacement } from "./workspace-message-bubble-meta-placement.lib";

describe("resolveWorkspaceBubbleMetaPlacement", () => {
  it("uses inline placement for a simple one line text message", () => {
    expect(resolveWorkspaceBubbleMetaPlacement({ text: "Simple workspace text" })).toBe("inline");
  });

  it("uses inline placement for multiline plain text", () => {
    expect(resolveWorkspaceBubbleMetaPlacement({ text: "First line\nSecond line" })).toBe("inline");
  });

  it("uses inline placement for a very long word", () => {
    expect(
      resolveWorkspaceBubbleMetaPlacement({
        text: "word-without-breaks-abcdefghijklmnopqrstuvwxyz",
      }),
    ).toBe("inline");
  });

  it("uses row placement for non-text surfaces", () => {
    expect(resolveWorkspaceBubbleMetaPlacement({ text: "Text", attachmentsCount: 1 })).toBe("row");
    expect(resolveWorkspaceBubbleMetaPlacement({ text: "Text", hasReactions: true })).toBe("row");
    expect(resolveWorkspaceBubbleMetaPlacement({ text: "Text", hasLinkPreview: true })).toBe("row");
    expect(resolveWorkspaceBubbleMetaPlacement({ text: "Text", hasRichBlocks: true })).toBe("row");
  });
});
