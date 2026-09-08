import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stickerFromDto } from "~/entities/sticker/sticker-workspace.repository";
import { buildStickerMarkdown } from "~/entities/sticker/sticker.api";
import { useStickerStore } from "~/entities/sticker/sticker.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceIamCapabilitiesStore } from "~/entities/workspace-auth/workspace-iam-capabilities.model";
import { renderWithProviders } from "~/test/render";
import {
  requestUrl,
  OTHER_STICKER_ID,
  STICKER_ID,
  stickerDto,
  stickerPageResponse,
  stickerSession,
} from "~/test/sticker-contract.fixture";
import { StickerPicker } from "./sticker-picker.ui";

let fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  useStickerStore.getState().clear();
  stickerSession();
  useWorkspaceIamCapabilitiesStore.getState().clear();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:sticker-fixture");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation((url) =>
      Promise.resolve(
        requestUrl(url).includes("/download")
          ? new Response("GIF89a")
          : stickerPageResponse([stickerDto()]),
      ),
    );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  useStickerStore.getState().clear();
  useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null });
  useWorkspaceIamCapabilitiesStore.getState().clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function catalogCalls() {
  return fetchMock.mock.calls.filter(([url]) => !requestUrl(url).includes("/actions/"));
}

describe("Workspace sticker picker HTTP integration", () => {
  it("loads authenticated media and sends only canonical UUID markdown on selection", async () => {
    const select = vi.fn();
    renderWithProviders(
      <StickerPicker onSelect={(sticker) => select(buildStickerMarkdown(sticker))} />,
    );
    const button = await screen.findByRole("button", { name: "Happy celebration" });
    await screen.findByRole("img", { name: "Happy celebration" });
    fireEvent.click(button);
    expect(select).toHaveBeenCalledWith(`![sticker](urn:sticker:${STICKER_ID})`);
    expect(screen.queryByText("Manage sticker catalog")).not.toBeInTheDocument();
    const download = fetchMock.mock.calls.find(([url]) => requestUrl(url).endsWith("/download"));
    expect(new Headers(download?.[1]?.headers).get("Authorization")).toBe(
      "Bearer fixture-access-token",
    );
    cleanup();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:sticker-fixture");
  });
  it("loads more without duplicates and resets cursor on category/search changes", async () => {
    fetchMock.mockImplementation((input) => {
      const url = new URL(requestUrl(input), "https://example.com");
      if (url.pathname.endsWith("/download")) return Promise.resolve(new Response("GIF89a"));
      return Promise.resolve(
        url.searchParams.has("page_marker")
          ? stickerPageResponse([
              stickerDto(),
              { ...stickerDto(OTHER_STICKER_ID), alt_text: "Second" },
            ])
          : stickerPageResponse([stickerDto()], "opaque-marker"),
      );
    });
    renderWithProviders(<StickerPicker onSelect={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await screen.findByRole("button", { name: "Second" });
    expect(screen.getAllByRole("button", { name: "Happy celebration" })).toHaveLength(1);
    fireEvent.change(screen.getByRole("combobox", { name: "Category" }), {
      target: { value: "gif" },
    });
    await waitFor(() => expect(requestUrl(catalogCalls().at(-1)?.[0])).toContain("category=gif"));
    expect(requestUrl(catalogCalls().at(-1)?.[0])).not.toContain("page_marker");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search stickers" }), {
      target: { value: "happy" },
    });
    await waitFor(() => expect(requestUrl(catalogCalls().at(-1)?.[0])).toContain("q=happy"));
    expect(requestUrl(catalogCalls().at(-1)?.[0])).not.toContain("page_marker");
  });
  it("confirms favorite writes, serializes rapid clicks and loads the server favorites tab", async () => {
    let starred = false;
    let finish!: () => void;
    fetchMock.mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.includes("/star/")) {
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        starred = true;
        return new Response(null);
      }
      if (url.includes("/unstar/")) {
        starred = false;
        return new Response(null);
      }
      if (url.endsWith("/download")) return new Response("GIF89a");
      return stickerPageResponse(
        url.includes("favorite=true") && !starred ? [] : [stickerDto(STICKER_ID, starred)],
      );
    });
    renderWithProviders(<StickerPicker onSelect={vi.fn()} />);
    const star = await screen.findByRole("button", { name: "Add to favorites" });
    fireEvent.click(star);
    fireEvent.click(star);
    await waitFor(() => expect(star).toBeDisabled());
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    await act(() => Promise.resolve(finish()));
    await screen.findByRole("button", { name: "Remove from favorites" });
    expect(fetchMock.mock.calls.filter(([url]) => requestUrl(url).includes("/star/"))).toHaveLength(
      1,
    );
    fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
    const unstar = await screen.findByRole("button", { name: "Remove from favorites" });
    fireEvent.click(unstar);
    await screen.findByText("No stickers found");
  });
  it("retains the confirmed favorite state after a failed mutation", async () => {
    fetchMock.mockImplementation((url) => {
      if (requestUrl(url).includes("/star/"))
        return Promise.resolve(Response.json({}, { status: 500 }));
      return Promise.resolve(
        requestUrl(url).endsWith("/download")
          ? new Response("GIF89a")
          : stickerPageResponse([stickerDto()]),
      );
    });
    renderWithProviders(<StickerPicker onSelect={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add to favorites" }));
    await screen.findByText("Could not update favorites. Please try again.");
    expect(screen.getByRole("button", { name: "Add to favorites" })).not.toBeDisabled();
  });
  it("shows a network failure and retries the catalog", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network error"));
    renderWithProviders(<StickerPicker onSelect={vi.fn()} />);
    await screen.findByText("Could not load stickers");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("button", { name: "Happy celebration" });
  });
  it("clears personalized data on account switch and rejects the earlier response", async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const first = useStickerStore.getState().loadCatalog();
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    stickerSession("user-b", 2);
    await useStickerStore.getState().loadCatalog();
    finish(stickerPageResponse([{ ...stickerDto(OTHER_STICKER_ID, true), title: "Other user" }]));
    await first;
    expect(useStickerStore.getState().items.map((item) => item.id)).toEqual([STICKER_ID]);
    expect(useStickerStore.getState().items[0]?.isFavorite).toBe(false);
  });
  it("rejects an older search response even if fetch ignores cancellation", async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const old = useStickerStore.getState().loadCatalog({ q: "old" });
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    await useStickerStore.getState().loadCatalog({ q: "new" });
    finish(stickerPageResponse([stickerDto(OTHER_STICKER_ID)]));
    await old;
    expect(useStickerStore.getState().items.map((item) => item.id)).toEqual([STICKER_ID]);
  });
  it("does not optimistically change a card while star is pending", async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const card = stickerFromDto(stickerDto());
    useStickerStore.setState({ items: [card] });
    const mutation = useStickerStore.getState().toggleFavorite(card);
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(useStickerStore.getState().items[0]?.isFavorite).toBe(false);
    finish(new Response(null));
    await mutation;
    expect(useStickerStore.getState().items[0]?.isFavorite).toBe(true);
  });
});
