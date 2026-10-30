import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "~/i18n/i18n";
import { WorkspaceMessageTimeView } from "./workspace-message-time-view.ui";

describe("WorkspaceMessageTimeView", () => {
  beforeEach(() => setLocale("en"));

  it("shows the stored instant as read-only date and time", () => {
    const anchor = document.createElement("time");
    const onClose = vi.fn();
    render(
      <WorkspaceMessageTimeView anchor={anchor} utc="2026-10-13T10:02:00Z" onClose={onClose} />,
    );

    const dialog = screen.getByRole("dialog", { name: "Date and time" });
    expect(within(dialog).getByRole("grid")).toHaveAttribute("aria-readonly", "true");
    expect(within(dialog).getByRole("group", { name: "Time" })).toBeInTheDocument();
    expect(within(dialog).queryAllByRole("button")).toHaveLength(0);
    expect(within(dialog).queryAllByRole("spinbutton")).toHaveLength(0);
    expect(within(dialog).getByRole("gridcell", { selected: true })).toBeInTheDocument();
    expect(dialog.querySelector('[tabindex="-1"]')).toHaveFocus();

    const date = new Date("2026-10-13T10:02:00Z");
    const expectedTime = `${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes(),
    ).padStart(2, "0")}`;
    expect(within(dialog).getByRole("status")).toHaveTextContent(expectedTime);
  });

  it("dismisses on Escape without changing the stored value", () => {
    const anchor = document.createElement("time");
    anchor.tabIndex = 0;
    document.body.append(anchor);
    const onClose = vi.fn();
    render(
      <WorkspaceMessageTimeView anchor={anchor} utc="2026-10-13T10:02:00Z" onClose={onClose} />,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(anchor).toHaveFocus();
    anchor.remove();
    expect(new Date("2026-10-13T10:02:00Z").toISOString()).toBe("2026-10-13T10:02:00.000Z");
  });
});
