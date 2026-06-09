import { describe, expect, it } from "vitest";
import { summarizeMessageIdsForFlowDebug, summarizeScrollElement } from "./pipeline-trace.lib";

describe("pipeline-trace scroll helpers", () => {
  it("summarizeScrollElement computes distance from bottom and atBottom", () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "scrollTop", { value: 100, configurable: true });
    Object.defineProperty(el, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(el, "clientHeight", { value: 400, configurable: true });

    const metrics = summarizeScrollElement(el, 80);
    expect(metrics).toEqual({
      scrollTop: 100,
      scrollHeight: 1000,
      clientHeight: 400,
      distanceFromBottom: 500,
      atBottom: false,
    });
  });

  it("summarizeMessageIdsForFlowDebug returns count and min/max", () => {
    expect(summarizeMessageIdsForFlowDebug([])).toEqual({
      count: 0,
      minId: null,
      maxId: null,
    });
    expect(summarizeMessageIdsForFlowDebug([5, 2, 9])).toEqual({
      count: 3,
      minId: 2,
      maxId: 9,
    });
  });
});
