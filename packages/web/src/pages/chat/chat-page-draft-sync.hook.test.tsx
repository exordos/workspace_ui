import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useDraftStore } from "~/entities/draft/draft.model";
import { useChatPageDraftHydration } from "./chat-page-draft-sync.hook";
import type React from "react";

vi.mock("./chat-forward.lib", () => ({
  consumePendingForwardPrefill: vi.fn(() => null),
}));

describe("useChatPageDraftHydration", () => {
  beforeEach(() => {
    useDraftStore.setState({ drafts: [] });
  });

  it("hydrates composer from existing draft", () => {
    useDraftStore.setState({
      drafts: [
        {
          id: 1,
          type: "stream",
          to: [5],
          topic: "general",
          content: "saved draft",
          timestamp: 1,
        },
      ],
    });

    const composerValueRef = { current: "" } as React.RefObject<string>;
    const activeDraftIdRef = { current: null as number | null } as React.RefObject<number | null>;
    const pendingForwardPrefillRef = { current: null as string | null } as React.RefObject<
      string | null
    >;
    const setDraftInitialValue = vi.fn();

    renderHook(
      () =>
        useChatPageDraftHydration({
          draftType: "stream",
          draftTo: [5],
          draftTopic: "general",
          drafts: useDraftStore.getState().drafts,
          composerValueRef,
          activeDraftIdRef,
          pendingForwardPrefillRef,
          setDraftInitialValue,
        }),
      {
        wrapper: ({ children }) => (
          <MemoryRouter initialEntries={["/org/example.com/stream/10-general/topic/general"]}>
            {children}
          </MemoryRouter>
        ),
      },
    );

    expect(setDraftInitialValue).toHaveBeenCalledWith("saved draft");
    expect(activeDraftIdRef.current).toBe(1);
  });
});
