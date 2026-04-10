import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SidebarUserStatusEmoji } from "./sidebar-user-status-emoji.ui";

describe("SidebarUserStatusEmoji", () => {
  it("renders nothing when status has no emoji", () => {
    render(<SidebarUserStatusEmoji status={{ text: "Busy", away: false }} />);
    expect(screen.queryByTestId("sidebar-user-status-emoji")).not.toBeInTheDocument();
  });

  it("renders unicode emoji from emoji_code", () => {
    render(
      <SidebarUserStatusEmoji
        status={{ text: "Hi", away: false, emojiCode: "1f697", emojiName: "car", reactionType: "unicode_emoji" }}
      />,
    );
    expect(screen.getByTestId("sidebar-user-status-emoji")).toHaveTextContent("🚗");
  });
});
