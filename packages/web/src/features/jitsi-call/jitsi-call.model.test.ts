import { afterEach, describe, expect, it } from "vitest";
import { testMessageId } from "~/test/factories";
import { useJitsiCallStore } from "./jitsi-call.model";

describe("useJitsiCallStore", () => {
  afterEach(() => {
    useJitsiCallStore.getState().clear();
  });

  it("opens active call and clears incoming invite", () => {
    useJitsiCallStore.getState().ingestIncomingInvite({
      messageId: "00000000-0000-4000-8000-000000000010",
      meetingUrl: "https://meet.jit.si/messenger-dm-room-10",
      callerName: "Slon",
      locationName: "Slon",
      avatarUrl: "/avatars/slon.png",
      timestamp: 1,
    });

    useJitsiCallStore.getState().openCall({
      meetingUrl: "https://meet.jit.si/messenger-dm-room-10",
      locationName: "Slon",
    });

    const state = useJitsiCallStore.getState();
    expect(state.activeCall?.meetingUrl).toBe("https://meet.jit.si/messenger-dm-room-10");
    expect(state.activeCall?.startWithVideoMuted).toBe(true);
    expect(state.incomingInvite).toBeNull();
  });

  it("accepts incoming invite and opens call with default muted video", () => {
    useJitsiCallStore.getState().ingestIncomingInvite({
      messageId: "00000000-0000-4000-8000-000000000011",
      meetingUrl: "https://meet.jit.si/messenger-dm-room-11",
      callerName: "Ku",
      locationName: "Ku",
      avatarUrl: "/avatars/ku.png",
      timestamp: 2,
    });

    useJitsiCallStore.getState().acceptIncomingInvite();

    const state = useJitsiCallStore.getState();
    expect(state.incomingInvite).toBeNull();
    expect(state.activeCall?.locationName).toBe("Ku");
    expect(state.activeCall?.startWithVideoMuted).toBe(true);
  });

  it("accepts incoming invite with unmuted video when requested", () => {
    useJitsiCallStore.getState().ingestIncomingInvite({
      messageId: "00000000-0000-4000-8000-000000000013",
      meetingUrl: "https://meet.jit.si/messenger-dm-room-13",
      callerName: "Dog",
      locationName: "Dog",
      avatarUrl: "/avatars/dog.png",
      timestamp: 4,
    });

    useJitsiCallStore.getState().acceptIncomingInvite({ startWithVideoMuted: false });

    const state = useJitsiCallStore.getState();
    expect(state.incomingInvite).toBeNull();
    expect(state.activeCall?.startWithVideoMuted).toBe(false);
  });

  it("deduplicates incoming invite by message id", () => {
    const invite = {
      messageId: "00000000-0000-4000-8000-000000000012",
      meetingUrl: "https://meet.jit.si/messenger-dm-room-12",
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

  it("does not ingest incoming invite when active call is already open", () => {
    useJitsiCallStore.getState().openCall({
      meetingUrl: "https://meet.jit.si/messenger-dm-room-active",
      locationName: "Active",
    });

    useJitsiCallStore.getState().ingestIncomingInvite({
      messageId: "00000000-0000-4000-8000-000000000021",
      meetingUrl: "https://meet.jit.si/messenger-dm-room-21",
      callerName: "Cat",
      locationName: "Cat",
      avatarUrl: "/avatars/cat.png",
      timestamp: 5,
    });

    const state = useJitsiCallStore.getState();
    expect(state.activeCall?.meetingUrl).toBe("https://meet.jit.si/messenger-dm-room-active");
    expect(state.incomingInvite).toBeNull();
    expect(state.lastIncomingMessageId).toBe(testMessageId(21));
  });

  it("keeps first incoming invite while another incoming invite arrives", () => {
    useJitsiCallStore.getState().ingestIncomingInvite({
      messageId: "00000000-0000-4000-8000-000000000031",
      meetingUrl: "https://meet.jit.si/messenger-dm-room-31",
      callerName: "Fox",
      locationName: "Fox",
      avatarUrl: "/avatars/fox.png",
      timestamp: 6,
    });

    useJitsiCallStore.getState().ingestIncomingInvite({
      messageId: "00000000-0000-4000-8000-000000000032",
      meetingUrl: "https://meet.jit.si/messenger-dm-room-32",
      callerName: "Wolf",
      locationName: "Wolf",
      avatarUrl: "/avatars/wolf.png",
      timestamp: 7,
    });

    const state = useJitsiCallStore.getState();
    expect(state.incomingInvite?.messageId).toBe(testMessageId(31));
    expect(state.incomingInvite?.meetingUrl).toBe("https://meet.jit.si/messenger-dm-room-31");
    expect(state.lastIncomingMessageId).toBe(testMessageId(32));
  });
});
