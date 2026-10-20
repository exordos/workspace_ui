import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

const SEMANTIC_CASES = [
  {
    variant: "primary",
    classes: ["bg-accent", "text-on-accent", "hover:bg-accent/90", "active:bg-accent/80"],
    disabledClasses: ["disabled:hover:bg-accent", "disabled:active:bg-accent"],
  },
  {
    variant: "neutral",
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
    variant: "danger",
    classes: ["bg-danger", "text-white", "hover:bg-danger/90", "active:bg-danger/80"],
    disabledClasses: ["disabled:hover:bg-danger", "disabled:active:bg-danger"],
  },
] as const;

const APPEARANCE_CASES = [
  {
    appearance: "filled",
    variant: "primary",
    classes: ["bg-accent", "text-on-accent"],
  },
  {
    appearance: "outline",
    variant: "primary",
    classes: ["border", "border-accent", "bg-transparent", "text-accent"],
  },
  {
    appearance: "outline",
    variant: "neutral",
    classes: ["border", "border-border-subtle", "bg-transparent", "text-text-primary"],
  },
  {
    appearance: "outline",
    variant: "danger",
    classes: ["border", "border-danger/30", "bg-transparent", "text-danger"],
  },
  {
    appearance: "ghost",
    variant: "neutral",
    classes: ["bg-transparent", "text-text-muted", "hover:bg-bg-elevated/60"],
  },
  {
    appearance: "ghost",
    variant: "primary",
    classes: ["bg-transparent", "text-accent", "hover:bg-accent/10"],
  },
  {
    appearance: "ghost",
    variant: "danger",
    classes: ["bg-transparent", "text-danger", "hover:bg-danger/10"],
  },
] as const;

describe("Button", () => {
  it("uses primary filled medium as the default", () => {
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

  it.each(SEMANTIC_CASES)(
    "supports the complete filled $variant state contract",
    ({ variant, classes, disabledClasses }) => {
      render(
        <Button variant={variant} appearance="filled" data-testid="semantic-button">
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

  it.each(APPEARANCE_CASES)(
    "supports the $appearance $variant combination",
    ({ appearance, variant, classes }) => {
      render(
        <Button appearance={appearance} variant={variant} data-testid="appearance-button">
          Action
        </Button>,
      );

      expect(screen.getByTestId("appearance-button")).toHaveClass(...classes);
    },
  );

  it.each([
    ["sm", "h-8", "px-3", "text-xs"],
    ["md", "h-9", "px-4", "text-sm"],
    ["lg", "h-10", "px-4", "text-sm", "leading-5"],
  ] as const)("supports %s geometry", (size, ...classes) => {
    render(
      <Button variant="neutral" appearance="filled" size={size} data-testid="sized-button">
        Continue
      </Button>,
    );

    expect(screen.getByTestId("sized-button")).toHaveClass(...classes);
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
