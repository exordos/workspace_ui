import { useState } from "react";
import { t } from "~/i18n/i18n";
import { SearchableCheckboxList } from "./searchable-checkbox-list.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

function CheckboxListExample({
  initialQuery = "",
  empty = false,
}: Readonly<{
  initialQuery?: string;
  empty?: boolean;
}>) {
  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(["docs"]));
  const options = [
    {
      value: "docs",
      label: t("settings.servicesPlaceholderKnowledgeBase"),
      searchText: t("settings.servicesPlaceholderKnowledgeBase"),
    },
    {
      value: "people",
      label: t("settings.servicesPlaceholderPeople"),
      searchText: t("settings.servicesPlaceholderPeople"),
    },
    {
      value: "automation",
      label: t("settings.servicesPlaceholderAutomation"),
      searchText: t("settings.servicesPlaceholderAutomation"),
      disabled: true,
    },
  ];
  return (
    <div className="space-y-3">
      <SearchableCheckboxList
        options={empty ? [] : options}
        selectedValues={selected}
        onToggle={(value) =>
          setSelected((previous) => {
            const next = new Set(previous);
            if (next.has(value)) next.delete(value);
            else next.add(value);
            return next;
          })
        }
        query={query}
        onQueryChange={setQuery}
        queryPlaceholder={t("search.search")}
        emptyLabel={t("search.noResults")}
        inputClassName="w-full rounded-lg border border-border-subtle bg-text-field-bg px-3 py-2 text-text-primary"
        listClassName="h-52 overflow-y-auto rounded-lg border border-border-subtle"
      />
      <p className="text-sm text-text-secondary" aria-live="polite">
        {t("message.selectedCount", { count: selected.size })}
      </p>
    </div>
  );
}

const meta = {
  title: "Shared/Lists/SearchableCheckboxList",
  component: SearchableCheckboxList,
  args: {
    options: [],
    selectedValues: new Set<string | number>(),
    onToggle: () => {},
    query: "",
    onQueryChange: () => {},
    queryPlaceholder: "",
    emptyLabel: "",
    inputClassName: "",
    listClassName: "",
  },
  render: () => <CheckboxListExample />,
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        component:
          "The caller owns all selected values. Search filters visible options only; selections remain intact when hidden by a query. Use UserPickerList for user names, presence, and email search.",
      },
    },
  },
} satisfies Meta<typeof SearchableCheckboxList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoMatches: Story = {
  render: () => <CheckboxListExample initialQuery="no-such-option" />,
};
export const Empty: Story = { render: () => <CheckboxListExample empty /> };
