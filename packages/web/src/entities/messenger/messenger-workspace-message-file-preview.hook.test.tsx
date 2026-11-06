import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { setLocale } from "~/i18n/i18n";
import { downloadWorkspaceFile } from "~/shared/api/messenger-files.api";
import type { MessengerBinaryResult } from "~/shared/api/messenger-transport.internal";
import { AUTH_IMAGE_PLACEHOLDER_SRC } from "~/shared/lib/media-display-url.lib";
import {
  createWorkspaceFileResourceCache,
  invalidateWorkspaceFileResourceCache,
} from "~/shared/lib/workspace-file-loader.lib";
import type { WorkspaceMessageFileReference } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import {
  useWorkspaceMessageFilePreviews,
  type LoadWorkspaceFilePreview,
} from "./messenger-workspace-message-file-preview.hook";

vi.mock("~/shared/api/messenger-files.api", () => ({ downloadWorkspaceFile: vi.fn() }));

const IMAGE: WorkspaceMessageFileReference = {
  kind: "media",
  mediaKind: "image",
  href: "urn:image:11111111-1111-4111-8111-111111111111",
  fileUuid: "11111111-1111-4111-8111-111111111111",
  name: "image.png",
  contentType: "image/png",
};
const VIDEO: WorkspaceMessageFileReference = {
  ...IMAGE,
  mediaKind: "video",
  name: "video.mp4",
  contentType: "video/mp4",
};
const SESSION: Omit<WorkspaceAuthSession, "runtimeGeneration"> = {
  accountId: "preview-account",
  instanceId: "preview-instance",
  organizationId: "preview-organization",
  organizationOrigin: "https://preview.example.com",
  projectId: "preview-project",
  userUuid: "preview-user",
  accessToken: "synthetic-access-token",
  login: "preview@example.com",
  profile: {
    uuid: "preview-user",
    username: "preview",
    firstName: null,
    lastName: null,
    email: null,
  },
};

function Preview({
  load,
  reference = IMAGE,
}: Readonly<{
  load: LoadWorkspaceFilePreview;
  reference?: WorkspaceMessageFileReference;
}>) {
  const bodyRef = useRef<HTMLDivElement>(null);
  useWorkspaceMessageFilePreviews({
    bodyRef,
    renderedHtml: reference.href,
    fileReferences: [reference],
    onLoadWorkspaceFilePreview: load,
  });
  return (
    <div ref={bodyRef}>
      <span
        role="button"
        tabIndex={0}
        aria-label={reference.name}
        data-workspace-file="true"
        data-workspace-file-kind="media"
        data-workspace-media-kind={reference.mediaKind}
        data-workspace-file-uuid={reference.fileUuid}
      >
        <img
          className="workspace-message-file-placeholder__image"
          src={AUTH_IMAGE_PLACEHOLDER_SRC}
          alt=""
        />
        <span className="workspace-message-file-placeholder__label">{reference.name}</span>
      </span>
    </div>
  );
}

function invalidate(fileUuid = IMAGE.fileUuid, ownerKey = workspaceRuntimeOwnerKey(SESSION)) {
  act(() => invalidateWorkspaceFileResourceCache(ownerKey, fileUuid));
}

beforeEach(() => {
  setLocale("en");
  useWorkspaceAuthStore.getState().setSession(SESSION);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview-recovery");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.mocked(downloadWorkspaceFile).mockReset();
});

afterEach(() => {
  cleanup();
  useWorkspaceAuthStore.getState().clear();
  vi.restoreAllMocks();
});

