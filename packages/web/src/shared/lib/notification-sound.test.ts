/**
 * Tests for the notification sound utility — Web Audio API integration.
 *
 * Verifies that playNotificationSound creates an oscillator with the correct
 * frequency and gain settings, reuses the AudioContext instance, and handles
 * missing or broken AudioContext gracefully (SSR, autoplay-policy-blocked).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("notification-sound", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates oscillator with 800 Hz tone and 0.1 gain, fading over 300 ms", async () => {
    const mockStart = vi.fn();
    const mockStop = vi.fn();
    const mockOscConnect = vi.fn();
    const mockGainConnect = vi.fn();
    const mockFreqSet = vi.fn();
    const mockGainSet = vi.fn();
    const mockGainRamp = vi.fn();
    const dest = {};

    vi.stubGlobal(
      "AudioContext",
      class {
        destination = dest;
        currentTime = 0;
        createOscillator = vi.fn(() => ({
          connect: mockOscConnect,
          frequency: { setValueAtTime: mockFreqSet },
          start: mockStart,
          stop: mockStop,
        }));
        createGain = vi.fn(() => ({
          connect: mockGainConnect,
          gain: { setValueAtTime: mockGainSet, exponentialRampToValueAtTime: mockGainRamp },
        }));
      },
    );

    const { playNotificationSound } = await import("./notification-sound");
    playNotificationSound();

    expect(mockOscConnect).toHaveBeenCalled();
    expect(mockGainConnect).toHaveBeenCalledWith(dest);
    expect(mockFreqSet).toHaveBeenCalledWith(800, 0);
    expect(mockGainSet).toHaveBeenCalledWith(0.1, 0);
    expect(mockGainRamp).toHaveBeenCalledWith(0.001, 0.3);
    expect(mockStart).toHaveBeenCalledWith(0);
    expect(mockStop).toHaveBeenCalledWith(0.3);
  });

  it("reuses the same AudioContext across multiple calls", async () => {
    let ctorCallCount = 0;

    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          ctorCallCount++;
        }
        destination = {};
        currentTime = 0;
        createOscillator = vi.fn(() => ({
          connect: vi.fn(),
          frequency: { setValueAtTime: vi.fn() },
          start: vi.fn(),
          stop: vi.fn(),
        }));
        createGain = vi.fn(() => ({
          connect: vi.fn(),
          gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        }));
      },
    );

    const { playNotificationSound } = await import("./notification-sound");
    playNotificationSound();
    playNotificationSound();

    expect(ctorCallCount).toBe(1);
  });

  it("does not throw when AudioContext is unavailable (SSR / restricted)", async () => {
    const { playNotificationSound } = await import("./notification-sound");
    expect(() => playNotificationSound()).not.toThrow();
  });

  it("does not throw when AudioContext constructor throws (autoplay policy)", async () => {
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new Error("The AudioContext was not allowed to start");
        }
      },
    );

    const { playNotificationSound } = await import("./notification-sound");
    expect(() => playNotificationSound()).not.toThrow();
  });

  it("plays a two-step digital pattern for the digital preset", async () => {
    const frequencySetCalls: [number, number][] = [];
    const startCalls: number[] = [];
    const stopCalls: number[] = [];

    vi.stubGlobal(
      "AudioContext",
      class {
        destination = {};
        currentTime = 0;
        createOscillator = vi.fn(() => ({
          connect: vi.fn(),
          frequency: {
            setValueAtTime: vi.fn((frequency: number, atTime: number) => {
              frequencySetCalls.push([frequency, atTime]);
            }),
          },
          start: vi.fn((atTime: number) => {
            startCalls.push(atTime);
          }),
          stop: vi.fn((atTime: number) => {
            stopCalls.push(atTime);
          }),
        }));
        createGain = vi.fn(() => ({
          connect: vi.fn(),
          gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        }));
      },
    );

    const { playNotificationSound } = await import("./notification-sound");
    playNotificationSound("digital");

    expect(frequencySetCalls).toHaveLength(2);
    expect(frequencySetCalls[0]).toEqual([880, 0]);
    expect(frequencySetCalls[1]).toEqual([1320, 0.09]);
    expect(startCalls).toEqual([0, 0.09]);
    expect(stopCalls).toEqual([0.12, 0.21]);
  });
});
