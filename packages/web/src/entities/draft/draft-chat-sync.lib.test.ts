import { describe, expect, it, vi } from "vitest";
import type { Draft } from "~/entities/draft/draft.types";
import {
  reconcileCreatedDraftServerId,
  syncExistingDraftDeleteOnClear,
  syncExistingDraftDeleteOnCleanup,
  syncExistingDraftUpdateOnCleanup,
} from "./draft-chat-sync.lib";

const EXISTING_DRAFT: Draft = {
  id: 7,
  type: "stream",
  to: [10],
  topic: "general",
  content: "Original draft",
  timestamp: 1,
};

describe("chat-page draft cleanup sync", () => {
  it("restores previous draft content when server update fails during cleanup", async () => {
    const updateDraft = vi.fn();
    const restoreDraft = vi.fn();
    const updateDraftOnServer = vi.fn().mockResolvedValue(false);

    await syncExistingDraftUpdateOnCleanup({
      draft: EXISTING_DRAFT,
      existingId: 7,
      draftType: "stream",
      draftTo: [10],
      draftTopic: "general",
      nextContent: "Edited draft",
      updateDraft,
      restoreDraft,
      updateDraftOnServer,
    });

    expect(updateDraft).toHaveBeenCalledWith(7, { content: "Edited draft" });
    expect(updateDraftOnServer).toHaveBeenCalledWith(7, {
      type: "stream",
      to: [10],
      topic: "general",
      content: "Edited draft",
    });
    expect(restoreDraft).toHaveBeenCalledWith(EXISTING_DRAFT);
  });

  it("restores removed draft when server delete fails during cleanup", async () => {
    const removeDraftForChat = vi.fn();
    const restoreDraft = vi.fn();
    const setActiveDraftId = vi.fn();
    const deleteDraftOnServer = vi.fn().mockResolvedValue(false);

    await syncExistingDraftDeleteOnCleanup({
      draft: EXISTING_DRAFT,
      existingId: 7,
      draftType: "stream",
      draftTo: [10],
      draftTopic: "general",
      deleteDraftOnServer,
      removeDraftForChat,
      restoreDraft,
      setActiveDraftId,
    });

    expect(removeDraftForChat).toHaveBeenCalledWith("stream", [10], "general");
    expect(deleteDraftOnServer).toHaveBeenCalledWith(7);
    expect(restoreDraft).toHaveBeenCalledWith(EXISTING_DRAFT);
    expect(setActiveDraftId).not.toHaveBeenCalled();
  });

  it("restores removed draft when live clear delete fails and composer is still empty", async () => {
    const removeDraftForChat = vi.fn();
    const restoreDraft = vi.fn();
    const setActiveDraftId = vi.fn();
    const deleteDraftOnServer = vi.fn().mockResolvedValue(false);

    await syncExistingDraftDeleteOnClear({
      draft: EXISTING_DRAFT,
      existingId: 7,
      draftType: "stream",
      draftTo: [10],
      draftTopic: "general",
      deleteDraftOnServer,
      removeDraftForChat,
      restoreDraft,
      setActiveDraftId,
      shouldRestoreDraft: () => true,
    });

    expect(restoreDraft).toHaveBeenCalledWith(EXISTING_DRAFT);
  });

  it("does not restore removed draft when live clear delete fails after the user retyped", async () => {
    const removeDraftForChat = vi.fn();
    const restoreDraft = vi.fn();
    const setActiveDraftId = vi.fn();
    const deleteDraftOnServer = vi.fn().mockResolvedValue(false);

    await syncExistingDraftDeleteOnClear({
      draft: EXISTING_DRAFT,
      existingId: 7,
      draftType: "stream",
      draftTo: [10],
      draftTopic: "general",
      deleteDraftOnServer,
      removeDraftForChat,
      restoreDraft,
      setActiveDraftId,
      shouldRestoreDraft: () => false,
    });

    expect(restoreDraft).not.toHaveBeenCalled();
  });
});

describe("reconcileCreatedDraftServerId", () => {
  it("links local draft when server id arrives and draft is still local-only", async () => {
    const getDraftForChat = vi.fn().mockReturnValue({
      ...EXISTING_DRAFT,
      id: null,
      content: "Pending local draft",
    });
    const linkDraftToServerId = vi.fn();
    const deleteDraftOnServer = vi.fn().mockResolvedValue(true);

    await reconcileCreatedDraftServerId({
      serverId: 101,
      draftType: "stream",
      draftTo: [10],
      draftTopic: "general",
      getDraftForChat,
      linkDraftToServerId,
      deleteDraftOnServer,
    });

    expect(linkDraftToServerId).toHaveBeenCalledWith("stream", [10], "general", 101);
    expect(deleteDraftOnServer).not.toHaveBeenCalled();
  });

  it("deletes stale server draft when local draft was removed before create returned", async () => {
    const getDraftForChat = vi.fn().mockReturnValue(undefined);
    const linkDraftToServerId = vi.fn();
    const deleteDraftOnServer = vi.fn().mockResolvedValue(true);

    await reconcileCreatedDraftServerId({
      serverId: 202,
      draftType: "private",
      draftTo: [42],
      draftTopic: "general",
      getDraftForChat,
      linkDraftToServerId,
      deleteDraftOnServer,
    });

    expect(deleteDraftOnServer).toHaveBeenCalledWith(202);
    expect(linkDraftToServerId).not.toHaveBeenCalled();
  });

  it("deletes duplicate server draft when local draft is already linked to another id", async () => {
    const getDraftForChat = vi.fn().mockReturnValue({
      ...EXISTING_DRAFT,
      id: 77,
    });
    const linkDraftToServerId = vi.fn();
    const deleteDraftOnServer = vi.fn().mockResolvedValue(true);

    await reconcileCreatedDraftServerId({
      serverId: 303,
      draftType: "stream",
      draftTo: [10],
      draftTopic: "general",
      getDraftForChat,
      linkDraftToServerId,
      deleteDraftOnServer,
    });

    expect(deleteDraftOnServer).toHaveBeenCalledWith(303);
    expect(linkDraftToServerId).not.toHaveBeenCalled();
  });

  it("does nothing when local draft is already linked to the same server id", async () => {
    const getDraftForChat = vi.fn().mockReturnValue({
      ...EXISTING_DRAFT,
      id: 404,
    });
    const linkDraftToServerId = vi.fn();
    const deleteDraftOnServer = vi.fn().mockResolvedValue(true);

    await reconcileCreatedDraftServerId({
      serverId: 404,
      draftType: "stream",
      draftTo: [10],
      draftTopic: "general",
      getDraftForChat,
      linkDraftToServerId,
      deleteDraftOnServer,
    });

    expect(linkDraftToServerId).not.toHaveBeenCalled();
    expect(deleteDraftOnServer).not.toHaveBeenCalled();
  });
});
