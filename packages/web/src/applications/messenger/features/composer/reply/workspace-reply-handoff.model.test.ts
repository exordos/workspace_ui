import { afterEach, describe, expect, it } from "vitest";
import {
  claimWorkspaceReplyHandoff,
  clearWorkspaceReplyHandoff,
  completeWorkspaceReplyHandoffClaim,
  hasWorkspaceReplyHandoffForScope,
  releaseWorkspaceReplyHandoffClaim,
  stageWorkspaceReplyHandoff,
  type WorkspaceReplyHandoff,
} from "./workspace-reply-handoff.model";

const CONVERSATION_ID =
  "topic:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222" as const;

function createHandoff(overrides: Partial<WorkspaceReplyHandoff> = {}): WorkspaceReplyHandoff {
  return {
    ownerKey: "owner-a",
    runtimeGeneration: 3,
    conversationId: CONVERSATION_ID,
    intentId: "intent-a",
    quote: {
      messageUuid: "55555555-5555-4555-8555-555555555555",
      senderUuid: "33333333-3333-4333-8333-333333333333",
      senderName: "Alice Stone",
      quotedContent: "message body",
      selectedText: "selected text",
    },
    identity: {
      id: "reply-tab-a",
      createdAt: "2026-09-10T09:00:00.000Z",
    },
    ...overrides,
  };
}

describe("workspace reply handoff", () => {
  afterEach(() => {
    clearWorkspaceReplyHandoff();
  });

  it("claims a matching handoff only once", () => {
    const handoff = createHandoff();
    const claimToken = "target-navigation";
    expect(stageWorkspaceReplyHandoff(handoff)).toEqual(handoff);

    const claim = claimWorkspaceReplyHandoff(handoff, claimToken);
    expect(claim).toEqual({ claimToken, handoff });
    expect(claimWorkspaceReplyHandoff(handoff, "other-navigation")).toBeNull();
    if (claim == null) throw new Error("Expected reply handoff claim");
    completeWorkspaceReplyHandoffClaim(claim);
    expect(claimWorkspaceReplyHandoff(handoff, claimToken)).toBeNull();
  });

  it.each([
    ["owner", { ownerKey: "owner-b" }],
    ["runtime generation", { runtimeGeneration: 4 }],
  ])("rejects and discards a handoff for a stale %s", (_label, scopeOverrides) => {
    const handoff = createHandoff();
    stageWorkspaceReplyHandoff(handoff);

    expect(
      claimWorkspaceReplyHandoff({ ...handoff, ...scopeOverrides }, "stale-navigation"),
    ).toBeNull();
    expect(claimWorkspaceReplyHandoff(handoff, "target-navigation")).toBeNull();
  });

  it("keeps a target-topic handoff pending when a late stream hydration checks its scope", () => {
    const handoff = createHandoff();
    stageWorkspaceReplyHandoff(handoff);

    expect(
      claimWorkspaceReplyHandoff(
        { ...handoff, conversationId: "stream:11111111-1111-4111-8111-111111111111" },
        "source-stream-navigation",
      ),
    ).toBeNull();
    expect(claimWorkspaceReplyHandoff(handoff, "target-topic-navigation")).not.toBeNull();
  });

  it("releases an abandoned target claim without allowing a later mount to replay it", async () => {
    const handoff = createHandoff();
    const claimToken = "abandoned-target-navigation";
    stageWorkspaceReplyHandoff(handoff);
    const claim = claimWorkspaceReplyHandoff(handoff, claimToken);
    if (claim == null) throw new Error("Expected reply handoff claim");

    releaseWorkspaceReplyHandoffClaim(claim);
    await Promise.resolve();

    expect(claimWorkspaceReplyHandoff(handoff, "later-target-navigation")).toBeNull();
  });

  it("allows the same mount to reclaim during a StrictMode effect replay", async () => {
    const handoff = createHandoff();
    const claimToken = "strict-target-navigation";
    stageWorkspaceReplyHandoff(handoff);
    const firstClaim = claimWorkspaceReplyHandoff(handoff, claimToken);
    if (firstClaim == null) throw new Error("Expected first reply handoff claim");

    releaseWorkspaceReplyHandoffClaim(firstClaim);
    const replayedClaim = claimWorkspaceReplyHandoff(handoff, claimToken);
    await Promise.resolve();

    expect(replayedClaim).toEqual({ claimToken, handoff });
  });

  it("reports send blocking only for the target navigation scope", () => {
    const handoff = createHandoff();
    stageWorkspaceReplyHandoff(handoff);

    expect(hasWorkspaceReplyHandoffForScope(handoff, "target-navigation")).toBe(true);
    expect(
      hasWorkspaceReplyHandoffForScope(
        { ...handoff, conversationId: "stream:11111111-1111-4111-8111-111111111111" },
        "source-navigation",
      ),
    ).toBe(false);

    const claim = claimWorkspaceReplyHandoff(handoff, "target-navigation");
    expect(hasWorkspaceReplyHandoffForScope(handoff, "target-navigation")).toBe(true);
    if (claim == null) throw new Error("Expected target claim");
    completeWorkspaceReplyHandoffClaim(claim);
    expect(hasWorkspaceReplyHandoffForScope(handoff, "target-navigation")).toBe(false);
  });

  it("does not let an older navigation failure clear a newer handoff", () => {
    const older = createHandoff();
    const newer = createHandoff({
      intentId: "intent-b",
      identity: { ...older.identity, id: "tab-b" },
    });
    stageWorkspaceReplyHandoff(older);
    stageWorkspaceReplyHandoff(newer);

    clearWorkspaceReplyHandoff(older.intentId);

    expect(claimWorkspaceReplyHandoff(newer, "newer-target-navigation")?.handoff).toEqual(newer);
  });
});
