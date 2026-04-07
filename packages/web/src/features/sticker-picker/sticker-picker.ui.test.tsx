import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStickerStore } from "~/entities/sticker/sticker.model";
import type { StickerPack } from "~/entities/sticker/sticker.types";
import { renderWithProviders } from "~/test/render";
import { StickerPicker } from "./sticker-picker.ui";

const PACK: StickerPack = {
  id: "pack-1",
  title: "Classic",
  author: "Workspace",
  animated: false,
  coverStickerId: "s-1",
  isDefault: true,
  stickers: [
    {
      id: "s-1",
      packId: "pack-1",
      emoji: "😀",
      alt: "grinning",
      format: "webp",
      url: "https://cdn.example.com/stickers/s-1.webp",
      thumbnailUrl: "https://cdn.example.com/stickers/s-1-thumb.webp",
      width: 512,
      height: 512,
    },
  ],
};

describe("StickerPicker", () => {
  afterEach(() => {
    useStickerStore.setState({ packs: [], recent: [], favorites: [], loading: false });
    localStorage.removeItem("sticker_recent");
    localStorage.removeItem("sticker_favorites");
  });

  it("renders localized empty state when no packs are available", () => {
    renderWithProviders(<StickerPicker onSelect={vi.fn()} />);

    expect(screen.getByText("No sticker packs installed yet.")).toBeInTheDocument();
  });

  it("uses localized search copy and empty search results text", () => {
    useStickerStore.setState({ packs: [PACK], recent: [], favorites: [], loading: false });

    renderWithProviders(<StickerPicker onSelect={vi.fn()} />);

    const searchInput = screen.getByPlaceholderText("Search stickers...");
    fireEvent.change(searchInput, { target: { value: "zzz" } });

    expect(screen.getByText("No stickers found")).toBeInTheDocument();
  });

  it("updates recent tab after selecting a sticker in the same open session", () => {
    useStickerStore.setState({ packs: [PACK], recent: [], favorites: [], loading: false });
    renderWithProviders(<StickerPicker onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Classic" }));
    fireEvent.click(screen.getByRole("button", { name: /grinning/i }));
    fireEvent.click(screen.getByRole("button", { name: /recent stickers/i }));

    expect(screen.queryByText("No recent stickers")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /grinning/i })).toBeInTheDocument();
  });
});
