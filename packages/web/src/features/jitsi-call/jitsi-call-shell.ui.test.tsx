import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IncomingDmCallInvite } from "./jitsi-call.model";

vi.mock("~/shared/api/zulip-client.internal", () => ({
  getRealmBaseUrl: () => "https://realm.test",
}));

vi.mock("~/shared/lib/avatar", () => ({
  resolveAvatarUrl: () => null,
}));

vi.mock("./jitsi-call.ui", () => ({
  JitsiCallModal: ({ startWithVideoMuted = true }: { startWithVideoMuted?: boolean }) => (
    <div data-testid="jitsi-call-modal" data-start-with-video-muted={String(startWithVideoMuted)} />
  ),
}));

function buildInvite(messageId = 777): IncomingDmCallInvite {
  return {
    messageId,
    meetingUrl: "https://meet.jit.si/zulip-dm-room-777",
    callerName: "Fox",
    locationName: "Fox",
    avatarUrl: undefined,
    timestamp: 1_700_000_000,
  };
}

async function loadShell(variant?: "large" | "compact") {
  vi.resetModules();
  vi.unstubAllEnvs();
  if (variant != null) {
    vi.stubEnv("VITE_CALL_INCOMING_MODAL_VARIANT", variant);
  }

  const { useJitsiCallStore } = await import("./jitsi-call.model");
  const { JitsiCallShell } = await import("./jitsi-call-shell.ui");

  useJitsiCallStore.getState().clear();
  return { useJitsiCallStore, JitsiCallShell };
}

describe("JitsiCallShell", () => {
  afterEach(async () => {
    const { useJitsiCallStore } = await import("./jitsi-call.model");
    useJitsiCallStore.getState().clear();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("renders large incoming modal by default", async () => {
    const { useJitsiCallStore, JitsiCallShell } = await loadShell();
    act(() => {
      useJitsiCallStore.getState().ingestIncomingInvite(buildInvite(101));
    });

    render(<JitsiCallShell />);

    expect(screen.getByTestId("incoming-call-large")).toBeInTheDocument();
    expect(screen.queryByTestId("incoming-call-compact")).not.toBeInTheDocument();
  });

  it("renders compact incoming modal when variant is compact", async () => {
    const { useJitsiCallStore, JitsiCallShell } = await loadShell("compact");
    act(() => {
      useJitsiCallStore.getState().ingestIncomingInvite(buildInvite(102));
    });

    render(<JitsiCallShell />);

    expect(screen.getByTestId("incoming-call-compact")).toBeInTheDocument();
    expect(screen.queryByTestId("incoming-call-large")).not.toBeInTheDocument();
  });

  it("passes unmuted video preference from large modal toggle to active call", async () => {
    const { useJitsiCallStore, JitsiCallShell } = await loadShell("large");
    act(() => {
      useJitsiCallStore.getState().ingestIncomingInvite(buildInvite(103));
    });

    render(<JitsiCallShell />);

    fireEvent.click(screen.getByTestId("incoming-call-video-toggle"));
    fireEvent.click(screen.getByTestId("incoming-call-accept"));

    expect(useJitsiCallStore.getState().activeCall?.startWithVideoMuted).toBe(false);
    expect(screen.getByTestId("jitsi-call-modal")).toHaveAttribute(
      "data-start-with-video-muted",
      "false",
    );
  });

  it("declines incoming invite and clears invite state", async () => {
    const { useJitsiCallStore, JitsiCallShell } = await loadShell("large");
    act(() => {
      useJitsiCallStore.getState().ingestIncomingInvite(buildInvite(104));
    });

    render(<JitsiCallShell />);

    fireEvent.click(screen.getByTestId("incoming-call-decline"));

    expect(useJitsiCallStore.getState().incomingInvite).toBeNull();
    expect(screen.queryByTestId("incoming-call-large")).not.toBeInTheDocument();
    expect(screen.queryByTestId("incoming-call-compact")).not.toBeInTheDocument();
  });

  it("auto-declines incoming invite after 45 seconds", async () => {
    vi.useFakeTimers();
    const { useJitsiCallStore, JitsiCallShell } = await loadShell("large");
    act(() => {
      useJitsiCallStore.getState().ingestIncomingInvite(buildInvite(105));
    });

    render(<JitsiCallShell />);
    expect(screen.getByTestId("incoming-call-large")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(45_000);
    });

    expect(useJitsiCallStore.getState().incomingInvite).toBeNull();
    expect(screen.queryByTestId("incoming-call-large")).not.toBeInTheDocument();
  });
});
