import { env } from "~/shared/lib/env";
import { BUNDLED_STICKER_CATALOG } from "./sticker-catalog.lib";
import { createGiphyStickerCatalogRepository } from "./sticker-giphy.repository";
import type { StickerCatalogSource } from "./sticker.repository";

const stickerCatalogSource: StickerCatalogSource = {
  load(signal) {
    signal?.throwIfAborted();
    return Promise.resolve(BUNDLED_STICKER_CATALOG);
  },
};

export const stickerCatalogRepository = createGiphyStickerCatalogRepository({
  apiKey: env.GIPHY_API_KEY,
  catalogSource: stickerCatalogSource,
});
