import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { t } from "~/i18n/i18n";
import type { UserPickerOption } from "~/shared/lib/user-picker";
import { UserPickerList } from "./user-picker-list.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

const USERS: readonly UserPickerOption<string>[] = [
  {
    userId: "00000000-0000-4000-8000-000000000001",
    fullName: "Alex Morgan",
    username: "alex",
    email: "alex@example.test",
    presence: "active",
    statusLabel: null,
    isDisabled: false,
  },
  {
    userId: "00000000-0000-4000-8000-000000000002",
    fullName: "Blair Taylor",
    username: "blair",
    email: "blair@example.test",
    presence: "idle",
    statusLabel: null,
    isDisabled: false,
  },
  {
    userId: "00000000-0000-4000-8000-000000000003",
    fullName: "Casey Walker With A Very Long Display Name For Narrow Panels",
    username: "casey",
    email: "casey-with-a-long-email-address@example.test",
    presence: "offline",
    statusLabel: null,
    isDisabled: false,
  },
  {
    userId: "00000000-0000-4000-8000-000000000004",
    fullName: "Drew Kim",
    username: "drew",
    email: "drew@example.test",
    presence: null,
    statusLabel: null,
    isDisabled: true,
  },
];

function PickerExample({
  initialQuery = "",
  empty = false,
}: Readonly<{
  initialQuery?: string;
  empty?: boolean;
}>) {
  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(["00000000-0000-4000-8000-000000000001"]),
  );
  return (
    <div className="space-y-3">
      <UserPickerList
        options={empty ? [] : USERS}
        selectedUserIds={selected}
        onToggle={(userId) =>
          setSelected((previous) => {
            const next = new Set(previous);
            if (next.has(userId)) next.delete(userId);
            else next.add(userId);
            return next;
          })
        }
        query={query}
        onQueryChange={setQuery}
        listClassName="h-64 overflow-y-auto rounded-lg border border-border-subtle"
      />
      <p className="text-sm text-text-secondary" aria-live="polite">
        {t("message.selectedCount", { count: selected.size })}
      </p>
    </div>
  );
}

const meta = {
  title: "Shared/Lists/UserPickerList",
  component: UserPickerList,
  args: {
    options: USERS,
    selectedUserIds: new Set<string | number>(),
    onToggle: () => {},
    query: "",
    onQueryChange: () => {},
  },
  render: () => <PickerExample />,
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        component:
          "Shared user picker with caller-owned selection. Synthetic users are local fixtures; this story does not load accounts or call the API.",
      },
    },
  },
} satisfies Meta<typeof UserPickerList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoMatches: Story = { render: () => <PickerExample initialQuery="no-such-user" /> };
export const Empty: Story = { render: () => <PickerExample empty /> };
export const SelectionSurvivesSearch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const query = canvas.getByRole("textbox", { name: t("message.searchUsers") });
    await userEvent.type(query, "blair");
    await userEvent.click(canvas.getByRole("checkbox", { name: /Blair Taylor/ }));
    await expect(canvas.getByText(t("message.selectedCount", { count: 2 }))).toBeVisible();
    await userEvent.clear(query);
    await expect(canvas.getByRole("checkbox", { name: /Alex Morgan/ })).toBeChecked();
    await expect(canvas.getByRole("checkbox", { name: /Blair Taylor/ })).toBeChecked();
    await expect(canvas.getByRole("checkbox", { name: /Drew Kim/ })).toBeDisabled();
  },
};
