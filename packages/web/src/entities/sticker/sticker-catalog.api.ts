import {
  createWorkspaceStickerResolver,
  loadWorkspaceStickerPage,
} from "./sticker-workspace.repository";
import type { StickerCatalogRepository } from "./sticker.repository";

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
    return resolveWorkspaceSticker(reference.stickerId, signal);
  },
};
