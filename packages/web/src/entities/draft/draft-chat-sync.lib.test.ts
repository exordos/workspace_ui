import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceApiHttpError } from "~/shared/api/workspace-orval-mutator";
import { createDraftFixture } from "~/test/factories";
import {
  createPendingDraft,
  finalizeDraftAfterSuccessfulSend,
  syncDraftContent,
} from "./draft-chat-sync.lib";
import {
  DraftPreconditionError,
  createDraft,
  deleteDraftOnServer,
  updateDraftOnServer,
} from "./draft.api";
import type * as DraftApiModule from "./draft.api";
import type { Draft } from "./draft.types";

vi.mock("./draft.api", async () => {
  const actual = await vi.importActual<typeof DraftApiModule>("./draft.api");
  return {
    ...actual,
    createDraft: vi.fn(),
    deleteDraftOnServer: vi.fn(),
    updateDraftOnServer: vi.fn(),
  };
});

const createDraftMock = vi.mocked(createDraft);
const deleteDraftOnServerMock = vi.mocked(deleteDraftOnServer);
const updateDraftOnServerMock = vi.mocked(updateDraftOnServer);

const DRAFT_UUID = "00000000-0000-4000-8000-000000000007";
const STREAM_UUID = "00000000-0000-4000-8000-000000000010";
const TOPIC_UUID = "00000000-0000-4000-8000-000000000020";

function options(overrides: Partial<Parameters<typeof syncDraftContent>[0]> = {}) {
  const drafts = new Map<string, Draft>();
  const upsertDraft = vi.fn((draft: Draft) => drafts.set(draft.uuid, draft));
  const updateDraftPayload = vi.fn(
    (uuid: string, content: string, syncState?: Draft["sync_state"]) => {
      const draft = drafts.get(uuid);
      if (draft != null) {
        drafts.set(uuid, {
          ...draft,
          payload: { ...draft.payload, content },
          sync_state: syncState,
        });
      }
    },
  );
  const removeDraft = vi.fn((uuid: string) => drafts.delete(uuid));
  return {
    drafts,
    input: {
      uuid: DRAFT_UUID,
      streamUuid: STREAM_UUID,
      topicUuid: TOPIC_UUID,
      content: "Edited draft",
      getDraft: (uuid: string) => drafts.get(uuid),
      getCurrentContent: () => "Edited draft",
      upsertDraft,
      updateDraftPayload,
      markDraftConflict: vi.fn(),
      removeDraft,
      ...overrides,
    },
  };
}

describe("syncDraftContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the server draft with the existing client UUID", async () => {
    const setup = options();
    setup.drafts.set(
      DRAFT_UUID,
      createPendingDraft({
        uuid: DRAFT_UUID,
        streamUuid: STREAM_UUID,
        topicUuid: TOPIC_UUID,
        content: "Edited draft",
      }),
    );
    const server = createDraftFixture({
      uuid: DRAFT_UUID,
      stream_uuid: STREAM_UUID,
      topic_uuid: TOPIC_UUID,
      content: "Edited draft",
    });
    createDraftMock.mockResolvedValue(server);

    await expect(syncDraftContent(setup.input)).resolves.toEqual({
      status: "synced",
      needsResync: false,
    });
    expect(createDraftMock).toHaveBeenCalledWith({
      uuid: DRAFT_UUID,
      stream_uuid: STREAM_UUID,
      topic_uuid: TOPIC_UUID,
      payload: { kind: "markdown", content: "Edited draft" },
    });
    expect(setup.input.upsertDraft).toHaveBeenCalledWith(server);
  });

  it("updates only payload with the active draft ETag", async () => {
    const existing = createDraftFixture({
      uuid: DRAFT_UUID,
      stream_uuid: STREAM_UUID,
      topic_uuid: TOPIC_UUID,
      etag: '"2"',
    });
    const setup = options();
    setup.drafts.set(DRAFT_UUID, existing);
    updateDraftOnServerMock.mockResolvedValue({
      ...existing,
      payload: { kind: "markdown", content: "Edited draft" },
      revision: 3,
      etag: '"3"',
    });

    await syncDraftContent(setup.input);

    expect(updateDraftOnServerMock).toHaveBeenCalledWith(
      DRAFT_UUID,
      { payload: { kind: "markdown", content: "Edited draft" } },
      '"2"',
    );
  });

  it("preserves input typed while an autosave request is in flight", async () => {
    const existing = createDraftFixture({ uuid: DRAFT_UUID, content: "Before" });
    const setup = options({ getCurrentContent: () => "Typed during request" });
    setup.drafts.set(DRAFT_UUID, existing);
    updateDraftOnServerMock.mockResolvedValue({
      ...existing,
      payload: { kind: "markdown", content: "Edited draft" },
      revision: 2,
      etag: '"2"',
    });

    await expect(syncDraftContent(setup.input)).resolves.toEqual({
      status: "synced",
      needsResync: true,
    });
    expect(setup.input.updateDraftPayload).toHaveBeenCalledWith(
      DRAFT_UUID,
      "Typed during request",
      "pending",
    );
  });

  it("deletes only the active server draft using If-Match", async () => {
    const existing = createDraftFixture({ uuid: DRAFT_UUID, etag: '"4"' });
    const setup = options({ content: "", getCurrentContent: () => "" });
    setup.drafts.set(DRAFT_UUID, existing);
    deleteDraftOnServerMock.mockResolvedValue();

    await expect(syncDraftContent(setup.input)).resolves.toEqual({
      status: "deleted",
      needsResync: false,
    });
    expect(deleteDraftOnServerMock).toHaveBeenCalledWith(DRAFT_UUID, '"4"');
    expect(setup.input.removeDraft).toHaveBeenCalledWith(DRAFT_UUID);
  });

  it("keeps local text and exposes the direct conflict snapshot", async () => {
    const existing = createDraftFixture({ uuid: DRAFT_UUID, content: "Local", etag: '"1"' });
    const current = createDraftFixture({
      uuid: DRAFT_UUID,
      content: "Remote",
      revision: 2,
      etag: '"2"',
    });
    const setup = options();
    setup.drafts.set(DRAFT_UUID, existing);
    updateDraftOnServerMock.mockRejectedValue(
      new DraftPreconditionError(
        new WorkspaceApiHttpError("conflict", 412, current, new Headers({ ETag: '"2"' })),
      ),
    );

    await expect(syncDraftContent(setup.input)).resolves.toEqual({
      status: "conflict",
      needsResync: false,
    });
    expect(setup.input.markDraftConflict).toHaveBeenCalledWith(
      DRAFT_UUID,
      expect.objectContaining({
        uuid: current.uuid,
        revision: current.revision,
        etag: current.etag,
        payload: current.payload,
      }),
    );
    expect(setup.input.upsertDraft).not.toHaveBeenCalled();
  });
});

