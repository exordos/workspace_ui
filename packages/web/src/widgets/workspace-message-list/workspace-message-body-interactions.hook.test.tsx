import { createEvent, fireEvent, render, screen } from "@testing-library/react";
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

const PERMALINK_PATH = "/org/org-a/project/project-b/message/11111111-1111-4111-8111-111111111111";
function PermalinkHarness({
  href,
  onOpen,
}: Readonly<{
  href: string;
  onOpen: (path: string) => void;
}>): React.ReactElement {
  const bodyRef = useRef<HTMLDivElement>(null);
  const { handleBodyClick } = useWorkspaceMessageBodyInteractions({
    bodyRef,
    renderedHtml: href,
    enableCodeCopy: false,
    fileReferences: [],
    messageWebOrigin: "https://workspace.example",
    onOpenMessagePermalink: onOpen,
  });
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- Test stand-in for the interactive message body.
    <div ref={bodyRef} onClick={handleBodyClick}>
      <a href={href} target="_blank" rel="noreferrer">
        Message
      </a>
    </div>
  );
}
describe("trusted message permalink interactions", () => {
  it.each([PERMALINK_PATH, `https://workspace.example${PERMALINK_PATH}`])(
    "opens the full route for %s",
    (href) => {
      const onOpen = vi.fn();
      render(<PermalinkHarness href={href} onOpen={onOpen} />);
      const event = createEvent.click(screen.getByRole("link"), {
        button: 0,
        bubbles: true,
        cancelable: true,
      });
      fireEvent(screen.getByRole("link"), event);
      expect(event.defaultPrevented).toBe(true);
      expect(onOpen).toHaveBeenCalledExactlyOnceWith(PERMALINK_PATH);
    },
  );
  it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }])(
    "preserves native modified navigation %j",
    (modifiers) => {
      const onOpen = vi.fn();
      render(
        <PermalinkHarness href={`https://workspace.example${PERMALINK_PATH}`} onOpen={onOpen} />,
      );
      const event = createEvent.click(screen.getByRole("link"), {
        bubbles: true,
        cancelable: true,
        ...modifiers,
      });
      fireEvent(screen.getByRole("link"), event);
      expect(event.defaultPrevented).toBe(false);
      expect(onOpen).not.toHaveBeenCalled();
    },
  );
  it("keeps a lookalike external origin external", () => {
    const onOpen = vi.fn();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const href = `https://untrusted.example${PERMALINK_PATH}`;
    render(<PermalinkHarness href={href} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("link"));
    expect(onOpen).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(href, "_blank", "noopener,noreferrer");
    open.mockRestore();
  });
});
