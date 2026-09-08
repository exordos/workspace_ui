import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stickerFromDto } from "~/entities/sticker/sticker-workspace.repository";
import type { StickerCatalogRepository } from "~/entities/sticker/sticker.repository";
import type { Sticker } from "~/entities/sticker/sticker.types";
import { renderWithProviders } from "~/test/render";
import { stickerDto, stickerSession } from "~/test/sticker-contract.fixture";
import { StickerMessage } from "./sticker-message.ui";

const STICKER_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("~/shared/api/messenger-stickers.api", () => ({
  downloadSticker: vi.fn(() => Promise.resolve(new Blob(["image"], { type: "image/gif" }))),
}));

beforeEach(() => {
  stickerSession();
  vi.stubGlobal("IntersectionObserver", undefined);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:workspace-sticker");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const STICKER: Sticker = stickerFromDto({
  ...stickerDto(STICKER_ID),
  media: { ...stickerDto(STICKER_ID).media, width: 480, height: 270 },
});

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
    expect(image).toHaveAttribute("src", "blob:workspace-sticker");
    expect(image).toHaveAttribute("width", "480");
    expect(image).toHaveAttribute("height", "270");
    expect(image.parentElement).toHaveStyle({ aspectRatio: `${16 / 9}`, width: "240px" });
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
