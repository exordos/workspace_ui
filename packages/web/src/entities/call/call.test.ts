/**
 * Tests for callParticipantsStore — tracks Jitsi call participants per meeting URL.
 *
 * Each active call room has its own participant list, keyed by meeting URL.
 * Used by the CallBubble and JitsiCallModal to show who is in the call.
 * Rooms must be fully independent — updating one must never affect another.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCallParticipantsStore } from "./call.model";

function resetStore() {
  useCallParticipantsStore.setState({ participantsByUrl: {} });
}

// Verifies set, replace, clear, and get operations for multi-room participant tracking.
describe("callParticipantsStore", () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  // setParticipants replaces the full participant list for a given room.
  describe("setParticipants", () => {
    // Basic set — must store and retrieve the correct participant list.
    it("stores participants for a meeting URL", () => {
      useCallParticipantsStore
        .getState()
        .setParticipants("https://meet.test/room1", [
          { displayName: "Alice" },
          { displayName: "Bob" },
        ]);

      const participants = useCallParticipantsStore
        .getState()
        .getParticipants("https://meet.test/room1");
      expect(participants).toHaveLength(2);
      expect(participants[0]!.displayName).toBe("Alice");
    });

    // Jitsi sends full participant list on each update — must replace, not merge.
    it("replaces existing participants for the same URL", () => {
      const { setParticipants } = useCallParticipantsStore.getState();
      setParticipants("https://meet.test/room1", [{ displayName: "Alice" }]);

      useCallParticipantsStore
        .getState()
        .setParticipants("https://meet.test/room1", [{ displayName: "Charlie" }]);

      const participants = useCallParticipantsStore
        .getState()
        .getParticipants("https://meet.test/room1");
      expect(participants).toHaveLength(1);
      expect(participants[0]!.displayName).toBe("Charlie");
    });

    // Concurrent calls to different rooms must be tracked independently.
    it("handles multiple rooms independently", () => {
      const store = useCallParticipantsStore.getState();
      store.setParticipants("https://meet.test/room1", [{ displayName: "Alice" }]);

      useCallParticipantsStore
        .getState()
        .setParticipants("https://meet.test/room2", [{ displayName: "Bob" }]);

      expect(
        useCallParticipantsStore.getState().getParticipants("https://meet.test/room1"),
      ).toHaveLength(1);
      expect(
        useCallParticipantsStore.getState().getParticipants("https://meet.test/room2"),
      ).toHaveLength(1);
    });
  });

  // clearParticipants is called when the user leaves or the call ends.
  describe("clearParticipants", () => {
    // After clearing, getParticipants must return an empty array.
    it("removes participants for a specific meeting URL", () => {
      useCallParticipantsStore
        .getState()
        .setParticipants("https://meet.test/room1", [{ displayName: "Alice" }]);

      useCallParticipantsStore.getState().clearParticipants("https://meet.test/room1");

      expect(
        useCallParticipantsStore.getState().getParticipants("https://meet.test/room1"),
      ).toHaveLength(0);
    });

    // Clearing one room must not touch other active rooms.
    it("does not affect other rooms when clearing one", () => {
      const store = useCallParticipantsStore.getState();
      store.setParticipants("https://meet.test/room1", [{ displayName: "Alice" }]);

      useCallParticipantsStore
        .getState()
        .setParticipants("https://meet.test/room2", [{ displayName: "Bob" }]);

      useCallParticipantsStore.getState().clearParticipants("https://meet.test/room1");

      expect(
        useCallParticipantsStore.getState().getParticipants("https://meet.test/room2"),
      ).toHaveLength(1);
    });

    // Clearing a non-existent room must not crash or mutate state.
    it("is a no-op for a URL with no participants", () => {
      useCallParticipantsStore.getState().clearParticipants("https://meet.test/unknown");

      expect(useCallParticipantsStore.getState().participantsByUrl).toEqual({});
    });
  });

  // getParticipants is a safe getter — must always return an array, never undefined.
  describe("getParticipants", () => {
    // Unknown URL must return [] to avoid null checks in UI components.
    it("returns empty array for unknown meeting URL", () => {
      expect(
        useCallParticipantsStore.getState().getParticipants("https://meet.test/nonexistent"),
      ).toEqual([]);
    });

    // After clear, the room effectively becomes "unknown" — same [] result.
    it("returns empty array for cleared meeting URL", () => {
      useCallParticipantsStore
        .getState()
        .setParticipants("https://meet.test/room1", [{ displayName: "Alice" }]);
      useCallParticipantsStore.getState().clearParticipants("https://meet.test/room1");

      expect(
        useCallParticipantsStore.getState().getParticipants("https://meet.test/room1"),
      ).toEqual([]);
    });
  });
});
