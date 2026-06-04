// This file verifies the Jitsi modal does not break embed lifecycle on UI toggles.
// Focus is not appearance but that minimize/expand/resize
// do not create a new Jitsi session instance.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React, { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JitsiCallModal } from "./jitsi-call.ui";

vi.mock("./jitsi-call-api-loader.hook", () => ({
  useJitsiExternalApiLoader: () => ({ loadState: "ready" as const, retry: vi.fn() }),
}));

// Minimal props shape required by the react-rnd mock.
interface MockRndProps {
  children: React.ReactNode;
  position?: { x: number; y: number };
  size?: { width: number | string; height: number | string };
  bounds?: string;
  disableDragging?: boolean;
  enableResizing?: boolean;
  onDragStop?: (event: MouseEvent | TouchEvent, data: { x: number; y: number }) => void;
  onResizeStop?: (
    event: MouseEvent | TouchEvent,
    direction: unknown,
    ref: HTMLElement,
    delta: unknown,
    position: { x: number; y: number },
  ) => void;
}

// Track whether shell toggles create a new Jitsi session.
let latestRndProps: MockRndProps | null = null;
let latestJitsiIframe: HTMLIFrameElement | null = null;
let latestJitsiConfigOverwrite: Record<string, unknown> | undefined;
let jitsiMountCount = 0;
let jitsiApiReadyCount = 0;
let jitsiIframeReadyCount = 0;

