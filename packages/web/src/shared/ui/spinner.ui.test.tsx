import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Spinner } from "./spinner.ui";

describe("Spinner", () => {
  it("renders accent variant at lg size by default", () => {
    const { container } = render(<Spinner />);
    const el = container.querySelector("span");
    expect(el).toHaveClass("h-8", "w-8", "border-t-accent");
    expect(el).toHaveAttribute("aria-hidden", "true");
  });

  it("renders inherit variant at sm size", () => {
    const { container } = render(<Spinner size="sm" variant="inherit" />);
    const el = container.querySelector("span");
    expect(el).toHaveClass("h-3.5", "w-3.5", "border-current");
  });
});
