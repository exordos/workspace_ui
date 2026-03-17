import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const tailwindConfig = readFileSync(
  resolve(import.meta.dirname, "../../tailwind.config.ts"),
  "utf8",
);

describe("tailwind radius contract", () => {
  it("uses stricter global radii and telegram-like bubble radius", () => {
    expect(tailwindConfig).toContain('lg: "6px"');
    expect(tailwindConfig).toContain('xl: "10px"');
    expect(tailwindConfig).toContain('"2xl": "12px"');
    expect(tailwindConfig).toContain('bubble: "18px"');
  });
});