vi.mock("@jitsi/react-sdk", () => ({
  // Mock models real Jitsi embed lifecycle.
  // Count mount/apiReady/iframeReady to catch hidden remount on window mode change.
  JitsiMeeting: ({
    onApiReady,
    getIFrameRef,
    configOverwrite,
  }: {
    onApiReady?: (api: {
      getNumberOfParticipants: () => number;
      getParticipantsInfo: () => [];
      on: (event: string, callback: () => void) => void;
    }) => void;
    getIFrameRef?: (iframe: HTMLElement | null) => void;
    configOverwrite?: Record<string, unknown>;
  }) => {
    latestJitsiConfigOverwrite = configOverwrite;

    useEffect(() => {
      // Mount effect models creation of a new Jitsi session.
      jitsiMountCount += 1;
      jitsiApiReadyCount += 1;
      onApiReady?.({
        getNumberOfParticipants: () => 2,
        getParticipantsInfo: () => [],
        on: () => {},
      });

      const iframe = document.createElement("iframe");
      latestJitsiIframe = iframe;
      jitsiIframeReadyCount += 1;
      getIFrameRef?.(iframe);

      return () => {
        getIFrameRef?.(null);
      };
      // Mock must react only to mount/unmount, not ordinary shell re-renders.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <div data-testid="jitsi-meeting">meeting</div>;
  },
}));

vi.mock("react-rnd", () => ({
  // Mock Rnd lets the test simulate drag/resize without a real DOM layout engine.
  Rnd: (props: MockRndProps) => {
    latestRndProps = props;
    return (
      <div data-testid="mock-rnd">
        <button
          type="button"
          onClick={() => props.onDragStop?.(new MouseEvent("mouseup"), { x: 111, y: 222 })}
        >
          drag-stop
        </button>
        <button
          type="button"
          onClick={() =>
            props.onResizeStop?.(
              new MouseEvent("mouseup"),
              null,
              { offsetWidth: 410, offsetHeight: 280 } as unknown as HTMLElement,
              null,
              { x: 111, y: 222 },
            )
          }
        >
          resize-stop
        </button>
        {props.children}
      </div>
    );
  },
}));

describe("JitsiCallModal", () => {
  afterEach(() => {
    // Reset counters after each test so each case is isolated.
    latestRndProps = null;
    latestJitsiIframe = null;
    latestJitsiConfigOverwrite = undefined;
    jitsiMountCount = 0;
    jitsiApiReadyCount = 0;
    jitsiIframeReadyCount = 0;
  });

  it("includes call name in the dialog header title", () => {
    // Assert shell shows a clear active-call title.
    render(
      <JitsiCallModal
        open
        meetingUrl="https://meet.genesis-core.tech/room-42"
        locationName="Engineering"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Call - Engineering")).toBeInTheDocument();
  });

  it("preserves pip position and size across minimize cycles", () => {
    // PiP window must remember last bounds for predictable re-minimize.
    render(
      <JitsiCallModal
        open
        meetingUrl="https://meet.genesis-core.tech/room-42"
        locationName="Engineering"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /minimize/i }));
    fireEvent.click(screen.getByText("drag-stop"));
    fireEvent.click(screen.getByText("resize-stop"));

    fireEvent.click(screen.getByRole("button", { name: /expand/i }));
    fireEvent.click(screen.getByRole("button", { name: /minimize/i }));

    expect(latestRndProps?.position).toEqual({ x: 111, y: 222 });
    expect(latestRndProps?.size).toEqual({ width: 410, height: 280 });
  });

  it("configures Jitsi iframe permissions for camera and microphone", async () => {
    // iframe must get required allow permissions regardless of shell state.
    render(
      <JitsiCallModal
        open
        meetingUrl="https://meet.genesis-core.tech/room-99"
        locationName="Support"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(latestJitsiIframe?.getAttribute("allow")).toBe(
        "camera; microphone; fullscreen; display-capture",
      );
    });
  });

  it("passes session-level video mute preference to Jitsi config", async () => {
    render(
      <JitsiCallModal
        open
        meetingUrl="https://meet.genesis-core.tech/room-video-pref"
        locationName="Video pref"
        startWithVideoMuted={false}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(latestJitsiConfigOverwrite?.startWithVideoMuted).toBe(false);
      expect(latestJitsiConfigOverwrite?.startWithAudioMuted).toBe(true);
    });
  });

  it("uses element-based bounds for pip window and disables dragging in expanded mode", () => {
    // Expanded mode is fixed; PiP mode becomes draggable/resizable.
    render(
      <JitsiCallModal
        open
        meetingUrl="https://meet.genesis-core.tech/room-bounds"
        locationName="Bounds safety"
        onClose={vi.fn()}
      />,
    );

    expect(latestRndProps?.disableDragging).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /minimize/i }));

    expect(latestRndProps?.bounds).toBe("body");
    expect(latestRndProps?.disableDragging).toBe(false);
    expect(latestRndProps?.enableResizing).toBe(true);
  });

  it("does not remount Jitsi when minimizing and expanding the same call", async () => {
    // Main regression: minimize/expand must not create a new Jitsi instance.
    render(
      <JitsiCallModal
        open
        meetingUrl="https://meet.genesis-core.tech/room-stable"
        locationName="Stable call"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(jitsiMountCount).toBe(1);
      expect(jitsiApiReadyCount).toBe(1);
      expect(jitsiIframeReadyCount).toBe(1);
    });

    const firstIframe = latestJitsiIframe;

    fireEvent.click(screen.getByRole("button", { name: /minimize/i }));
    fireEvent.click(screen.getByRole("button", { name: /expand/i }));

    await waitFor(() => {
      expect(jitsiMountCount).toBe(1);
      expect(jitsiApiReadyCount).toBe(1);
      expect(jitsiIframeReadyCount).toBe(1);
      expect(latestJitsiIframe).toBe(firstIframe);
    });
  });

  it("does not remount Jitsi when pip window is dragged or resized", async () => {
    // Drag and resize are shell-only — embed must not treat them as a new mount.
    render(
      <JitsiCallModal
        open
        meetingUrl="https://meet.genesis-core.tech/room-resize-safe"
        locationName="Resize safe"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(jitsiMountCount).toBe(1);
    });

    fireEvent.click(screen.getByRole("button", { name: /minimize/i }));
    fireEvent.click(screen.getByText("drag-stop"));
    fireEvent.click(screen.getByText("resize-stop"));

    await waitFor(() => {
      expect(jitsiMountCount).toBe(1);
      expect(jitsiApiReadyCount).toBe(1);
      expect(jitsiIframeReadyCount).toBe(1);
    });
  });
});
