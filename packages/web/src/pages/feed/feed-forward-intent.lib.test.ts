import { describe, expect, it } from "vitest";
import { testMessageId } from "~/test/factories";
import { appendForwardIntentQuery } from "./feed-forward-intent.lib";

describe("appendForwardIntentQuery", () => {
  it("appends forward query when route has no search params", () => {
    expect(
      appendForwardIntentQuery(
        `/stream/10-engineering/topic/bugs?msg=${testMessageId(44)}`,
        testMessageId(44),
      ),
    ).toBe(
      `/stream/10-engineering/topic/bugs?msg=${testMessageId(44)}&forward=${testMessageId(44)}`,
    );
  });

  it("appends forward query when route has no query string", () => {
    expect(appendForwardIntentQuery("/dm/42,7", testMessageId(91))).toBe(
      `/dm/42,7?forward=${testMessageId(91)}`,
    );
  });
});
