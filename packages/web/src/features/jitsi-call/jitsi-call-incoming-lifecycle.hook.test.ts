import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "~/features/settings/settings.model";
import { playNotificationSound } from "~/shared/lib/notification-sound";
import { useIncomingCallLifecycle } from "./jitsi-call-incoming-lifecycle.hook";
import type { ActiveJitsiCall, IncomingDmCallInvite } from "./jitsi-call.model";

vi.mock("~/shared/lib/notification-sound", () => ({
  playNotificationSound: vi.fn(),
}));

function buildInvite(messageId = 777): IncomingDmCallInvite {
  return {
    messageId,
    meetingUrl: `https://meet.jit.si/zulip-dm-room-${messageId}`,
    callerName: "Fox",
    locationName: "Fox",
    avatarUrl: undefined,
    timestamp: 1_700_000_000,
  };
}

function buildActiveCall(): ActiveJitsiCall {
  return {
    meetingUrl: "https://meet.jit.si/active-room",
    locationName: "Active",
    startWithVideoMuted: true,
  };
}

interface HookProps {
  incomingInvite: IncomingDmCallInvite | null;
  activeCall: ActiveJitsiCall | null;
  onDeclineIncomingInvite: () => void;
}

function renderIncomingCallLifecycle(initialProps: HookProps) {
  return renderHook((props: HookProps) => useIncomingCallLifecycle(props), {
    initialProps,
  });
}

describe("useIncomingCallLifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSettingsStore.setState({ notificationSound: "default" });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    useSettingsStore.setState({ notificationSound: "default" });
  });

  it("starts auto-decline timer only when incoming invite is visible", () => {
    const onDeclineIncomingInvite = vi.fn();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const { rerender } = renderIncomingCallLifecycle({
      incomingInvite: null,
      activeCall: null,
      onDeclineIncomingInvite,
    });

    expect(setTimeoutSpy).not.toHaveBeenCalled();

    rerender({
      incomingInvite: buildInvite(101),
      activeCall: null,
      onDeclineIncomingInvite,
    });
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);

    rerender({
      incomingInvite: buildInvite(101),
      activeCall: buildActiveCall(),
      onDeclineIncomingInvite,
    });
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  it("declines incoming invite after 45 seconds", () => {
    const onDeclineIncomingInvite = vi.fn();
    renderIncomingCallLifecycle({
      incomingInvite: buildInvite(102),
      activeCall: null,
      onDeclineIncomingInvite,
    });

    act(() => {
      vi.advanceTimersByTime(44_999);
    });
    expect(onDeclineIncomingInvite).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDeclineIncomingInvite).toHaveBeenCalledTimes(1);
  });

  it("does not play ringtone when notification sound is none", () => {
    useSettingsStore.setState({ notificationSound: "none" });

    renderIncomingCallLifecycle({
      incomingInvite: buildInvite(103),
      activeCall: null,
      onDeclineIncomingInvite: vi.fn(),
    });

    expect(playNotificationSound).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(12_000);
    });
    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it("plays soft_call ringtone immediately and on each 1.5-second interval", () => {
    useSettingsStore.setState({ notificationSound: "glass" });

    renderIncomingCallLifecycle({
      incomingInvite: buildInvite(104),
      activeCall: null,
      onDeclineIncomingInvite: vi.fn(),
    });

    expect(playNotificationSound).toHaveBeenCalledTimes(1);
    expect(playNotificationSound).toHaveBeenLastCalledWith("soft_call");

    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(playNotificationSound).toHaveBeenCalledTimes(2);

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(playNotificationSound).toHaveBeenCalledTimes(4);
  });

  it("cleans up timer and ringtone interval when invite becomes hidden", () => {
    const onDeclineIncomingInvite = vi.fn();
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    const { rerender } = renderIncomingCallLifecycle({
      incomingInvite: buildInvite(105),
      activeCall: null,
      onDeclineIncomingInvite,
    });

    expect(playNotificationSound).toHaveBeenCalledTimes(1);

    rerender({
      incomingInvite: buildInvite(105),
      activeCall: buildActiveCall(),
      onDeclineIncomingInvite,
    });

    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(clearIntervalSpy).toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(45_000);
    });
    expect(onDeclineIncomingInvite).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(8_000);
    });
    expect(playNotificationSound).toHaveBeenCalledTimes(1);
  });

  it("cleans up timer and ringtone interval on unmount", () => {
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    const onDeclineIncomingInvite = vi.fn();
    const { unmount } = renderIncomingCallLifecycle({
      incomingInvite: buildInvite(106),
      activeCall: null,
      onDeclineIncomingInvite,
    });

    expect(playNotificationSound).toHaveBeenCalledTimes(1);

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(clearIntervalSpy).toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(45_000);
    });
    expect(onDeclineIncomingInvite).not.toHaveBeenCalled();
  });
});
