import { describe, expect, it } from "vitest";
import { MESSAGE_BUBBLE_BODY_CLASS_NAME } from "./message-body-rich-text-classes";

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
});
