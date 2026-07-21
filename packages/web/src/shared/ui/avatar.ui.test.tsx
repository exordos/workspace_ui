import { fireEvent, render } from "@testing-library/react";
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

  it("renders fallback content when the image fails to load", () => {
    const { container } = render(<Avatar src="https://example.test/unavailable.png">A</Avatar>);
    const image = container.querySelector("img");

    expect(image).not.toBeNull();
    fireEvent.error(image!);

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("A");
  });

  it("retries with a new source after the previous image failed", () => {
    const { container, rerender } = render(
      <Avatar src="https://example.test/unavailable.png">A</Avatar>,
    );
    fireEvent.error(container.querySelector("img")!);

    rerender(<Avatar src="https://example.test/available.png">A</Avatar>);

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.test/available.png",
    );
  });

  it("adds group-hover ring and pointer cursor only when interactive is enabled", () => {
    const { container, rerender } = render(<Avatar>A</Avatar>);
    const staticAvatar = container.firstElementChild;

    expect(staticAvatar?.className).not.toContain("group-hover:ring-2");
    expect(staticAvatar?.className).not.toContain("cursor-pointer");

    rerender(<Avatar interactive>A</Avatar>);
    const interactiveAvatar = container.firstElementChild;

    expect(interactiveAvatar?.className).toContain("group-hover:ring-2");
    expect(interactiveAvatar?.className).toContain("group-hover:ring-accent-soft");
    // interactive = кликабельный аватар (профиль и т.п.) → курсор «пальчик»
    expect(interactiveAvatar?.className).toContain("cursor-pointer");
  });
});
