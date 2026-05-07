import { describe, expect, it } from "vitest";
import {
  normalizeZulipMessagesNarrowForApi,
  zulipTopicNarrowOperandForApi,
} from "./zulip-topic-narrow.lib";

describe("zulipTopicNarrowOperandForApi", () => {
  it("maps only empty topic to empty string", () => {
    expect(zulipTopicNarrowOperandForApi("")).toBe("");
    expect(zulipTopicNarrowOperandForApi("   ")).toBe("");
    expect(zulipTopicNarrowOperandForApi("general")).toBe("general");
    expect(zulipTopicNarrowOperandForApi("General")).toBe("General");
  });

  it("preserves other topic names", () => {
    expect(zulipTopicNarrowOperandForApi("bugs")).toBe("bugs");
    expect(zulipTopicNarrowOperandForApi("my-general-bug")).toBe("my-general-bug");
  });

  it("maps resolved default-style topic to empty operand", () => {
    expect(zulipTopicNarrowOperandForApi("\u2714")).toBe("");
    expect(zulipTopicNarrowOperandForApi("\u2714 general")).toBe("\u2714 general");
  });
});

describe("normalizeZulipMessagesNarrowForApi", () => {
  it("normalizes only string topic operands", () => {
    expect(
      normalizeZulipMessagesNarrowForApi([
        { operator: "stream", operand: "dev" },
        { operator: "topic", operand: "" },
      ]),
    ).toEqual([
      { operator: "stream", operand: "dev" },
      { operator: "topic", operand: "" },
    ]);
  });
});
