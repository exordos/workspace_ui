import { describe, expect, it } from "vitest";
import {
  SIDEBAR_STREAM_GROUP_CLASS,
  SIDEBAR_STREAM_PREVIEW_LINK_CLASS,
  SIDEBAR_TOPIC_BAR_CLASS,
  SIDEBAR_TOPIC_LIST_CLASS,
  formatSidebarTopicTitle,
  isWorkspaceSidebarStreamHighlighted,
  resolveSidebarTopicBarColor,
  sidebarTopicRowLinkClass,
  sidebarTopicShowMoreButtonClass,
} from "./sidebar-chat-row-layout.lib";
import { TOPIC_BAR_FALLBACK_COLOR } from "./sidebar.lib";

describe("SIDEBAR_STREAM_GROUP_CLASS", () => {
  it("uses base card-bg for the shell in both collapsed and expanded states", () => {
    expect(SIDEBAR_STREAM_GROUP_CLASS).toContain("overflow-hidden");
    expect(SIDEBAR_STREAM_GROUP_CLASS).toContain("rounded-lg");
    expect(SIDEBAR_STREAM_GROUP_CLASS).toContain("bg-card-bg");
    expect(SIDEBAR_STREAM_GROUP_CLASS).not.toContain("bg-card-bg-active");
    expect(SIDEBAR_STREAM_GROUP_CLASS).not.toContain("items-stretch");
  });
});

describe("SIDEBAR_STREAM_PREVIEW_LINK_CLASS", () => {
  it("uses card underlay for nested hover so it stays visible on a hovered stream row", () => {
    expect(SIDEBAR_STREAM_PREVIEW_LINK_CLASS).toContain("hover:bg-card-bg");
    expect(SIDEBAR_STREAM_PREVIEW_LINK_CLASS).toContain("focus-visible:bg-card-bg");
    expect(SIDEBAR_STREAM_PREVIEW_LINK_CLASS).not.toContain("sidebar-hover");
    expect(SIDEBAR_STREAM_PREVIEW_LINK_CLASS).not.toContain("hover:bg-bg");
  });
});

describe("sidebarTopicRowLinkClass", () => {
  it("uses a shared left inset then flex gap for bar + title", () => {
    const classes = sidebarTopicRowLinkClass(false);
    expect(classes).toContain("flex");
    expect(classes).toContain("gap-3");
    expect(classes).toContain("rounded-lg");
    expect(classes).toContain("pl-[38px]");
    expect(classes).not.toContain("relative");
  });

  it("keeps a tighter indent in compact density", () => {
    expect(sidebarTopicRowLinkClass(true)).toContain("pl-9");
    expect(sidebarTopicRowLinkClass(true)).toContain("gap-2");
    expect(sidebarTopicRowLinkClass(true)).toContain("rounded-md");
  });
});

describe("SIDEBAR_TOPIC_BAR_CLASS", () => {
  it("is a flex column strip that sits with the title, not absolute on the card edge", () => {
    expect(SIDEBAR_TOPIC_BAR_CLASS).toContain("w-[3px]");
    expect(SIDEBAR_TOPIC_BAR_CLASS).toContain("shrink-0");
    expect(SIDEBAR_TOPIC_BAR_CLASS).toContain("self-stretch");
    expect(SIDEBAR_TOPIC_BAR_CLASS).not.toContain("absolute");
    expect(SIDEBAR_TOPIC_BAR_CLASS).not.toContain("left-");
  });
});

describe("resolveSidebarTopicBarColor", () => {
  it("formats an API RGB int as a CSS hex color", () => {
    expect(resolveSidebarTopicBarColor({ color: 0xffd633 })).toBe("#ffd633");
    expect(resolveSidebarTopicBarColor({ color: 0xf458d2 })).toBe("#f458d2");
    expect(resolveSidebarTopicBarColor({ color: 0 })).toBe("#000000");
  });

  it("uses a theme-neutral gray when color is missing or invalid", () => {
    expect(resolveSidebarTopicBarColor({})).toBe(TOPIC_BAR_FALLBACK_COLOR);
    expect(resolveSidebarTopicBarColor({ color: null })).toBe(TOPIC_BAR_FALLBACK_COLOR);
    expect(resolveSidebarTopicBarColor({ color: -1 })).toBe(TOPIC_BAR_FALLBACK_COLOR);
    expect(resolveSidebarTopicBarColor({ color: 0x1000000 })).toBe(TOPIC_BAR_FALLBACK_COLOR);
  });
});

