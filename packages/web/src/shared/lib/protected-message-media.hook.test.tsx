import { fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import { useProtectedMessageHtml } from "./protected-message-media.hook";

const PREVIEW_HTML = "<p><strong>Hello</strong> world</p>";

const ProtectedHtmlHarness = () => {
  const [visible, setVisible] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useProtectedMessageHtml(containerRef, PREVIEW_HTML);

  return (
    <div>
      <button type="button" onClick={() => setVisible((prev) => !prev)}>
        Toggle preview
      </button>
      {visible ? <div ref={containerRef} data-testid="preview-container" /> : null}
    </div>
  );
};

describe("useProtectedMessageHtml", () => {
  it("reinjects identical html after preview container remount", () => {
    render(<ProtectedHtmlHarness />);

    expect(screen.getByTestId("preview-container")).toHaveTextContent("Hello world");

    fireEvent.click(screen.getByRole("button", { name: "Toggle preview" }));
    expect(screen.queryByTestId("preview-container")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Toggle preview" }));
    expect(screen.getByTestId("preview-container")).toHaveTextContent("Hello world");
  });
});
