import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

const SEMANTIC_CASES = [
  {
    tone: "accent",
    classes: ["bg-accent", "text-on-accent", "hover:bg-accent/90", "active:bg-accent/80"],
    disabledClasses: ["disabled:hover:bg-accent", "disabled:active:bg-accent"],
  },
  {
    tone: "neutral",
    classes: [
      "bg-card-bg-active",
      "text-text-primary",
      "hover:bg-bg-elevated",
      "active:bg-card-bg",
    ],
    disabledClasses: [
      "disabled:hover:border-transparent",
      "disabled:hover:bg-card-bg-active",
      "disabled:hover:ring-0",
      "disabled:active:border-transparent",
      "disabled:active:bg-card-bg-active",
      "disabled:active:ring-0",
    ],
  },
  {
    tone: "danger",
    classes: ["bg-danger", "text-white", "hover:bg-danger/90", "active:bg-danger/80"],
    disabledClasses: ["disabled:hover:bg-danger", "disabled:active:bg-danger"],
  },
] as const;

describe("Button", () => {
  it("keeps the default button as the legacy primary medium button", () => {
    render(<Button data-testid="default-button">Connect</Button>);

    expect(screen.getByTestId("default-button")).toHaveClass(
      "bg-accent",
      "text-on-accent",
      "font-semibold",
      "h-9",
      "px-4",
      "text-sm",
    );
    expect(screen.getByTestId("default-button")).not.toHaveAttribute("type");
  });

  it("keeps legacy primary and ghost styles pixel-compatible", () => {
    render(
      <>
        <Button variant="primary" data-testid="primary-button">
          Connect
        </Button>
        <Button variant="ghost" data-testid="ghost-button">
          Cancel
        </Button>
      </>,
    );

    const button = screen.getByTestId("primary-button");
    expect(button).toHaveClass("bg-accent", "text-on-accent", "font-semibold");
    expect(button).not.toHaveClass("text-black");
    // Opacity hover washes label + icon; fill-only hover keeps text solid
    expect(button.className).not.toMatch(/hover:opacity-/);
    expect(button.className).not.toMatch(/hover:bg-accent-soft/);
    expect(button.className).toMatch(/hover:bg-accent\/90/);
    expect(screen.getByTestId("ghost-button")).toHaveClass(
      "bg-transparent",
      "text-text-muted",
      "hover:bg-bg-elevated/60",
      "hover:text-text-primary",
    );
  });

  it.each(SEMANTIC_CASES)(
    "keeps the complete filled $tone state contract",
    ({ tone, classes, disabledClasses }) => {
      render(
        <Button tone={tone} data-testid="semantic-button">
          Action
        </Button>,
      );

      const button = screen.getByTestId("semantic-button");
      expect(button).toHaveClass(
        "font-medium",
        "focus-visible:ring-2",
        "disabled:pointer-events-none",
        "disabled:cursor-not-allowed",
        "disabled:opacity-50",
        ...classes,
        ...disabledClasses,
      );
      expect(button).not.toHaveClass("disabled:opacity-60");
    },
  );

  it("maps the neutral filled large style to selection action states", () => {
    render(
      <Button tone="neutral" size="lg" data-testid="selection-button">
        Forward
      </Button>,
    );

    expect(screen.getByTestId("selection-button")).toHaveClass(
      "h-10",
      "rounded-lg",
      "border",
      "border-transparent",
      "bg-card-bg-active",
      "px-4",
      "text-sm",
      "leading-5",
      "hover:border-border-subtle",
      "hover:bg-bg-elevated",
      "hover:ring-1",
      "active:border-accent-soft",
      "active:bg-card-bg",
      "active:ring-2",
      "disabled:opacity-50",
      "disabled:hover:border-transparent",
      "disabled:hover:bg-card-bg-active",
      "disabled:hover:ring-0",
      "disabled:active:border-transparent",
      "disabled:active:bg-card-bg-active",
      "disabled:active:ring-0",
    );
  });

  it("supports large geometry", () => {
    render(
      <Button tone="accent" size="lg" data-testid="large-button">
        Continue
      </Button>,
    );

    expect(screen.getByTestId("large-button")).toHaveClass("h-10", "px-4", "text-sm", "leading-5");
  });

  it("forwards native props and a button ref", () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(
      <Button
        ref={ref}
        type="submit"
        name="action"
        value="save"
        aria-label="Save"
        data-testid="native-button"
      >
        Save
      </Button>,
    );

    const button = screen.getByTestId("native-button");
    expect(ref.current).toBe(button);
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveAttribute("name", "action");
    expect(button).toHaveAttribute("value", "save");
    expect(button).toHaveAttribute("aria-label", "Save");
  });

  it("renders a leading icon before children and adds a gap only when needed", () => {
    render(
      <Button leadingIcon={<span data-testid="leading-icon">→</span>} data-testid="icon-button">
        Forward
      </Button>,
    );

    const button = screen.getByTestId("icon-button");
    expect(button.firstElementChild).toBe(screen.getByTestId("leading-icon"));
    expect(button).toHaveTextContent("→Forward");
    expect(button).toHaveClass("gap-1.5");
  });

  it("marks loading buttons busy, disabled, and renders the shared spinner", () => {
    render(
      <Button loading data-testid="loading-button">
        Save
      </Button>,
    );

    const button = screen.getByTestId("loading-button");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector(".animate-spin")).toBeInTheDocument();
    expect(button).toHaveClass("gap-1.5");
    expect(button).toHaveTextContent("Save");
  });

  it("preserves explicit aria-busy when idle and forces it while loading", () => {
    render(
      <>
        <Button aria-busy={false} data-testid="idle-button">
          Save
        </Button>
        <Button aria-busy="false" loading data-testid="busy-button">
          Save
        </Button>
      </>,
    );

    expect(screen.getByTestId("idle-button")).toHaveAttribute("aria-busy", "false");
    expect(screen.getByTestId("busy-button")).toHaveAttribute("aria-busy", "true");
  });

  it("preserves disabled passthrough, full width, custom classes, and icon hover opt-out", () => {
    render(
      <Button disabled fullWidth className="custom-button" data-testid="disabled-button">
        Disabled
      </Button>,
    );

    const button = screen.getByTestId("disabled-button");
    expect(button).toBeDisabled();
    expect(button).toHaveClass("w-full", "custom-button");
    // app.styles.css icon-only rule skips [data-icon-hover="custom"]
    expect(button).toHaveAttribute("data-icon-hover", "custom");
    expect(button).not.toHaveAttribute("aria-busy");
  });
});