describe("formatSidebarTopicTitle", () => {
  it("prefixes a hash when missing", () => {
    expect(formatSidebarTopicTitle("Тема 1")).toBe("#Тема 1");
  });

  it("does not double-prefix an existing hash", () => {
    expect(formatSidebarTopicTitle("#Общий чат")).toBe("#Общий чат");
  });
});

describe("SIDEBAR_TOPIC_LIST_CLASS", () => {
  it("spaces topic cards without a shared indent rail", () => {
    expect(SIDEBAR_TOPIC_LIST_CLASS).toContain("space-y-1");
    expect(SIDEBAR_TOPIC_LIST_CLASS).not.toContain("border-l");
    expect(SIDEBAR_TOPIC_LIST_CLASS).not.toContain("ml-4");
  });
});

describe("sidebarTopicShowMoreButtonClass", () => {
  it("matches Figma show-more strip: 38px left inset, 14/20 medium, inherits group fill", () => {
    const classes = sidebarTopicShowMoreButtonClass(false);
    expect(classes).toContain("pl-[38px]");
    expect(classes).toContain("pr-2");
    expect(classes).toContain("py-2");
    expect(classes).toContain("justify-between");
    expect(classes).toContain("gap-3");
    expect(classes).toContain("text-left");
    expect(classes).toContain("text-sm");
    expect(classes).toContain("font-medium");
    expect(classes).toContain("leading-5");
    // Expansion must not look selected — fill comes from the group shell only.
    expect(classes).not.toContain("bg-card-bg-active");
    expect(classes).not.toContain("rounded");
  });

  it("uses the same sidebar-hover surface as topic/stream cards", () => {
    const classes = sidebarTopicShowMoreButtonClass(false);
    expect(classes).toContain("hover:bg-sidebar-hover");
    expect(classes).toContain("transition-colors");
    expect(classes).not.toContain("hover:opacity-90");
    expect(sidebarTopicShowMoreButtonClass(true)).toContain("hover:bg-sidebar-hover");
  });

  it("keeps the same left inset as topic cards", () => {
    expect(sidebarTopicShowMoreButtonClass(false)).toContain("pl-[38px]");
    expect(sidebarTopicRowLinkClass(false)).toContain("pl-[38px]");
    expect(sidebarTopicShowMoreButtonClass(true)).toContain("pl-9");
    expect(sidebarTopicRowLinkClass(true)).toContain("pl-9");
  });
});

describe("isWorkspaceSidebarStreamHighlighted", () => {
  const streamUuid = "stream-a";

  it("highlights when this stream is the active route without a topic", () => {
    expect(
      isWorkspaceSidebarStreamHighlighted({
        streamUuid,
        expanded: false,
        activeStreamUuid: streamUuid,
        activeTopicUuid: null,
      }),
    ).toBe(true);
    expect(
      isWorkspaceSidebarStreamHighlighted({
        streamUuid,
        expanded: true,
        activeStreamUuid: streamUuid,
        activeTopicUuid: null,
      }),
    ).toBe(true);
  });

  it("highlights a collapsed stream when one of its topics is the active route", () => {
    // Topics are hidden while collapsed — promote highlight to the stream card.
    expect(
      isWorkspaceSidebarStreamHighlighted({
        streamUuid,
        expanded: false,
        activeStreamUuid: streamUuid,
        activeTopicUuid: "topic-1",
      }),
    ).toBe(true);
  });

  it("does not highlight an expanded stream when a topic is the active route", () => {
    // Expanded: the topic row itself carries the active highlight.
    expect(
      isWorkspaceSidebarStreamHighlighted({
        streamUuid,
        expanded: true,
        activeStreamUuid: streamUuid,
        activeTopicUuid: "topic-1",
      }),
    ).toBe(false);
  });

  it("does not highlight a different stream", () => {
    expect(
      isWorkspaceSidebarStreamHighlighted({
        streamUuid,
        expanded: false,
        activeStreamUuid: "stream-b",
        activeTopicUuid: null,
      }),
    ).toBe(false);
    expect(
      isWorkspaceSidebarStreamHighlighted({
        streamUuid,
        expanded: false,
        activeStreamUuid: "stream-b",
        activeTopicUuid: "topic-1",
      }),
    ).toBe(false);
  });
});
