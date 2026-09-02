import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStickerStore } from "~/entities/sticker/sticker.model";
import type { StickerPack } from "~/entities/sticker/sticker.types";
import { renderWithProviders } from "~/test/render";
import { StickerPicker } from "./sticker-picker.ui";

const PACK: StickerPack = {
  id: "pack-1",
  title: "Classic",
  coverStickerId: "s-1",
  stickers: [
    {
      id: "s-1",
      reference: { kind: "workspace", stickerId: "11111111-1111-4111-8111-111111111111" },
      source: { provider: "giphy", externalId: "giphy-s-1" },
      title: "Classic grin",
      emoji: ["😀"],
      alt: "grinning",
      tags: ["happy", "радость"],
      media: {
        animated: false,
        width: 512,
        height: 512,
        aspectRatio: 1,
        preferredFormat: "webp",
      },
      attribution: { provider: "GIPHY" },
      rating: "g",
      active: true,
      blocked: false,
      format: "webp",
      url: "https://cdn.example.com/stickers/s-1.webp",
      thumbnailUrl: "https://cdn.example.com/stickers/s-1-thumb.webp",
    },
  ],
};

describe("StickerPicker", () => {
  beforeEach(() => {
    useStickerStore.setState({
      packs: [],
      recent: [],
      loading: false,
      error: null,
      searchResults: [],
      sessionStickers: [],
      searchLoading: false,
      searchError: null,
      loadCatalog: vi.fn(() => Promise.resolve()),
      searchCatalog: vi.fn(() => Promise.resolve()),
      clearSearch: vi.fn(),
    });
  });

  it("shows load error state with retry when sticker fetch failed", async () => {
    const loadCatalog = vi.fn(() => {
      useStickerStore.setState({ error: null });
      return Promise.resolve();
    });
    useStickerStore.setState({
      packs: [],
      recent: [],
      loading: false,
      error: "Network error",
      loadCatalog,
    });
    renderWithProviders(<StickerPicker onSelect={vi.fn()} />);

    expect(screen.getByText("Could not load sticker packs")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(useStickerStore.getState().error).toBeNull());
  });

  it("renders localized empty state when no packs are available", async () => {
    renderWithProviders(<StickerPicker onSelect={vi.fn()} />);

    expect(await screen.findByText("No sticker packs installed yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Powered by GIPHY" })).toHaveAttribute(
      "href",
      "https://giphy.com/",
    );
  });

  it("shows the catalog loading state", () => {
    useStickerStore.setState({ loading: true, error: null });

    renderWithProviders(<StickerPicker onSelect={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading stickers...");
  });

  it("uses localized search copy and empty search results text", async () => {
    useStickerStore.setState({ packs: [PACK], recent: [], loading: false });

    renderWithProviders(<StickerPicker onSelect={vi.fn()} />);

    const searchInput = screen.getByPlaceholderText("Search stickers...");
    fireEvent.change(searchInput, { target: { value: "zzz" } });

    expect(await screen.findByText("No stickers found")).toBeInTheDocument();
  });

  it("hides results from the previous query during the debounce window", async () => {
    const searchCatalog = vi.fn((query: string) => {
      useStickerStore.setState({
        searchResults: query === "happy" ? [...PACK.stickers] : [],
        searchLoading: false,
        searchError: null,
      });
      return Promise.resolve();
    });
    useStickerStore.setState({ packs: [PACK], searchCatalog });

    renderWithProviders(<StickerPicker onSelect={vi.fn()} />);

    const searchInput = screen.getByPlaceholderText("Search stickers...");
    fireEvent.change(searchInput, { target: { value: "happy" } });
    expect(await screen.findByRole("button", { name: "grinning" })).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "sad" } });

    expect(screen.queryByRole("button", { name: "grinning" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading stickers...");
  });

  it("shows search results even when the initial catalog is empty and failed", async () => {
    const searchCatalog = vi.fn(() => {
      useStickerStore.setState({
        searchResults: [...PACK.stickers],
        searchLoading: false,
        searchError: null,
      });
      return Promise.resolve();
    });
    useStickerStore.setState({ error: "Initial catalog failed", searchCatalog });

    renderWithProviders(<StickerPicker onSelect={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Search stickers..."), {
      target: { value: "happy" },
    });

    expect(await screen.findByRole("button", { name: "grinning" })).toBeInTheDocument();
    expect(screen.queryByText("Could not load sticker packs")).not.toBeInTheDocument();
    expect(screen.queryByText("No sticker packs installed yet.")).not.toBeInTheDocument();
  });

  it("opens the first pack after initial load but preserves an explicit empty recent view", async () => {
    const loadCatalog = vi.fn(() => {
      useStickerStore.setState({ packs: [PACK], loading: false, error: null });
      return Promise.resolve();
    });
    useStickerStore.setState({ loadCatalog });

    renderWithProviders(<StickerPicker onSelect={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "grinning" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /recent stickers/i }));

    expect(screen.getByText("No recent stickers")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "grinning" })).not.toBeInTheDocument();
  });

  it("searches the loaded catalog by local metadata tags", async () => {
    const searchCatalog = vi.fn((query: string) => {
      const normalizedQuery = query.toLocaleLowerCase();
      const results = PACK.stickers.filter((sticker) =>
        [sticker.title, sticker.alt, ...sticker.tags, ...sticker.emoji].some((value) =>
          value.toLocaleLowerCase().includes(normalizedQuery),
        ),
      );
      useStickerStore.setState({ searchResults: results, searchLoading: false, searchError: null });
      return Promise.resolve();
    });
    useStickerStore.setState({
      packs: [PACK],
      recent: [],
      loading: false,
      searchCatalog,
    });

    renderWithProviders(<StickerPicker onSelect={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Search stickers..."), {
      target: { value: "радость" },
    });

    expect(await screen.findByRole("button", { name: "grinning" })).toBeInTheDocument();
    expect(screen.queryByText("No stickers found")).not.toBeInTheDocument();
  });

  it("updates recent tab after selecting a sticker in the same open session", () => {
    useStickerStore.setState({ packs: [PACK], recent: [], loading: false });
    renderWithProviders(<StickerPicker onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Classic" }));
    fireEvent.click(screen.getByRole("button", { name: /grinning/i }));
    fireEvent.click(screen.getByRole("button", { name: /recent stickers/i }));

    expect(screen.queryByText("No recent stickers")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /grinning/i })).toBeInTheDocument();
  });
});
