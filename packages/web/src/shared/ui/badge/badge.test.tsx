import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge";
import { UnreadCountBadge } from "./unread-count-badge";

describe("Badge", () => {
  it("keeps unrelated activity counts exact unless a display limit is supplied", () => {
    render(<Badge count={2002} variant="muted" />);

    expect(screen.getByText("2002")).toBeInTheDocument();
  });

  it.each([
    [999, "999"],
    [1000, "1000"],
    [1001, "1k+"],
    [1003, "1k+"],
    [1999, "1k+"],
    [2000, "2k+"],
    [2002, "2k+"],
    [2003, "2k+"],
    [2999, "2k+"],
    [3000, "3k+"],
    [3001, "3k+"],
    [3003, "3k+"],
    [3999, "3k+"],
    [4000, "4k+"],
    [4003, "4k+"],
  ])("formats count %i as %s", (count, label) => {
    render(<UnreadCountBadge count={count} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
