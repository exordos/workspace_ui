import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { InputSelector } from "./input-selector.ui";
import type { SyntheticEvent } from "react";

const options = [
  { value: "https://alpha.example", label: "Alpha" },
  { value: "https://beta.example", label: "Beta" },
];

function Harness({ searchable = false }: Readonly<{ searchable?: boolean }>) {
  const [value, setValue] = useState("");
  return (
    <InputSelector
      options={options}
      value={value}
      onValueChange={setValue}
      searchable={searchable}
      aria-label="Organization"
    />
  );
}

describe("InputSelector", () => {
  it("allows arbitrary text and filters only suggestions when search is enabled", async () => {
    const user = userEvent.setup();
    render(<Harness searchable />);
    const input = screen.getByRole("combobox", { name: "Organization" });
    await user.type(input, "alpha");
    expect(input).toHaveValue("alpha");
    expect(screen.getByRole("option", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Beta" })).not.toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "https://custom.example/path?q=1");
    expect(input).toHaveValue("https://custom.example/path?q=1");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).not.toHaveAttribute("aria-controls");
    await user.clear(input);
    await user.type(input, "beta");
    expect(screen.getByRole("option", { name: "Beta" })).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "true");
    await user.clear(input);
    await user.type(input, "https://custom.example/path?q=1");
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("https://custom.example/path?q=1");
  });

  it("leaves suggestions unfiltered by default and only commits explicitly navigated options", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await user.type(input, "custom");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    fireEvent.pointerMove(screen.getByRole("option", { name: "Alpha" }));
    await user.keyboard("{Enter}");
    expect(input).toHaveValue("custom");
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(input).toHaveValue("https://beta.example");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it("does not consume free-text Enter or IME composition", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: SyntheticEvent<HTMLFormElement>) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Harness />
        <button type="submit">Continue</button>
      </form>,
    );
    const input = screen.getByRole("combobox");
    await user.type(input, "new organization");
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await user.keyboard("{ArrowDown}");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(input).toHaveValue("new organization");
    fireEvent.keyDown(input, { key: "ArrowDown", isComposing: true });
    expect(input).toHaveAttribute("aria-activedescendant");
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("new organization");
  });

  it("selects by pointer and closes on Tab while preserving typed text", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness />
        <button>Next</button>
      </>,
    );
    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.click(screen.getByRole("option", { name: "Beta" }));
    expect(input).toHaveValue("https://beta.example");
    await user.type(input, "/new");
    await user.tab();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
    expect(input).toHaveValue("https://beta.example/new");
  });

  it("closes on readOnly or disabled transitions and rejects stale dynamic options", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const props = { value: "custom", options, onValueChange, "aria-label": "Organization" };
    const view = render(<InputSelector {...props} />);
    await user.click(screen.getByRole("combobox"));
    await user.keyboard("{ArrowDown}");
    view.rerender(<InputSelector {...props} options={[]} />);
    expect(screen.getByRole("combobox")).not.toHaveAttribute("aria-activedescendant");
    await user.keyboard("{Enter}");
    expect(onValueChange).not.toHaveBeenCalled();
    await user.keyboard("{ArrowDown}");
    view.rerender(<InputSelector {...props} readOnly />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    view.rerender(<InputSelector {...props} />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.keyboard("{ArrowDown}");
    view.rerender(<InputSelector {...props} disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
    view.rerender(<InputSelector {...props} />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
