import { describe, expect, it } from "vitest";
import {
  parseWorkspaceSecretDraft,
  replaceWorkspaceSecretDraft,
} from "./workspace-secret-draft.lib";

describe("protected composer fences", () => {
  it("replaces multiple protected ranges without changing surrounding public text", () => {
    const source = "Public :::secret\nfirst\n::: suffix :::secret\nsecond\n::: end";
    const fragments = parseWorkspaceSecretDraft(source);
    expect(fragments.map((fragment) => fragment.text)).toEqual(["first", "second"]);
    expect(replaceWorkspaceSecretDraft(source, fragments, ["[cipher1]", "[cipher2]"])).toBe(
      "Public [cipher1] suffix [cipher2] end",
    );
  });

  it.each([
    "Public :::secret\nunclosed",
    ":::secret\nouter :::secret\ninner\n:::\n:::",
    ":::secret\n\n:::",
    ":::secret edited syntax",
    // Inserting a closing fence inside an existing protected selection must not expose its suffix.
    "Public :::secret\nfirst line\n::: secret suffix\n::: public",
  ])("rejects an ambiguous or unfinished protected range: %s", (source) => {
    expect(() => parseWorkspaceSecretDraft(source)).toThrow("invalid-secret");
  });
});
