import { describe, expect, it } from "vitest";
import { buildZulipQuoteHeader } from "./zulip-quote-header.lib";

describe("buildZulipQuoteHeader", () => {
  it("builds header with mention, sender id, and wrote permalink", () => {
    expect(
      buildZulipQuoteHeader({
        senderName: "Alice",
        senderId: 42,
        wroteLabel: "wrote",
        permalinkUrl: "https://zulip.example.com/#narrow/dm/1-dm/near/99",
      }),
    ).toBe("@_**Alice|42** [wrote](https://zulip.example.com/#narrow/dm/1-dm/near/99):");
  });

  it("builds header without permalink when it is missing", () => {
    expect(
      buildZulipQuoteHeader({
        senderName: "Bob",
        senderId: 7,
        wroteLabel: "писал/а",
      }),
    ).toBe("@_**Bob|7**:");
  });
});
