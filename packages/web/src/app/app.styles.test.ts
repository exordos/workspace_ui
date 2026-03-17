import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const focusOutlineStyles = readFileSync(
  resolve(import.meta.dirname, "focus-outline.styles.css"),
  "utf8",
);

describe("focus-outline styles contract", () => {
  it("separates focus outline styling for controls and text-entry inputs", () => {
    expect(focusOutlineStyles).toContain("button:focus-visible");
    expect(focusOutlineStyles).toContain(
      'input:not([type="checkbox"]):not([type="radio"]):focus-visible',
    );
    expect(focusOutlineStyles).toContain("@apply outline-2 outline-offset-2 outline-accent-soft");
    expect(focusOutlineStyles).toContain("@apply outline-1 outline-offset-0 outline-accent-soft");
  });
});
