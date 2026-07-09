import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useHydrateDrafts } from "./draft-hydration";
import { useDraftStore } from "./draft.model";

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
  });

  it("preserves local drafts when an instance is ready", () => {
    useDraftStore
      .getState()
      .setDrafts([
        { id: 1, type: "stream", to: [10], topic: "general", content: "Draft 1", timestamp: 1 },
      ]);

    render(<Harness currentInstanceId="inst-1" currentUserStatus="ready" />);

    expect(useDraftStore.getState().drafts).toHaveLength(1);
  });

  it("clears stale drafts when readiness is lost", () => {
    useDraftStore
      .getState()
      .setDrafts([
        { id: 1, type: "stream", to: [10], topic: "general", content: "Draft 1", timestamp: 1 },
      ]);

    const { rerender } = render(<Harness currentInstanceId="inst-1" currentUserStatus="ready" />);
    rerender(<Harness currentInstanceId="inst-1" currentUserStatus="loading" />);

    expect(useDraftStore.getState().drafts).toHaveLength(0);
  });
});
