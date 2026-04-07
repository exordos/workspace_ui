import type { Draft } from "~/entities/draft/draft.types";

export function resolveHydratedDraftBootstrap(
  composerValue: string,
  matchingDraft: Draft | undefined,
): { initialValue: string; activeDraftId: number | null } | null {
  if (composerValue.trim().length > 0 || matchingDraft == null) {
    return null;
  }

  return {
    initialValue: matchingDraft.content,
    activeDraftId: matchingDraft.id,
  };
}
