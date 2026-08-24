import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SidebarActivityView } from "./sidebar-activity-view.ui";

const EMPTY_COUNTS = {
  inbox: null,
  mentions: null,
  drafts: null,
  markedMessages: null,
};

function renderCompact(path = "/org/acme/project/project-1/inbox") {
  const onToggle = vi.fn();
  render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarActivityView
        open={false}
        onToggle={onToggle}
        counts={EMPTY_COUNTS}
        isCompactDensity={false}
      />
    </MemoryRouter>,
  );
  return { onToggle };
}

describe("SidebarActivityView compact rail", () => {
  it("renders activity items as equal-width buttons that fill the row", () => {
    renderCompact();

    const list = screen.getByRole("list", { name: "My Activity" });
    expect(list).toHaveClass("flex", "w-full", "flex-1");
    expect(list).not.toHaveClass("w-max");

    const items = list.querySelectorAll(":scope > li");
    expect(items.length).toBeGreaterThan(1);
    items.forEach((item) => {
      expect(item).toHaveClass("flex-1");
      expect(item).not.toHaveClass("w-7");
    });

    const mentions = screen.getByRole("link", { name: "Mentions" });
    expect(mentions).toHaveClass("w-full", "bg-card-bg", "rounded-lg");
  });

  it("keeps the chevron on the same card chrome without stretching", () => {
    renderCompact();

    const toggle = screen.getByTestId("sidebar-activity-compact-toggle");
    expect(toggle).toHaveClass("bg-card-bg", "rounded-lg", "shrink-0", "w-8");
    expect(toggle).not.toHaveClass("flex-1");
    expect(toggle).not.toHaveClass("w-full");
  });

  it("highlights the active activity button without a layout-shifting border", () => {
    renderCompact("/org/acme/project/project-1/inbox");

    const inbox = screen.getByRole("link", { name: "Inbox" });
    expect(inbox).toHaveAttribute("aria-current", "page");
    expect(inbox).toHaveClass("bg-card-bg-active", "text-icon-active");
    expect(inbox).not.toHaveClass("border");

    const mentions = screen.getByRole("link", { name: "Mentions" });
    expect(mentions).not.toHaveAttribute("aria-current");
    expect(mentions).toHaveClass("bg-card-bg", "text-icon-active");
    expect(mentions).not.toHaveClass("bg-card-bg-active");

    const chevron = screen.getByTestId("sidebar-activity-compact-toggle");
    expect(chevron).toHaveClass("text-text-muted");
    expect(chevron).not.toHaveClass("text-icon-active");
  });

  it("keeps compact activity action icons bright on a chat route", () => {
    renderCompact("/org/acme/project/project-1/channel/general");

    const list = screen.getByRole("list", { name: "My Activity" });
    const actionLinks = list.querySelectorAll("a");
    expect(actionLinks.length).toBeGreaterThan(1);
    actionLinks.forEach((link) => {
      expect(link).toHaveClass("text-icon-active");
      expect(link).toHaveAttribute("data-icon-tone", "active");
      expect(link).not.toHaveAttribute("aria-current");
    });

    expect(screen.getByTestId("sidebar-activity-compact-toggle")).toHaveClass("text-text-muted");
  });

  it("does not wrap compact icons in a horizontal scroll viewport", () => {
    renderCompact();

    expect(screen.queryByTestId("sidebar-activity-compact-scroll")).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "My Activity" })).not.toHaveClass("overflow-x-auto");
  });

  it("toggles the expanded activity list from the chevron", async () => {
    const user = userEvent.setup();
    const { onToggle } = renderCompact();

    await user.click(screen.getByTestId("sidebar-activity-compact-toggle"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("renders compact glyphs smaller than the 24px Figma icon frame", () => {
    renderCompact();

    const iconSize = (name: string) =>
      screen.getByRole("link", { name }).querySelector("svg")?.getAttribute("width");

    // Cropped compact SVGs at 24px look larger than Material's padded 24×24 frame.
    expect(iconSize("Inbox")).toBe("20");
    expect(iconSize("Favorites")).toBe("18");
    expect(iconSize("Marked messages")).toBe("18");
    expect(iconSize("Mentions")).toBe("20");
    expect(iconSize("Drafts")).toBe("18");
  });
});
