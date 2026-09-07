import { isValidRealmUrl } from "./validation";

const PROFILE_HASH = /^#user\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function parseWorkspaceProfileShareHash(hash: string): string | null {
  return PROFILE_HASH.exec(hash)?.[1]?.toLowerCase() ?? null;
}

export function buildWorkspaceProfileShareLink(
  organizationOrigin: string | undefined,
  userUuid: string,
): string | null {
  if (organizationOrigin == null || !isValidRealmUrl(organizationOrigin)) return null;
  if (parseWorkspaceProfileShareHash(`#user/${userUuid}`) == null) return null;
  return `${organizationOrigin.replace(/\/+$/, "")}/#user/${userUuid}`;
}

export function preserveWorkspaceProfileShareHash(target: string, hash: string): string {
  const userUuid = parseWorkspaceProfileShareHash(hash);
  return userUuid == null ? target : `${target}#user/${userUuid}`;
}
