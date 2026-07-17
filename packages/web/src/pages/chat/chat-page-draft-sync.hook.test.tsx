import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDraftStore } from "~/entities/draft/draft.model";
import { createDraftFixture } from "~/test/factories";
import { useChatPageDraftHydration } from "./chat-page-draft-sync.hook";
import type React from "react";

vi.mock("./chat-forward.lib", () => ({
  consumePendingForwardPrefill: vi.fn(() => null),
}));

const STREAM_UUID = "00000000-0000-4000-8000-000000000010";
const TOPIC_UUID = "00000000-0000-4000-8000-000000000020";

describe("useChatPageDraftHydration", () => {
  beforeEach(() => {
    useDraftStore.getState().clear();
  });

  it("hydrates the exact draft selected by the stable query parameter", () => {
    const older = createDraftFixture({
      uuid: "00000000-0000-4000-8000-000000000001",
      stream_uuid: STREAM_UUID,
      topic_uuid: TOPIC_UUID,
      content: "selected older draft",
      updated_at: "2026-07-16T10:00:00.000Z",
    });
    const newer = createDraftFixture({
      uuid: "00000000-0000-4000-8000-000000000002",
      stream_uuid: STREAM_UUID,
      topic_uuid: TOPIC_UUID,
      content: "newer sibling",
      updated_at: "2026-07-16T11:00:00.000Z",
    });
    useDraftStore.getState().setDrafts([newer, older]);

    const composerValueRef = { current: "" } as React.RefObject<string>;
    const activeDraftIdRef = { current: null as string | null } as React.RefObject<string | null>;
    const pendingForwardPrefillRef = { current: null as string | null } as React.RefObject<
      string | null
    >;
    const setDraftInitialValue = vi.fn();

    renderHook(
      () =>
        useChatPageDraftHydration({
          streamUuid: STREAM_UUID,
          topicUuid: TOPIC_UUID,
          drafts: useDraftStore.getState().drafts,
          composerValueRef,
          activeDraftIdRef,
          pendingForwardPrefillRef,
          setDraftInitialValue,
        }),
      {
        wrapper: ({ children }) => (
          <MemoryRouter
            initialEntries={[
              `/org/example.com/stream/10-general/topic/general?draft=${older.uuid}`,
            ]}
          >
            {children}
          </MemoryRouter>
        ),
      },
    );

    expect(setDraftInitialValue).toHaveBeenCalledWith("selected older draft");
    expect(activeDraftIdRef.current).toBe(older.uuid);
  });
});
