import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import { WORKSPACE_ORIGIN } from "~/shared/config/constants";
import { resolveAvatarUrl } from "~/shared/lib/avatar";

export function resolveAvatarSrc(relativeUrl: string | undefined | null): string | undefined {
  const base = getRealmBaseUrl() || WORKSPACE_ORIGIN || undefined;
  return resolveAvatarUrl(relativeUrl, base);
}
