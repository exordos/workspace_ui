import type { OwnProfile, OwnProfilePatch } from "~/shared/api/own-profile.types";

export interface ProfileDraft {
  readonly username: string;
  firstName: string;
  lastName: string;
  phone: string;
  description: string;
}

export type ProfileEditableField = keyof OwnProfilePatch;

export function profileDraft(profile: OwnProfile): ProfileDraft {
  return {
    username: profile.username,
    firstName: profile.firstName ?? "",
    lastName: profile.lastName ?? "",
    phone: profile.phone ?? "",
    description: profile.description,
  };
}

export function profileDraftDisplayName(draft: ProfileDraft): string {
  return (
    [draft.firstName.trim(), draft.lastName.trim()].filter(Boolean).join(" ") ||
    draft.username.trim()
  );
}

export function profilePatch(baseline: ProfileDraft, draft: ProfileDraft): OwnProfilePatch {
  const patch: OwnProfilePatch = {};
  if (baseline.firstName !== draft.firstName.trim())
    patch.firstName = draft.firstName.trim() || null;
  if (baseline.lastName !== draft.lastName.trim()) patch.lastName = draft.lastName.trim() || null;
  if (baseline.phone !== draft.phone.trim()) patch.phone = draft.phone.trim();
  if (baseline.description !== draft.description) patch.description = draft.description;
  return patch;
}

function isProfileNameValid(value: string): boolean {
  const name = value.trim();
  // Python's name pattern excludes embedded LF but accepts other Unicode characters.
  return [...name].length <= 128 && !name.includes("\n");
}

export function isProfileDraftValid(draft: ProfileDraft): boolean {
  return (
    isProfileNameValid(draft.firstName) &&
    isProfileNameValid(draft.lastName) &&
    [...draft.phone.trim()].length <= 15
  );
}
