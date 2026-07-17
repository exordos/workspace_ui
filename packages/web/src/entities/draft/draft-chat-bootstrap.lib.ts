import type { Draft } from "./draft.types";

export function resolveHydratedDraftBootstrap(
  composerValue: string,
  matchingDraft: Draft | undefined,
): { initialValue: string; activeDraftId: string } | null {
  if (composerValue.trim().length > 0 || matchingDraft == null) {
    return null;
  }

  return {
    initialValue: matchingDraft.payload.content,
    activeDraftId: matchingDraft.uuid,
  };
}
