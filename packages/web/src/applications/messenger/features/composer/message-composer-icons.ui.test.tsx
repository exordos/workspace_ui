import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  MessageComposerAttachIcon,
  MessageComposerBottomPanelCloseIcon,
  MessageComposerBottomPanelOpenIcon,
  MessageComposerCollapseContentIcon,
  MessageComposerEmojiIcon,
  MessageComposerExpandContentIcon,
  MessageComposerSendIcon,
} from "./message-composer-icons.ui";

describe("message composer icons", () => {
  it("renders compact controls at their Figma vector bounds", () => {
    const { container } = render(
      <>
        <MessageComposerBottomPanelCloseIcon />
        <MessageComposerBottomPanelOpenIcon />
        <MessageComposerAttachIcon />
        <MessageComposerAttachIcon compact />
        <MessageComposerEmojiIcon />
        <MessageComposerSendIcon />
        <MessageComposerExpandContentIcon />
        <MessageComposerCollapseContentIcon />
      </>,
    );

    const icon = (name: string) => container.querySelector(`[data-composer-icon="${name}"]`);

    expect(icon("bottom-panel-close")).toHaveAttribute("width", "21.333");
    expect(icon("bottom-panel-close")).toHaveAttribute("height", "21.333");
    expect(icon("bottom-panel-close")).toHaveAttribute("viewBox", "0 0 21.333 21.333");
    expect(icon("bottom-panel-open")).toHaveAttribute("width", "21.333");
    expect(icon("bottom-panel-open")).toHaveAttribute("height", "21.333");
    expect(icon("bottom-panel-open")).toHaveAttribute("viewBox", "0 0 21.333 21.333");
    const attachIcons = container.querySelectorAll('[data-composer-icon="attach"]');
    expect(attachIcons).toHaveLength(2);
    expect(attachIcons[0]).toHaveAttribute("width", "14.35");
    expect(attachIcons[0]).toHaveAttribute("height", "24");
    expect(attachIcons[0]).toHaveAttribute("viewBox", "0 0 14.35 24");
    expect(attachIcons[1]).toHaveAttribute("width", "14");
    expect(attachIcons[1]).toHaveAttribute("height", "24");
    expect(attachIcons[1]).toHaveAttribute("viewBox", "0 0 14 24");
    expect(icon("emoji")).toHaveAttribute("width", "24");
    expect(icon("emoji")).toHaveAttribute("height", "24");
    expect(icon("emoji")).toHaveAttribute("viewBox", "0 0 24 24");
    expect(icon("emoji")?.querySelector("path")).toHaveAttribute("fill", "currentColor");
    expect(icon("send")).toHaveAttribute("width", "24");
    expect(icon("send")).toHaveAttribute("height", "20");
    expect(icon("expand-content")).toHaveAttribute("width", "14");
    expect(icon("expand-content")).toHaveAttribute("height", "14");
    expect(icon("expand-content")).toHaveAttribute("viewBox", "0 0 14 14");
    expect(icon("collapse-content")).toHaveAttribute("width", "14");
    expect(icon("collapse-content")).toHaveAttribute("height", "14");
    expect(icon("collapse-content")).toHaveAttribute("viewBox", "0 0 14 14");
  });
});
