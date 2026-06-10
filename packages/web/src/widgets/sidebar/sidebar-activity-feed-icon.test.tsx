import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useDraftStore } from "~/entities/draft/draft.model";
import { SidebarActivity } from "./sidebar-activity.ui";

describe("SidebarActivity feed icon sizing", () => {
  afterEach(() => {
    useChatListStore.getState().clear();
    useDraftStore.getState().clear();
  });

  it("uses compact feed icon size for collapsed mode", () => {
    useChatListStore.setState({ currentUserId: 7, lastAppliedMessages: [] });

    render(
      <MemoryRouter>
        <SidebarActivity open={false} onToggle={() => {}} />
      </MemoryRouter>,
    );

    const feedLink = screen.getByRole("link", { name: /feed/i });
    const feedIcon = feedLink.querySelector("svg");

    expect(feedIcon).toHaveAttribute("width", "16");
    expect(feedIcon).toHaveAttribute("height", "16");
  });

  it("uses balanced feed icon size for expanded mode", () => {
    useChatListStore.setState({ currentUserId: 7, lastAppliedMessages: [] });

    render(
      <MemoryRouter>
        <SidebarActivity open onToggle={() => {}} />
      </MemoryRouter>,
    );

    const feedLink = screen.getByRole("link", { name: /feed/i });
    const feedIcon = feedLink.querySelector("svg");

    expect(feedIcon).toHaveAttribute("width", "16");
    expect(feedIcon).toHaveAttribute("height", "16");
  });
});
