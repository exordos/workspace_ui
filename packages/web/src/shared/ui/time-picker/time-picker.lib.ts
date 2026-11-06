export function parseTime(value: string | null | undefined): number | null {
  if (value == null || !/^\d{2}:\d{2}(?::\d{2})?$/u.test(value)) return null;
  const hours = Number(value.slice(0, 2));
  const minutes = Number(value.slice(3, 5));
  const seconds = value.length === 8 ? Number(value.slice(6)) : 0;
  return hours < 24 && minutes < 60 && seconds < 60 ? hours * 3600 + minutes * 60 + seconds : null;
}

export function formatTime(seconds: number, showSeconds = false): string {
  const parts = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60];
  if (showSeconds) parts.push(seconds % 60);
  return parts.map((part) => String(part).padStart(2, "0")).join(":");
}

export function timePart(seconds: number, index: number): number {
  if (index === 0) return Math.floor(seconds / 3600);
  if (index === 1) return Math.floor(seconds / 60) % 60;
  return seconds % 60;
}
