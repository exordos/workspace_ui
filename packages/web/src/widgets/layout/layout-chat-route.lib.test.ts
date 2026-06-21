import { describe, expect, it } from "vitest";
import { testMessageId } from "~/test/factories";
import { parseFocusedMessageIdFromSearch } from "./layout-chat-route.lib";

describe("parseFocusedMessageIdFromSearch", () => {
  it("parses uuid msg query param", () => {
    expect(parseFocusedMessageIdFromSearch(`?msg=${testMessageId(42)}`)).toBe(testMessageId(42));
  });

  it("returns null for invalid msg", () => {
    expect(parseFocusedMessageIdFromSearch("?msg=abc")).toBeNull();
    expect(parseFocusedMessageIdFromSearch("")).toBeNull();
  });
});
