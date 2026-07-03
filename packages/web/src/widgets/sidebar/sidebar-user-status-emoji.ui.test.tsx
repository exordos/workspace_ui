import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SidebarUserStatusEmoji } from "./sidebar-user-status-emoji.ui";

describe("SidebarUserStatusEmoji", () => {
  it("renders nothing when status has no emoji", () => {
    render(<SidebarUserStatusEmoji status={{ text: "Busy", away: false }} />);
    expect(screen.queryByTestId("sidebar-user-status-emoji")).not.toBeInTheDocument();
  });

  it("renders unicode status emoji", () => {
    render(
      <SidebarUserStatusEmoji
        status={{
          text: "Hi",
          away: false,
          emojiCode: "1f697",
          emojiName: "car",
          reactionType: "unicode_emoji",
        }}
      />,
    );
    expect(screen.getByTestId("sidebar-user-status-emoji")).toHaveTextContent("🚗");
  });

  it("renders realm status emoji shortcode when image data is not available", () => {
    render(
      <SidebarUserStatusEmoji
        status={{
          text: "Party",
          away: false,
          emojiCode: "42",
          emojiName: "party_parrot",
          reactionType: "realm_emoji",
        }}
      />,
    );

    expect(screen.getByTestId("sidebar-user-status-emoji")).toHaveTextContent(":party_parrot:");
  });
});
