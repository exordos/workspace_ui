import { blueCold } from "./blue-cold";
import { blueMist } from "./blue-mist";
import { emeraldChat } from "./emerald-chat";
import { orangeWarm } from "./orange-warm";
import type { ThemePalette } from "./tokens";

export const palettes: readonly ThemePalette[] = [orangeWarm, blueCold, blueMist, emeraldChat];

export const defaultPaletteId = "blue-mist";

export function getPalette(id: string): ThemePalette {
  return palettes.find((p) => p.id === id) ?? palettes[0]!;
}
