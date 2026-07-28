import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useWorkspaceMessageBodyInteractions } from "./workspace-message-body-interactions.hook";

function SelectionHarness({
  text,
  onRead,
}: Readonly<{
  text: string;
  onRead: (selectedText: string | undefined) => void;
}>): React.ReactElement {
  const bodyRef = useRef<HTMLDivElement>(null);
  const { getSelectedText } = useWorkspaceMessageBodyInteractions({
    bodyRef,
    renderedHtml: text,
    enableCodeCopy: false,
    fileReferences: [],
  });

  return (
    <>
      <div ref={bodyRef} data-testid="body">
        {text}
      </div>
      <button type="button" onClick={() => onRead(getSelectedText())}>
        Read selection
      </button>
    </>
  );
}

function selectWholeBody(body: HTMLElement): void {
  const textNode = body.firstChild;
  if (textNode == null) {
    throw new Error("Selection body has no text node");
  }
  const range = document.createRange();
  range.selectNodeContents(textNode);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

describe("useWorkspaceMessageBodyInteractions selection", () => {
  it("preserves leading and trailing spaces in a meaningful selection", () => {
    const onRead = vi.fn();
    render(<SelectionHarness text="  selected text  " onRead={onRead} />);
    selectWholeBody(screen.getByTestId("body"));

    fireEvent.click(screen.getByRole("button", { name: "Read selection" }));

    expect(onRead).toHaveBeenCalledWith("  selected text  ");
  });

  it("treats a whitespace-only selection as absent", () => {
    const onRead = vi.fn();
    render(<SelectionHarness text="   " onRead={onRead} />);
    selectWholeBody(screen.getByTestId("body"));

    fireEvent.click(screen.getByRole("button", { name: "Read selection" }));

    expect(onRead).toHaveBeenCalledWith(undefined);
  });
});
