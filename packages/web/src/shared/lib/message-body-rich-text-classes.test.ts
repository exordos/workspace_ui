import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MESSAGE_BUBBLE_BODY_CLASS_NAME } from "./message-body-rich-text-classes";

const appStyles = readFileSync(resolve(import.meta.dirname, "../../app/app.styles.css"), "utf8");

describe("message-body-rich-text-classes", () => {
  it("uses compact vertical spacing for pre blocks inside message bubbles", () => {
    expect(MESSAGE_BUBBLE_BODY_CLASS_NAME).toContain("[&_pre]:my-0.5");
    expect(MESSAGE_BUBBLE_BODY_CLASS_NAME).toContain("[&_pre]:py-1");
    expect(MESSAGE_BUBBLE_BODY_CLASS_NAME).toContain("[&_pre]:pl-1.5");
    expect(MESSAGE_BUBBLE_BODY_CLASS_NAME).toContain("[&_pre]:pr-1.5");
  });

  it("tightens spacing between Zulip quote blocks and following reply text", () => {
    expect(MESSAGE_BUBBLE_BODY_CLASS_NAME).toContain("[&_.zulip-quote-block+p]:mt-0");
    expect(MESSAGE_BUBBLE_BODY_CLASS_NAME).toContain("[&_.zulip-quote-body>:last-child]:mb-0");
  });

  it("keeps wide Markdown tables inside a horizontally scrollable bubble region", () => {
    expect(MESSAGE_BUBBLE_BODY_CLASS_NAME).toContain(
      "[&_.workspace-message-table-scroll]:max-w-full",
    );
    expect(MESSAGE_BUBBLE_BODY_CLASS_NAME).toContain(
      "[&_.workspace-message-table-scroll]:overflow-x-auto",
    );
    expect(MESSAGE_BUBBLE_BODY_CLASS_NAME).toContain("[&_table]:min-w-max");
    expect(MESSAGE_BUBBLE_BODY_CLASS_NAME).toContain("[&_th]:whitespace-nowrap");
  });

  it("uses compact typography for headings and task controls inside message bodies", () => {
    expect(MESSAGE_BUBBLE_BODY_CLASS_NAME).toContain("[&_h1]:text-lg");
    expect(MESSAGE_BUBBLE_BODY_CLASS_NAME).toContain("[&_h2]:text-base");
    expect(MESSAGE_BUBBLE_BODY_CLASS_NAME).toContain("[&_hr]:border-border-subtle");
    expect(MESSAGE_BUBBLE_BODY_CLASS_NAME).toContain("[&_.contains-task-list]:list-none");
    expect(MESSAGE_BUBBLE_BODY_CLASS_NAME).toContain("[&_.task-list-item]:list-none");
    expect(MESSAGE_BUBBLE_BODY_CLASS_NAME).toContain("[&_.workspace-message-task-marker]:mr-1.5");
  });

  it("keeps intentional message gaps inert and constrained by the shared body classes", () => {
    expect(MESSAGE_BUBBLE_BODY_CLASS_NAME).toContain("[&_.workspace-message-gap]:block");
    expect(MESSAGE_BUBBLE_BODY_CLASS_NAME).toContain("[&_.workspace-message-gap]:w-0");
    expect(MESSAGE_BUBBLE_BODY_CLASS_NAME).toContain("[&_.workspace-message-gap]:max-w-full");
    expect(MESSAGE_BUBBLE_BODY_CLASS_NAME).toContain("[&_.workspace-message-gap]:overflow-hidden");
    expect(MESSAGE_BUBBLE_BODY_CLASS_NAME).toContain(
      "[&_.workspace-message-gap]:pointer-events-none",
    );
  });

  it("maps the five allowed gap modifiers to line-height units and removes double paragraph spacing", () => {
    expect(appStyles).toMatch(
      /\.message-body p:has\(\+ \.workspace-message-gap\)\s*\{[^}]*margin-bottom:\s*0/s,
    );

    const expectedHeights = ["0.7", "1.4", "2.1", "2.8", "3.5"];
    for (const [index, height] of expectedHeights.entries()) {
      const gap = index + 1;
      expect(appStyles).toMatch(
        new RegExp(
          `\\.message-body \\.workspace-message-gap\\.workspace-message-gap--${gap}\\s*\\{[^}]*height:\\s*${height}lh`,
          "s",
        ),
      );
    }
  });
});
