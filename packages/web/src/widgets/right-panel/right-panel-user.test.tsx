import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "~/test/render";
import { useRightDrawerStore } from "./right-drawer.model";
import { RightPanelUser } from "./right-panel-user.ui";

describe("RightPanelUser", () => {
  afterEach(() => {
    useRightDrawerStore.setState({ open: false, mode: "info", userIdOverride: null });
  });

  it("shows back control when user profile was opened on top of chat info and clears override on click", async () => {
    const user = userEvent.setup();
    useRightDrawerStore.setState({ open: true, mode: "info", userIdOverride: 99 });

    renderWithProviders(
      <RightPanelUser user={{ name: "Test User", userId: 99 }} onOpenDirectMessage={vi.fn()} />,
    );

    const back = screen.getByRole("button", { name: /back/i });
    expect(back).toBeInTheDocument();

    await user.click(back);

    expect(useRightDrawerStore.getState().userIdOverride).toBeNull();
  });

  it("does not show back when there is no userId override", () => {
    useRightDrawerStore.setState({ open: true, mode: "info", userIdOverride: null });

    renderWithProviders(<RightPanelUser user={{ name: "Partner", userId: 1 }} />);

    expect(screen.queryByRole("button", { name: /back/i })).not.toBeInTheDocument();
  });
});