describe("finalizeDraftAfterSuccessfulSend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the exact server draft even after the originating composer unmounts", async () => {
    const existing = createDraftFixture({
      uuid: DRAFT_UUID,
      stream_uuid: STREAM_UUID,
      topic_uuid: TOPIC_UUID,
      content: "Sent draft",
      etag: '"4"',
    });
    const setup = options();
    setup.drafts.set(DRAFT_UUID, existing);
    deleteDraftOnServerMock.mockResolvedValue();

    await expect(
      finalizeDraftAfterSuccessfulSend({
        ...setup.input,
        sentContent: "Sent draft",
      }),
    ).resolves.toBe("deleted");
    expect(deleteDraftOnServerMock).toHaveBeenCalledWith(DRAFT_UUID, '"4"');
    expect(setup.drafts.has(DRAFT_UUID)).toBe(false);
  });

  it("treats a typed DELETE 404 as idempotent and removes the matching local draft", async () => {
    const existing = createDraftFixture({
      uuid: DRAFT_UUID,
      stream_uuid: STREAM_UUID,
      topic_uuid: TOPIC_UUID,
      content: "Sent draft",
      etag: '"4"',
    });
    const setup = options();
    setup.drafts.set(DRAFT_UUID, existing);
    deleteDraftOnServerMock.mockRejectedValue(
      new WorkspaceApiHttpError("draft not found", 404, { type: "not_found" }),
    );

    await expect(
      finalizeDraftAfterSuccessfulSend({
        ...setup.input,
        sentContent: "Sent draft",
      }),
    ).resolves.toBe("deleted");
    expect(setup.input.removeDraft).toHaveBeenCalledWith(DRAFT_UUID);
    expect(setup.drafts.has(DRAFT_UUID)).toBe(false);
  });

  it("does not mistake a typed non-404 transport error for an idempotent delete", async () => {
    const existing = createDraftFixture({
      uuid: DRAFT_UUID,
      stream_uuid: STREAM_UUID,
      topic_uuid: TOPIC_UUID,
      content: "Sent draft",
    });
    const setup = options();
    setup.drafts.set(DRAFT_UUID, existing);
    const serverError = new WorkspaceApiHttpError("server error", 500, null);
    deleteDraftOnServerMock.mockRejectedValue(serverError);

    await expect(
      finalizeDraftAfterSuccessfulSend({
        ...setup.input,
        sentContent: "Sent draft",
      }),
    ).rejects.toBe(serverError);
    expect(setup.input.removeDraft).not.toHaveBeenCalled();
    expect(setup.drafts.get(DRAFT_UUID)).toBe(existing);
  });

  it("preserves a different draft with the same chat identity", async () => {
    const setup = options();
    setup.drafts.set(
      DRAFT_UUID,
      createDraftFixture({
        uuid: DRAFT_UUID,
        stream_uuid: STREAM_UUID,
        topic_uuid: TOPIC_UUID,
        content: "Newer draft",
      }),
    );

    await expect(
      finalizeDraftAfterSuccessfulSend({
        ...setup.input,
        sentContent: "Sent draft",
      }),
    ).resolves.toBe("preserved");
    expect(deleteDraftOnServerMock).not.toHaveBeenCalled();
  });

  it("recreates text typed while server deletion is in flight", async () => {
    let resolveDelete: () => void = () => {
      throw new Error("Expected delete resolver to be assigned");
    };
    deleteDraftOnServerMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    const existing = createDraftFixture({
      uuid: DRAFT_UUID,
      stream_uuid: STREAM_UUID,
      topic_uuid: TOPIC_UUID,
      content: "Sent draft",
    });
    const setup = options();
    setup.drafts.set(DRAFT_UUID, existing);
    createDraftMock.mockResolvedValue(
      createDraftFixture({
        uuid: DRAFT_UUID,
        stream_uuid: STREAM_UUID,
        topic_uuid: TOPIC_UUID,
        content: "Typed during retry",
      }),
    );

    const finalizing = finalizeDraftAfterSuccessfulSend({
      ...setup.input,
      sentContent: "Sent draft",
    });
    setup.input.updateDraftPayload(DRAFT_UUID, "Typed during retry", "pending");
    resolveDelete();

    await expect(finalizing).resolves.toBe("preserved");
    expect(createDraftMock).toHaveBeenCalledWith({
      uuid: DRAFT_UUID,
      stream_uuid: STREAM_UUID,
      topic_uuid: TOPIC_UUID,
      payload: { kind: "markdown", content: "Typed during retry" },
    });
    expect(setup.drafts.get(DRAFT_UUID)?.payload.content).toBe("Typed during retry");
  });
});
