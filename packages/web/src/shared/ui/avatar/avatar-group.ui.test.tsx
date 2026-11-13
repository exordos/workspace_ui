import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AvatarGroup } from "./avatar-group.ui";

const items = Array.from({ length: 7 }, (_, index) => ({
  id: `person-${index}`,
  name: `Person ${index}`,
  image: `https://example.test/avatar-${index}.png`,
}));

describe("AvatarGroup", () => {
  it("preserves caller order, limits visible people and supports a supplied avatar renderer", () => {
    const renderAvatar = vi.fn((item: (typeof items)[number]) => <span>{item.id}</span>);
    const { rerender } = render(
      <AvatarGroup items={items} renderAvatar={renderAvatar} ariaLabel="Participants" />,
    );
    expect(screen.getByRole("group", { name: "Participants" })).toBeInTheDocument();
    expect(renderAvatar.mock.calls.map(([item]) => item.id)).toEqual(
      items.slice(0, 5).map((item) => item.id),
    );
    expect(screen.queryByTitle("Person 5")).not.toBeInTheDocument();
    rerender(<AvatarGroup items={items} max={2} getAvatarSrc={(item) => item.image} />);
    expect(screen.getByTitle("Person 0").querySelector("img")).toHaveAttribute(
      "src",
      items[0]?.image,
    );
    expect(screen.queryByTitle("Person 2")).not.toBeInTheDocument();
  });

  it("renders no group for an empty list or zero visible limit", () => {
    const { container, rerender } = render(<AvatarGroup items={[]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<AvatarGroup items={items} max={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
