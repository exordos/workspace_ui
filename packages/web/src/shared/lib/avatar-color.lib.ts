/** Resolve an API RGB integer; missing or invalid colors use the Avatar theme background. */
export function resolveAvatarBackgroundColor(color: number | null | undefined): string | undefined {
  if (color == null || !Number.isInteger(color) || color < 0 || color > 0xffffff) {
    return undefined;
  }
  return `#${color.toString(16).padStart(6, "0")}`;
}
