import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IncomingDmCallInvite } from "./jitsi-call.model";

vi.mock("./jitsi-call.ui", () => ({
  JitsiCallModal: ({ startWithVideoMuted = true }: { startWithVideoMuted?: boolean }) => (
    <div data-testid="jitsi-call-modal" data-start-with-video-muted={String(startWithVideoMuted)} />
  ),
}));

function buildInvite(messageId = 777): IncomingDmCallInvite {
  return {
    messageId,
    meetingUrl: "https://meet.workspace.example.com/workspace-room-777",
    callerName: "Fox",
    locationName: "Fox",
    avatarUrl: undefined,
    timestamp: 1_700_000_000,
  };
}

const activeCallPayload = {
  meetingUrl: "https://meet.workspace.example.com/active-room",
  locationName: "Active room",
};

function mockCallWindow() {
  let notifyClosed: ((callId: string) => void) | undefined;
  let notifyParticipants:
    | ((event: { callId: string; participants: JitsiCallWindowParticipant[] }) => void)
    | undefined;
  const bridge = {
    open: vi.fn<JitsiCallWindowHostBridge["open"]>().mockResolvedValue(true),
    close: vi.fn<JitsiCallWindowHostBridge["close"]>(),
    focus: vi.fn<JitsiCallWindowHostBridge["focus"]>(),
    onClosed: vi.fn<JitsiCallWindowHostBridge["onClosed"]>((listener) => {
      notifyClosed = listener;
      return () => {
        notifyClosed = undefined;
      };
    }),
    onParticipants: vi.fn<JitsiCallWindowHostBridge["onParticipants"]>((listener) => {
      notifyParticipants = listener;
      return () => {
        notifyParticipants = undefined;
      };
    }),
  };
  vi.stubGlobal("electronAPI", { callWindow: bridge });
  return {
    bridge,
    notifyClosed: (callId: string) => notifyClosed?.(callId),
    notifyParticipants: (callId: string, participants: JitsiCallWindowParticipant[]) =>
      notifyParticipants?.({ callId, participants }),
  };
}

async function loadShell(variant?: "large" | "compact") {
  vi.resetModules();
  vi.unstubAllEnvs();
  if (variant != null) {
    vi.stubEnv("VITE_CALL_INCOMING_MODAL_VARIANT", variant);
  }

  const { useJitsiCallStore } = await import("./jitsi-call.model");
  const { JitsiActiveCallHost, JitsiCallShell, JitsiIncomingInviteHost } =
    await import("./jitsi-call-shell.ui");

  useJitsiCallStore.getState().clear();
  return { useJitsiCallStore, JitsiActiveCallHost, JitsiCallShell, JitsiIncomingInviteHost };
}

