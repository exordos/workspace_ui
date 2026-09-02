import type { Sticker, StickerCatalog, StickerReference } from "./sticker.types";

export interface StickerCatalogRepository {
  list(signal?: AbortSignal): Promise<readonly Sticker[]>;
  search(query: string, signal?: AbortSignal): Promise<readonly Sticker[]>;
  resolve(reference: StickerReference, signal?: AbortSignal): Promise<Sticker | null>;
}

export interface StickerCatalogSource {
  load(signal?: AbortSignal): Promise<StickerCatalog>;
}

export class StickerCatalogValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StickerCatalogValidationError";
  }
}
