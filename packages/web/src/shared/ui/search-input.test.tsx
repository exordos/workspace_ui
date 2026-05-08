import { fireEvent, render, screen } from "@testing-library/react";
import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SearchInput } from "./search-input";

describe("SearchInput", () => {
  it("renders search icon", () => {
    render(<SearchInput value="" onChange={vi.fn()} placeholder="Search" />);

    const input = screen.getByPlaceholderText("Search");
    const frame = input.closest("label");
    expect(frame).not.toBeNull();
    expect(frame?.querySelector(".search-input-icon")).not.toBeNull();
  });

  it("renders clear button only when value is not empty", () => {
    const { rerender } = render(<SearchInput value="" onChange={vi.fn()} placeholder="Search" />);

    expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();

    rerender(<SearchInput value="hello" onChange={vi.fn()} placeholder="Search" />);

    expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
  });

  it("hides clear button when clearable is false", () => {
    render(<SearchInput value="hello" onChange={vi.fn()} placeholder="Search" clearable={false} />);

    expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();
  });

  it("clears value and keeps focus after clear click", () => {
    const onClear = vi.fn();

    const Harness: React.FC = () => {
      const [value, setValue] = useState("hello");
      return (
        <SearchInput value={value} onChange={setValue} placeholder="Search" onClear={onClear} />
      );
    };

    render(<Harness />);

    const input = screen.getByPlaceholderText("Search");
    input.focus();
    expect(input).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