describe("Workspace message preview recovery", () => {
  it.each([IMAGE, VIDEO])(
    "recovers a failed $mediaKind after a matching file event",
    async (reference) => {
      const load = vi
        .fn<LoadWorkspaceFilePreview>()
        .mockRejectedValueOnce(new Error("404"))
        .mockResolvedValue(new Blob(["media"], { type: reference.contentType }));
      const { container, unmount } = render(<Preview reference={reference} load={load} />);
      const placeholder = container.querySelector("[data-workspace-file='true']");
      await waitFor(() =>
        expect(placeholder).toHaveAttribute("data-workspace-preview-status", "load-error"),
      );

      invalidate("other-file");
      invalidate(reference.fileUuid, "other-owner");
      expect(load).toHaveBeenCalledTimes(1);

      invalidate(reference.fileUuid);
      await waitFor(() =>
        expect(placeholder).toHaveAttribute("data-workspace-preview-status", "loaded"),
      );
      expect(load).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();

      invalidate(reference.fileUuid);
      expect(load).toHaveBeenCalledTimes(2);
      unmount();
      invalidate(reference.fileUuid);
      expect(load).toHaveBeenCalledTimes(2);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-recovery");
    },
  );

  it("offers an explicit retry after a persistent error without polling", async () => {
    const load = vi
      .fn<LoadWorkspaceFilePreview>()
      .mockRejectedValueOnce(new Error("404"))
      .mockRejectedValueOnce(new Error("404"))
      .mockResolvedValue(new Blob(["image"], { type: "image/png" }));
    const { container } = render(<Preview load={load} />);
    await screen.findByRole("button", { name: "Retry" });
    invalidate();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(container.querySelector("[data-workspace-file-preview='true']")).toHaveAttribute(
        "src",
        "blob:preview-recovery",
      ),
    );
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("does not miss a file event while a failing request is in flight", async () => {
    let rejectRequest!: (reason: Error) => void;
    const pending = new Promise<Blob>((_resolve, reject) => {
      rejectRequest = reject;
    });
    const load = vi
      .fn<LoadWorkspaceFilePreview>()
      .mockReturnValueOnce(pending)
      .mockResolvedValue(new Blob(["image"], { type: "image/png" }));
    const { container } = render(<Preview load={load} />);
    invalidate();
    invalidate();
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      rejectRequest(new Error("404"));
      await pending.catch(() => undefined);
    });
    await waitFor(() =>
      expect(container.querySelector("[data-workspace-file-preview='true']")).not.toBeNull(),
    );
    expect(load).toHaveBeenCalledTimes(2);
  });

  it.each(["refreshes", "clears"])(
    "recovers when another consumer %s the shared cache",
    async (operation) => {
      const cache = createWorkspaceFileResourceCache();
      const download = vi.mocked(downloadWorkspaceFile);
      download
        .mockReturnValueOnce(
          new Promise<MessengerBinaryResult>(() => {
            // The original request stays pending until the cache aborts it.
          }),
        )
        .mockResolvedValue({
          blob: new Blob(["image"], { type: "image/png" }),
          headers: new Headers(),
        });
      const runtime = useWorkspaceAuthStore.getState().getCurrentRuntimeContext()!;
      const options = {
        ownerKey: workspaceRuntimeOwnerKey(runtime),
        runtimeGeneration: runtime.runtimeGeneration,
        fileUuid: IMAGE.fileUuid,
        requestOptions: { accessToken: runtime.accessToken },
      };
      const load = vi.fn<LoadWorkspaceFilePreview>(async (_reference, signal) => {
        const result = await cache.load({ ...options, signal });
        return result.blob;
      });
      const { container } = render(<Preview load={load} />);
      if (operation === "refreshes") {
        invalidate();
        await act(async () => {
          await cache.load(options);
        });
      } else {
        act(() => cache.clear());
        fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
      }

      expect(load.mock.calls[0]?.[1].aborted).toBe(false);
      expect(download.mock.calls[0]?.[0].signal?.aborted).toBe(true);
      await waitFor(() =>
        expect(container.querySelector("[data-workspace-file-preview='true']")).not.toBeNull(),
      );
      expect(load).toHaveBeenCalledTimes(2);
      expect(download).toHaveBeenCalledTimes(2);
      cache.clear();
    },
  );

  it.each([IMAGE, VIDEO])(
    "retries a $mediaKind display failure and releases its old URL",
    async (reference) => {
      const load = vi
        .fn<LoadWorkspaceFilePreview>()
        .mockResolvedValue(new Blob(["media"], { type: reference.contentType }));
      const { container } = render(<Preview reference={reference} load={load} />);
      await waitFor(() =>
        expect(container.querySelector("[data-workspace-file-preview='true']")).not.toBeNull(),
      );
      fireEvent.error(container.querySelector("[data-workspace-file-preview='true']")!);
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
      fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
      await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(container.querySelector("[data-workspace-file-preview='true']")).not.toBeNull(),
      );
    },
  );

  it("rejects an old runtime result after leaving and returning to the same account", async () => {
    let resolveRequest!: (value: Blob) => void;
    const pending = new Promise<Blob>((resolve) => {
      resolveRequest = resolve;
    });
    const load = vi
      .fn<LoadWorkspaceFilePreview>()
      .mockReturnValueOnce(pending)
      .mockReturnValue(new Promise<Blob>(() => {}));
    const { container } = render(<Preview load={load} />);
    const signal = load.mock.calls[0]?.[1];
    act(() => {
      useWorkspaceAuthStore.getState().setCurrentAccountId(null);
      useWorkspaceAuthStore.getState().setCurrentAccountId(SESSION.accountId);
    });
    await act(async () => {
      resolveRequest(new Blob(["old image"], { type: "image/png" }));
      await pending;
    });
    expect(signal?.aborted).toBe(true);
    expect(container.querySelector("[data-workspace-file-preview='true']")).toBeNull();
  });
});
