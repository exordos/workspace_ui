// Этот файл проверяет, что Jitsi-модалка не ломает lifecycle embed при UI-переключениях.
// Здесь нас интересует не внешний вид как таковой, а то, что minimize/expand/resize
// не создают новый Jitsi session instance.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React, { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JitsiCallModal } from "./jitsi-call.ui";

// Это минимальный shape props, который тесту нужен от mock-версии react-rnd.
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

// Эти переменные позволяют проверить, что shell-переключения не создают новую Jitsi-сессию.
let latestRndProps: MockRndProps | null = null;
let latestJitsiIframe: HTMLIFrameElement | null = null;
let jitsiMountCount = 0;
let jitsiApiReadyCount = 0;
let jitsiIframeReadyCount = 0;

vi.mock("@jitsi/react-sdk", () => ({
  // Этот mock моделирует жизненный цикл настоящего Jitsi embed.
  // Нам важно считать mount/apiReady/iframeReady, чтобы ловить скрытый remount при смене режима окна.
  JitsiMeeting: ({
    onApiReady,
    getIFrameRef,
  }: {
    onApiReady?: (api: {
      getNumberOfParticipants: () => number;
      getParticipantsInfo: () => [];
      on: (event: string, callback: () => void) => void;
    }) => void;
    getIFrameRef?: (iframe: HTMLElement | null) => void;
  }) => {
    useEffect(() => {
      // Mount эффекта здесь моделирует создание новой Jitsi-сессии.
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
      // Этот mock должен реагировать только на mount/unmount, а не на обычные shell-ререндеры.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <div data-testid="jitsi-meeting">meeting</div>;
  },
}));

vi.mock("react-rnd", () => ({
  // Mock Rnd даёт тесту контролируемый способ симулировать drag и resize без настоящего DOM layout engine.
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
    // После каждого теста обнуляем счётчики, чтобы каждая проверка смотрела только на свой сценарий.
    latestRndProps = null;
    latestJitsiIframe = null;
    jitsiMountCount = 0;
    jitsiApiReadyCount = 0;
    jitsiIframeReadyCount = 0;
  });

  it("includes call name in the dialog header title", () => {
    // Проверяем, что shell показывает понятный заголовок активного звонка.
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
    // PiP-окно должно помнить last known bounds, чтобы повторное сворачивание было предсказуемым.
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
    // iframe должен получать нужные allow permissions независимо от shell-состояния.
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

  it("uses element-based bounds for pip window and disables dragging in expanded mode", () => {
    // В expanded режиме окно фиксированное, а в PiP режиме становится draggable/resizable.
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
    // Это главный регрессионный тест: minimize/expand не должен создавать новый Jitsi instance.
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
    // Drag и resize — это только shell-операции. Для embed они не должны выглядеть как новый mount.
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
