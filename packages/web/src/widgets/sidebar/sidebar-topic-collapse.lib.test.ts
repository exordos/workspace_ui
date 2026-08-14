import { describe, expect, it } from "vitest";
import {
  resolveSidebarTopicCollapseState,
  SIDEBAR_COLLAPSED_TOPIC_LIMIT,
} from "./sidebar-topic-collapse.lib";

describe("sidebar-topic-collapse.lib", () => {
  it("limits collapsed topic list to three items", () => {
    expect(SIDEBAR_COLLAPSED_TOPIC_LIMIT).toBe(3);
  });

  it("reveals active topics before completed topics", () => {
    expect(resolveSidebarTopicCollapseState(7, 5, "collapsed")).toEqual({
      expanded: false,
      hiddenCount: 2,
      toggleAction: "showMore",
      visibleCount: 3,
    });
    expect(resolveSidebarTopicCollapseState(7, 5, "unfinished")).toEqual({
      expanded: true,
      hiddenCount: 2,
      toggleAction: "showCompleted",
      visibleCount: 5,
    });
    expect(resolveSidebarTopicCollapseState(7, 5, "all")).toEqual({
      expanded: true,
      hiddenCount: 0,
      toggleAction: "collapse",
      visibleCount: 7,
    });
  });

  it("skips active reveal when all active topics fit in the initial three", () => {
    expect(resolveSidebarTopicCollapseState(5, 2, "collapsed")).toEqual({
      expanded: false,
      hiddenCount: 2,
      toggleAction: "showCompleted",
      visibleCount: 3,
    });
  });

  it("offers collapse after revealing an active-only list", () => {
    expect(resolveSidebarTopicCollapseState(5, 5, "unfinished")).toEqual({
      expanded: true,
      hiddenCount: 0,
      toggleAction: "collapse",
      visibleCount: 5,
    });
  });

  it("hides the toggle when every topic fits in the initial three", () => {
    expect(resolveSidebarTopicCollapseState(3, 2, "collapsed")).toEqual({
      expanded: false,
      hiddenCount: 0,
      toggleAction: null,
      visibleCount: 3,
    });
  });
});
