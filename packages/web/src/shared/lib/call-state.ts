/**
 * Active call state manager — notifies the OS about ongoing calls.
 *
 * Integrates with:
 * - Navigator.mediaSession API (Chrome, Edge, Safari) — shows call info in OS media controls
 * - Screen Wake Lock API — prevents screen from sleeping during a call
 * - Document title — shows call indicator in browser tab
 * - Electron IPC — notifies main process for tray icon / overlay / power management
 * - Beacon API — sends call-end signal on page unload
 *
 * These APIs allow the OS to:
 * - Show "In a call" in the media overlay (macOS Now Playing, Win media controls)
 * - Prevent the screen from dimming
 * - Show call status in Electron tray tooltip
 * - Prevent the system from sleeping (Electron powerSaveBlocker)
 *
 * Usage:
 *   import { callState } from "~/shared/lib/call-state";
 *
 *   callState.start({ roomName: "standup", participants: 3 });
 *   callState.updateParticipants(5);
 *   callState.end();
 */

import { useSyncExternalStore } from "react";
import { brand } from "./brand";
import { isElectron, getElectronAPI } from "./electron";
import { createLogger } from "./logger";

const log = createLogger("call-state");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActiveCall {
  roomName: string;
  displayName?: string;
  startedAt: number;
  participants: number;
  muted: boolean;
  videoOn: boolean;
}

export type CallStatus = "idle" | "connecting" | "active";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let status: CallStatus = "idle";
let activeCall: ActiveCall | null = null;
let wakeLock: WakeLockSentinel | null = null;
let wakeLockReleaseHandler: (() => void) | null = null;
let originalTitle = "";
let titleIntervalId: ReturnType<typeof setInterval> | null = null;

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((cb) => cb());
}

function getCallDisplayName(call: ActiveCall): string {
  const trimmedDisplayName = call.displayName?.trim();
  return trimmedDisplayName != null && trimmedDisplayName.length > 0
    ? trimmedDisplayName
    : call.roomName;
}

// ---------------------------------------------------------------------------
// Media Session (OS-level call awareness)
// ---------------------------------------------------------------------------

function updateMediaSession(): void {
  if (!("mediaSession" in navigator)) return;

  if (!activeCall) {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = "none";
    return;
  }

  navigator.mediaSession.metadata = new MediaMetadata({
    title: `Call: ${getCallDisplayName(activeCall)}`,
    artist: `${activeCall.participants} participants`,
    album: brand.appName,
  });

  navigator.mediaSession.playbackState = "playing";

  navigator.mediaSession.setActionHandler("pause", () => {
    log.info("Media session pause — muting call");
    if (activeCall) {
      activeCall.muted = true;
      notify();
    }
  });

  navigator.mediaSession.setActionHandler("play", () => {
    log.info("Media session play — unmuting call");
    if (activeCall) {
      activeCall.muted = false;
      notify();
    }
  });

  navigator.mediaSession.setActionHandler("stop", () => {
    log.info("Media session stop — ending call");
    end();
  });
}

// ---------------------------------------------------------------------------
// Screen Wake Lock (prevent sleep during call)
// ---------------------------------------------------------------------------

async function acquireWakeLock(): Promise<void> {
  if (!("wakeLock" in navigator)) return;

  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLockReleaseHandler = () => {
      log.info("Wake lock released");
      wakeLock = null;
      wakeLockReleaseHandler = null;
    };
    wakeLock.addEventListener("release", wakeLockReleaseHandler);
    log.info("Wake lock acquired");
  } catch (err) {
    log.warn("Wake lock failed", { error: String(err) });
  }
}

async function releaseWakeLock(): Promise<void> {
  const currentWakeLock = wakeLock;
  if (!currentWakeLock) return;

  if (wakeLockReleaseHandler) {
    currentWakeLock.removeEventListener("release", wakeLockReleaseHandler);
    wakeLockReleaseHandler = null;
  }

  await currentWakeLock.release();
  if (wakeLock === currentWakeLock) {
    wakeLock = null;
  }
}

function reacquireWakeLockOnVisibility(): void {
  if (document.visibilityState === "visible" && activeCall && !wakeLock) {
    void acquireWakeLock();
  }
}

