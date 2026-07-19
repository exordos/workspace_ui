import { describe, expect, it } from "vitest";
import {
  getSidebarCollapsedVisibleTopicCount,
  getSidebarHiddenTopicCount,
  orderSidebarTopicsByCompletion,
  SIDEBAR_COLLAPSED_TOPIC_LIMIT,
} from "./sidebar-topic-collapse.lib";

const ACTIVE_TOPICS = [{ isDone: false }, {}, { isDone: false }] as const;

describe("sidebar-topic-collapse.lib", () => {
  it("limits collapsed topic list to three items", () => {
    expect(SIDEBAR_COLLAPSED_TOPIC_LIMIT).toBe(3);
  });

  describe("getSidebarHiddenTopicCount", () => {
    it("returns zero when topics fit the collapsed limit", () => {
      expect(getSidebarHiddenTopicCount([])).toBe(0);
      expect(getSidebarHiddenTopicCount(ACTIVE_TOPICS)).toBe(0);
    });

    it("returns overflow count above the collapsed limit", () => {
      expect(getSidebarHiddenTopicCount([{}, {}, {}, {}, {}])).toBe(2);
    });

    it("counts every done topic as hidden", () => {
      expect(getSidebarHiddenTopicCount([{}, { isDone: true }, {}])).toBe(1);
    });
  });

  describe("getSidebarCollapsedVisibleTopicCount", () => {
    it("shows three topics while collapsed", () => {
      expect(getSidebarCollapsedVisibleTopicCount(Array.from({ length: 10 }, () => ({})))).toBe(3);
    });

    it("does not reveal done topics to fill the collapsed limit", () => {
      expect(getSidebarCollapsedVisibleTopicCount([{}, { isDone: true }, {}])).toBe(2);
    });
  });

  it("orders active topics before completed topics without reordering either group", () => {
    const topics = [
      { subject: "done-a", isDone: true },
      { subject: "active-a" },
      { subject: "done-b", isDone: true },
      { subject: "active-b", isDone: false },
    ];

    expect(orderSidebarTopicsByCompletion(topics).map((topic) => topic.subject)).toEqual([
      "active-a",
      "active-b",
      "done-a",
      "done-b",
    ]);
  });
});
