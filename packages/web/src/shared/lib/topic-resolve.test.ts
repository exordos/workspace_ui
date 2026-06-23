import { describe, expect, it } from "vitest";
import { formatTopicDoneLabel } from "./topic-resolve";

describe("topic-resolve", () => {
  it("adds a visual done marker without changing the underlying topic name", () => {
    expect(formatTopicDoneLabel("incident", true)).toBe("\u2714 incident");
    expect(formatTopicDoneLabel("incident", false)).toBe("incident");
  });

  it("does not render a marker for blank labels", () => {
    expect(formatTopicDoneLabel(" ", true)).toBe(" ");
  });
});
