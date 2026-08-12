import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "~/i18n/i18n";
import { AttachmentCard, AttachmentCardList } from "~/shared/ui/attachment-card.ui";

describe("AttachmentCard", () => {
  beforeEach(() => {
    setLocale("en");
  });

  it("renders file and image cards with fixed Figma dimensions and truncated names", () => {
    const onRemove = vi.fn();
    render(
      <AttachmentCardList ariaLabel="Attached files">
        <AttachmentCard
          status="file"
          fileName="a-very-long-document-name-that-does-not-fit.pdf"
          metadata={{ formatLabel: "PDF", sizeLabel: "1.4 MB" }}
          onRemove={onRemove}
        />
        <AttachmentCard
          status="image"
          fileName="workspace.png"
          previewUrl="blob:workspace-preview"
          metadata={{ formatLabel: "PNG", sizeLabel: "820 KB" }}
        />
      </AttachmentCardList>,
    );

    const list = screen.getByRole("list", { name: "Attached files" });
    const cards = screen.getAllByRole("listitem");
    expect(list).toHaveClass("flex-nowrap", "gap-2.5", "overflow-x-auto", "scrollbar-none");
    expect(cards[0]).toHaveClass("h-[58px]", "w-60", "shrink-0");
    expect(screen.getByTitle("a-very-long-document-name-that-does-not-fit.pdf")).toHaveClass(
      "truncate",
    );
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText("1.4 MB")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "workspace.png" })).toHaveAttribute(
      "src",
      "blob:workspace-preview",
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove a-very-long-document-name-that-does-not-fit.pdf",
      }),
    );
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("renders upload progress on the card and calls the optional cancel action", () => {
    const onCancel = vi.fn();
    render(
      <AttachmentCard
        status="uploading"
        fileName="workspace.pdf"
        progress={64.4}
        onCancel={onCancel}
      />,
    );

    const progress = screen.getByRole("progressbar", {
      name: "Uploading workspace.pdf: 64%",
    });
    expect(progress).toHaveAttribute("aria-valuemin", "0");
    expect(progress).toHaveAttribute("aria-valuemax", "100");
    expect(progress).toHaveAttribute("aria-valuenow", "64");
    expect(screen.getByText("Uploading · 64%")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel upload of workspace.pdf" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("announces validating and queued states without fake upload progress", () => {
    const onRemove = vi.fn();
    render(
      <AttachmentCardList ariaLabel="Attached files">
        <AttachmentCard
          status="validating"
          fileName="checking.pdf"
          detailText="Checking file"
          onRemove={onRemove}
        />
        <AttachmentCard
          status="queued"
          fileName="waiting.pdf"
          detailText="Waiting to upload"
          onRemove={onRemove}
        />
      </AttachmentCardList>,
    );

    expect(screen.getByText("Checking file")).toBeInTheDocument();
    expect(screen.getByText("Waiting to upload")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cancel upload/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove checking.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove waiting.pdf" }));
    expect(onRemove).toHaveBeenCalledTimes(2);
  });

  it("renders the independent error state and only exposes retry when supported", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <AttachmentCard status="error" fileName="workspace.pdf" onRetry={onRetry} />,
    );

    expect(screen.getByText("Upload failed")).toHaveClass("text-danger");
    const retryButton = screen.getByRole("button", { name: "Retry upload of workspace.pdf" });
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(<AttachmentCard status="error" fileName="workspace.pdf" />);
    expect(
      screen.queryByRole("button", { name: "Retry upload of workspace.pdf" }),
    ).not.toBeInTheDocument();
  });
});
