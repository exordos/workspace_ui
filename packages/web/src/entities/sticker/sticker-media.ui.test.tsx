import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadSticker } from "~/shared/api/messenger-stickers.api";
import { renderWithProviders } from "~/test/render";
import { stickerDto, stickerSession } from "~/test/sticker-contract.fixture";
import { StickerMedia } from "./sticker-media.ui";
import { stickerFromDto } from "./sticker-workspace.repository";

vi.mock("~/shared/api/messenger-stickers.api", () => ({ downloadSticker: vi.fn() }));

beforeEach(() => {
  stickerSession();
  vi.stubGlobal("IntersectionObserver", undefined);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:sticker-test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.mocked(downloadSticker)
    .mockReset()
    .mockResolvedValue(new Blob(["gif"], { type: "image/gif" }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Workspace sticker media", () => {
  it("downloads authenticated media and waits for image load before reporting ready", async () => {
    const { unmount } = renderWithProviders(
      <StickerMedia sticker={stickerFromDto(stickerDto())} />,
    );
    const image = await screen.findByRole("img", { name: "Happy celebration" });
    expect(downloadSticker).toHaveBeenCalledWith(
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
      expect.objectContaining({ id: stickerDto().id }),
    );
    expect(image).toHaveAttribute("src", "blob:sticker-test");
    expect(image.parentElement).toHaveAttribute("data-sticker-media-status", "loading");
    fireEvent.load(image);
    expect(image.parentElement).toHaveAttribute("data-sticker-media-status", "ready");
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:sticker-test");
  });

  it("retries a failed download without remounting the message", async () => {
    vi.mocked(downloadSticker).mockRejectedValueOnce(new Error("temporary failure"));
    renderWithProviders(<StickerMedia sticker={stickerFromDto(stickerDto())} retryEnabled />);
    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    const image = await screen.findByRole("img", { name: "Happy celebration" });
    fireEvent.load(image);
    expect(image.parentElement).toHaveAttribute("data-sticker-media-status", "ready");
    expect(downloadSticker).toHaveBeenCalledTimes(2);
  });

  it("reports invalid image bytes and lets the user retry", async () => {
    renderWithProviders(<StickerMedia sticker={stickerFromDto(stickerDto())} retryEnabled />);
    fireEvent.error(await screen.findByRole("img", { name: "Happy celebration" }));
    expect(screen.getByRole("img", { name: "Sticker unavailable" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await screen.findByRole("img", { name: "Happy celebration" });
    expect(downloadSticker).toHaveBeenCalledTimes(2);
  });

  it("discards bytes from a previous account", async () => {
    let finish!: (blob: Blob) => void;
    vi.mocked(downloadSticker).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderWithProviders(<StickerMedia sticker={stickerFromDto(stickerDto())} />);
    await waitFor(() => expect(downloadSticker).toHaveBeenCalledTimes(1));
    act(() => stickerSession("user-b", 2));
    await screen.findByRole("img", { name: "Happy celebration" });
    await act(async () => {
      finish(new Blob(["old"]));
      await Promise.resolve();
    });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
});
