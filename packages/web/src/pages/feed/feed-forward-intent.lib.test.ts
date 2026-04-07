import { describe, expect, it } from "vitest";
import { appendForwardIntentQuery } from "./feed-forward-intent.lib";

describe("appendForwardIntentQuery", () => {
  it("appends forward query when route has no search params", () => {
    expect(appendForwardIntentQuery("/stream/10-engineering/topic/bugs?msg=44", 44)).toBe(
      "/stream/10-engineering/topic/bugs?msg=44&forward=44",
    );
  });

  it("appends forward query when route has no query string", () => {
    expect(appendForwardIntentQuery("/dm/42,7", 91)).toBe("/dm/42,7?forward=91");
  });
});
