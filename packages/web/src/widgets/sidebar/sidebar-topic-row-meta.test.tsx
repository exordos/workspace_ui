import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SidebarTopicRowMeta } from "./sidebar-topic-row-meta.ui";

vi.mock("./sidebar-folder-topic-buttons.ui", () => ({
  TopicMuteButton: () => <button type="button">mute</button>,
}));

describe("SidebarTopicRowMeta", () => {
  it("renders message time below the action row when not compact", () => {
    render(<SidebarTopicRowMeta streamId={11} topic="incident" unreadCount={2} time="10:13" />);

    const meta = screen.getByTestId("sidebar-topic-row-meta");
    const time = screen.getByTestId("sidebar-topic-row-time");

    expect(meta).toHaveClass("justify-between");
    expect(time).toHaveTextContent("10:13");
    expect(meta).toContainElement(screen.getByTestId("sidebar-topic-row-meta-actions"));
    expect(meta).toContainElement(time);
  });

  it("hides time in compact density", () => {
    render(<SidebarTopicRowMeta streamId={11} topic="incident" compact time="10:13" />);

    expect(screen.queryByTestId("sidebar-topic-row-time")).not.toBeInTheDocument();
  });

  it("hides time when value is empty", () => {
    render(<SidebarTopicRowMeta streamId={11} topic="incident" time="" />);

    expect(screen.queryByTestId("sidebar-topic-row-time")).not.toBeInTheDocument();
  });
});
