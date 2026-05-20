import { describe, expect, it } from "vitest";
import { applyListContinuationOnNewline } from "./message-composer-list-continuation.lib";

describe("message-composer-list-continuation.lib", () => {
  it("continues unordered list item with matching marker", () => {
    const text = "- item";
    const result = applyListContinuationOnNewline({
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });

    expect(result).toEqual({
      nextValue: "- item\n- ",
      nextSelection: 9,
    });
  });

  it("continues unordered list with indentation", () => {
    const text = "  * nested";
    const result = applyListContinuationOnNewline({
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });

    expect(result).toEqual({
      nextValue: "  * nested\n  * ",
      nextSelection: 15,
    });
  });

  it("continues ordered list with incremented number", () => {
    const text = "3. item";
    const result = applyListContinuationOnNewline({
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });

    expect(result).toEqual({
      nextValue: "3. item\n4. ",
      nextSelection: 11,
    });
  });

  it("exits unordered list on empty marker line", () => {
    const text = "- ";
    const result = applyListContinuationOnNewline({
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });

    expect(result).toEqual({
      nextValue: "",
      nextSelection: 0,
    });
  });

  it("exits ordered list on empty marker line", () => {
    const text = "12. ";
    const result = applyListContinuationOnNewline({
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });

    expect(result).toEqual({
      nextValue: "",
      nextSelection: 0,
    });
  });

  it("returns null when cursor is not at line end", () => {
    const text = "- item";
    const result = applyListContinuationOnNewline({
      text,
      selectionStart: 2,
      selectionEnd: 2,
    });

    expect(result).toBeNull();
  });

  it("returns null when current line is not a list item", () => {
    const text = "plain text";
    const result = applyListContinuationOnNewline({
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });

    expect(result).toBeNull();
  });
});
