import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "~/test/render";
import { useAiReplyStore } from "./ai-reply.model";
import { AiActionMenu } from "./ai-reply.ui";

describe("AiActionMenu", () => {
  afterEach(() => {
    useAiReplyStore.getState().clear();
  });

  it("renders compact dialog shell when opened", () => {
    renderWithProviders(
      <AiActionMenu draft="Hello" onInsert={vi.fn()} open onOpenChange={vi.fn()} />,
    );

    const menu = screen.getByRole("dialog", { name: /ai assistant menu/i });
    expect(menu).toHaveClass("p-2");
    expect(menu).toHaveClass("max-h-[320px]");
    expect(menu).toHaveClass("w-[min(320px,calc(100vw-24px))]");
  });

  it("renders compact action rows in idle state", () => {
    renderWithProviders(
      <AiActionMenu draft="Hello" onInsert={vi.fn()} open onOpenChange={vi.fn()} />,
    );

    const rewriteAction = screen.getByRole("button", { name: /rewrite/i });
    expect(rewriteAction).toHaveClass("py-1");
    expect(rewriteAction).toHaveClass("text-xs");
  });
});
