import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StickerCatalogRepository } from "~/entities/sticker/sticker.repository";
import type { Sticker } from "~/entities/sticker/sticker.types";
import { renderWithProviders } from "~/test/render";
import { StickerMessage } from "./sticker-message.ui";

const STICKER_ID = "11111111-1111-4111-8111-111111111111";

const STICKER: Sticker = {
  id: STICKER_ID,
  reference: { kind: "workspace", stickerId: STICKER_ID },
  source: { provider: "giphy", externalId: "giphy-1" },
  title: "Celebration",
  alt: "Happy celebration",
  emoji: ["🎉"],
  tags: ["celebration", "праздник"],
  media: {
    animated: true,
    width: 480,
    height: 270,
    aspectRatio: 16 / 9,
    preferredFormat: "webp",
  },
  attribution: {
    provider: "GIPHY",
    creator: "Workspace Artist",
    pageUrl: "https://giphy.com/gifs/celebration",
  },
  rating: "g",
  active: true,
  blocked: false,
  format: "webp",
  url: "https://media.giphy.com/media/giphy-1/200w.webp",
  thumbnailUrl: "https://media.giphy.com/media/giphy-1/100w.webp",
};

function createRepository(resolve: StickerCatalogRepository["resolve"]): StickerCatalogRepository {
  return {
    list: vi.fn(() => Promise.resolve([STICKER])),
    search: vi.fn(() => Promise.resolve([STICKER])),
    resolve,
  };
}

describe("StickerMessage", () => {
  it("resolves a Workspace sticker ID and renders only the sticker media", async () => {
    const resolve = vi.fn(() => Promise.resolve(STICKER));

    renderWithProviders(
      <StickerMessage reference={STICKER.reference} repository={createRepository(resolve)} />,
    );

    const image = await screen.findByRole("img", { name: STICKER.alt });

    expect(resolve).toHaveBeenCalledWith(STICKER.reference, expect.any(AbortSignal));
    expect(image).toHaveAttribute("src", STICKER.url);
    expect(image).toHaveAttribute("width", "480");
    expect(image).toHaveAttribute("height", "270");
    expect(image.parentElement).toHaveStyle({ aspectRatio: `${16 / 9}`, width: "240px" });
    expect(screen.queryByText("GIPHY")).not.toBeInTheDocument();
    expect(screen.queryByText("by Workspace Artist")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders a safe placeholder when the repository cannot resolve a sticker", async () => {
    const repository = createRepository(vi.fn(() => Promise.resolve(null)));

    renderWithProviders(<StickerMessage reference={STICKER.reference} repository={repository} />);

    expect(await screen.findByText("Sticker unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("does not resolve media when passive loading is disabled", () => {
    const resolve = vi.fn(() => Promise.resolve(STICKER));

    renderWithProviders(
      <StickerMessage
        reference={STICKER.reference}
        repository={createRepository(resolve)}
        loadEnabled={false}
      />,
    );

    expect(screen.getByText("Sticker unavailable")).toBeInTheDocument();
    expect(resolve).not.toHaveBeenCalled();
  });
});
