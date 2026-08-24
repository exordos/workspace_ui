import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { t } from "~/i18n/i18n";
import { renderWithProviders } from "~/test/render";
import { RightPanelUserProfileActions } from "./right-panel-user-profile-actions.ui";

describe("RightPanelUserProfileActions", () => {
  it("renders share idle state with share label", () => {
    renderWithProviders(
      <RightPanelUserProfileActions variant="self" onShare={vi.fn()} shareCopied={false} />,
    );

    const share = screen.getByTestId("right-panel-profile-share");
    expect(share).toHaveTextContent(t("info.share"));
    expect(share).toHaveAttribute("data-copy-state", "idle");
  });

  it("swaps share glyph feedback to check + copied label while shareCopied", () => {
    renderWithProviders(
      <RightPanelUserProfileActions variant="self" onShare={vi.fn()} shareCopied />,
    );

    const share = screen.getByTestId("right-panel-profile-share");
    expect(share).toHaveTextContent(t("message.copied"));
    expect(share).toHaveAttribute("data-copy-state", "success");
  });

  it("invokes onShare when share button is clicked", () => {
    const onShare = vi.fn();
    renderWithProviders(<RightPanelUserProfileActions variant="self" onShare={onShare} />);

    fireEvent.click(screen.getByTestId("right-panel-profile-share"));
    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it("renders message, call, and share actions for other users", () => {
    renderWithProviders(
      <RightPanelUserProfileActions
        variant="other"
        onMessage={vi.fn()}
        onCall={vi.fn()}
        onShare={vi.fn()}
        shareCopied={false}
      />,
    );

    expect(screen.getByTestId("right-panel-user-profile-actions-other")).toBeInTheDocument();
    const message = screen.getByTestId("right-panel-profile-message");
    expect(message).toHaveTextContent(t("info.openDirectMessages"));
    expect(message.querySelector("svg")).toHaveClass("text-icon-active");
    expect(screen.getByTestId("right-panel-profile-call").querySelector("svg")).toHaveClass(
      "text-icon-active",
    );
    expect(screen.getByTestId("right-panel-profile-share").querySelector("svg")).toHaveClass(
      "text-icon-active",
    );
    expect(screen.getByTestId("right-panel-profile-call")).toHaveTextContent(t("call.call"));
    expect(screen.getByTestId("right-panel-profile-share")).toHaveTextContent(t("info.share"));
    expect(screen.queryByTestId("right-panel-profile-favorites")).not.toBeInTheDocument();
    expect(screen.queryByTestId("right-panel-profile-edit")).not.toBeInTheDocument();
  });

  it("invokes onCall and onShare from other-user actions", () => {
    const onCall = vi.fn();
    const onShare = vi.fn();
    renderWithProviders(
      <RightPanelUserProfileActions
        variant="other"
        onMessage={vi.fn()}
        onCall={onCall}
        onShare={onShare}
      />,
    );

    fireEvent.click(screen.getByTestId("right-panel-profile-call"));
    fireEvent.click(screen.getByTestId("right-panel-profile-share"));
    expect(onCall).toHaveBeenCalledTimes(1);
    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it("disables call while callPending", () => {
    renderWithProviders(
      <RightPanelUserProfileActions variant="other" onCall={vi.fn()} callPending />,
    );

    expect(screen.getByTestId("right-panel-profile-call")).toBeDisabled();
  });
});
