import { describe, expect, it } from "vitest";
import {
  decodeTopicFromRoute,
  encodeTopicForRoute,
  EMPTY_TOPIC_ROUTE_TOKEN,
  isEmptyTopicIdentity,
  normalizeTopicForIdentity,
  topicToApiOperand,
} from "./topic-identity.lib";

describe("normalizeTopicForIdentity", () => {
  it("maps legacy general chat alias to empty default topic", () => {
    expect(normalizeTopicForIdentity("general chat")).toBe("");
    expect(normalizeTopicForIdentity("General Chat")).toBe("");
    expect(normalizeTopicForIdentity("  general chat  ")).toBe("");
  });

  it("maps Russian general chat alias to empty default topic", () => {
    expect(normalizeTopicForIdentity("общий чат")).toBe("");
  });

  it("keeps literal general topic distinct from default topic", () => {
    expect(normalizeTopicForIdentity("general")).toBe("general");
    expect(normalizeTopicForIdentity("")).toBe("");
  });

  it("preserves non-default topic names", () => {
    expect(normalizeTopicForIdentity("release")).toBe("release");
  });
});

describe("topicToApiOperand", () => {
  it("uses empty operand for general chat alias", () => {
    expect(topicToApiOperand("general chat")).toBe("");
    expect(topicToApiOperand("general")).toBe("general");
  });
});

describe("encodeTopicForRoute", () => {
  it("encodes general chat alias as empty topic route token", () => {
    expect(encodeTopicForRoute("general chat")).toBe(EMPTY_TOPIC_ROUTE_TOKEN);
  });
});

describe("decodeTopicFromRoute", () => {
  it("decodes general chat segment to empty topic identity", () => {
    expect(decodeTopicFromRoute("general chat")).toBe("");
  });
});

describe("isEmptyTopicIdentity", () => {
  it("returns true for empty and alias default topics", () => {
    expect(isEmptyTopicIdentity("")).toBe(true);
    expect(isEmptyTopicIdentity("general chat")).toBe(true);
    expect(isEmptyTopicIdentity("general")).toBe(false);
  });
});
