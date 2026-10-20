import { useId, useRef } from "react";
import { useArgs } from "storybook/preview-api";
import { expect, userEvent, within } from "storybook/test";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import {
  getListboxOptionId,
  LISTBOX_CONTROL_CLASS,
  LISTBOX_CONTROL_SIZE_CLASS,
  moveActiveListboxOption,
} from "./listbox.lib";
import { Listbox } from "./listbox.ui";
import type { ListboxProps } from "./listbox.types";
import type { Meta, StoryObj } from "@storybook/react-vite";

type ListboxStoryArgs = ListboxProps & { open: boolean };

function ListboxExample(args: Readonly<ListboxStoryArgs>) {
  const [{ open, value, activeValue }, updateArgs] = useArgs<ListboxStoryArgs>();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const activeOption = args.options.find(
    (option) => option.value === activeValue && !option.disabled,
  );
  const choose = (value: string) => updateArgs({ value, open: false });
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        role="combobox"
        aria-label={t("settings.timezone")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={
          open && activeOption != null ? getListboxOptionId(id, activeOption.value) : undefined
        }
        className={`${LISTBOX_CONTROL_CLASS} ${LISTBOX_CONTROL_SIZE_CLASS.default}`}
        onClick={() => updateArgs({ open: !open })}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            updateArgs({
              open: true,
              activeValue: moveActiveListboxOption(
                args.options,
                activeValue,
                event.key === "ArrowDown" ? 1 : -1,
              ),
            });
          } else if (event.key === "Enter" && open && activeOption != null) {
            event.preventDefault();
            choose(activeOption.value);
          }
        }}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {args.options.find((option) => option.value === value)?.label ??
            t("selector.placeholder")}
        </span>
        <Icon name="chevron-down" size={16} />
      </button>
      {open ? (
        <Listbox
          {...args}
          id={id}
          anchorRef={anchorRef}
          value={value}
          activeValue={activeOption?.value ?? null}
          ariaLabel={t("settings.timezone")}
          onActiveChange={(activeValue) => updateArgs({ activeValue })}
          onSelect={choose}
          onClose={() => updateArgs({ open: false })}
        />
      ) : null}
    </>
  );
}

const meta = {
  title: "Shared/Forms/Listbox",
  component: Listbox,
  args: {
    id: "listbox-example",
    anchorRef: { current: null },
    value: "moscow",
    activeValue: "moscow",
    open: false,
    options: [
      { value: "moscow", label: "Moscow" },
      { value: "auckland", label: "Auckland", disabled: true },
      { value: "berlin", label: "Berlin", description: "Europe/Berlin" },
    ],
    onSelect: () => {},
    onClose: () => {},
  },
  argTypes: {
    id: { control: false },
    anchorRef: { control: false },
    ariaLabel: { control: false },
    ariaLabelledBy: { control: false },
    onSelect: { control: false },
    onClose: { control: false },
    onActiveChange: { control: false },
  },
  render: ListboxExample,
  parameters: {
    docs: {
      description: {
        component:
          "Anchored option popup shared by Select and InputSelector. The caller owns the trigger, open state, value, and keyboard events; exported navigation helpers skip disabled options. The popup stays inside its owning dialog when present.",
      },
    },
  },
} satisfies Meta<ListboxStoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Open: Story = { args: { open: true } };
export const EmptyOptions: Story = {
  args: { open: true, options: [], value: "", activeValue: null },
};
export const KeyboardNavigation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("combobox", { name: t("settings.timezone") });
    await userEvent.click(trigger);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect(trigger).toHaveTextContent("Berlin");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  },
};
