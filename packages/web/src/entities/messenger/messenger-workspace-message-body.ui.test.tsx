import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parseWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-parse.lib";
import {
  renderWorkspaceMessageBody,
  renderWorkspaceMessageBodySegments,
} from "~/shared/lib/workspace-message-render/workspace-message-render.lib";
import { WorkspaceMessageBody } from "./messenger-workspace-message-body.ui";

function renderSharedBody(markdown: string): HTMLElement {
  const document = parseWorkspaceMessageBody(markdown);
  const rendered = renderWorkspaceMessageBody(document);
  const { container } = render(
    <WorkspaceMessageBody
      html={rendered.html}
      metadata={rendered.metadata}
      useInlineMeta={false}
    />,
  );

  const body = container.querySelector<HTMLElement>("[data-message-body='true']");
  if (body == null) {
    throw new Error("Workspace message body was not rendered");
  }
  return body;
}

describe("WorkspaceMessageBody", () => {
  it("preserves safe GFM after the final DOM sanitization boundary", () => {
    const body = renderSharedBody(
      [
        "## Status",
        "",
        "| Item | Result |",
        "|---|---|",
        "| Parser | Ready |",
        "",
        "- [x] verified",
        "",
        "~~old~~",
        "",
        "---",
      ].join("\n"),
    );

    expect(body.querySelector("h2")).toHaveTextContent("Status");
    expect(body.querySelector(".workspace-message-table-scroll > table")).not.toBeNull();
    expect(body.querySelector("th")).toHaveTextContent("Item");
    expect(body.querySelector("del")).toHaveTextContent("old");
    expect(body.querySelector("hr")).not.toBeNull();
    expect(body.querySelector("ul.contains-task-list")).not.toBeNull();
    expect(body.querySelector("li.task-list-item")).toHaveTextContent("verified");
    expect(body.querySelector(".workspace-message-task-marker")).not.toBeNull();
    expect(body.querySelector("input[type='checkbox']")).toBeNull();
  });

  it("does not reactivate raw HTML that resembles allowed message markup", () => {
    const body = renderSharedBody(
      [
        "**safe Markdown**",
        "",
        '<table><tbody><tr><td data-workspace-message-link="true">raw</td></tr></tbody></table>',
        "",
        "<details><summary>raw details</summary>payload</details>",
      ].join("\n"),
    );

    expect(body.querySelector("strong")).toHaveTextContent("safe Markdown");
    expect(body.querySelector("table")).toBeNull();
    expect(body.querySelector("details")).toBeNull();
    expect(body.querySelector("[data-workspace-message-link='true']")).toBeNull();
    expect(body.textContent).toContain("<table>");
    expect(body.textContent).toContain("<details>");
  });

  it("keeps a bounded intentional gap through the final DOM sanitization boundary", () => {
    const body = renderSharedBody(["Before", "", "", "", "After"].join("\n"));

    const gap = body.querySelector<HTMLElement>(".workspace-message-gap--3");
    expect(gap).not.toBeNull();
    expect(gap).toHaveClass("workspace-message-gap");
    expect(gap).toHaveAttribute("aria-hidden", "true");
    expect(body.querySelectorAll(".workspace-message-gap")).toHaveLength(1);
    expect(body.textContent).toContain("Before");
    expect(body.textContent).toContain("After");
  });

  it("does not activate a gap element supplied through raw Markdown HTML", () => {
    const body = renderSharedBody(
      'Before\n<span class="workspace-message-gap workspace-message-gap--5" aria-hidden="true"></span>\nAfter',
    );

    expect(body.querySelector(".workspace-message-gap")).toBeNull();
    expect(body.textContent).toContain("workspace-message-gap--5");
  });

  it("mounts a standalone quote directly between body segments without adjacent gap elements", () => {
    const messageUuid = "11111111-1111-4111-8111-111111111111";
    const document = parseWorkspaceMessageBody(
      [
        "Before quote",
        ...Array.from({ length: 20 }, () => ""),
        `[Alice](urn:quote:${messageUuid})`,
        ...Array.from({ length: 20 }, () => ""),
        "After quote",
      ].join("\n"),
    );
    const rendered = renderWorkspaceMessageBodySegments(document);
    const { container } = render(
      <WorkspaceMessageBody
        html=""
        segments={rendered.segments}
        renderQuote={(segment) => (
          <aside data-rendered-workspace-quote={segment.reference.messageUuid}>Quote</aside>
        )}
        metadata={rendered.metadata}
        useInlineMeta={false}
      />,
    );

    const body = container.querySelector<HTMLElement>("[data-message-body='true']");
    const quote = body?.querySelector<HTMLElement>(
      `[data-rendered-workspace-quote='${messageUuid}']`,
    );
    expect(quote).not.toBeNull();
    expect(body?.querySelector(".workspace-message-gap")).toBeNull();
    expect(quote?.previousElementSibling).toHaveTextContent("Before quote");
    expect(quote?.nextElementSibling).toHaveTextContent("After quote");
    expect(quote?.previousElementSibling?.querySelector(".workspace-message-gap")).toBeNull();
    expect(quote?.nextElementSibling?.querySelector(".workspace-message-gap")).toBeNull();
  });

  it("drops the injected DOM when an edit switches the body to quote segments", () => {
    const messageUuid = "44444444-4444-4444-8444-444444444444";
    const plain = renderWorkspaceMessageBody(parseWorkspaceMessageBody("Same tail"));
    const withQuote = renderWorkspaceMessageBodySegments(
      parseWorkspaceMessageBody(`[Alice](urn:quote:${messageUuid})\n\nSame tail`),
    );
    const { container, rerender } = render(
      <WorkspaceMessageBody html={plain.html} metadata={plain.metadata} useInlineMeta={false} />,
    );

    rerender(
      <WorkspaceMessageBody
        html=""
        segments={withQuote.segments}
        renderQuote={(segment) => (
          <aside data-rendered-workspace-quote={segment.reference.messageUuid}>Quote</aside>
        )}
        metadata={withQuote.metadata}
        useInlineMeta={false}
      />,
    );

    const body = container.querySelector<HTMLElement>("[data-message-body='true']");

    expect(body?.querySelectorAll("p")).toHaveLength(1);
    expect(body?.firstElementChild).toHaveAttribute("data-rendered-workspace-quote", messageUuid);
  });
});
