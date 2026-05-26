import { describe, expect, it } from "vitest";
import { parseFocusedMessageIdFromSearch } from "./layout-chat-route.lib";

describe("parseFocusedMessageIdFromSearch", () => {
  it("parses positive msg query param", () => {
    expect(parseFocusedMessageIdFromSearch("?msg=42")).toBe(42);
  });

  it("returns null for invalid msg", () => {
    expect(parseFocusedMessageIdFromSearch("?msg=abc")).toBeNull();
    expect(parseFocusedMessageIdFromSearch("")).toBeNull();
  });
});
