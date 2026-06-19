import { describe, expect, it } from "vitest";
import {
  normalizeMessengerMessagesNarrowForApi,
  messengerTopicNarrowOperandForApi,
} from "./messenger-topic-narrow.lib";

describe("messengerTopicNarrowOperandForApi", () => {
  it("maps only empty topic to empty string", () => {
    expect(messengerTopicNarrowOperandForApi("")).toBe("");
    expect(messengerTopicNarrowOperandForApi("   ")).toBe("");
    expect(messengerTopicNarrowOperandForApi("general")).toBe("general");
    expect(messengerTopicNarrowOperandForApi("General")).toBe("General");
    expect(messengerTopicNarrowOperandForApi("general chat")).toBe("");
  });

  it("preserves other topic names", () => {
    expect(messengerTopicNarrowOperandForApi("bugs")).toBe("bugs");
    expect(messengerTopicNarrowOperandForApi("my-general-bug")).toBe("my-general-bug");
  });

  it("maps resolved default-style topic to empty operand", () => {
    expect(messengerTopicNarrowOperandForApi("\u2714")).toBe("");
    expect(messengerTopicNarrowOperandForApi("\u2714 general")).toBe("\u2714 general");
  });
});

describe("normalizeMessengerMessagesNarrowForApi", () => {
  it("normalizes only string topic operands", () => {
    expect(
      normalizeMessengerMessagesNarrowForApi([
        { operator: "stream", operand: "dev" },
        { operator: "topic", operand: "" },
      ]),
    ).toEqual([
      { operator: "stream", operand: "dev" },
      { operator: "topic", operand: "" },
    ]);
  });
});
