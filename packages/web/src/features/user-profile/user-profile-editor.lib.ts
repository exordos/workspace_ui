import type { OwnProfile, OwnProfilePatch } from "~/shared/api/own-profile.types";

export interface ProfileDraft {
  username: string;
  firstName: string;
  lastName: string;
  phone: string;
  description: string;
}

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
  if (baseline.username !== draft.username.trim()) patch.username = draft.username.trim();
  if (baseline.firstName !== draft.firstName.trim())
    patch.firstName = draft.firstName.trim() || null;
  if (baseline.lastName !== draft.lastName.trim()) patch.lastName = draft.lastName.trim() || null;
  if (baseline.phone !== draft.phone.trim()) patch.phone = draft.phone.trim();
  if (baseline.description !== draft.description) patch.description = draft.description;
  return patch;
}

export function isProfileUsernameValid(value: string): boolean {
  const username = value.trim();
  // IAM uses Python len() and Unicode \w, not UTF-16 code units or ASCII \w.
  return (
    username.length > 0 &&
    [...username].length <= 128 &&
    /^[\p{L}\p{N}_!#$%& '*+/=?^`{|}~.-]+$/u.test(username)
  );
}

function isProfileNameValid(value: string): boolean {
  const name = value.trim();
  // Python's name pattern excludes embedded LF but accepts other Unicode characters.
  return [...name].length <= 128 && !name.includes("\n");
}

export function isProfileDraftValid(draft: ProfileDraft): boolean {
  return (
    isProfileUsernameValid(draft.username) &&
    isProfileNameValid(draft.firstName) &&
    isProfileNameValid(draft.lastName) &&
    [...draft.phone.trim()].length <= 15
  );
}
