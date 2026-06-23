import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LayoutNotificationPermissionBanner } from "./layout-notification-permission-banner.ui";

vi.mock("~/i18n/i18n", () => ({
  t: (key: string) => key,
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("LayoutNotificationPermissionBanner", () => {
  it("renders title, description, and both actions in expanded state", () => {
    render(
      <LayoutNotificationPermissionBanner
        enabling={false}
        onEnable={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("notifications.permissionBannerTitle")).toBeInTheDocument();
    expect(screen.getByText("notifications.permissionBannerBody")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "notifications.permissionBannerDismiss" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "notifications.permissionBannerEnable" }),
    ).toBeInTheDocument();
  });

  it("uses enabling label and disables all actions while enabling", () => {
    render(<LayoutNotificationPermissionBanner enabling onEnable={vi.fn()} onDismiss={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "notifications.permissionBannerDismiss" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "notifications.permissionBannerEnabling" }),
    ).toBeDisabled();
  });

  it("dismisses from the secondary action", () => {
    const onDismiss = vi.fn();
    render(
      <LayoutNotificationPermissionBanner
        enabling={false}
        onEnable={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "notifications.permissionBannerDismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not auto-expand on hover and expands on click", () => {
    render(
      <LayoutNotificationPermissionBanner
        enabling={false}
        onEnable={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "a11y.hideTopBanner" }));
    const collapsedTrigger = screen.getByRole("button", { name: "a11y.showTopBanner" });
    expect(collapsedTrigger).toHaveClass("group", "cursor-pointer");
    fireEvent.mouseEnter(collapsedTrigger);

    expect(
      screen.queryByRole("button", { name: "notifications.permissionBannerEnable" }),
    ).not.toBeInTheDocument();

    fireEvent.click(collapsedTrigger);
    expect(
      screen.getByRole("button", { name: "notifications.permissionBannerEnable" }),
    ).toBeInTheDocument();
  });

  it("does not auto-expand on focus and expands after activation", () => {
    render(
      <LayoutNotificationPermissionBanner
        enabling={false}
        onEnable={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "a11y.hideTopBanner" }));
    const collapsedTrigger = screen.getByRole("button", { name: "a11y.showTopBanner" });
    fireEvent.focus(collapsedTrigger);

    expect(
      screen.queryByRole("button", { name: "notifications.permissionBannerEnable" }),
    ).not.toBeInTheDocument();

    fireEvent.click(collapsedTrigger);
    expect(
      screen.getByRole("button", { name: "notifications.permissionBannerEnable" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "a11y.hideTopBanner" })).toBeInTheDocument();
  });
});
