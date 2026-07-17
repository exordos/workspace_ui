import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDraftFixture } from "~/test/factories";
import { useHydrateDrafts } from "./draft-hydration";
import { useDraftStore } from "./draft.model";

const fetchDraftsPage = vi.hoisted(() => vi.fn());

vi.mock("./draft.api", async () => {
  const actual = await vi.importActual("./draft.api");
  return {
    ...actual,
    fetchDraftsPage,
  };
});

function Harness({
  currentInstanceId,
  currentUserStatus,
}: {
  currentInstanceId: string | null;
  currentUserStatus: "idle" | "loading" | "ready" | "degraded" | "blocked";
}) {
  useHydrateDrafts(currentInstanceId, currentUserStatus);
  return null;
}

describe("useHydrateDrafts", () => {
  afterEach(() => {
    useDraftStore.getState().clear();
    fetchDraftsPage.mockReset();
  });

  it("loads the first draft page when an instance is ready", async () => {
    fetchDraftsPage.mockResolvedValue({
      drafts: [createDraftFixture({ content: "Draft 1" })],
      nextPageMarker: "next",
    });

    render(<Harness currentInstanceId="inst-1" currentUserStatus="ready" />);

    await waitFor(() => {
      expect(useDraftStore.getState()).toMatchObject({
        drafts: [{ payload: { content: "Draft 1" } }],
        nextPageMarker: "next",
        hasMore: true,
      });
    });
  });

  it("clears stale drafts when readiness is lost", () => {
    fetchDraftsPage.mockResolvedValue({ drafts: [], nextPageMarker: null });
    useDraftStore.getState().setDrafts([createDraftFixture()]);

    const { rerender } = render(<Harness currentInstanceId="inst-1" currentUserStatus="ready" />);
    rerender(<Harness currentInstanceId="inst-1" currentUserStatus="loading" />);

    expect(useDraftStore.getState().drafts).toHaveLength(0);
  });

  it("preserves existing drafts when refresh fails", async () => {
    fetchDraftsPage.mockRejectedValue(new Error("offline"));
    useDraftStore.getState().setDrafts([createDraftFixture()]);

    render(<Harness currentInstanceId="inst-1" currentUserStatus="ready" />);

    await waitFor(() => {
      expect(fetchDraftsPage).toHaveBeenCalledTimes(1);
      expect(useDraftStore.getState().loading).toBe(false);
    });
    expect(useDraftStore.getState().drafts).toHaveLength(1);
  });
});
