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

function TimeViewHarness({ dateTime }: Readonly<{ dateTime: string | null }>): React.ReactElement {
  const bodyRef = useRef<HTMLDivElement>(null);
  const { closeTimeView, handleBodyClick, handleKeyDown, timeView } =
    useWorkspaceMessageBodyInteractions({
      bodyRef,
      renderedHtml: "<time>",
      enableCodeCopy: false,
      fileReferences: [],
    });
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Test stand-in for the interactive message body.
    <div
      ref={bodyRef}
      data-testid="body"
      data-time-view={timeView?.utc ?? ""}
      onClick={handleBodyClick}
      onKeyDown={handleKeyDown}
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Rendered message HTML focuses the time chip. */}
      <time className="workspace-message-time" dateTime={dateTime ?? undefined} tabIndex={0}>
        Monday
      </time>
      <button type="button" onClick={closeTimeView}>
        Close time view
      </button>
    </div>
  );
}

describe("useWorkspaceMessageBodyInteractions time view", () => {
  it("opens the stored instant from a time chip by click and by keyboard", () => {
    render(<TimeViewHarness dateTime="2026-10-13T10:02:00Z" />);
    const body = screen.getByTestId("body");
    const chip = screen.getByText("Monday");

    fireEvent.click(chip);
    expect(body).toHaveAttribute("data-time-view", "2026-10-13T10:02:00Z");

    fireEvent.click(screen.getByRole("button", { name: "Close time view" }));
    expect(body).toHaveAttribute("data-time-view", "");

    chip.focus();
    fireEvent.keyDown(chip, { key: "Enter" });
    expect(body).toHaveAttribute("data-time-view", "2026-10-13T10:02:00Z");
  });

  it("ignores a chip without a stored instant", () => {
    render(<TimeViewHarness dateTime={null} />);

    fireEvent.click(screen.getByText("Monday"));

    expect(screen.getByTestId("body")).toHaveAttribute("data-time-view", "");
  });
});

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
