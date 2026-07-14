const WORKSPACE_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORKSPACE_GRAVATAR_HASH_PATTERN = /^[0-9a-f]{32}$/i;
const WORKSPACE_GAVATAR_PREFIX = "urn:gavatar:";
const WORKSPACE_GRAVATAR_PREFIX = "urn:gravatar:";
const WORKSPACE_IMAGE_AVATAR_PREFIX = "urn:image:";
const WORKSPACE_URL_AVATAR_PREFIX = "urn:url:";
const WORKSPACE_GAVATAR_URL = "https://secure.gravatar.com/avatar/";

export type WorkspaceAvatarSource =
  | { kind: "external"; url: string }
  | { kind: "file"; fileUuid: string };

function isWorkspaceUuid(value: string): boolean {
  return WORKSPACE_UUID_PATTERN.test(value);
}

function resolveGeneratedAvatarUrl(userUuid: string): string {
  const hash = userUuid.replaceAll("-", "").toLowerCase();
  return `${WORKSPACE_GAVATAR_URL}${hash}?d=identicon&s=500`;
}

function resolveGravatarUrl(hash: string): string | null {
  const normalizedHash = hash.trim().toLowerCase();
  return WORKSPACE_GRAVATAR_HASH_PATTERN.test(normalizedHash)
    ? `${WORKSPACE_GAVATAR_URL}${normalizedHash}?d=identicon&s=500`
    : null;
}

export function resolveWorkspaceAvatarSource(
  avatarUrn: string | null | undefined,
): WorkspaceAvatarSource | null {
  const value = avatarUrn?.trim() ?? "";
  if (value.startsWith(WORKSPACE_GRAVATAR_PREFIX)) {
    const hash = value.slice(WORKSPACE_GRAVATAR_PREFIX.length);
    const url = resolveGravatarUrl(hash);
    return url == null ? null : { kind: "external", url };
  }

  if (value.startsWith(WORKSPACE_GAVATAR_PREFIX)) {
    const userUuid = value.slice(WORKSPACE_GAVATAR_PREFIX.length);
    return isWorkspaceUuid(userUuid)
      ? { kind: "external", url: resolveGeneratedAvatarUrl(userUuid) }
      : null;
  }

  if (value.startsWith(WORKSPACE_IMAGE_AVATAR_PREFIX)) {
    const fileUuid = value.slice(WORKSPACE_IMAGE_AVATAR_PREFIX.length);
    return isWorkspaceUuid(fileUuid) ? { kind: "file", fileUuid } : null;
  }

  if (value.startsWith(WORKSPACE_URL_AVATAR_PREFIX)) {
    const urlValue = value.slice(WORKSPACE_URL_AVATAR_PREFIX.length);
    try {
      const url = new URL(urlValue);
      if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        url.username !== "" ||
        url.password !== ""
      ) {
        return null;
      }
      return { kind: "external", url: url.href };
    } catch {
      return null;
    }
  }

  return null;
}

export function isWorkspaceAvatarUrn(value: unknown): value is string {
  return typeof value === "string" && resolveWorkspaceAvatarSource(value) != null;
}
