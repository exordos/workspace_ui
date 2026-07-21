import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SidebarChatTitleWithStatus } from "./sidebar-chat-title-with-status.ui";

describe("SidebarChatTitleWithStatus", () => {
  it("renders title without status when status fields are empty", () => {
    render(<SidebarChatTitleWithStatus title="Eugene Frolov" statusEmoji={null} statusText="  " />);

    expect(screen.getByTestId("sidebar-chat-title")).toHaveTextContent("Eugene Frolov");
    expect(screen.queryByTestId("sidebar-user-status-emoji")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-chat-status-text")).not.toBeInTheDocument();
  });

  it("keeps title shrink priority lower than status text", () => {
    render(
      <SidebarChatTitleWithStatus title="Eugene Frolov" statusEmoji="🏠" statusText="вджобываю!" />,
    );

    expect(screen.getByTestId("sidebar-chat-title")).toHaveClass("shrink", "truncate", "min-w-0");
    expect(screen.getByTestId("sidebar-chat-title")).not.toHaveClass("shrink-[9999]");
    expect(screen.getByTestId("sidebar-user-status-emoji")).toHaveTextContent("🏠");
    expect(screen.getByTestId("sidebar-chat-status-text")).toHaveClass(
      "shrink-[9999]",
      "truncate",
      "min-w-0",
    );
    expect(screen.getByTestId("sidebar-chat-status-text")).toHaveTextContent("вджобываю!");
  });
});
