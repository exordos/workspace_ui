import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { toggleUserPickerSelection } from "~/shared/lib/user-picker";
import type { UserPickerOption } from "~/shared/lib/user-picker";
import { UserPickerList } from "./user-picker-list.ui";

const OPTIONS: UserPickerOption<string>[] = [
  {
    userId: "alice",
    fullName: "Alice Adams",
    username: "engineer-alpha",
    email: "alice@example.com",
    presence: "active",
    statusLabel: null,
    isDisabled: false,
  },
  {
    userId: "bob",
    fullName: "Bob Baker",
    username: "engineer-beta",
    email: "bob@example.com",
    presence: "idle",
    statusLabel: "Away",
    isDisabled: false,
  },
];

function Picker() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  return (
    <>
      <UserPickerList
        options={OPTIONS}
        selectedUserIds={new Set(selectedIds)}
        onToggle={(id) => setSelectedIds((previous) => toggleUserPickerSelection(previous, id))}
        query={query}
        onQueryChange={setQuery}
        queryPlaceholder="Find people"
        emptyLabel="Nobody found"
      />
      <output aria-label="Selected users">{selectedIds.join(",")}</output>
    </>
  );
}

describe("UserPickerList", () => {
  it("preserves the full selection across name, username, email and empty searches", () => {
    render(<Picker />);
    const search = screen.getByRole("textbox", { name: "Find people" });

    fireEvent.change(search, { target: { value: "Adams" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Alice Adams/ }));
    fireEvent.change(search, { target: { value: " ENGINEER-BETA " } });
    expect(screen.queryByRole("checkbox", { name: /Alice Adams/ })).not.toBeInTheDocument();
    expect(screen.queryByText("engineer-beta")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Bob Baker/ }));

    fireEvent.change(search, { target: { value: "unknown" } });
    expect(screen.getByText("Nobody found")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Selected users" })).toHaveTextContent("alice,bob");

    fireEvent.change(search, { target: { value: "alice@example.com" } });
    expect(screen.getByRole("checkbox", { name: /Alice Adams/ })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: /Alice Adams/ }));
    fireEvent.change(search, { target: { value: "" } });
    expect(screen.getByRole("checkbox", { name: /Alice Adams/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Bob Baker/ })).toBeChecked();
    expect(screen.getByRole("status", { name: "Selected users" })).toHaveTextContent("bob");
  });
});
