import type { MessengerConversationId } from "~/entities/messenger/messenger.types";
import { normalizeWorkspaceReplyQuote } from "./workspace-reply.model";
import type { WorkspaceReplyQuote, WorkspaceReplyTabIdentity } from "./workspace-reply.types";

export interface WorkspaceReplyHandoffScope {
  ownerKey: string;
  runtimeGeneration: number;
  conversationId: MessengerConversationId;
}

export interface WorkspaceReplyHandoff extends WorkspaceReplyHandoffScope {
  intentId: string;
  quote: WorkspaceReplyQuote;
  identity: WorkspaceReplyTabIdentity;
}

export interface WorkspaceReplyHandoffClaim {
  claimToken: string;
  handoff: WorkspaceReplyHandoff;
}

interface ClaimedWorkspaceReplyHandoff extends WorkspaceReplyHandoffClaim {
  releaseGeneration: number;
}

let pendingHandoff: WorkspaceReplyHandoff | null = null;
let claimedHandoff: ClaimedWorkspaceReplyHandoff | null = null;

function isSameRuntimeScope(
  handoff: WorkspaceReplyHandoffScope,
  scope: WorkspaceReplyHandoffScope,
): boolean {
  return (
    handoff.ownerKey === scope.ownerKey && handoff.runtimeGeneration === scope.runtimeGeneration
  );
}

function isSameConversationScope(
  handoff: WorkspaceReplyHandoffScope,
  scope: WorkspaceReplyHandoffScope,
): boolean {
  return isSameRuntimeScope(handoff, scope) && handoff.conversationId === scope.conversationId;
}

export function stageWorkspaceReplyHandoff(
  handoff: WorkspaceReplyHandoff,
): WorkspaceReplyHandoff | null {
  const ownerKey = handoff.ownerKey.trim();
  const conversationId = handoff.conversationId.trim();
  const intentId = handoff.intentId.trim();
  const identity = {
    id: handoff.identity.id.trim(),
    createdAt: handoff.identity.createdAt.trim(),
  };
  const quote = normalizeWorkspaceReplyQuote(handoff.quote);

  if (
    ownerKey.length === 0 ||
    conversationId.length === 0 ||
    intentId.length === 0 ||
    !Number.isFinite(handoff.runtimeGeneration) ||
    identity.id.length === 0 ||
    identity.createdAt.length === 0 ||
    quote == null
  ) {
    return null;
  }

  pendingHandoff = {
    ownerKey,
    runtimeGeneration: handoff.runtimeGeneration,
    conversationId,
    intentId,
    quote,
    identity,
  };
  claimedHandoff = null;
  return pendingHandoff;
}

export function claimWorkspaceReplyHandoff(
  scope: WorkspaceReplyHandoffScope,
  claimToken: string,
): WorkspaceReplyHandoffClaim | null {
  if (claimedHandoff != null) {
    if (!isSameRuntimeScope(claimedHandoff.handoff, scope)) {
      claimedHandoff = null;
      return null;
    }
    if (
      claimedHandoff.claimToken !== claimToken ||
      claimedHandoff.handoff.conversationId !== scope.conversationId
    ) {
      return null;
    }

    claimedHandoff.releaseGeneration += 1;
    return { claimToken, handoff: claimedHandoff.handoff };
  }

  const handoff = pendingHandoff;
  if (handoff == null) return null;
  if (!isSameRuntimeScope(handoff, scope)) {
    pendingHandoff = null;
    return null;
  }
  if (!isSameConversationScope(handoff, scope)) return null;

  pendingHandoff = null;
  claimedHandoff = {
    claimToken,
    handoff,
    releaseGeneration: 0,
  };
  return { claimToken, handoff };
}

export function releaseWorkspaceReplyHandoffClaim(claim: WorkspaceReplyHandoffClaim): void {
  if (
    claimedHandoff?.claimToken !== claim.claimToken ||
    claimedHandoff.handoff.intentId !== claim.handoff.intentId
  ) {
    return;
  }

  claimedHandoff.releaseGeneration += 1;
  const releaseGeneration = claimedHandoff.releaseGeneration;
  queueMicrotask(() => {
    if (
      claimedHandoff?.claimToken === claim.claimToken &&
      claimedHandoff.handoff.intentId === claim.handoff.intentId &&
      claimedHandoff.releaseGeneration === releaseGeneration
    ) {
      claimedHandoff = null;
    }
  });
}

export function completeWorkspaceReplyHandoffClaim(claim: WorkspaceReplyHandoffClaim): void {
  if (
    claimedHandoff?.claimToken === claim.claimToken &&
    claimedHandoff.handoff.intentId === claim.handoff.intentId
  ) {
    claimedHandoff = null;
  }
}

export function hasWorkspaceReplyHandoffForScope(
  scope: WorkspaceReplyHandoffScope,
  claimToken: string,
): boolean {
  if (claimedHandoff != null) {
    return (
      claimedHandoff.claimToken === claimToken &&
      isSameConversationScope(claimedHandoff.handoff, scope)
    );
  }
  return pendingHandoff != null && isSameConversationScope(pendingHandoff, scope);
}

export function clearWorkspaceReplyHandoff(intentId?: string): void {
  if (intentId == null || pendingHandoff?.intentId === intentId) pendingHandoff = null;
  if (intentId == null || claimedHandoff?.handoff.intentId === intentId) claimedHandoff = null;
}
