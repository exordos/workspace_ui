import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MailViewToolbar } from "./mail-view-toolbar.ui";

describe("MailViewToolbar", () => {
  it("prioritizes compose and search in normal mode", async () => {
    const user = userEvent.setup();
    const onComposeOpen = vi.fn();
    render(
      <MailViewToolbar
        searchQuery=""
        batchMode={false}
        selectedCount={0}
        onSearchChange={vi.fn()}
        onComposeOpen={onComposeOpen}
        onToggleBatchMode={vi.fn()}
        onBatchDelete={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /compose/i }));
    expect(onComposeOpen).toHaveBeenCalledOnce();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveAttribute("data-selection-mode", "false");
  });

  it("replaces normal actions with the selection state", async () => {
    const user = userEvent.setup();
    const onBatchDelete = vi.fn();
    render(
      <MailViewToolbar
        searchQuery=""
        batchMode
        selectedCount={2}
        onSearchChange={vi.fn()}
        onComposeOpen={vi.fn()}
        onToggleBatchMode={vi.fn()}
        onBatchDelete={onBatchDelete}
      />,
    );

    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2 selected");
    await user.click(screen.getByRole("button", { name: /delete/i }));
    expect(onBatchDelete).toHaveBeenCalledOnce();
  });
});
