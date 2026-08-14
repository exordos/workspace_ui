import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSidebarTopicCollapse } from "./sidebar-topic-collapse.hook";

describe("useSidebarTopicCollapse", () => {
  it("moves through active, completed, and collapsed levels", () => {
    const topics = [
      { isDone: false },
      { isDone: false },
      { isDone: false },
      { isDone: false },
      { isDone: false },
      { isDone: true },
      { isDone: true },
    ];
    const { result } = renderHook(() => useSidebarTopicCollapse(topics));

    expect(result.current).toMatchObject({
      toggleAction: "showMore",
      visibleCount: 3,
    });

    act(() => result.current.toggleTopics());
    expect(result.current).toMatchObject({
      toggleAction: "showCompleted",
      visibleCount: 5,
    });

    act(() => result.current.toggleTopics());
    expect(result.current).toMatchObject({
      toggleAction: "collapse",
      visibleCount: 7,
    });

    act(() => result.current.toggleTopics());
    expect(result.current).toMatchObject({
      toggleAction: "showMore",
      visibleCount: 3,
    });
  });

  it("opens completed topics immediately when active topics already fit", () => {
    const topics = [
      { isDone: false },
      { isDone: false },
      { isDone: true },
      { isDone: true },
      { isDone: true },
    ];
    const { result } = renderHook(() => useSidebarTopicCollapse(topics));

    expect(result.current).toMatchObject({
      expanded: false,
      hiddenCount: 2,
      toggleAction: "showCompleted",
      visibleCount: 3,
    });

    act(() => result.current.toggleTopics());
    expect(result.current).toMatchObject({
      expanded: true,
      toggleAction: "collapse",
      visibleCount: 5,
    });
  });
});
