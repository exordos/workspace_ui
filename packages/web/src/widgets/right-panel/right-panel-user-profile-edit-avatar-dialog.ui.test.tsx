import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { t } from "~/i18n/i18n";
import { RightPanelUserProfileEditAvatarDialog } from "./right-panel-user-profile-edit-avatar-dialog.ui";

describe("RightPanelUserProfileEditAvatarDialog", () => {
  it("renders Figma actions and cancel", () => {
    render(
      <RightPanelUserProfileEditAvatarDialog
        open
        onOpenChange={vi.fn()}
        hasAvatar
        onTakePhoto={vi.fn()}
        onChooseFromGallery={vi.fn()}
        onRemoveCurrentPhoto={vi.fn()}
      />,
    );

    const body = screen.getByTestId("right-panel-edit-avatar-dialog");
    expect(body).toBeInTheDocument();
    // Pad 12/20 + gap 20 между actions и Cancel (Figma Frame 2087327592).
    expect(body).toHaveClass("gap-5", "px-3", "py-5");

    // Shell: 323px, radius 12 (2xl), без shadow — только border-subtle.
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass(
      "w-[323px]",
      "rounded-2xl",
      "border-border-subtle",
      "bg-bg-elevated",
    );
    expect(dialog).not.toHaveClass("shadow-xl");

    const takePhoto = screen.getByTestId("right-panel-edit-avatar-take-photo");
    expect(takePhoto).toHaveTextContent(t("settings.takePhoto"));
    // Ряд 32px, Regular 14/20, gap иконка→текст 12.
    expect(takePhoto).toHaveClass("h-8", "gap-3", "text-sm", "font-normal", "leading-5");

    expect(screen.getByTestId("right-panel-edit-avatar-choose-gallery")).toHaveTextContent(
      t("settings.chooseFromGallery"),
    );

    const remove = screen.getByTestId("right-panel-edit-avatar-remove");
    expect(remove).toHaveTextContent(t("settings.removeCurrentPhoto"));
    // Destructive в макете #f04c4c → call-red.
    expect(remove.querySelector("span.text-call-red")).toBeTruthy();

    const cancel = screen.getByTestId("right-panel-edit-avatar-cancel");
    expect(cancel).toHaveTextContent(t("common.cancel"));
    expect(cancel).toHaveClass(
      "h-10",
      "rounded-lg",
      "bg-card-bg-active",
      "text-sm",
      "font-medium",
      "leading-5",
      "text-accent",
    );
  });

  it("disables remove when there is no avatar", () => {
    render(
      <RightPanelUserProfileEditAvatarDialog
        open
        onOpenChange={vi.fn()}
        hasAvatar={false}
        onTakePhoto={vi.fn()}
        onChooseFromGallery={vi.fn()}
        onRemoveCurrentPhoto={vi.fn()}
      />,
    );

    expect(screen.getByTestId("right-panel-edit-avatar-remove")).toBeDisabled();
  });

  it("invokes action callbacks on click", () => {
    const onTakePhoto = vi.fn();
    const onChooseFromGallery = vi.fn();
    const onRemoveCurrentPhoto = vi.fn();

    render(
      <RightPanelUserProfileEditAvatarDialog
        open
        onOpenChange={vi.fn()}
        hasAvatar
        onTakePhoto={onTakePhoto}
        onChooseFromGallery={onChooseFromGallery}
        onRemoveCurrentPhoto={onRemoveCurrentPhoto}
      />,
    );

    fireEvent.click(screen.getByTestId("right-panel-edit-avatar-take-photo"));
    fireEvent.click(screen.getByTestId("right-panel-edit-avatar-choose-gallery"));
    fireEvent.click(screen.getByTestId("right-panel-edit-avatar-remove"));

    expect(onTakePhoto).toHaveBeenCalledTimes(1);
    expect(onChooseFromGallery).toHaveBeenCalledTimes(1);
    expect(onRemoveCurrentPhoto).toHaveBeenCalledTimes(1);
  });

  it("shows error message when provided", () => {
    render(
      <RightPanelUserProfileEditAvatarDialog
        open
        onOpenChange={vi.fn()}
        hasAvatar
        error={t("settings.avatarUnsupported")}
        onTakePhoto={vi.fn()}
        onChooseFromGallery={vi.fn()}
        onRemoveCurrentPhoto={vi.fn()}
      />,
    );

    expect(screen.getByTestId("right-panel-edit-avatar-error")).toHaveTextContent(
      t("settings.avatarUnsupported"),
    );
  });
});
