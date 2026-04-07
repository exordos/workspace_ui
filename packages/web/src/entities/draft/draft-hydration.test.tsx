import { render, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHydrateDrafts } from "./draft-hydration";
import { useDraftStore } from "./draft.model";

const fetchDrafts = vi.hoisted(() => vi.fn());

vi.mock("./draft.api", async () => {
  const actual = await vi.importActual("./draft.api");
  return {
    ...actual,
    fetchDrafts,
  };
});

function Harness({
  currentInstanceId,
  currentUserStatus,
}: {
  currentInstanceId: string | null;
  currentUserStatus: "idle" | "loading" | "ready" | "error";
}) {
  useHydrateDrafts(currentInstanceId, currentUserStatus);
  return null;
}

describe("useHydrateDrafts", () => {
  afterEach(() => {
    useDraftStore.getState().clear();
    fetchDrafts.mockReset();
  });

  it("loads drafts when an instance is ready", async () => {
    fetchDrafts.mockResolvedValue([
      { id: 1, type: "stream", to: [10], topic: "general", content: "Draft 1", timestamp: 1 },
    ]);

    render(<Harness currentInstanceId="inst-1" currentUserStatus="ready" />);

    await waitFor(() => {
      expect(useDraftStore.getState().drafts).toHaveLength(1);
    });
  });

  it("clears stale drafts when readiness is lost", () => {
    fetchDrafts.mockResolvedValue([]);
    useDraftStore
      .getState()
      .setDrafts([
        { id: 1, type: "stream", to: [10], topic: "general", content: "Draft 1", timestamp: 1 },
      ]);

    const { rerender } = render(<Harness currentInstanceId="inst-1" currentUserStatus="ready" />);
    rerender(<Harness currentInstanceId="inst-1" currentUserStatus="loading" />);

    expect(useDraftStore.getState().drafts).toHaveLength(0);
  });

  it("preserves existing drafts when refresh fails", async () => {
    fetchDrafts.mockRejectedValue(new Error("offline"));
    useDraftStore
      .getState()
      .setDrafts([
        { id: 1, type: "stream", to: [10], topic: "general", content: "Draft 1", timestamp: 1 },
      ]);

    render(<Harness currentInstanceId="inst-1" currentUserStatus="ready" />);

    await waitFor(() => {
      expect(fetchDrafts).toHaveBeenCalledTimes(1);
    });
    await expect(fetchDrafts.mock.results[0]!.value).rejects.toThrow("offline");

    expect(useDraftStore.getState().drafts).toHaveLength(1);
  });
});
