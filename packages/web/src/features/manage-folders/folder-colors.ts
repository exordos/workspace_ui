export const FOLDER_COLOR_PRESETS: number[] = [
  0xff2563eb, // blue
  0xff4f46e5, // indigo
  0xff0d9488, // teal
  0xff059669, // emerald
  0xfff59e0b, // amber
  0xffdc2626, // red
  0xff6b7280, // gray
  0xff334155, // slate
];

export function folderColorValueToCssHex(colorValue: number): string {
  const rgb = colorValue & 0x00ffffff;
  return `#${rgb.toString(16).padStart(6, "0")}`;
}

export function folderColorValueToCssRgba(colorValue: number, alpha: number): string {
  const rgb = colorValue & 0x00ffffff;
  const red = (rgb >> 16) & 0xff;
  const green = (rgb >> 8) & 0xff;
  const blue = rgb & 0xff;
  const safeAlpha = Math.min(1, Math.max(0, alpha));
  return `rgba(${red}, ${green}, ${blue}, ${safeAlpha})`;
}