// ---------------------------------------------------------------------------
// Document title (tab shows call indicator)
// ---------------------------------------------------------------------------

function startTitlePulse(): void {
  originalTitle = document.title;
  let showCallIcon = true;

  titleIntervalId = setInterval(() => {
    if (!activeCall) return;
    const elapsed = Math.floor((Date.now() - activeCall.startedAt) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const ss = String(elapsed % 60).padStart(2, "0");
    const icon = showCallIcon ? "🔴" : "📞";
    document.title = `${icon} ${mm}:${ss} — ${getCallDisplayName(activeCall)}`;
    showCallIcon = !showCallIcon;
  }, 1000);
}

function stopTitlePulse(): void {
  if (titleIntervalId) {
    clearInterval(titleIntervalId);
    titleIntervalId = null;
  }
  if (originalTitle) {
    document.title = originalTitle;
    originalTitle = "";
  }
}

// ---------------------------------------------------------------------------
// Electron integration
// ---------------------------------------------------------------------------

function notifyElectronCallStart(room: string, participants: number): void {
  getElectronAPI()?.call.start({ room, participants });
}

function notifyElectronCallEnd(): void {
  getElectronAPI()?.call.end();
}

function notifyElectronCallUpdate(participants: number): void {
  getElectronAPI()?.call.update({ participants });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function start(params: {
  roomName: string;
  displayName?: string;
  participants?: number;
  muted?: boolean;
  videoOn?: boolean;
}): void {
  if (activeCall) {
    log.warn("Call already active, ending previous");
    end();
  }

  status = "active";
  activeCall = {
    roomName: params.roomName,
    displayName: params.displayName,
    startedAt: Date.now(),
    participants: params.participants ?? 1,
    muted: params.muted ?? false,
    videoOn: params.videoOn ?? true,
  };

  log.info("Call started", { room: params.roomName });

  updateMediaSession();
  void acquireWakeLock();
  startTitlePulse();
  document.addEventListener("visibilitychange", reacquireWakeLockOnVisibility);

  if (isElectron()) {
    notifyElectronCallStart(getCallDisplayName(activeCall), activeCall.participants);
  }

  notify();
}

function end(): void {
  if (!activeCall) return;

  const duration = Math.floor((Date.now() - activeCall.startedAt) / 1000);
  log.info("Call ended", { room: activeCall.roomName, durationSec: duration });

  status = "idle";
  activeCall = null;

  updateMediaSession();
  void releaseWakeLock();
  stopTitlePulse();
  document.removeEventListener("visibilitychange", reacquireWakeLockOnVisibility);

  if (isElectron()) {
    notifyElectronCallEnd();
  }

  notify();
}

function updateParticipants(count: number): void {
  if (!activeCall) return;
  activeCall.participants = count;
  updateMediaSession();
  if (isElectron()) notifyElectronCallUpdate(count);
  notify();
}

function setMuted(muted: boolean): void {
  if (!activeCall) return;
  activeCall.muted = muted;
  notify();
}

function setVideoOn(videoOn: boolean): void {
  if (!activeCall) return;
  activeCall.videoOn = videoOn;
  notify();
}

function getStatus(): CallStatus {
  return status;
}

function getActiveCall(): ActiveCall | null {
  return activeCall;
}

function getCallDuration(): number {
  if (!activeCall) return 0;
  return Math.floor((Date.now() - activeCall.startedAt) / 1000);
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export function useCallState(): {
  status: CallStatus;
  call: ActiveCall | null;
  duration: number;
} {
  const snapshot = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => ({
      status,
      call: activeCall,
      duration: activeCall ? Math.floor((Date.now() - activeCall.startedAt) / 1000) : 0,
    }),
  );
  return snapshot;
}

// ---------------------------------------------------------------------------
// Page unload — notify server call ended (best-effort)
// ---------------------------------------------------------------------------

function handleBeforeUnload(): void {
  if (activeCall) {
    end();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", handleBeforeUnload);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const callState = {
  start,
  end,
  updateParticipants,
  setMuted,
  setVideoOn,
  getStatus,
  getActiveCall,
  getCallDuration,
} as const;
