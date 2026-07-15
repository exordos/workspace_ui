/**
 * Draft API facade.
 *
 * The Workspace gateway backend currently has no server-side drafts endpoint. Drafts stay local in
 * the Zustand draft store; these functions preserve validation and expose no-network fallbacks for
 * call sites that still use the server-sync shape.
 */

import { guard } from "~/shared/lib/guards";
import type { MessageId } from "~/shared/lib/message-id.lib";
import type { Draft, DraftInput } from "./draft.types";

function validateDraftInput(input: DraftInput, scope: string): void {
  guard.oneOf(input.type, ["stream", "private"] as const, `${scope} draft type`);
  guard.nonEmptyArray(input.to, `${scope} draft to`);
  for (const id of input.to) {
    if (input.type === "stream") {
      guard.streamUuid(id, `${scope} to`);
    } else {
      guard.userId(id, `${scope} to`);
    }
  }
}

export function fetchDrafts(): Promise<Draft[]> {
  return Promise.resolve([]);
}

export async function createDraft(input: DraftInput): Promise<MessageId | null> {
  validateDraftInput(input, "createDraft");
  await Promise.resolve();
  return null;
}

export async function updateDraftOnServer(id: MessageId, input: DraftInput): Promise<boolean> {
  guard.messageId(id, "updateDraftOnServer");
  validateDraftInput(input, "updateDraftOnServer");
  await Promise.resolve();
  return false;
}

export async function deleteDraftOnServer(id: MessageId): Promise<boolean> {
  guard.messageId(id, "deleteDraftOnServer");
  await Promise.resolve();
  return false;
}
