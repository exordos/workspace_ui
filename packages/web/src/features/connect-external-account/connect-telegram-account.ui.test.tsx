import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ConnectTelegramAccount } from "./connect-telegram-account.ui";

vi.mock("./connect-telegram-account.hook", () => ({
  useConnectTelegramAccount: () => ({
    snapshot: {
      state: "authorized",
      generation: "synthetic",
      dialogs: [
        { peer_key: "user:8", title: "First contact", imported_messages: 12, history_done: true },
        { peer_key: "user:9", title: "Second contact", imported_messages: 7, history_done: false },
      ],
    },
    password: "",
    busy: false,
    error: false,
    setPassword: vi.fn(),
    submitPassword: vi.fn(),
    connect: vi.fn(),
  }),
}));

it("automatically shows progress for every chat without an import selector or start button", () => {
  render(<ConnectTelegramAccount runtimeContext={null} account={null} onChooseZulip={vi.fn()} />);
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/history|истори/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /import|импорт/i })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("19");
});
