import { describe, expect, it } from "vitest";
import { isTopicResolved, toResolvedTopicName, toUnresolvedTopicName } from "./topic-resolve";

describe("topic-resolve", () => {
  it("detects resolved topics by Zulip-style checkmark prefix", () => {
    expect(isTopicResolved("incident")).toBe(false);
    expect(isTopicResolved("\u2714 incident")).toBe(true);
    expect(isTopicResolved("\u2714   incident")).toBe(true);
  });

  it("adds resolved marker only once", () => {
    expect(toResolvedTopicName("incident")).toBe("\u2714 incident");
    expect(toResolvedTopicName("\u2714 incident")).toBe("\u2714 incident");
  });

  it("removes resolved marker from topic names", () => {
    expect(toUnresolvedTopicName("\u2714 incident")).toBe("incident");
    expect(toUnresolvedTopicName("\u2714\uFE0F incident")).toBe("incident");
    expect(toUnresolvedTopicName("\u2714\uFE0E incident")).toBe("incident");
    expect(toUnresolvedTopicName("incident")).toBe("incident");
  });
});
