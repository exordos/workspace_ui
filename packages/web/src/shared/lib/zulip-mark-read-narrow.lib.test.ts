import { describe, expect, it } from "vitest";
import {
  buildSidebarMarkReadNarrowForChannel,
  buildSidebarMarkReadNarrowForDm,
  buildSidebarMarkReadNarrowForTopic,
} from "./zulip-mark-read-narrow.lib";

describe("zulip-mark-read-narrow", () => {
  it("builds dm narrow with is:unread", () => {
    expect(buildSidebarMarkReadNarrowForDm([10, 20])).toEqual([
      { operator: "is", operand: "unread", negated: false },
      { operator: "dm", operand: [10, 20] },
    ]);
  });

  it("builds channel narrow with is:unread", () => {
    expect(buildSidebarMarkReadNarrowForChannel(588)).toEqual([
      { operator: "is", operand: "unread", negated: false },
      { operator: "channel", operand: 588 },
    ]);
  });

  it("builds topic narrow with channel and topic operands", () => {
    expect(buildSidebarMarkReadNarrowForTopic(588, "general")).toEqual([
      { operator: "is", operand: "unread", negated: false },
      { operator: "channel", operand: 588 },
      { operator: "topic", operand: "general" },
    ]);
  });
});
