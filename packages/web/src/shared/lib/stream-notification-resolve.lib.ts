/**
 * Resolves per-channel stream notification overrides against global user settings.
 *
 * Zulip subscription `desktop_notifications` / `audible_notifications`:
 * - `true` — force on for this channel
 * - `false` — force off
 * - `null` / missing — inherit global `enable_stream_*` settings
 */

export function resolveStreamAllMessagesNotifyEnabled(
  perStream: boolean | null | undefined,
  globalEnableStreamDesktop: boolean,
): boolean {
  if (perStream === true) return true;
  if (perStream === false) return false;
  return globalEnableStreamDesktop;
}

export function resolveStreamAllMessagesAudibleEnabled(
  perStream: boolean | null | undefined,
  globalEnableStreamAudible: boolean,
): boolean {
  if (perStream === true) return true;
  if (perStream === false) return false;
  return globalEnableStreamAudible;
}
