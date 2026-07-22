import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { DropdownMenu, type DropdownMenuItem, type DropdownMenuSource } from "./dropdown-menu";

describe("DropdownMenu", () => {
  it("renders action, separator, submenu, checkbox, and custom items", () => {
    const items: DropdownMenuItem[] = [
      { type: "action", key: "reply", label: "Reply", icon: "reply" },
      { type: "separator", key: "sep-1" },
      {
        type: "submenu",
        key: "folder-submenu",
        label: "Add to folder",
        icon: "folder",
        items: [{ type: "action", key: "work", label: "Work" }],
      },
      { type: "checkbox", key: "pin", label: "Pin", checked: true },
      {
        type: "custom",
        key: "custom-footer",
        render: () => <div data-testid="menu-custom">Custom block</div>,
      },
    ];

    render(
      <DropdownMenu
        open
        onOpenChange={() => {}}
        trigger={<button type="button">Open</button>}
        items={items}
      />,
    );

    expect(screen.getByRole("menuitem", { name: "Reply" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Add to folder" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemcheckbox", { name: "Pin" })).toBeInTheDocument();
    expect(screen.getByTestId("menu-custom")).toBeInTheDocument();
    // Menu surface matches header/sidebar chrome (bg-elevated) across all palettes
    expect(screen.getByRole("menu")).toHaveClass("bg-bg-elevated");
  });

  it("supports danger, disabled, and keepOpenOnSelect", () => {
    const onDelete = vi.fn();
    const onToggle = vi.fn();

    render(
      <DropdownMenu
        open
        onOpenChange={() => {}}
        trigger={<button type="button">Open</button>}
        items={[
          {
            type: "action",
            key: "delete",
            label: "Delete",
            danger: true,
            keepOpenOnSelect: true,
            onSelect: onDelete,
          },
          {
            type: "checkbox",
            key: "disabled-checkbox",
            label: "Disabled toggle",
            checked: false,
            disabled: true,
            onCheckedChange: onToggle,
          },
        ]}
      />,
    );

    const deleteItem = screen.getByRole("menuitem", { name: "Delete" });
    fireEvent.click(deleteItem);

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(deleteItem).toHaveClass("text-notice-base");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemcheckbox", { name: "Disabled toggle" })).toHaveAttribute(
      "data-disabled",
      "",
    );
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("supports keyboard selection and open state change callback", () => {
    const onOpenChange = vi.fn();
    const onReply = vi.fn();

    const ControlledHarness = (): React.JSX.Element => {
      const [open, setOpen] = React.useState(false);
      return (
        <DropdownMenu
          open={open}
          onOpenChange={(nextOpen) => {
            onOpenChange(nextOpen);
            setOpen(nextOpen);
          }}
          trigger={<button type="button">Open</button>}
          items={[{ type: "action", key: "reply", label: "Reply", onSelect: onReply }]}
        />
      );
    };

    render(<ControlledHarness />);

    fireEvent.pointerDown(screen.getByRole("button", { name: "Open" }));
    expect(onOpenChange).toHaveBeenCalled();
    expect(screen.getByRole("menuitem", { name: "Reply" })).toBeInTheDocument();

    const replyItem = screen.getByRole("menuitem", { name: "Reply" });
    replyItem.focus();
    fireEvent.keyDown(replyItem, { key: "Enter" });
    expect(onReply).toHaveBeenCalledTimes(1);
  });

  it("opens context source when anchor is provided", () => {
    const onOpenChange = vi.fn();
    const onSourceChange = vi.fn();

    render(
      <DropdownMenu
        open
        source="context"
        onSourceChange={onSourceChange}
        onOpenChange={onOpenChange}
        contextAnchor={{ left: 120, top: 180 }}
        items={[{ type: "action", key: "reply", label: "Reply" }]}
      />,
    );

    expect(screen.getByRole("menuitem", { name: "Reply" })).toBeInTheDocument();
    expect(
      document.querySelector('[data-context-menu-trigger-source="context"]'),
    ).toBeInTheDocument();
  });

  it("passes custom render context with close and source", () => {
    const sourceProbe = vi.fn<(source: DropdownMenuSource) => void>();

    const Harness = (): React.JSX.Element => {
      const [open, setOpen] = React.useState(true);
      return (
        <DropdownMenu
          open={open}
          onOpenChange={setOpen}
          trigger={<button type="button">Open</button>}
          items={[
            {
              type: "custom",
              key: "custom-with-close",
              render: (ctx) => (
                <button
                  type="button"
                  onClick={() => {
                    sourceProbe(ctx.source);
                    ctx.close();
                  }}
                >
                  Close from custom
                </button>
              ),
            },
          ]}
        />
      );
    };

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Close from custom" }));
    expect(sourceProbe).toHaveBeenCalledWith("trigger");
    expect(screen.queryByRole("button", { name: "Close from custom" })).not.toBeInTheDocument();
  });
});
