import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SidebarUserStatusEmoji } from "./sidebar-user-status-emoji.ui";

describe("SidebarUserStatusEmoji", () => {
  it("renders nothing when status has no emoji", () => {
    render(<SidebarUserStatusEmoji statusEmoji={null} />);
    expect(screen.queryByTestId("sidebar-user-status-emoji")).not.toBeInTheDocument();
  });

  it("renders native Workspace status emoji", () => {
    render(<SidebarUserStatusEmoji statusEmoji="☕" />);
    expect(screen.getByTestId("sidebar-user-status-emoji")).toHaveTextContent("☕");
  });

  it("renders known legacy preset name as a native emoji", () => {
    render(<SidebarUserStatusEmoji statusEmoji="speech_balloon" />);
    expect(screen.getByTestId("sidebar-user-status-emoji")).toHaveTextContent("💬");
  });

  it("does not render unknown shortcode-like legacy values", () => {
    render(<SidebarUserStatusEmoji statusEmoji="party_parrot" />);
    expect(screen.queryByTestId("sidebar-user-status-emoji")).not.toBeInTheDocument();
  });
});
