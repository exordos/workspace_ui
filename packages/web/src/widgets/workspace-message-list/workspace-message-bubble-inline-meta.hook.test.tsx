import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveWorkspaceMessageMetaAnchor,
  useWorkspaceMessageInlineMeta,
  WORKSPACE_MESSAGE_META_ANCHOR_ATTRIBUTE,
} from "./workspace-message-bubble-inline-meta.hook";
import type React from "react";

const MOUNTED_NODES: HTMLElement[] = [];

function mount<T extends HTMLElement>(element: T): T {
  document.body.append(element);
  MOUNTED_NODES.push(element);
  return element;
}

function createBody(innerHtml: string): HTMLDivElement {
  const body = document.createElement("div");
  body.innerHTML = innerHtml;
  return mount(body);
}

function createMeta(): HTMLSpanElement {
  const meta = document.createElement("span");
  meta.textContent = "09:14";
  return mount(meta);
}

afterEach(() => {
  for (const node of MOUNTED_NODES.splice(0)) {
    node.remove();
  }
});

describe("resolveWorkspaceMessageMetaAnchor", () => {
  it("anchors on the trailing paragraph of a directly injected body", () => {
    const body = createBody("<p>first</p><p>last</p>");

    const anchor = resolveWorkspaceMessageMetaAnchor(body);

    expect(anchor?.tagName).toBe("P");
    expect(anchor?.textContent).toBe("last");
  });

  it("anchors on the trailing paragraph inside an html segment wrapper", () => {
    const body = createBody(
      [
        '<div data-workspace-quote="true"><p>quoted</p></div>',
        '<div data-workspace-message-html-segment="true"><p>tail text</p></div>',
      ].join(""),
    );

    const anchor = resolveWorkspaceMessageMetaAnchor(body);

    expect(anchor?.tagName).toBe("P");
    expect(anchor?.textContent).toBe("tail text");
  });

  it("returns null when the message ends with a quote card", () => {
    const body = createBody(
      [
        '<div data-workspace-message-html-segment="true"><p>intro</p></div>',
        '<div data-workspace-quote="true"><p>quoted tail</p></div>',
      ].join(""),
    );

    expect(resolveWorkspaceMessageMetaAnchor(body)).toBeNull();
  });

  it("returns null when the message ends with a non-text block", () => {
    expect(
      resolveWorkspaceMessageMetaAnchor(createBody("<p>intro</p><ul><li>one</li></ul>")),
    ).toBeNull();
    expect(
      resolveWorkspaceMessageMetaAnchor(createBody("<p>intro</p><pre><code>x</code></pre>")),
    ).toBeNull();
  });

  it("returns null for an empty body", () => {
    expect(resolveWorkspaceMessageMetaAnchor(createBody(""))).toBeNull();
  });
});

describe("useWorkspaceMessageInlineMeta", () => {
  function renderInlineMeta(body: HTMLDivElement, contentKey: string) {
    const bodyRef: React.RefObject<HTMLDivElement | null> = { current: body };
    const metaRef: React.RefObject<HTMLSpanElement | null> = { current: createMeta() };

    return renderHook(
      ({ key }: { key: string }) =>
        useWorkspaceMessageInlineMeta({
          bodyRef,
          metaRef,
          preferInline: true,
          contentKey: key,
        }),
      { initialProps: { key: contentKey } },
    );
  }

  it("keeps inline meta and marks the anchor when the tail is a paragraph", () => {
    const body = createBody("<p>hello</p>");

    const { result } = renderInlineMeta(body, "<p>hello</p>");
    const anchor = body.querySelector("p");

    expect(result.current).toBe(true);
    expect(anchor).toHaveAttribute(WORKSPACE_MESSAGE_META_ANCHOR_ATTRIBUTE, "true");
    expect(anchor?.style.getPropertyValue("--workspace-message-bubble-meta-width")).not.toBe("");
    expect(anchor?.style.getPropertyValue("--workspace-message-bubble-meta-height")).not.toBe("");
  });

  it("falls back to row placement when no anchor can be resolved", () => {
    const body = createBody("<ul><li>one</li></ul>");

    const { result } = renderInlineMeta(body, "<ul><li>one</li></ul>");

    expect(result.current).toBe(false);
    expect(body.querySelector(`[${WORKSPACE_MESSAGE_META_ANCHOR_ATTRIBUTE}]`)).toBeNull();
  });

  it("retries inline meta after the message content changes", () => {
    const body = createBody("<ul><li>one</li></ul>");
    const { result, rerender } = renderInlineMeta(body, "<ul><li>one</li></ul>");

    expect(result.current).toBe(false);

    body.innerHTML = "<p>edited into text</p>";
    rerender({ key: "<p>edited into text</p>" });

    expect(result.current).toBe(true);
    expect(body.querySelector("p")).toHaveAttribute(
      WORKSPACE_MESSAGE_META_ANCHOR_ATTRIBUTE,
      "true",
    );
  });

  it("releases the previous anchor when the content changes", () => {
    const body = createBody("<p>first</p>");
    const { rerender } = renderInlineMeta(body, "<p>first</p>");
    const firstAnchor = body.querySelector("p");

    expect(firstAnchor).toHaveAttribute(WORKSPACE_MESSAGE_META_ANCHOR_ATTRIBUTE, "true");

    body.innerHTML = "<p>second</p>";
    rerender({ key: "<p>second</p>" });

    expect(firstAnchor).not.toHaveAttribute(WORKSPACE_MESSAGE_META_ANCHOR_ATTRIBUTE);
    expect(body.querySelectorAll(`[${WORKSPACE_MESSAGE_META_ANCHOR_ATTRIBUTE}]`)).toHaveLength(1);
  });

  it("clears the anchor on unmount", () => {
    const body = createBody("<p>hello</p>");
    const { unmount } = renderInlineMeta(body, "<p>hello</p>");
    const anchor = body.querySelector("p");

    unmount();

    expect(anchor).not.toHaveAttribute(WORKSPACE_MESSAGE_META_ANCHOR_ATTRIBUTE);
    expect(anchor?.style.getPropertyValue("--workspace-message-bubble-meta-width")).toBe("");
  });
});
