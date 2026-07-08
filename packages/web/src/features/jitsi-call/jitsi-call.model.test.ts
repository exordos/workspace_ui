import { afterEach, describe, expect, it } from "vitest";
import { useJitsiCallStore } from "./jitsi-call.model";

describe("useJitsiCallStore", () => {
  afterEach(() => {
    useJitsiCallStore.getState().clear();
  });

  it("requestOpenCall opens first call and clears invite", () => {
    useJitsiCallStore.getState().ingestIncomingInvite({
      messageId: 10,
      meetingUrl: "https://meet.workspace.example.com/workspace-room-10",
      callerName: "Slon",
      locationName: "Slon",
      avatarUrl: "/avatars/slon.png",
      timestamp: 1,
    });

    const result = useJitsiCallStore.getState().requestOpenCall({
      meetingUrl: "https://meet.workspace.example.com/workspace-room-10",
      locationName: "Slon",
      ownerKey: "owner-a",
      meetUrl: "https://meet.workspace.example.com",
      displayName: "Current User",
    });

    const state = useJitsiCallStore.getState();
    expect(result.status).toBe("opened");
    expect(result.activeCall).toBe(state.activeCall);
    expect(state.activeCall?.callKey).toBe(
      "owner-a:https://meet.workspace.example.com/workspace-room-10",
    );
    expect(state.activeCall?.meetingUrl).toBe(
      "https://meet.workspace.example.com/workspace-room-10",
    );
    expect(state.activeCall?.ownerKey).toBe("owner-a");
    expect(state.activeCall?.meetUrl).toBe("https://meet.workspace.example.com");
    expect(state.activeCall?.displayName).toBe("Current User");
    expect(state.activeCall?.startWithVideoMuted).toBe(true);
    expect(state.activeCall?.startedAtMs).toEqual(expect.any(Number));
    expect(state.incomingInvite).toBeNull();
  });

  it("same call returns same and preserves original activeCall object fields and startedAtMs", () => {
    const firstResult = useJitsiCallStore.getState().requestOpenCall({
      meetingUrl: "https://MEET.workspace.example.com/workspace-room-same/",
      locationName: "First label",
      ownerKey: "owner-a",
      displayName: "First User",
      startWithVideoMuted: false,
    });
    const firstCall = firstResult.activeCall;

    const secondResult = useJitsiCallStore.getState().requestOpenCall({
      meetingUrl: "https://meet.workspace.example.com/workspace-room-same",
      locationName: "Second label",
      ownerKey: "owner-a",
      displayName: "Second User",
      startWithVideoMuted: true,
    });

    expect(secondResult.status).toBe("same");
    expect(secondResult.activeCall).toBe(firstCall);
    expect(useJitsiCallStore.getState().activeCall).toBe(firstCall);
    expect(secondResult.activeCall.locationName).toBe("First label");
    expect(secondResult.activeCall.displayName).toBe("First User");
    expect(secondResult.activeCall.startWithVideoMuted).toBe(false);
    expect(secondResult.activeCall.startedAtMs).toBe(firstCall.startedAtMs);
  });

  it("different call returns blocked-active and preserves first call", () => {
    const firstResult = useJitsiCallStore.getState().requestOpenCall({
      meetingUrl: "https://meet.workspace.example.com/workspace-room-first",
      locationName: "First",
      ownerKey: "owner-a",
    });

    const secondResult = useJitsiCallStore.getState().requestOpenCall({
      meetingUrl: "https://meet.workspace.example.com/workspace-room-second",
      locationName: "Second",
      ownerKey: "owner-a",
    });

    expect(secondResult.status).toBe("blocked-active");
    expect(secondResult.activeCall).toBe(firstResult.activeCall);
    expect(useJitsiCallStore.getState().activeCall).toBe(firstResult.activeCall);
    expect(useJitsiCallStore.getState().activeCall?.meetingUrl).toBe(
      "https://meet.workspace.example.com/workspace-room-first",
    );
  });

  it("acceptIncomingInvite does not replace existing activeCall", () => {
    const firstResult = useJitsiCallStore.getState().requestOpenCall({
      meetingUrl: "https://meet.workspace.example.com/workspace-room-active",
      locationName: "Active",
      ownerKey: "owner-a",
    });
    useJitsiCallStore.setState({
      incomingInvite: {
        messageId: 99,
        meetingUrl: "https://meet.workspace.example.com/workspace-room-invite",
        callerName: "Invite",
        locationName: "Invite",
        ownerKey: "owner-a",
        timestamp: 8,
      },
    });

    useJitsiCallStore.getState().acceptIncomingInvite();

    expect(useJitsiCallStore.getState().activeCall).toBe(firstResult.activeCall);
    expect(useJitsiCallStore.getState().activeCall?.meetingUrl).toBe(
      "https://meet.workspace.example.com/workspace-room-active",
    );
    expect(useJitsiCallStore.getState().incomingInvite).toBeNull();
  });

  it("default startWithVideoMuted remains true", () => {
    useJitsiCallStore.getState().requestOpenCall({
      meetingUrl: "https://meet.workspace.example.com/workspace-room-muted",
      locationName: "Muted",
    });

    expect(useJitsiCallStore.getState().activeCall?.startWithVideoMuted).toBe(true);
  });

  it("accepts incoming invite and opens call with default muted video", () => {
    useJitsiCallStore.getState().ingestIncomingInvite({
      messageId: 11,
      meetingUrl: "https://meet.workspace.example.com/workspace-room-11",
      callerName: "Ku",
      locationName: "Ku",
      ownerKey: "owner-a",
      meetUrl: "https://meet.workspace.example.com",
      displayName: "Current User",
      avatarUrl: "/avatars/ku.png",
      timestamp: 2,
    });

    useJitsiCallStore.getState().acceptIncomingInvite();

    const state = useJitsiCallStore.getState();
    expect(state.incomingInvite).toBeNull();
    expect(state.activeCall?.locationName).toBe("Ku");
    expect(state.activeCall?.ownerKey).toBe("owner-a");
    expect(state.activeCall?.meetUrl).toBe("https://meet.workspace.example.com");
    expect(state.activeCall?.displayName).toBe("Current User");
    expect(state.activeCall?.startWithVideoMuted).toBe(true);
    expect(state.activeCall?.callKey).toBe(
      "owner-a:https://meet.workspace.example.com/workspace-room-11",
    );
    expect(state.activeCall?.startedAtMs).toEqual(expect.any(Number));
  });

  it("accepts incoming invite with unmuted video when requested", () => {
    useJitsiCallStore.getState().ingestIncomingInvite({
      messageId: 13,
      meetingUrl: "https://meet.workspace.example.com/workspace-room-13",
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
      messageId: 12,
      meetingUrl: "https://meet.workspace.example.com/workspace-room-12",
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
    useJitsiCallStore.getState().requestOpenCall({
      meetingUrl: "https://meet.workspace.example.com/workspace-room-active",
      locationName: "Active",
    });

    useJitsiCallStore.getState().ingestIncomingInvite({
      messageId: 21,
      meetingUrl: "https://meet.workspace.example.com/workspace-room-21",
      callerName: "Cat",
      locationName: "Cat",
      avatarUrl: "/avatars/cat.png",
      timestamp: 5,
    });

    const state = useJitsiCallStore.getState();
    expect(state.activeCall?.meetingUrl).toBe(
      "https://meet.workspace.example.com/workspace-room-active",
    );
    expect(state.incomingInvite).toBeNull();
    expect(state.lastIncomingMessageId).toBe(21);
  });

  it("keeps first incoming invite while another incoming invite arrives", () => {
    useJitsiCallStore.getState().ingestIncomingInvite({
      messageId: 31,
      meetingUrl: "https://meet.workspace.example.com/workspace-room-31",
      callerName: "Fox",
      locationName: "Fox",
      avatarUrl: "/avatars/fox.png",
      timestamp: 6,
    });

    useJitsiCallStore.getState().ingestIncomingInvite({
      messageId: 32,
      meetingUrl: "https://meet.workspace.example.com/workspace-room-32",
      callerName: "Wolf",
      locationName: "Wolf",
      avatarUrl: "/avatars/wolf.png",
      timestamp: 7,
    });

    const state = useJitsiCallStore.getState();
    expect(state.incomingInvite?.messageId).toBe(31);
    expect(state.incomingInvite?.meetingUrl).toBe(
      "https://meet.workspace.example.com/workspace-room-31",
    );
    expect(state.lastIncomingMessageId).toBe(32);
  });
});
