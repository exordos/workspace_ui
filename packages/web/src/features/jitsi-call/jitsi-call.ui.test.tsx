import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JitsiCallModal } from "./jitsi-call.ui";

interface MockRndProps {
  children: React.ReactNode;
  position?: { x: number; y: number };
  size?: { width: number | string; height: number | string };
  bounds?: string;
  onDragStop?: (event: MouseEvent | TouchEvent, data: { x: number; y: number }) => void;
  onResizeStop?: (
    event: MouseEvent | TouchEvent,
    direction: unknown,
    ref: HTMLElement,
    delta: unknown,
    position: { x: number; y: number },
  ) => void;
}

let latestRndProps: MockRndProps | null = null;
let latestJitsiIframe: HTMLIFrameElement | null = null;

vi.mock("@jitsi/react-sdk", () => ({
  JitsiMeeting: ({
    onApiReady,
    getIFrameRef,
  }: {
    onApiReady?: (api: {
      getNumberOfParticipants: () => number;
      getParticipantsInfo: () => [];
      on: (event: string, callback: () => void) => void;
    }) => void;
    getIFrameRef?: (iframe: HTMLElement) => void;
  }) => {
    queueMicrotask(() => {
      onApiReady?.({
        getNumberOfParticipants: () => 2,
        getParticipantsInfo: () => [],
        on: () => {},
      });
      const iframe = document.createElement("iframe");
      latestJitsiIframe = iframe;
      getIFrameRef?.(iframe);
    });
    return <div data-testid="jitsi-meeting">meeting</div>;
  },
}));

vi.mock("react-rnd", () => ({
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

describe("JitsiCallModal pip bounds persistence", () => {
  afterEach(() => {
    latestRndProps = null;
    latestJitsiIframe = null;
  });

  it("includes call name in the dialog header title", () => {
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
    render(
      <JitsiCallModal
        open
        meetingUrl="https://meet.genesis-core.tech/room-42"
        locationName="Engineering"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /minimize/i }));
    expect(screen.getByTestId("mock-rnd")).toBeInTheDocument();

    fireEvent.click(screen.getByText("drag-stop"));
    fireEvent.click(screen.getByText("resize-stop"));

    fireEvent.click(screen.getByRole("button", { name: /expand/i }));
    fireEvent.click(screen.getByRole("button", { name: /minimize/i }));

    expect(latestRndProps?.position).toEqual({ x: 111, y: 222 });
    expect(latestRndProps?.size).toEqual({ width: 410, height: 280 });
  });

  it("configures Jitsi iframe permissions for camera and microphone", async () => {
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

  it("renders pip content in a dedicated non-radix container when minimized", () => {
    render(
      <JitsiCallModal
        open
        meetingUrl="https://meet.genesis-core.tech/room-safe-ref"
        locationName="Ref safety"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /minimize/i }));
    expect(screen.getByTestId("jitsi-pip-content")).toBeInTheDocument();
  });

  it("uses element-based bounds for pip window to avoid window getComputedStyle crash", () => {
    render(
      <JitsiCallModal
        open
        meetingUrl="https://meet.genesis-core.tech/room-bounds"
        locationName="Bounds safety"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /minimize/i }));
    expect(latestRndProps?.bounds).toBe("body");
  });

  it("keeps pip outside Radix portal to prevent non-element ref callbacks", () => {
    render(
      <JitsiCallModal
        open
        meetingUrl="https://meet.genesis-core.tech/room-portal-safety"
        locationName="Portal safety"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /minimize/i }));
    const pipContent = screen.getByTestId("jitsi-pip-content");
    expect(pipContent.closest("[data-radix-portal]")).toBeNull();
  });
});
