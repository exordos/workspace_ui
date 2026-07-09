import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "~/shared/ui/avatar";

describe("Avatar", () => {
  it("renders the supplied image URL directly", () => {
    const { container } = render(<Avatar src="https://example.test/avatar.png">A</Avatar>);

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.test/avatar.png",
    );
  });

  it("renders fallback content without an image", () => {
    const { container } = render(<Avatar>A</Avatar>);

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("A");
  });
});
