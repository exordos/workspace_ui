/**
 * Mention popover helpers (avoid importing right-panel from message-list).
 */

/** Local part before @ for @mention display (aligned with right-panel resolveMentionNickname email branch). */
export function extractMentionNicknameFromEmail(
  email: string | undefined | null,
): string | undefined {
  if (email == null) return undefined;
  const trimmed = email.trim();
  if (trimmed.length === 0) return undefined;
  const atIndex = trimmed.indexOf("@");
  const rawNick = atIndex > 0 ? trimmed.slice(0, atIndex) : trimmed;
  const normalizedNick = rawNick.trim();
  return normalizedNick.length > 0 ? normalizedNick : undefined;
}

/**
 * @handle for mention card (list + clipboard): prefer email local-part, else label from the
 * clicked `span.user-mention` (GET /users email may be missing on first paint).
 */
export function resolveMentionDisplayForPopover(
  email: string | undefined | null,
  fallbackName: string,
): string | undefined {
  const fromEmail = extractMentionNicknameFromEmail(email);
  if (fromEmail != null && fromEmail.length > 0) {
    return `@${fromEmail}`;
  }
  const ft = fallbackName.trim();
  if (ft.length === 0) return undefined;
  if (ft.startsWith("@")) return ft;
  return `@${ft}`;
}
