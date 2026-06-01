import { describe, expect, it } from "vitest";
import {
  computeScrollTopAfterPrepend,
  computeScrollTopFromAnchor,
  resolveVisibleMessageAnchor,
} from "./scroll-prepend-anchor.lib";

function setRect(el: HTMLElement, rect: Partial<DOMRectReadOnly>): void {
  el.getBoundingClientRect = () =>
    ({
      x: rect.x ?? 0,
      y: rect.y ?? rect.top ?? 0,
      width: rect.width ?? 0,
      height: rect.height ?? 0,
      top: rect.top ?? 0,
      right: rect.right ?? 0,
      bottom: rect.bottom ?? 0,
      left: rect.left ?? 0,
      toJSON: () => ({}),
    }) satisfies DOMRect;
}

function appendMessage(root: HTMLElement, messageId: string, rect: Partial<DOMRectReadOnly>) {
  const node = document.createElement("div");
  node.dataset.messageId = messageId;
  setRect(node, rect);
  root.append(node);
  return node;
}

describe("computeScrollTopAfterPrepend", () => {
  it("preserves visible anchor after prepending older messages", () => {
    expect(
      computeScrollTopAfterPrepend(
        {
          scrollTop: 18,
          scrollHeight: 700,
        },
        910,
      ),
    ).toBe(228);
  });

  it("clamps to zero when next height is unexpectedly smaller", () => {
    expect(
      computeScrollTopAfterPrepend(
        {
          scrollTop: 20,
          scrollHeight: 700,
        },
        650,
      ),
    ).toBe(0);
  });
});

describe("resolveVisibleMessageAnchor", () => {
  it("returns the first visible message node with its viewport offset", () => {
    const root = document.createElement("div");
    setRect(root, { top: 100, bottom: 500 });
    appendMessage(root, "1", { top: 20, bottom: 80 });
    appendMessage(root, "2", { top: 80, bottom: 160 });
    appendMessage(root, "3", { top: 180, bottom: 260 });

    expect(resolveVisibleMessageAnchor(root)).toEqual({
      messageId: 2,
      offsetTop: -20,
    });
  });

  it("returns null when no message node is visible", () => {
    const root = document.createElement("div");
    setRect(root, { top: 100, bottom: 500 });
    appendMessage(root, "1", { top: 20, bottom: 80 });
    appendMessage(root, "2", { top: 520, bottom: 600 });

    expect(resolveVisibleMessageAnchor(root)).toBeNull();
  });
});

describe("computeScrollTopFromAnchor", () => {
  it("returns scrollTop adjusted by the anchor offset delta", () => {
    const root = document.createElement("div");
    Object.defineProperty(root, "scrollTop", { configurable: true, writable: true, value: 50 });
    setRect(root, { top: 100, bottom: 500 });
    appendMessage(root, "2", { top: 260, bottom: 320 });

    expect(computeScrollTopFromAnchor(root, { messageId: 2, offsetTop: -20 })).toBe(230);
  });

  it("returns null when the anchor message is not in the DOM", () => {
    const root = document.createElement("div");
    Object.defineProperty(root, "scrollTop", { configurable: true, writable: true, value: 50 });
    setRect(root, { top: 100, bottom: 500 });

    expect(computeScrollTopFromAnchor(root, { messageId: 2, offsetTop: -20 })).toBeNull();
  });
});
