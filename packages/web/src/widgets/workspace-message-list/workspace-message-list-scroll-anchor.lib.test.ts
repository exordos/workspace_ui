// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  computeWorkspaceScrollTopAfterPrepend,
  computeWorkspaceScrollTopFromAnchor,
  computeWorkspaceScrollTopFromRenderAnchor,
  findWorkspaceMessageNode,
  resolveVisibleWorkspaceMessageAnchor,
  resolveVisibleWorkspaceMessageRenderAnchor,
} from "./workspace-message-list-scroll-anchor.lib";

function setRect(element: HTMLElement, rect: Pick<DOMRect, "top" | "bottom">): void {
  element.getBoundingClientRect = () => ({
    top: rect.top,
    bottom: rect.bottom,
    left: 0,
    right: 0,
    width: 0,
    height: rect.bottom - rect.top,
    x: 0,
    y: rect.top,
    toJSON: () => ({}),
  });
}

describe("workspace message scroll anchor helpers", () => {
  it("finds messages by string uuid without requiring numeric ids", () => {
    const root = document.createElement("div");
    const message = document.createElement("article");

    message.setAttribute("data-message-uuid", "topic:stream-uuid:message-uuid");
    root.append(message);

    expect(findWorkspaceMessageNode(root, "topic:stream-uuid:message-uuid")).toBe(message);
    expect(findWorkspaceMessageNode(root, "missing-message")).toBeNull();
  });

  it("resolves the first visible string-keyed message anchor", () => {
    const root = document.createElement("div");
    const hiddenBefore = document.createElement("article");
    const visible = document.createElement("article");
    const hiddenAfter = document.createElement("article");

    hiddenBefore.setAttribute("data-message-uuid", "hidden-before");
    visible.setAttribute("data-message-uuid", "visible-message");
    hiddenAfter.setAttribute("data-message-uuid", "hidden-after");
    root.append(hiddenBefore, visible, hiddenAfter);

    setRect(root, { top: 100, bottom: 300 });
    setRect(hiddenBefore, { top: 20, bottom: 80 });
    setRect(visible, { top: 140, bottom: 180 });
    setRect(hiddenAfter, { top: 340, bottom: 380 });

    expect(resolveVisibleWorkspaceMessageAnchor(root)).toEqual({
      messageKey: "visible-message",
      offsetTop: 40,
    });
  });

  it("computes scrollTop needed to keep the same anchor offset", () => {
    const root = document.createElement("div");
    const message = document.createElement("article");

    message.setAttribute("data-message-uuid", "message-after-prepend");
    root.append(message);
    root.scrollTop = 120;

    setRect(root, { top: 100, bottom: 300 });
    setRect(message, { top: 190, bottom: 240 });

    expect(
      computeWorkspaceScrollTopFromAnchor(root, {
        messageKey: "message-after-prepend",
        offsetTop: 40,
      }),
    ).toBe(170);
  });

  it("uses a render key for a stable anchor while keeping the server uuid separate", () => {
    const root = document.createElement("div");
    const message = document.createElement("article");

    message.setAttribute("data-message-uuid", "server-message-uuid");
    message.setAttribute("data-message-render-key", "outgoing:local-id");
    root.append(message);
    root.scrollTop = 120;

    setRect(root, { top: 100, bottom: 300 });
    setRect(message, { top: 190, bottom: 240 });

    expect(resolveVisibleWorkspaceMessageRenderAnchor(root)).toEqual({
      messageKey: "outgoing:local-id",
      offsetTop: 90,
    });
    expect(
      computeWorkspaceScrollTopFromRenderAnchor(root, {
        messageKey: "outgoing:local-id",
        offsetTop: 40,
      }),
    ).toBe(170);
    expect(findWorkspaceMessageNode(root, "server-message-uuid")).toBe(message);
  });

  it("falls back to scrollHeight delta after prepend", () => {
    expect(
      computeWorkspaceScrollTopAfterPrepend(
        {
          scrollTop: 80,
          scrollHeight: 600,
        },
        760,
      ),
    ).toBe(240);
  });
});
