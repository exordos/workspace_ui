import { describe, expect, it } from "vitest";
import { buildWorkspaceQuoteHeader } from "./messenger-quote-header.lib";

describe("buildWorkspaceQuoteHeader", () => {
  it("builds header with mention, sender id, and wrote permalink", () => {
    expect(
      buildWorkspaceQuoteHeader({
        senderName: "Alice",
        senderId: 42,
        wroteLabel: "wrote",
        permalinkUrl: "https://chat.example.com/#narrow/dm/1-dm/near/99",
      }),
    ).toBe("@_**Alice|42** [wrote](https://chat.example.com/#narrow/dm/1-dm/near/99):");
  });

  it("builds header without permalink when it is missing", () => {
    expect(
      buildWorkspaceQuoteHeader({
        senderName: "Bob",
        senderId: 7,
        wroteLabel: "писал/а",
      }),
    ).toBe("@_**Bob|7**:");
  });
});
