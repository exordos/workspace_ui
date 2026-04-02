/**
 * Text/time formatting helpers for chat-list sidebar preview labels.
 */
import { t, getLocale } from "~/i18n/i18n";

const MAX_PREVIEW_LEN = 60;

export function truncatePreview(text: string): string {
  const plain = text.replace(/<[^>]+>/g, "").trim();
  if (plain.length <= MAX_PREVIEW_LEN) return plain;
  return plain.slice(0, MAX_PREVIEW_LEN) + "…";
}

export function formatMessageTime(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  const locale = getLocale() === "ru" ? "ru-RU" : "en-US";
  if (sameDay) return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth())
    return t("chat.yesterday");
  return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

export function hashKey(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h % 1000000;
}

export const GROUP_DM_ID_OFFSET = 2000000;

export function slugify(s: string): string {
  const lower = s.trim().toLowerCase();
  const safe = lower.replace(/[^\p{L}\p{N}-]/gu, "-").replace(/-+/g, "-");
  return safe.replace(/^-|-$/g, "") || "chat";
}

export function getDisplayName(recipient: { email?: string; full_name?: string }): string {
  if (recipient.email != null && recipient.email.length > 0) {
    const part = recipient.email.split("@")[0];
    if (part) return part;
  }
  return recipient.full_name ?? "";
}

export function getDmPartnerName(recipient: { email?: string; full_name?: string }): string {
  const name = (recipient.full_name ?? "").trim();
  if (name) return name;
  return getDisplayName(recipient) || t("dm.privateChat");
}
