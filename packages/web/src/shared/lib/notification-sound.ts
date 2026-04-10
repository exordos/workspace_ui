/**
 * Notification sound — plays short modern tones via Web Audio API.
 *
 * Uses oscillators (no external audio files needed). Supports multiple presets:
 * default, subtle, digital, glass, pulse, soft_call, and none.
 *
 * Usage:
 *   import { playNotificationSound } from "~/shared/lib/notification-sound";
 *   playNotificationSound("digital");
 */

let audioContext: AudioContext | null = null;

type NotificationSoundPreset =
  | "default"
  | "subtle"
  | "digital"
  | "glass"
  | "pulse"
  | "soft_call"
  | "none";

interface ToneSpec {
  frequency: number;
  gain: number;
  duration: number;
  startOffset: number;
  waveType?: OscillatorType;
}

const TONE_PRESETS: Readonly<
  Record<Exclude<NotificationSoundPreset, "none">, readonly ToneSpec[]>
> = {
  default: [{ frequency: 800, gain: 0.1, duration: 0.3, startOffset: 0, waveType: "sine" }],
  subtle: [{ frequency: 660, gain: 0.07, duration: 0.22, startOffset: 0, waveType: "sine" }],
  digital: [
    { frequency: 880, gain: 0.09, duration: 0.12, startOffset: 0, waveType: "triangle" },
    { frequency: 1320, gain: 0.08, duration: 0.12, startOffset: 0.09, waveType: "triangle" },
  ],
  glass: [{ frequency: 1480, gain: 0.075, duration: 0.18, startOffset: 0, waveType: "sine" }],
  pulse: [
    { frequency: 640, gain: 0.09, duration: 0.1, startOffset: 0, waveType: "square" },
    { frequency: 760, gain: 0.085, duration: 0.1, startOffset: 0.14, waveType: "square" },
  ],
  soft_call: [
    { frequency: 622, gain: 0.11, duration: 0.09, startOffset: 0, waveType: "triangle" },
    { frequency: 622, gain: 0.105, duration: 0.09, startOffset: 0.12, waveType: "triangle" },
    { frequency: 740, gain: 0.1, duration: 0.09, startOffset: 0.24, waveType: "triangle" },
    { frequency: 622, gain: 0.1, duration: 0.09, startOffset: 0.36, waveType: "triangle" },
    { frequency: 740, gain: 0.095, duration: 0.09, startOffset: 0.48, waveType: "triangle" },
    { frequency: 622, gain: 0.09, duration: 0.09, startOffset: 0.6, waveType: "triangle" },
    { frequency: 740, gain: 0.09, duration: 0.11, startOffset: 0.72, waveType: "triangle" },
  ],
};

function playTone(context: AudioContext, tone: ToneSpec): void {
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const startAt = context.currentTime + tone.startOffset;
  const stopAt = startAt + tone.duration;

  oscillator.type = tone.waveType ?? "sine";
  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.frequency.setValueAtTime(tone.frequency, startAt);
  gainNode.gain.setValueAtTime(tone.gain, startAt);
  gainNode.gain.exponentialRampToValueAtTime(0.001, stopAt);
  oscillator.start(startAt);
  oscillator.stop(stopAt);
}

export function playNotificationSound(preset: NotificationSoundPreset = "default"): void {
  if (preset === "none") {
    return;
  }

  try {
    audioContext ??= new AudioContext();
    const context = audioContext;
    if (context == null) {
      return;
    }
    const tones = TONE_PRESETS[preset] ?? TONE_PRESETS.default;
    tones.forEach((tone) => playTone(context, tone));
  } catch {
    /* AudioContext not available (e.g. SSR, restricted environment) */
  }
}
