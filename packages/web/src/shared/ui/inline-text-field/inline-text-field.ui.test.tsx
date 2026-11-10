import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InlineTextField } from "./inline-text-field.ui";

describe("InlineTextField", () => {
  it("remeasures unchanged text on viewport resize when only font metrics change", () => {
    const { unmount } = render(
      <InlineTextField value="A long answer" readOnly aria-label="Answer" />,
    );
    const input = screen.getByRole("textbox", { name: "Answer" });
    let contentHeight = 34;
    const measure = vi.fn(() => contentHeight);
    Object.defineProperty(input, "scrollHeight", { get: measure });

    fireEvent.resize(window);
    expect(input).toHaveStyle({ height: "34px" });
    contentHeight = 51;
    fireEvent.resize(window);
    expect(input).toHaveStyle({ height: "51px" });
    expect(input).toHaveValue("A long answer");

    unmount();
    measure.mockClear();
    fireEvent.resize(window);
    expect(measure).not.toHaveBeenCalled();
  });
});
