/**
 * What status the presence heartbeat is allowed to claim.
 *
 * The Workspace API keeps one field for two different things: liveness the client
 * measures (am I at the keyboard) and a status the user deliberately chose (away,
 * do not disturb).
 *
 * The rule here: never claim a status the user did not choose.
 *   - No local activity to report at all -> send nothing.
 *   - The user chose a status in this client -> send that, unchanged.
 *   - The account is in do-not-disturb -> leave it. Nothing sets DND automatically,
 *     so it is always deliberate, even when another device set it.
 *   - Otherwise -> report what the local activity tracker actually measured.
 *
 * Known limit: an *idle* status set deliberately on another device is
 * indistinguishable from one an auto-timeout produced, so this client will
 * overwrite it. Separating presence from status needs a server-side change.
 */
import type { WorkspaceMessengerUserStatus } from "~/shared/api/messenger.types";
import type { LocalPresenceStatus } from "~/shared/lib/presence";
import type { User } from "./user.types";

/**
 * A status the user picked here, as opposed to one measured or inferred. Only away
 * is choosable in this client; do-not-disturb always arrives from elsewhere, and the
 * account status is what carries it.
 */
export type WorkspaceManualStatus = "idle";

export interface ResolveHeartbeatStatusParams {
  /** What the local activity tracker measured. */
  localPresence: LocalPresenceStatus;
  /** What the user last chose in this client, if anything. */
  manualStatus: WorkspaceManualStatus | null;
  /** What the store currently holds for the account, from the server. */
  accountStatus: WorkspaceMessengerUserStatus | null;
}

/** Returns the status to send, or null when the heartbeat should stay silent. */
export function resolveWorkspaceHeartbeatStatus({
  localPresence,
  manualStatus,
  accountStatus,
}: ResolveHeartbeatStatusParams): WorkspaceMessengerUserStatus | null {
  if (localPresence === "offline") return null;
  if (manualStatus != null) return manualStatus;
  if (accountStatus === "do_not_disturb") return "do_not_disturb";
  return localPresence;
}

/** The status dialog offers a single away toggle; DND can only arrive from elsewhere. */
export function manualStatusFromAwayToggle(away: boolean): WorkspaceManualStatus | null {
  return away ? "idle" : null;
}

export interface WorkspaceStatusDecoration {
  emoji: string | null;
  text: string | null;
}

/**
 * Status text and emoji for a heartbeat, or null while the account is not in the
 * store yet — the nulls of an absent user would reach the server as "clear these".
 */
export function workspaceStatusDecoration(
  user: Pick<User, "statusEmoji" | "statusText"> | null,
): WorkspaceStatusDecoration | null {
  return user == null ? null : { emoji: user.statusEmoji ?? null, text: user.statusText ?? null };
}
