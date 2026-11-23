import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceSidebarActivity } from "./sidebar-workspace-activity.ui";

describe("WorkspaceSidebarActivity", () => {
  it("renders mentions as an enabled Workspace activity link", () => {
    render(
      <MemoryRouter initialEntries={["/org/acme/project/project-1/activity/mentions"]}>
        <WorkspaceSidebarActivity
          open
          onToggle={vi.fn()}
          counts={{ inboxCount: null, mentionsCount: null }}
        />
      </MemoryRouter>,
    );

    const mentionsLink = screen.getByRole("link", { name: "Mentions" });
    expect(mentionsLink).toHaveAttribute("href", "/org/acme/project/project-1/activity/mentions");
    expect(mentionsLink).toHaveAttribute("aria-current", "page");
    expect(mentionsLink).not.toHaveAttribute("aria-disabled");
  });
});
