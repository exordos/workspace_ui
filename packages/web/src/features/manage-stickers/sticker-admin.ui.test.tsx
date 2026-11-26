import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStickerStore } from "~/entities/sticker/sticker.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceIamCapabilitiesStore } from "~/entities/workspace-auth/workspace-iam-capabilities.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { renderWithProviders } from "~/test/render";
import {
  requestUrl,
  STICKER_ID,
  stickerDto,
  stickerPageResponse,
  stickerSession,
} from "~/test/sticker-contract.fixture";
import { StickerAdmin } from "./sticker-admin.ui";

let fetchMock = vi.fn<typeof fetch>();
function allow() {
  const context = useWorkspaceAuthStore.getState().getCurrentRuntimeContext()!;
  const owner = workspaceRuntimeOwnerKey(context);
  const state = useWorkspaceIamCapabilitiesStore.getState();
  const version = state.startLoad(owner, 1);
  state.finishLoad(owner, 1, version, ["workspace.sticker_catalog.manage"]);
}
beforeEach(() => {
  useStickerStore.getState().clear();
  stickerSession();
  useWorkspaceIamCapabilitiesStore.getState().clear();
  allow();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:sticker-fixture");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  fetchMock = vi.fn<typeof fetch>().mockImplementation((url, init) => {
    if (requestUrl(url).endsWith("/download")) return Promise.resolve(new Response("GIF89a"));
    if (init?.method === "PUT" || requestUrl(url).endsWith(STICKER_ID))
      return Promise.resolve(Response.json(stickerDto()));
    return Promise.resolve(stickerPageResponse([stickerDto()]));
  });
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
function open() {
  fireEvent.click(screen.getByRole("button", { name: "Manage sticker catalog" }));
  return screen.getByRole("dialog", { name: "Manage sticker catalog" });
}
async function edit() {
  fireEvent.click(screen.getByRole("button", { name: "Edit stickers" }));
  fireEvent.click(await screen.findByRole("button", { name: /Happy celebration/ }));
}
describe("Sticker admin dialog HTTP integration", () => {
  it("opens as a separate dialog, closes and restores focus to its portable trigger", async () => {
    renderWithProviders(<StickerAdmin />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const dialog = open();
    expect(within(dialog).getByLabelText("ZIP archive (up to 40 MiB)")).toBeVisible();
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Manage sticker catalog" })).toHaveFocus();
  });
  it("hides the feature without permission and unmounts an open dialog on account switch", () => {
    renderWithProviders(<StickerAdmin />);
    open();
    act(() => stickerSession("user-b", 2));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Manage sticker catalog")).not.toBeInTheDocument();
  });
  it("imports duplicates and opens their current card from the result", async () => {
    fetchMock.mockImplementation((url) => {
      if (requestUrl(url).includes("import_archive"))
        return Promise.resolve(
          Response.json({
            created: 0,
            duplicates: 1,
            items: [
              {
                client_id: STICKER_ID,
                sticker_uuid: STICKER_ID,
                file: "happy.gif",
                status: "duplicate",
              },
            ],
          }),
        );
      if (requestUrl(url).endsWith(STICKER_ID)) return Promise.resolve(Response.json(stickerDto()));
      if (requestUrl(url).endsWith("/download")) return Promise.resolve(new Response("GIF89a"));
      return Promise.resolve(stickerPageResponse([]));
    });
    renderWithProviders(<StickerAdmin />);
    open();
    fireEvent.change(screen.getByLabelText("ZIP archive (up to 40 MiB)"), {
      target: { files: [new File(["zip"], "stickers.zip")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import archive" }));
    await screen.findByText("Created: 0, duplicates: 1");
    expect(useStickerStore.getState().revision).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByLabelText("Title")).toHaveValue(stickerDto().title);
  });
  it("prefills metadata, keeps edits across tasks and sends only changed fields", async () => {
    renderWithProviders(<StickerAdmin />);
    open();
    await edit();
    expect(screen.getByLabelText("Title")).toHaveValue(stickerDto().title);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Edited" } });
    fireEvent.click(screen.getByRole("button", { name: "Import ZIP" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit stickers" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Edited");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Saved successfully");
    expect(fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")?.[1]?.body).toBe(
      JSON.stringify({ title: "Edited" }),
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });
  it("retains edits after a 403 and requires a decision before closing a dirty form", async () => {
    fetchMock.mockImplementation((url, init) => {
      if (init?.method === "PUT") return Promise.resolve(Response.json({}, { status: 403 }));
      if (requestUrl(url).endsWith("/download")) return Promise.resolve(new Response("GIF89a"));
      return Promise.resolve(stickerPageResponse([stickerDto()]));
    });
    renderWithProviders(<StickerAdmin />);
    open();
    await edit();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Edited" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("You do not have permission to manage stickers.");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Edited");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("loads by UUID and offers deletion without a visibility setting", async () => {
    renderWithProviders(<StickerAdmin />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Edit stickers" }));
    fireEvent.click(screen.getByText("Find by UUID"));
    fireEvent.change(screen.getByLabelText("Sticker UUID"), { target: { value: STICKER_ID } });
    fireEvent.click(screen.getByRole("button", { name: "Load sticker" }));
    await screen.findByLabelText("Title");
    expect(screen.queryByLabelText("Visibility")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete sticker" })).toBeVisible();
  });
  it("keeps the dialog open during import and ignores its result after account switch", async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    renderWithProviders(<StickerAdmin />);
    open();
    fireEvent.change(screen.getByLabelText("ZIP archive (up to 40 MiB)"), {
      target: { files: [new File(["zip"], "stickers.zip")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import archive" }));
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(screen.getByRole("button", { name: "Edit stickers" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    act(() => stickerSession("user-b", 2));
    await act(async () => {
      finish(Response.json({ created: 1, duplicates: 0, items: [] }));
      await Promise.resolve();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(useStickerStore.getState().revision).toBe(0);
  });
  it("rejects an oversized archive before making a request", () => {
    renderWithProviders(<StickerAdmin />);
    open();
    const archive = new File(["zip"], "too-large.zip");
    Object.defineProperty(archive, "size", { value: 41 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText("ZIP archive (up to 40 MiB)"), {
      target: { files: [archive] },
    });
    expect(screen.getByRole("button", { name: "Import archive" })).toBeDisabled();
    expect(screen.getByRole("alert")).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
