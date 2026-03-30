import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import { resolveAvatarUrl } from "~/shared/lib/avatar";
import { isValidEmail, isValidUrl } from "~/shared/lib/validation";

import type { RightPanelUserInfo } from "./right-panel.types";

export function resolveAvatarSrc(url: string | undefined | null): string | undefined {
  return resolveAvatarUrl(url, getRealmBaseUrl());
}

export function buildStreamSlug(streamId: number, streamName: string): string {
  const lower = streamName.trim().toLowerCase();
  const safe = lower.replace(/[^\p{L}\p{N}-]/gu, "-").replace(/-+/g, "-");
  const slug = safe.replace(/^-|-$/g, "") || "chat";
  return `${streamId}-${slug}`;
}

export function buildMailtoHref(email: string | undefined): string | undefined {
  if (!email) return undefined;
  const trimmed = email.trim();
  if (!isValidEmail(trimmed)) return undefined;
  return `mailto:${trimmed}`;
}

export function buildTelHref(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  const normalized = phone.replace(/[^\d+]/g, "");
  if (!/^\+?\d{5,}$/.test(normalized)) return undefined;
  return `tel:${normalized}`;
}

export function formatDateJoined(dateJoined: string | undefined): string | undefined {
  if (!dateJoined) return undefined;
  const trimmed = dateJoined.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return trimmed;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

export function resolveMentionNickname({
  username,
  email,
}: Pick<RightPanelUserInfo, "username" | "email">): string | undefined {
  const candidates = [username, email];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    if (trimmed.length === 0) continue;
    const atIndex = trimmed.indexOf("@");
    const rawNick = atIndex > 0 ? trimmed.slice(0, atIndex) : trimmed;
    const normalizedNick = rawNick.trim();
    if (normalizedNick.length > 0) return normalizedNick;
  }

  return undefined;
}
