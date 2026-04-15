import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./avatar";

describe("Avatar", () => {
  it("sets loading lazy on avatar image by default", () => {
    const { container } = render(
      <Avatar src="https://example.com/a.png" size="md">
        X
      </Avatar>,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("decoding", "async");
  });

  it("allows eager loading override", () => {
    const { container } = render(
      <Avatar src="https://example.com/b.png" size="md" imageLoading="eager">
        Y
      </Avatar>,
    );
    expect(container.querySelector("img")).toHaveAttribute("loading", "eager");
  });
});
