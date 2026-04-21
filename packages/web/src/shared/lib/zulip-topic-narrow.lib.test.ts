import { describe, expect, it } from "vitest";
import {
  normalizeZulipMessagesNarrowForApi,
  zulipTopicNarrowOperandForApi,
} from "./zulip-topic-narrow.lib";

describe("zulipTopicNarrowOperandForApi", () => {
  it("maps general (default topic placeholder) to empty string", () => {
    expect(zulipTopicNarrowOperandForApi("general")).toBe("");
    expect(zulipTopicNarrowOperandForApi("General")).toBe("");
    expect(zulipTopicNarrowOperandForApi("  general  ")).toBe("");
  });

  it("preserves other topic names", () => {
    expect(zulipTopicNarrowOperandForApi("bugs")).toBe("bugs");
    expect(zulipTopicNarrowOperandForApi("my-general-bug")).toBe("my-general-bug");
  });

  it("maps resolved default-style topic to empty operand", () => {
    expect(zulipTopicNarrowOperandForApi("\u2714 general")).toBe("");
  });
});

describe("normalizeZulipMessagesNarrowForApi", () => {
  it("normalizes only string topic operands", () => {
    expect(
      normalizeZulipMessagesNarrowForApi([
        { operator: "stream", operand: "dev" },
        { operator: "topic", operand: "general" },
      ]),
    ).toEqual([
      { operator: "stream", operand: "dev" },
      { operator: "topic", operand: "" },
    ]);
  });
});
