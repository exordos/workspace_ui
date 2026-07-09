/**
 * Tests for the draft entity — store actions and queries.
 *
 * Drafts are critical for preserving user work-in-progress.
 * A bug here could cause users to lose unsent messages.
 */
import { afterEach, describe, expect, it } from "vitest";
import { useDraftStore } from "./draft.model";
import type { Draft } from "./draft.types";

const STREAM_DRAFT: Draft = {
  id: 1,
  type: "stream",
  to: [10],
  topic: "general",
  content: "Hello world",
  timestamp: 1710000000,
};

const DM_DRAFT: Draft = {
  id: 2,
  type: "private",
  to: [42],
  topic: "",
  content: "Hey there",
  timestamp: 1710000100,
};

describe("useDraftStore", () => {
  afterEach(() => {
    useDraftStore.getState().clear();
  });

  // Initial state should have no drafts
  it("starts empty", () => {
    expect(useDraftStore.getState().drafts).toHaveLength(0);
  });

  // setDrafts replaces all local drafts
  it("setDrafts replaces all drafts", () => {
    useDraftStore.getState().setDrafts([STREAM_DRAFT, DM_DRAFT]);
    expect(useDraftStore.getState().drafts).toHaveLength(2);
  });

  // addDraft appends a new draft
  it("addDraft adds to the list", () => {
    useDraftStore.getState().addDraft(STREAM_DRAFT);
    expect(useDraftStore.getState().drafts).toHaveLength(1);
    expect(useDraftStore.getState().drafts[0]!.content).toBe("Hello world");
  });

  // updateDraft modifies content and timestamp
  it("updateDraft updates content by id", () => {
    useDraftStore.getState().setDrafts([STREAM_DRAFT]);
    useDraftStore.getState().updateDraft(1, { content: "Updated" });
    expect(useDraftStore.getState().drafts[0]!.content).toBe("Updated");
  });

  // updateDraft on non-existent ID is a no-op
  it("updateDraft is a no-op for unknown id", () => {
    useDraftStore.getState().setDrafts([STREAM_DRAFT]);
    useDraftStore.getState().updateDraft(999, { content: "Nope" });
    expect(useDraftStore.getState().drafts[0]!.content).toBe("Hello world");
  });

  // removeDraft deletes by id
  it("removeDraft removes by id", () => {
    useDraftStore.getState().setDrafts([STREAM_DRAFT, DM_DRAFT]);
    useDraftStore.getState().removeDraft(1);
    expect(useDraftStore.getState().drafts).toHaveLength(1);
    expect(useDraftStore.getState().drafts[0]!.id).toBe(2);
  });

  // getDraftForChat finds a matching draft by type + target
  it("getDraftForChat finds stream draft", () => {
    useDraftStore.getState().setDrafts([STREAM_DRAFT, DM_DRAFT]);
    const found = useDraftStore.getState().getDraftForChat("stream", [10], "general");
    expect(found?.content).toBe("Hello world");
  });

  it("getDraftForChat finds DM draft", () => {
    useDraftStore.getState().setDrafts([STREAM_DRAFT, DM_DRAFT]);
    const found = useDraftStore.getState().getDraftForChat("private", [42]);
    expect(found?.content).toBe("Hey there");
  });

  it("getDraftForChat returns undefined for no match", () => {
    useDraftStore.getState().setDrafts([STREAM_DRAFT]);
    expect(useDraftStore.getState().getDraftForChat("private", [99])).toBeUndefined();
  });

  it("setLocalDraft replaces an existing local-only draft for the same stream chat", () => {
    useDraftStore.getState().setDrafts([
      {
        id: null,
        type: "stream",
        to: [10],
        topic: "general",
        content: "Old local draft",
        timestamp: 1710000200,
      },
    ]);

    useDraftStore.getState().setLocalDraft({
      id: null,
      type: "stream",
      to: [10],
      topic: "general",
      content: "New local draft",
      timestamp: 1710000300,
    });

    const state = useDraftStore.getState();
    expect(state.drafts).toHaveLength(1);
    expect(state.drafts[0]!.content).toBe("New local draft");
  });

  it("removeDraftForChat removes a local-only draft by chat identity", () => {
    useDraftStore.getState().setDrafts([
      {
        id: null,
        type: "stream",
        to: [10],
        topic: "general",
        content: "Pending local stream draft",
        timestamp: 1710000500,
      },
      DM_DRAFT,
    ]);

    useDraftStore.getState().removeDraftForChat("stream", [10], "general");

    const state = useDraftStore.getState();
    expect(state.drafts).toHaveLength(1);
    expect(state.drafts[0]!.id).toBe(2);
  });

  // clear removes everything
  it("clear resets state", () => {
    useDraftStore.getState().setDrafts([STREAM_DRAFT, DM_DRAFT]);
    useDraftStore.getState().clear();
    expect(useDraftStore.getState().drafts).toHaveLength(0);
  });
});
