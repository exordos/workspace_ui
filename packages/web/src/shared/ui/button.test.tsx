import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("uses on-accent text on primary so label contrast follows the active palette", () => {
    render(
      <Button variant="primary" data-testid="primary-button">
        Connect
      </Button>,
    );

    const button = screen.getByTestId("primary-button");
    expect(button).toHaveClass("bg-accent", "text-on-accent", "font-semibold");
    expect(button).not.toHaveClass("text-black");
    // Opacity hover washes label + icon; fill-only hover keeps text solid
    expect(button.className).not.toMatch(/hover:opacity-/);
    expect(button.className).not.toMatch(/hover:bg-accent-soft/);
    expect(button.className).toMatch(/hover:bg-accent\/90/);
  });

  it("opts out of the global icon-only gray text preset (svg+label would otherwise match)", () => {
    render(
      <Button variant="primary" data-testid="primary-button">
        Connect
      </Button>,
    );

    // app.styles.css icon-only rule skips [data-icon-hover="custom"]
    expect(screen.getByTestId("primary-button")).toHaveAttribute("data-icon-hover", "custom");
  });
});
