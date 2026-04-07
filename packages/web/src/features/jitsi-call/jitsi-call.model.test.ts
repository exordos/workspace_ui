import { afterEach, describe, expect, it } from "vitest";
import { useJitsiCallStore } from "./jitsi-call.model";

describe("useJitsiCallStore", () => {
  afterEach(() => {
    useJitsiCallStore.getState().clear();
  });

  it("opens active call and clears incoming invite", () => {
    useJitsiCallStore.getState().ingestIncomingInvite({
      messageId: 10,
      meetingUrl: "https://meet.jit.si/zulip-dm-room-10",
      callerName: "Slon",
      locationName: "Slon",
      avatarUrl: "/avatars/slon.png",
      timestamp: 1,
    });

    useJitsiCallStore.getState().openCall({
      meetingUrl: "https://meet.jit.si/zulip-dm-room-10",
      locationName: "Slon",
    });

    const state = useJitsiCallStore.getState();
    expect(state.activeCall?.meetingUrl).toBe("https://meet.jit.si/zulip-dm-room-10");
    expect(state.incomingInvite).toBeNull();
  });

  it("accepts incoming invite and opens call", () => {
    useJitsiCallStore.getState().ingestIncomingInvite({
      messageId: 11,
      meetingUrl: "https://meet.jit.si/zulip-dm-room-11",
      callerName: "Ku",
      locationName: "Ku",
      avatarUrl: "/avatars/ku.png",
      timestamp: 2,
    });

    useJitsiCallStore.getState().acceptIncomingInvite();

    const state = useJitsiCallStore.getState();
    expect(state.incomingInvite).toBeNull();
    expect(state.activeCall?.locationName).toBe("Ku");
  });

  it("deduplicates incoming invite by message id", () => {
    const invite = {
      messageId: 12,
      meetingUrl: "https://meet.jit.si/zulip-dm-room-12",
      callerName: "Fox",
      locationName: "Fox",
      avatarUrl: "/avatars/fox.png",
      timestamp: 3,
    };
    useJitsiCallStore.getState().ingestIncomingInvite(invite);
    useJitsiCallStore.getState().declineIncomingInvite();
    useJitsiCallStore.getState().ingestIncomingInvite(invite);

    expect(useJitsiCallStore.getState().incomingInvite).toBeNull();
  });
});
