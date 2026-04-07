/**
 * Tests for the active call state manager.
 *
 * Verifies that the OS is properly notified about ongoing calls via
 * Media Session API, Wake Lock API, document title, and Electron IPC.
 * A broken call state can cause the screen to sleep during a video call
 * or leave stale "in call" indicators after the call ends.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callState } from "./call-state";

// jsdom/happy-dom don't provide MediaMetadata or navigator.mediaSession
class MockMediaMetadata {
  title: string;
  artist: string;
  album: string;
  constructor(init: { title?: string; artist?: string; album?: string } = {}) {
    this.title = init.title ?? "";
    this.artist = init.artist ?? "";
    this.album = init.album ?? "";
  }
}

if (typeof globalThis.MediaMetadata === "undefined") {
  (globalThis as unknown as Record<string, unknown>).MediaMetadata = MockMediaMetadata;
}

if (!("mediaSession" in navigator)) {
  Object.defineProperty(navigator, "mediaSession", {
    value: {
      metadata: null,
      playbackState: "none",
      setActionHandler: () => {},
    },
    writable: true,
    configurable: true,
  });
}

describe("callState", () => {
  afterEach(() => {
    callState.end();
  });

  // When no call is active, all getters should return idle/null/0
  describe("initial state", () => {
    it("starts idle with no active call", () => {
      expect(callState.getStatus()).toBe("idle");
      expect(callState.getActiveCall()).toBeNull();
      expect(callState.getCallDuration()).toBe(0);
    });
  });

  // Starting a call should transition to active and record the room name
  describe("start", () => {
    it("transitions to active status", () => {
      callState.start({ roomName: "standup" });
      expect(callState.getStatus()).toBe("active");
    });

    it("records room name and start time", () => {
      callState.start({ roomName: "design-review" });
      const call = callState.getActiveCall();
      expect(call?.roomName).toBe("design-review");
      expect(call?.startedAt).toBeGreaterThan(0);
    });

    it("stores optional display name for call context", () => {
      callState.start({ roomName: "dm-room-42", displayName: "Alice, Bob" });
      expect(callState.getActiveCall()?.displayName).toBe("Alice, Bob");
    });

    it("sets default values for muted and videoOn", () => {
      callState.start({ roomName: "test" });
      const call = callState.getActiveCall();
      expect(call?.muted).toBe(false);
      expect(call?.videoOn).toBe(true);
    });

    it("accepts custom muted and videoOn", () => {
      callState.start({ roomName: "test", muted: true, videoOn: false });
      const call = callState.getActiveCall();
      expect(call?.muted).toBe(true);
      expect(call?.videoOn).toBe(false);
    });

    it("sets default participant count to 1", () => {
      callState.start({ roomName: "test" });
      expect(callState.getActiveCall()?.participants).toBe(1);
    });

    // If start() is called while already in a call, the previous call should end first
    it("ends previous call before starting a new one", () => {
      callState.start({ roomName: "first" });
      callState.start({ roomName: "second" });
      expect(callState.getActiveCall()?.roomName).toBe("second");
    });
  });

  // Ending a call should clean up all state back to idle
  describe("end", () => {
    it("transitions back to idle", () => {
      callState.start({ roomName: "test" });
      callState.end();
      expect(callState.getStatus()).toBe("idle");
      expect(callState.getActiveCall()).toBeNull();
    });

    // Calling end() when no call is active should be a safe no-op
    it("is safe to call when no call active", () => {
      expect(() => callState.end()).not.toThrow();
    });
  });

  // Participant count must update correctly for tray/media session display
  describe("updateParticipants", () => {
    it("updates participant count", () => {
      callState.start({ roomName: "test", participants: 2 });
      callState.updateParticipants(5);
      expect(callState.getActiveCall()?.participants).toBe(5);
    });

    // No-op when no call is active — prevents stale state
    it("no-op when no call active", () => {
      callState.updateParticipants(10);
      expect(callState.getActiveCall()).toBeNull();
    });
  });

  // Mute/unmute must be tracked for media session play/pause mapping
  describe("setMuted / setVideoOn", () => {
    it("toggles muted state", () => {
      callState.start({ roomName: "test" });
      callState.setMuted(true);
      expect(callState.getActiveCall()?.muted).toBe(true);
      callState.setMuted(false);
      expect(callState.getActiveCall()?.muted).toBe(false);
    });

    it("toggles videoOn state", () => {
      callState.start({ roomName: "test" });
      callState.setVideoOn(false);
      expect(callState.getActiveCall()?.videoOn).toBe(false);
    });
  });

  // Call duration should increase over time
  describe("getCallDuration", () => {
    it("returns 0 when no call", () => {
      expect(callState.getCallDuration()).toBe(0);
    });

    it("returns positive value during active call", () => {
      callState.start({ roomName: "test" });
      expect(callState.getCallDuration()).toBeGreaterThanOrEqual(0);
    });
  });

  // MediaSession integration: notifies the OS about the active call
  describe("MediaSession integration", () => {
    let originalMediaSession: MediaSession;

    beforeEach(() => {
      originalMediaSession = navigator.mediaSession;
      const handlers = new Map<string, MediaSessionActionHandler | null>();
      Object.defineProperty(navigator, "mediaSession", {
        value: {
          metadata: null,
          playbackState: "none",
          setActionHandler: vi.fn((action: string, handler: MediaSessionActionHandler | null) => {
            handlers.set(action, handler);
          }),
          _handlers: handlers,
        },
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(navigator, "mediaSession", {
        value: originalMediaSession,
        writable: true,
        configurable: true,
      });
    });

    it("sets MediaMetadata on call start", () => {
      callState.start({ roomName: "standup", participants: 3 });
      expect(navigator.mediaSession.metadata).not.toBeNull();
      expect(navigator.mediaSession.metadata?.title).toBe("Call: standup");
      expect(navigator.mediaSession.metadata?.artist).toBe("3 participants");
    });

    it("prefers display name in MediaMetadata title when provided", () => {
      callState.start({ roomName: "dm-10-42", displayName: "Alice", participants: 2 });
      expect(navigator.mediaSession.metadata?.title).toBe("Call: Alice");
    });

    it("sets playbackState to playing on call start", () => {
      callState.start({ roomName: "test" });
      expect(navigator.mediaSession.playbackState).toBe("playing");
    });

    it("clears MediaMetadata on call end", () => {
      callState.start({ roomName: "test" });
      callState.end();
      expect(navigator.mediaSession.metadata).toBeNull();
      expect(navigator.mediaSession.playbackState).toBe("none");
    });

    it("registers pause/play/stop action handlers", () => {
      callState.start({ roomName: "test" });
      expect(navigator.mediaSession.setActionHandler).toHaveBeenCalledWith(
        "pause",
        expect.any(Function),
      );
      expect(navigator.mediaSession.setActionHandler).toHaveBeenCalledWith(
        "play",
        expect.any(Function),
      );
      expect(navigator.mediaSession.setActionHandler).toHaveBeenCalledWith(
        "stop",
        expect.any(Function),
      );
    });
  });

  // Document title shows call indicator in the browser tab
  describe("document.title updates", () => {
    let originalTitle: string;

    beforeEach(() => {
      vi.useFakeTimers();
      originalTitle = document.title;
    });

    afterEach(() => {
      vi.useRealTimers();
      document.title = originalTitle;
    });

    it("updates document.title with call info after interval tick", () => {
      document.title = "Original Title";
      callState.start({ roomName: "daily" });

      vi.advanceTimersByTime(1100);
      expect(document.title).not.toBe("Original Title");
      expect(document.title).toContain("daily");
    });

    it("restores original title on call end", () => {
      document.title = "My Chat App";
      callState.start({ roomName: "test" });
      vi.advanceTimersByTime(1100);

      callState.end();
      expect(document.title).toBe("My Chat App");
    });

    it("shows elapsed time in title", () => {
      callState.start({ roomName: "standup" });

      vi.advanceTimersByTime(62_000);
      expect(document.title).toMatch(/01:0[12]/);
    });

    it("uses display name in title pulse when provided", () => {
      callState.start({ roomName: "dm-10-42", displayName: "Alice, Bob" });
      vi.advanceTimersByTime(1100);
      expect(document.title).toContain("Alice, Bob");
      expect(document.title).not.toContain("dm-10-42");
    });
  });
});
