import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatPageRouteMetadataHydrate } from "./chat-page-route-metadata.hook";

const requestTopicListHydrateMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock("~/entities/chat-list/chat-list-hydrate-stream-sidebar.lib", () => ({
  requestStreamSidebarTopicListHydrate: requestTopicListHydrateMock,
}));

describe("useChatPageRouteMetadataHydrate", () => {
  beforeEach(() => {
    requestTopicListHydrateMock.mockClear();
  });

  it("hydrates topic names when the active route stream metadata becomes ready", () => {
    const streamUuid = "11111111-1111-4111-8111-111111111111";
    const { rerender } = renderHook(
      ({ activeStreamId }: { activeStreamId: string | null }) =>
        useChatPageRouteMetadataHydrate(activeStreamId),
      { initialProps: { activeStreamId: null as string | null } },
    );

    expect(requestTopicListHydrateMock).not.toHaveBeenCalled();

    rerender({ activeStreamId: streamUuid });
    expect(requestTopicListHydrateMock).toHaveBeenCalledTimes(1);
    expect(requestTopicListHydrateMock).toHaveBeenCalledWith(streamUuid);

    rerender({ activeStreamId: streamUuid });
    expect(requestTopicListHydrateMock).toHaveBeenCalledTimes(1);
  });
});
