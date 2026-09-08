import { env } from "~/shared/lib/env";
import { BUNDLED_STICKER_CATALOG } from "./sticker-catalog.lib";
import { createGiphyStickerCatalogRepository } from "./sticker-giphy.repository";
import {
  createWorkspaceStickerResolver,
  loadWorkspaceStickerPage,
} from "./sticker-workspace.repository";
import type { StickerCatalogSource, StickerCatalogRepository } from "./sticker.repository";

const stickerCatalogSource: StickerCatalogSource = {
  load(signal) {
    signal?.throwIfAborted();
    return Promise.resolve(BUNDLED_STICKER_CATALOG);
  },
};

const historicalProviderRepository = createGiphyStickerCatalogRepository({
  apiKey: env.GIPHY_API_KEY,
  catalogSource: stickerCatalogSource,
});

const resolveWorkspaceSticker = createWorkspaceStickerResolver();
export const stickerCatalogRepository: StickerCatalogRepository = {
  async list(signal) {
    const page = await loadWorkspaceStickerPage({}, signal);
    return page.items;
  },
  async search(q, signal) {
    const page = await loadWorkspaceStickerPage({ q }, signal);
    return page.items;
  },
  resolve(reference, signal) {
    return reference.kind === "workspace"
      ? resolveWorkspaceSticker(reference.stickerId, signal)
      : historicalProviderRepository.resolve(reference, signal);
  },
};
