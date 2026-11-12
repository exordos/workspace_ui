import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { setLocale } from "~/i18n/i18n";
import { MessengerApiError } from "~/shared/api/messenger-client";
import { CreatePollDialog } from "./create-poll-dialog.ui";

describe("CreatePollDialog", () => {
  it("shows that creation is disabled for the specific server response", async () => {
    setLocale("en");
    const send = vi
      .fn()
      .mockRejectedValue(
        new MessengerApiError("conflict", 409, { message: "Poll creation is not enabled" }),
      );
    render(<CreatePollDialog open onOpenChange={() => {}} onCreate={send} />);
    fireEvent.change(screen.getByPlaceholderText("Enter a question"), {
      target: { value: "Question" },
    });
    fireEvent.change(screen.getByPlaceholderText("Add an answer…"), { target: { value: "First" } });
    fireEvent.change(screen.getAllByPlaceholderText("Add an answer…")[1]!, {
      target: { value: "Second" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await screen.findByText("Poll creation is not enabled on this server.");
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });
  it("retries an uncertain send unchanged, but allows corrections after validation errors", async () => {
    setLocale("en");
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockRejectedValueOnce(new MessengerApiError("invalid", 400, null));
    render(<CreatePollDialog open onOpenChange={() => {}} onCreate={send} />);
    fireEvent.change(screen.getByPlaceholderText("Enter a question"), {
      target: { value: "Question" },
    });
    fireEvent.change(screen.getByPlaceholderText("Add an answer…"), { target: { value: "First" } });
    fireEvent.change(screen.getAllByPlaceholderText("Add an answer…")[1]!, {
      target: { value: "Second" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await screen.findByText(/Could not confirm/);
    expect(screen.getByPlaceholderText("Enter a question")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await screen.findByText(/poll was rejected/);
    expect(send.mock.calls[1]?.[0]).toBe(send.mock.calls[0]?.[0]);
    await waitFor(() => expect(screen.getByPlaceholderText("Enter a question")).toBeEnabled());
  });
  it.each([
    ["en", "Poll settings", "Results", "Always"],
    ["ru", "Настройки опроса", "Результаты", "Всегда"],
  ] as const)(
    "selects result visibility by keyboard in %s",
    (locale, settingsLabel, label, always) => {
      setLocale(locale);
      render(<CreatePollDialog open onOpenChange={() => {}} onCreate={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: new RegExp(settingsLabel) }));
      const control = screen.getByRole("combobox", { name: label });
      control.focus();
      fireEvent.keyDown(control, { key: "ArrowDown" });
      expect(screen.getByRole("listbox")).toBeInTheDocument();
      fireEvent.keyDown(control, { key: "ArrowDown" });
      fireEvent.keyDown(control, { key: "Enter" });
      expect(control).toHaveTextContent(always);
      expect(control).toHaveFocus();
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    },
  );
  it("keeps the question and answer fields labelled and focusable", () => {
    setLocale("en");
    render(<CreatePollDialog open onOpenChange={() => {}} onCreate={vi.fn()} />);
    const question = screen.getByRole("textbox", { name: "Question" });
    const answer = screen.getByRole("textbox", { name: /Add an answer/ });
    question.focus();
    expect(question).toHaveFocus();
    answer.focus();
    expect(answer).toHaveFocus();
    fireEvent.change(answer, { target: { value: "First" } });
    expect(screen.getByRole("checkbox", { name: "Mark as correct: First" })).toBeEnabled();
  });
  it("requires two answers and submits the ordered draft", () => {
    setLocale("en");
    const onCreate = vi.fn();
    render(<CreatePollDialog open onOpenChange={() => {}} onCreate={onCreate} />);
    const create = screen.getByRole("button", { name: "Create" });
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Enter a question"), {
      target: { value: " When? " },
    });
    fireEvent.change(screen.getByPlaceholderText("Add an answer…"), { target: { value: "First" } });
    fireEvent.change(screen.getAllByPlaceholderText("Add an answer…")[1]!, {
      target: { value: "Second" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Move answer up" })[1]!);
    fireEvent.click(create);
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        multipleAnswers: false,
        questions: [
          {
            text: "When?",
            options: [
              { text: "Second", correct: false },
              { text: "First", correct: false },
            ],
          },
        ],
      }),
    );
  });
  it("allows multiple correct answers and clearing one in single-answer mode", () => {
    setLocale("en");
    const onCreate = vi.fn();
    render(<CreatePollDialog open onOpenChange={() => {}} onCreate={onCreate} />);
    fireEvent.change(screen.getByPlaceholderText("Enter a question"), {
      target: { value: "Question" },
    });
    fireEvent.change(screen.getByPlaceholderText("Add an answer…"), { target: { value: "First" } });
    fireEvent.change(screen.getAllByPlaceholderText("Add an answer…")[1]!, {
      target: { value: "Second" },
    });
    const first = screen.getByRole("checkbox", { name: "Mark as correct: First" });
    const second = screen.getByRole("checkbox", { name: "Mark as correct: Second" });
    fireEvent.click(first);
    fireEvent.click(second);
    expect(first).toBeChecked();
    expect(second).toBeChecked();
    fireEvent.click(first);
    expect(first).not.toBeChecked();
    fireEvent.click(second);
    expect(second).not.toBeChecked();
  });
  it("drops an answer before the trailing empty input", () => {
    setLocale("en");
    const onCreate = vi.fn();
    render(<CreatePollDialog open onOpenChange={() => {}} onCreate={onCreate} />);
    fireEvent.change(screen.getByPlaceholderText("Enter a question"), {
      target: { value: "Question" },
    });
    fireEvent.change(screen.getByPlaceholderText("Add an answer…"), { target: { value: "First" } });
    fireEvent.change(screen.getAllByPlaceholderText("Add an answer…")[1]!, {
      target: { value: "Second" },
    });
    fireEvent.dragStart(screen.getAllByRole("button", { name: "Drag answer" })[0]!);
    fireEvent.drop(screen.getAllByPlaceholderText("Add an answer…")[2]!.parentElement!);
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(
      onCreate.mock.calls[0]?.[0].questions[0].options.map(
        (option: { text: string }) => option.text,
      ),
    ).toEqual(["Second", "First"]);
  });
  it("toggles the switch by clicking its visible label", () => {
    setLocale("en");
    render(<CreatePollDialog open onOpenChange={() => {}} onCreate={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Poll settings/ }));
    const control = screen.getByRole("switch", { name: "Multiple answers" });
    fireEvent.click(screen.getByText("Multiple answers"));
    expect(control).toBeChecked();
    fireEvent.click(screen.getByText("Multiple answers"));
    expect(control).not.toBeChecked();
  });
  it("uses one shared answer mode and preserves both questions when toggled", () => {
    setLocale("en");
    const onCreate = vi.fn();
    render(<CreatePollDialog open onOpenChange={() => {}} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: /Add question/ }));
    const sections = screen.getAllByRole("region", { name: /Question [12]/ });
    sections.forEach((section, index) => {
      const area = within(section);
      fireEvent.change(area.getByPlaceholderText("Enter a question"), {
        target: { value: `Question ${index + 1}` },
      });
      fireEvent.change(area.getByPlaceholderText("Add an answer…"), {
        target: { value: `First ${index + 1}` },
      });
      fireEvent.change(area.getAllByPlaceholderText("Add an answer…")[1]!, {
        target: { value: `Second ${index + 1}` },
      });
      fireEvent.click(area.getByRole("checkbox", { name: `Mark as correct: First ${index + 1}` }));
    });
    fireEvent.click(screen.getByRole("button", { name: /Poll settings/ }));
    expect(screen.getAllByRole("switch", { name: "Multiple answers" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("switch", { name: "Multiple answers" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        multipleAnswers: true,
        questions: [1, 2].map((number) => ({
          text: `Question ${number}`,
          options: [
            { text: `First ${number}`, correct: true },
            { text: `Second ${number}`, correct: false },
          ],
        })),
      }),
    );
  });
});
