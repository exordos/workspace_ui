import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Tooltip } from "./tooltip";

describe("Tooltip", () => {
  it("renders label in tooltip element", () => {
    render(
      <Tooltip label="Reply">
        <button type="button">Go</button>
      </Tooltip>,
    );
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent("Reply");
  });

  it("associates tooltip with trigger button", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip label="Forward">
        <button type="button">Send</button>
      </Tooltip>,
    );
    await user.hover(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByRole("tooltip")).toBeVisible();
  });
});
