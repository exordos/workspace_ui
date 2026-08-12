import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  WORKSPACE_MESSAGE_QUOTE_FRAME_CLASS_NAME,
  WorkspaceMessageQuoteFrame,
} from "./workspace-message-quote-frame.ui";

describe("WorkspaceMessageQuoteFrame", () => {
  it("renders accent header chrome and body children", () => {
    const { container } = render(
      <WorkspaceMessageQuoteFrame header="Alice">quoted body</WorkspaceMessageQuoteFrame>,
    );

    const frame = container.firstElementChild;
    expect(frame).not.toBeNull();
    expect(frame?.className).toContain(WORKSPACE_MESSAGE_QUOTE_FRAME_CLASS_NAME.split(" ")[0]);
    expect(frame?.className).toContain("border-l-2");
    expect(frame?.className).toContain("border-accent");
    expect(screen.getByText("Alice")).toHaveClass("text-accent");
    expect(screen.getByText("quoted body")).toBeInTheDocument();
  });

  it("mutes the header when unavailable", () => {
    render(
      <WorkspaceMessageQuoteFrame header="Unavailable" headerMuted>
        body
      </WorkspaceMessageQuoteFrame>,
    );

    expect(screen.getByText("Unavailable")).toHaveClass("text-text-muted");
    expect(screen.getByText("Unavailable")).not.toHaveClass("text-accent");
  });

  it("uses composer surface fill without the message soft background", () => {
    const { container } = render(
      <WorkspaceMessageQuoteFrame header="Alice" surface="composer">
        body
      </WorkspaceMessageQuoteFrame>,
    );

    expect(container.firstElementChild).toHaveClass(
      "bg-composer-outer",
      "border-l-2",
      "border-accent",
    );
    expect(container.firstElementChild).not.toHaveClass("bg-bg/35");
  });
});
