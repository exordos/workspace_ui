import type { Sticker, StickerReference } from "./sticker.types";

export interface StickerCatalogRepository {
  list(signal?: AbortSignal): Promise<readonly Sticker[]>;
  search(query: string, signal?: AbortSignal): Promise<readonly Sticker[]>;
  resolve(reference: StickerReference, signal?: AbortSignal): Promise<Sticker | null>;
}
