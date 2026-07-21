import { describe, expect, it } from "vitest";
import {
  SIDEBAR_STREAM_GROUP_RAIL_CLASS,
  SIDEBAR_TOPIC_LIST_CLASS,
  isWorkspaceSidebarStreamHighlighted,
  sidebarNewTopicButtonClass,
  sidebarStreamGroupClass,
  sidebarTopicRowLinkClass,
  sidebarTopicShowMoreButtonClass,
} from "./sidebar-chat-row-layout.lib";

describe("sidebarStreamGroupClass", () => {
  it("returns empty string when the stream is collapsed", () => {
    expect(sidebarStreamGroupClass(false)).toBe("");
  });

  it("clips the rail with overflow + radius instead of rounding the bar itself", () => {
    const classes = sidebarStreamGroupClass(true);
    expect(classes).toContain("flex");
    expect(classes).toContain("items-stretch");
    expect(classes).toContain("overflow-hidden");
    expect(classes).toContain("rounded-lg");
  });
});

describe("SIDEBAR_STREAM_GROUP_RAIL_CLASS", () => {
  it("is a straight 3px accent strip; corner curve comes from the group shell", () => {
    expect(SIDEBAR_STREAM_GROUP_RAIL_CLASS).toContain("w-[3px]");
    expect(SIDEBAR_STREAM_GROUP_RAIL_CLASS).toContain("bg-sidebar-sender");
    expect(SIDEBAR_STREAM_GROUP_RAIL_CLASS).not.toContain("rounded");
  });
});

describe("sidebarTopicRowLinkClass", () => {
  it("uses a full-width rounded card without a colored left stripe", () => {
    const classes = sidebarTopicRowLinkClass(false);
    expect(classes).toContain("rounded-lg");
    expect(classes).toContain("pl-[38px]");
    expect(classes).not.toContain("border-l");
    expect(classes).not.toContain("indicator-yellow");
  });

  it("keeps a tighter indent in compact density", () => {
    expect(sidebarTopicRowLinkClass(true)).toContain("pl-9");
    expect(sidebarTopicRowLinkClass(true)).toContain("rounded-md");
  });
});

describe("SIDEBAR_TOPIC_LIST_CLASS", () => {
  it("spaces topic cards without the legacy indent rail", () => {
    expect(SIDEBAR_TOPIC_LIST_CLASS).toContain("space-y-1");
    expect(SIDEBAR_TOPIC_LIST_CLASS).not.toContain("border-l");
    expect(SIDEBAR_TOPIC_LIST_CLASS).not.toContain("ml-4");
  });
});

describe("sidebarNewTopicButtonClass", () => {
  it("matches Figma: 12px regular, leading 20, secondary color", () => {
    const classes = sidebarNewTopicButtonClass(false);
    expect(classes).toContain("pl-[38px]");
    expect(classes).toContain("text-xs");
    expect(classes).toContain("font-normal");
    expect(classes).toContain("leading-5");
    expect(classes).toContain("text-text-secondary");
    expect(classes).not.toContain("font-medium");
  });
});

describe("sidebarTopicShowMoreButtonClass", () => {
  it("matches Figma show-more strip: 38px left inset, 14/20 medium, space-between", () => {
    const classes = sidebarTopicShowMoreButtonClass(false);
    expect(classes).toContain("pl-[38px]");
    expect(classes).toContain("pr-2");
    expect(classes).toContain("py-2");
    expect(classes).toContain("justify-between");
    expect(classes).toContain("text-left");
    expect(classes).toContain("text-sm");
    expect(classes).toContain("font-medium");
    expect(classes).toContain("leading-5");
    expect(classes).toContain("bg-card-bg-active");
    expect(classes).not.toContain("flex-1");
    // Radius comes from the stream group shell (overflow-hidden), not this strip.
    expect(classes).not.toContain("rounded");
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

  it("highlights only when this stream is the active route without a topic", () => {
    expect(
      isWorkspaceSidebarStreamHighlighted({
        streamUuid,
        activeStreamUuid: streamUuid,
        activeTopicUuid: null,
      }),
    ).toBe(true);
  });

  it("does not highlight when a topic inside this stream is open", () => {
    expect(
      isWorkspaceSidebarStreamHighlighted({
        streamUuid,
        activeStreamUuid: streamUuid,
        activeTopicUuid: "topic-1",
      }),
    ).toBe(false);
  });

  it("does not highlight another stream even if this one stays expanded in the UI", () => {
    expect(
      isWorkspaceSidebarStreamHighlighted({
        streamUuid,
        activeStreamUuid: "stream-b",
        activeTopicUuid: null,
      }),
    ).toBe(false);
  });
});
