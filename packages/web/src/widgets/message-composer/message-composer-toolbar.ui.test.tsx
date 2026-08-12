import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { FormattingToolbar } from "./message-composer-toolbar.ui";

describe("FormattingToolbar", () => {
  it("keeps 32px hit areas and Figma icon dimensions in formatting order", () => {
    const { container } = render(
      <FormattingToolbar
        textareaRef={createRef<HTMLTextAreaElement>()}
        onValueChange={vi.fn()}
        fileTrigger={<button type="button">Attach</button>}
        emojiTrigger={<button type="button">Emoji</button>}
        callLinkTrigger={<button type="button">Call</button>}
        scheduleTrigger={<button type="button">Schedule</button>}
        snippetsTrigger={<button type="button">Snippets</button>}
        aiTrigger={<button type="button">AI</button>}
      />,
    );

    const toolbar = screen.getByRole("toolbar");
    expect(toolbar).toHaveClass("gap-3");
    expect(toolbar.querySelectorAll("button.composer-toolbar-btn")).toHaveLength(10);
    for (const button of toolbar.querySelectorAll("button.composer-toolbar-btn")) {
      expect(button).toHaveClass("h-8", "w-8");
    }
    const separators = toolbar.querySelectorAll("span.h-7.w-px");
    expect(separators).toHaveLength(4);

    const expectedDimensions = {
      "add-link": ["24", "14.769", "0 0 24 14.769"],
      bold: ["10.93", "16.667", "0 0 10.93 16.667"],
      italic: ["15.448", "16.747", "0 0 15.448 16.747"],
      strikethrough: ["25.333", "19.79", "0 0 25.333 19.79"],
      "numbered-list": ["21.333", "24", "0 0 21.333 24"],
      "bulleted-list": ["21.328", "19.533", "0 0 21.328 19.533"],
      quote: ["24", "21.38", "0 0 24 21.38"],
      "code-block": ["21.333", "21.333", "0 0 21.333 21.333"],
      "inline-code": ["22", "18", "0 0 22 18"],
      "spoiler-eye-off": ["25.834", "17.333", "0 0 25.834 17.333"],
    };
    for (const [icon, [width, height, viewBox]] of Object.entries(expectedDimensions)) {
      const glyph = container.querySelector(`[data-composer-icon="${icon}"]`);
      expect(glyph).toHaveAttribute("width", width);
      expect(glyph).toHaveAttribute("height", height);
      expect(glyph).toHaveAttribute("viewBox", viewBox);
      expect(glyph?.querySelector("path")).toHaveAttribute("fill", "currentColor");
    }

    const labels = Array.from(toolbar.querySelectorAll("button[aria-label]")).map((button) =>
      button.getAttribute("aria-label"),
    );
    expect(labels.slice(-10)).toEqual([
      "Link",
      "Bold",
      "Italic",
      "Strikethrough",
      "Numbered list",
      "Bulleted list",
      "Quote",
      "Code block",
      "Code",
      "Spoiler",
    ]);
    expect(container.querySelector('[data-composer-icon="leaderboard"]')).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-composer-icon="inline-code"]')?.querySelectorAll("path"),
    ).toHaveLength(2);
    expect(container.querySelector('[data-composer-inline-code="brackets"]')).toHaveAttribute(
      "transform",
      "matrix(1.401 0 0 1.401 -3.944 -5.944)",
    );
    expect(container.querySelector('[data-composer-inline-code="letter-t"]')).toHaveAttribute(
      "fill",
      "currentColor",
    );
    expect(container.querySelector('[data-composer-inline-code="letter-t"]')).toHaveAttribute(
      "d",
      "M6.5 0.65H15.5V1.95H11.65V17.35H10.35V1.95H6.5V0.65Z",
    );
    expect(container.querySelector('[data-composer-icon="spoiler-eye-off"] + span')).toHaveClass(
      "rotate-[-35deg]",
    );
  });

  it("uses the frame-source button for fenced code blocks", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "message";
    textarea.setSelectionRange(0, textarea.value.length);
    const onValueChange = vi.fn();

    render(<FormattingToolbar textareaRef={{ current: textarea }} onValueChange={onValueChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Code block" }));

    expect(onValueChange).toHaveBeenCalledWith("```\nmessage\n```");
  });

  it("uses the inline-code button for single backticks", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "message";
    textarea.setSelectionRange(0, textarea.value.length);
    const onValueChange = vi.fn();

    render(<FormattingToolbar textareaRef={{ current: textarea }} onValueChange={onValueChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Code" }));

    expect(onValueChange).toHaveBeenCalledWith("`message`");
  });
});
