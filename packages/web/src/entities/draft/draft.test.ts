import { afterEach, describe, expect, it } from "vitest";
import { createDraftFixture } from "~/test/factories";
import { useDraftStore } from "./draft.model";

const STREAM_UUID = "00000000-0000-4000-8000-000000000010";
const TOPIC_UUID = "00000000-0000-4000-8000-000000000020";

describe("useDraftStore", () => {
  afterEach(() => {
    useDraftStore.getState().clear();
  });

  it("keeps multiple drafts for the same stream/topic and sorts newest first", () => {
    const older = createDraftFixture({
      uuid: "00000000-0000-4000-8000-000000000001",
      stream_uuid: STREAM_UUID,
      topic_uuid: TOPIC_UUID,
      content: "older",
      updated_at: "2026-07-16T10:00:00.000Z",
    });
    const newer = createDraftFixture({
      uuid: "00000000-0000-4000-8000-000000000002",
      stream_uuid: STREAM_UUID,
      topic_uuid: TOPIC_UUID,
      content: "newer",
      updated_at: "2026-07-16T11:00:00.000Z",
    });

    useDraftStore.getState().setDrafts([older, newer]);

    expect(useDraftStore.getState().getDraftsForChat(STREAM_UUID, TOPIC_UUID)).toEqual([
      newer,
      older,
    ]);
    expect(useDraftStore.getState().getLatestDraftForChat(STREAM_UUID, TOPIC_UUID)?.uuid).toBe(
      newer.uuid,
    );
  });

  it("upserts by UUID without collapsing a sibling draft in the same chat", () => {
    const first = createDraftFixture({
      uuid: "00000000-0000-4000-8000-000000000001",
      stream_uuid: STREAM_UUID,
      topic_uuid: TOPIC_UUID,
    });
    const sibling = createDraftFixture({
      uuid: "00000000-0000-4000-8000-000000000002",
      stream_uuid: STREAM_UUID,
      topic_uuid: TOPIC_UUID,
    });
    useDraftStore.getState().setDrafts([first, sibling]);

    useDraftStore.getState().upsertDraft({ ...first, payload: { ...first.payload, content: "x" } });

    expect(useDraftStore.getState().drafts).toHaveLength(2);
    expect(useDraftStore.getState().getDraft(first.uuid)?.payload.content).toBe("x");
    expect(useDraftStore.getState().getDraft(sibling.uuid)).toEqual(sibling);
  });

  it("marks conflicts without replacing local text silently", () => {
    const local = createDraftFixture({ content: "local", sync_state: "pending" });
    const remote = createDraftFixture({
      uuid: local.uuid,
      content: "remote",
      revision: 2,
      etag: '"2"',
    });
    useDraftStore.getState().setDrafts([local]);

    useDraftStore.getState().markDraftConflict(local.uuid, remote);

    const conflict = useDraftStore.getState().getDraft(local.uuid);
    expect(conflict?.sync_state).toBe("conflict");
    expect(conflict?.payload.content).toBe("remote");
    expect(conflict?.payload.local_content).toBe("local");
  });

  it("removes only the selected UUID", () => {
    const first = createDraftFixture();
    const sibling = createDraftFixture({ uuid: "00000000-0000-4000-8000-000000000099" });
    useDraftStore.getState().setDrafts([first, sibling]);
    useDraftStore.getState().removeDraft(first.uuid);
    expect(useDraftStore.getState().drafts).toEqual([sibling]);
  });
});
