import { describe, expect, it } from "vitest";
import {
  decodeTopicFromRoute,
  encodeTopicForRoute,
  isEmptyTopicIdentity,
  normalizeTopicForIdentity,
  topicToApiOperand,
} from "./topic-identity.lib";

describe("normalizeTopicForIdentity", () => {
  it("preserves server-provided topic names", () => {
    expect(normalizeTopicForIdentity("general chat")).toBe("general chat");
    expect(normalizeTopicForIdentity("General Chat")).toBe("General Chat");
    expect(normalizeTopicForIdentity("  general chat  ")).toBe("general chat");
    expect(normalizeTopicForIdentity("общий чат")).toBe("общий чат");
    expect(normalizeTopicForIdentity("general")).toBe("general");
  });

  it("keeps only blank topics empty", () => {
    expect(normalizeTopicForIdentity("")).toBe("");
    expect(normalizeTopicForIdentity("   ")).toBe("");
  });
});

describe("topicToApiOperand", () => {
  it("uses empty operand only for blank topic", () => {
    expect(topicToApiOperand("")).toBe("");
    expect(topicToApiOperand("general chat")).toBe("general chat");
    expect(topicToApiOperand("general")).toBe("general");
  });
});

describe("encodeTopicForRoute", () => {
  it("preserves route topic segments without empty-topic tokens", () => {
    expect(encodeTopicForRoute("")).toBe("");
    expect(encodeTopicForRoute("general chat")).toBe("general chat");
    expect(encodeTopicForRoute("__empty__")).toBe("__empty__");
  });
});

describe("decodeTopicFromRoute", () => {
  it("decodes route topic segments as literal server topics", () => {
    expect(decodeTopicFromRoute("__empty__")).toBe("__empty__");
    expect(decodeTopicFromRoute("~__empty__")).toBe("~__empty__");
    expect(decodeTopicFromRoute("general chat")).toBe("general chat");
  });
});

describe("isEmptyTopicIdentity", () => {
  it("returns true only for blank topics", () => {
    expect(isEmptyTopicIdentity("")).toBe(true);
    expect(isEmptyTopicIdentity("   ")).toBe(true);
    expect(isEmptyTopicIdentity("general chat")).toBe(false);
    expect(isEmptyTopicIdentity("general")).toBe(false);
  });
});