describe("Jitsi call hosts", () => {
  afterEach(async () => {
    const { useJitsiCallStore } = await import("./jitsi-call.model");
    useJitsiCallStore.getState().clear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("renders active modal from active host when activeCall exists", async () => {
    const { useJitsiCallStore, JitsiActiveCallHost } = await loadShell();
    act(() => {
      useJitsiCallStore.getState().requestOpenCall({
        meetingUrl: "https://meet.workspace.example.com/active-room",
        locationName: "Active room",
        startWithVideoMuted: false,
      });
    });

    render(<JitsiActiveCallHost />);

    expect(screen.getByTestId("jitsi-call-modal")).toHaveAttribute(
      "data-start-with-video-muted",
      "false",
    );
  });

  it("keeps a desktop call in its launch mode and applies the setting to the next call", async () => {
    const { useJitsiCallStore, JitsiActiveCallHost } = await loadShell();
    const { bridge, notifyClosed } = mockCallWindow();
    const { rerender } = render(<JitsiActiveCallHost />);

    act(() => {
      useJitsiCallStore.getState().requestOpenCall(activeCallPayload);
    });
    await waitFor(() => expect(bridge.open).toHaveBeenCalledOnce());
    const call = useJitsiCallStore.getState().activeCall!;
    expect(bridge.open).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: call.callId,
        meetingUrl: call.meetingUrl,
        startWithVideoMuted: true,
      }),
    );
    expect(screen.queryByTestId("jitsi-call-modal")).not.toBeInTheDocument();

    rerender(<JitsiActiveCallHost openInSeparateWindow={false} />);
    act(() => {
      useJitsiCallStore.getState().requestOpenCall(activeCallPayload);
    });
    expect(bridge.focus).toHaveBeenCalledExactlyOnceWith(call.callId);
    expect(bridge.open).toHaveBeenCalledOnce();
    expect(bridge.close).not.toHaveBeenCalled();
    expect(screen.queryByTestId("jitsi-call-modal")).not.toBeInTheDocument();

    act(() => notifyClosed(call.callId));
    expect(useJitsiCallStore.getState().activeCall).toBeNull();
    act(() => {
      useJitsiCallStore.getState().requestOpenCall(activeCallPayload);
    });
    expect(screen.getByTestId("jitsi-call-modal")).toBeInTheDocument();
    expect(bridge.open).toHaveBeenCalledOnce();
  });

  it("falls back to embedded only when the native launch reports that it failed safely", async () => {
    const { useJitsiCallStore, JitsiActiveCallHost } = await loadShell();
    const { bridge } = mockCallWindow();
    bridge.open.mockResolvedValue(false);
    const { rerender } = render(<JitsiActiveCallHost />);

    act(() => {
      useJitsiCallStore.getState().requestOpenCall(activeCallPayload);
    });
    expect(screen.queryByTestId("jitsi-call-modal")).not.toBeInTheDocument();
    expect(await screen.findByTestId("jitsi-call-modal")).toBeInTheDocument();

    rerender(<JitsiActiveCallHost openInSeparateWindow={false} />);
    rerender(<JitsiActiveCallHost />);
    expect(screen.getByTestId("jitsi-call-modal")).toBeInTheDocument();
    expect(bridge.open).toHaveBeenCalledOnce();
  });

  it("abandons a pending call on workspace change and ignores its late events", async () => {
    const { useJitsiCallStore, JitsiActiveCallHost } = await loadShell();
    const { useCallParticipantsStore } = await import("~/entities/call/call.model");
    const { bridge, notifyClosed, notifyParticipants } = mockCallWindow();
    let finishOpening: ((loaded: boolean) => void) | undefined;
    bridge.open.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOpening = resolve;
        }),
    );
    const { rerender } = render(<JitsiActiveCallHost ownerKey="owner-a" />);

    act(() => {
      useJitsiCallStore.getState().requestOpenCall({
        ...activeCallPayload,
        ownerKey: "owner-a",
      });
    });
    await waitFor(() => expect(bridge.open).toHaveBeenCalledOnce());
    const previousId = useJitsiCallStore.getState().activeCall!.callId;
    rerender(<JitsiActiveCallHost ownerKey="owner-b" />);
    expect(useJitsiCallStore.getState().activeCall).toBeNull();
    expect(bridge.close).toHaveBeenCalledWith(previousId);

    act(() => {
      useJitsiCallStore.getState().requestOpenCall({
        ...activeCallPayload,
        ownerKey: "owner-b",
      });
    });
    await waitFor(() => expect(bridge.open).toHaveBeenCalledTimes(2));
    const currentId = useJitsiCallStore.getState().activeCall!.callId;
    await act(async () => {
      finishOpening?.(false);
      await Promise.resolve();
      notifyClosed(previousId);
      notifyParticipants(previousId, [{ displayName: "Previous" }]);
    });

    expect(screen.queryByTestId("jitsi-call-modal")).not.toBeInTheDocument();
    expect(useJitsiCallStore.getState().activeCall?.callId).toBe(currentId);
    expect(
      useCallParticipantsStore.getState().getParticipants(activeCallPayload.meetingUrl),
    ).toEqual([]);
    const participants = [{ displayName: "Current" }];
    act(() => notifyParticipants(currentId, participants));
    expect(
      useCallParticipantsStore.getState().getParticipants(activeCallPayload.meetingUrl),
    ).toEqual(participants);
  });

  it("does not open the embedded call if the native launch has an unconfirmed outcome", async () => {
    const { useJitsiCallStore, JitsiActiveCallHost } = await loadShell();
    const { bridge } = mockCallWindow();
    bridge.open.mockRejectedValue(new Error("Launch outcome unknown"));
    render(<JitsiActiveCallHost />);

    act(() => {
      useJitsiCallStore.getState().requestOpenCall(activeCallPayload);
    });
    const callId = useJitsiCallStore.getState().activeCall!.callId;
    await waitFor(() => expect(bridge.close).toHaveBeenCalledWith(callId));

    expect(useJitsiCallStore.getState().activeCall).toBeNull();
    expect(screen.queryByTestId("jitsi-call-modal")).not.toBeInTheDocument();
  });

  it("renders large incoming modal by default", async () => {
    const { useJitsiCallStore, JitsiIncomingInviteHost } = await loadShell();
    act(() => {
      useJitsiCallStore.getState().ingestIncomingInvite(buildInvite(101));
    });

    render(<JitsiIncomingInviteHost />);

    expect(screen.getByTestId("incoming-call-large")).toBeInTheDocument();
    expect(screen.queryByTestId("incoming-call-compact")).not.toBeInTheDocument();
    expect(screen.queryByTestId("jitsi-call-modal")).not.toBeInTheDocument();
  });

  it("renders compact incoming modal when variant is compact", async () => {
    const { useJitsiCallStore, JitsiIncomingInviteHost } = await loadShell("compact");
    act(() => {
      useJitsiCallStore.getState().ingestIncomingInvite(buildInvite(102));
    });

    render(<JitsiIncomingInviteHost />);

    expect(screen.getByTestId("incoming-call-compact")).toBeInTheDocument();
    expect(screen.queryByTestId("incoming-call-large")).not.toBeInTheDocument();
  });

  it("passes unmuted video preference from large modal toggle to active call", async () => {
    const { useJitsiCallStore, JitsiIncomingInviteHost } = await loadShell("large");
    act(() => {
      useJitsiCallStore.getState().ingestIncomingInvite(buildInvite(103));
    });

    render(<JitsiIncomingInviteHost />);

    fireEvent.click(screen.getByTestId("incoming-call-video-toggle"));
    fireEvent.click(screen.getByTestId("incoming-call-accept"));

    expect(useJitsiCallStore.getState().activeCall?.startWithVideoMuted).toBe(false);
    expect(screen.queryByTestId("jitsi-call-modal")).not.toBeInTheDocument();
  });

  it("declines incoming invite and clears invite state", async () => {
    const { useJitsiCallStore, JitsiIncomingInviteHost } = await loadShell("large");
    act(() => {
      useJitsiCallStore.getState().ingestIncomingInvite(buildInvite(104));
    });

    render(<JitsiIncomingInviteHost />);

    fireEvent.click(screen.getByTestId("incoming-call-decline"));

    expect(useJitsiCallStore.getState().incomingInvite).toBeNull();
    expect(screen.queryByTestId("incoming-call-large")).not.toBeInTheDocument();
    expect(screen.queryByTestId("incoming-call-compact")).not.toBeInTheDocument();
  });

  it("auto-declines incoming invite after 45 seconds", async () => {
    vi.useFakeTimers();
    const { useJitsiCallStore, JitsiIncomingInviteHost } = await loadShell("large");
    act(() => {
      useJitsiCallStore.getState().ingestIncomingInvite(buildInvite(105));
    });

    render(<JitsiIncomingInviteHost />);
    expect(screen.getByTestId("incoming-call-large")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(45_000);
    });

    expect(useJitsiCallStore.getState().incomingInvite).toBeNull();
    expect(screen.queryByTestId("incoming-call-large")).not.toBeInTheDocument();
  });

  it("keeps compatible shell rendering both hosts", async () => {
    const { useJitsiCallStore, JitsiCallShell } = await loadShell("large");
    act(() => {
      useJitsiCallStore.getState().ingestIncomingInvite(buildInvite(106));
    });

    render(<JitsiCallShell />);

    expect(screen.getByTestId("incoming-call-large")).toBeInTheDocument();
  });
});
