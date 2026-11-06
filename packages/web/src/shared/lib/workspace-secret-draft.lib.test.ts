import { describe, expect, it } from "vitest";
import {
  hasWorkspaceSecretDraft,
  parseWorkspaceSecretDraft,
  replaceWorkspaceSecretDraft,
} from "./workspace-secret-draft.lib";

describe("protected composer fences", () => {
  it("replaces multiple protected ranges without changing surrounding public text", () => {
    const source = "Public :::first::: suffix :::second\nthird::: end";
    const fragments = parseWorkspaceSecretDraft(source);
    expect(fragments.map((fragment) => fragment.text)).toEqual(["first", "second\nthird"]);
    expect(replaceWorkspaceSecretDraft(source, fragments, ["[cipher1]", "[cipher2]"])).toBe(
      "Public [cipher1] suffix [cipher2] end",
    );
  });

  it("preserves whitespace inside multiline ranges and supports adjacent ranges", () => {
    const source = ":::\nfirst\nsecond\n::::::third:::";
    const fragments = parseWorkspaceSecretDraft(source);
    expect(fragments.map((fragment) => fragment.text)).toEqual(["\nfirst\nsecond\n", "third"]);
    expect(replaceWorkspaceSecretDraft(source, fragments, ["[cipher1]", "[cipher2]"])).toBe(
      "[cipher1][cipher2]",
    );
  });

  it.each([
    ":::unfinished",
    ":::private::: extra :::",
    ":::first\nline::: suffix ::: public",
    "::::::",
    "::: \n :::",
  ])("rejects an empty or unfinished protected range: %s", (source) => {
    expect(() => parseWorkspaceSecretDraft(source)).toThrow("invalid-secret");
  });

  it.each([":::", "::::::", "Public :::unfinished", ":::text:::"])(
    "protects drafts as soon as a delimiter exists: %s",
    (source) => {
      expect(hasWorkspaceSecretDraft(source)).toBe(true);
    },
  );

  it("leaves ordinary text without a delimiter unchanged", () => {
    const source = "Public :: text";
    expect(hasWorkspaceSecretDraft(source)).toBe(false);
    expect(parseWorkspaceSecretDraft(source)).toEqual([]);
    expect(replaceWorkspaceSecretDraft(source, [], [])).toBe(source);
  });
});
