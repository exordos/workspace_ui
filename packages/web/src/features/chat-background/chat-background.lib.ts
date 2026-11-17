import { detectImageMime } from "~/shared/lib/validation";
import forest from "./assets/forest.svg";
import mountains from "./assets/mountains.svg";
import sea from "./assets/sea.svg";

export const CHAT_BACKGROUNDS = [
  { id: "mountains", image: mountains, label: "chatBackground.mountains" },
  { id: "sea", image: sea, label: "chatBackground.sea" },
  { id: "forest", image: forest, label: "chatBackground.forest" },
] as const;
export type ChatBackgroundValue = { preset: string } | { image: string } | null;
const MAX_STORED_LENGTH = 2_000_000;
const MAX_STORED_IMAGE_LENGTH = MAX_STORED_LENGTH - '{"image":""}'.length;
export const chatBackgroundStorageKey = (scope: string) => `workspace-chat-background-v1:${scope}`;

export function chatBackgroundUrl(value: ChatBackgroundValue): string | undefined {
  if (value == null) return undefined;
  return "image" in value
    ? value.image
    : CHAT_BACKGROUNDS.find((item) => item.id === value.preset)?.image;
}
function validateChatBackground(value: unknown): ChatBackgroundValue {
  if (value == null || typeof value !== "object") return null;
  if ("preset" in value && CHAT_BACKGROUNDS.some((item) => item.id === value.preset))
    return { preset: String(value.preset) };
  if (
    "image" in value &&
    typeof value.image === "string" &&
    value.image.length <= MAX_STORED_IMAGE_LENGTH &&
    /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.image)
  )
    return { image: value.image };
  return null;
}
export interface ChatBackgroundPreferences {
  global: ChatBackgroundValue;
  chats: Record<string, ChatBackgroundValue>;
}
export function parseChatBackgroundPreferences(raw: string | null): ChatBackgroundPreferences {
  const empty: ChatBackgroundPreferences = { global: null, chats: {} };
  if (!raw || raw.length > 4_000_000) return empty;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      value != null &&
      typeof value === "object" &&
      "global" in value &&
      "chats" in value &&
      value.chats != null &&
      typeof value.chats === "object" &&
      !Array.isArray(value.chats)
    ) {
      const chats: Record<string, ChatBackgroundValue> = {};
      for (const [id, background] of Object.entries(value.chats)) {
        if (!/^(stream|topic):[0-9a-f:-]+$/i.test(id)) continue;
        const parsed = validateChatBackground(background);
        if (background === null || parsed != null) chats[id] = parsed;
      }
      return { global: validateChatBackground(value.global), chats };
    }
    return {
      global: raw.length <= MAX_STORED_LENGTH ? validateChatBackground(value) : null,
      chats: {},
    };
  } catch {
    return empty;
  }
}
export function saveChatBackgroundPreferences(key: string, value: ChatBackgroundPreferences): void {
  const raw = JSON.stringify(value);
  if (raw.length > 4_000_000) throw new BackgroundImageError("storage");
  localStorage.setItem(key, raw);
}
export type ChatBackgroundError = "type" | "size" | "decode" | "storage";
export class BackgroundImageError extends Error {
  constructor(readonly code: ChatBackgroundError) {
    super(code);
  }
}
/** Decode local raster files and persist a bounded JPEG, never an external URL or SVG. */
export async function prepareChatBackground(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new BackgroundImageError("type");
  if (!file.size || file.size > 8 * 1024 * 1024) throw new BackgroundImageError("size");
  if (detectImageMime(await file.arrayBuffer()) !== file.type)
    throw new BackgroundImageError("type");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new BackgroundImageError("decode"));
      image.src = url;
    });
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height || width * height > 24_000_000) throw new BackgroundImageError("size");
    const scale = Math.min(1, 1600 / width, 1600 / height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new BackgroundImageError("decode");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/jpeg", 0.8);
    if (!result.startsWith("data:image/jpeg;base64,") || result.length > MAX_STORED_LENGTH - 100)
      throw new BackgroundImageError("size");
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}
