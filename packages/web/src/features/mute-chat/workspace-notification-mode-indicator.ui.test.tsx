import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  WorkspaceStreamNotificationModeIndicator,
  WorkspaceTopicNotificationModeIndicator,
} from "./workspace-notification-mode-indicator.ui";

describe("Workspace notification mode indicators", () => {
  it.each(["all_messages", "mentions_only"] as const)("hides the %s stream mode", (mode) => {
    render(<WorkspaceStreamNotificationModeIndicator mode={mode} />);

    expect(screen.queryByTestId("workspace-notification-mode-indicator")).not.toBeInTheDocument();
  });

  it("hides the inherited topic mode", () => {
    render(<WorkspaceTopicNotificationModeIndicator mode="default" />);

    expect(screen.queryByTestId("workspace-notification-mode-indicator")).not.toBeInTheDocument();
  });

  it("shows the muted stream mode", () => {
    render(<WorkspaceStreamNotificationModeIndicator mode="muted" />);

    expect(screen.getByLabelText("Muted")).toBeInTheDocument();
  });

  it.each([
    ["mute", "Mute"],
    ["unmute", "Unmute"],
    ["follow", "Follow"],
  ] as const)("shows the %s topic override", (mode, label) => {
    render(<WorkspaceTopicNotificationModeIndicator mode={mode} />);

    expect(screen.getByLabelText(label)).toBeInTheDocument();
  });
});
