import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { ScrollArea } from "./scroll-area";
import type { Meta, StoryObj } from "@storybook/react-vite";

function HorizontalItems() {
  return (
    <div className="flex w-max gap-2 p-1">
      {Array.from({ length: 12 }, (_, index) => (
        <button
          key={index}
          type="button"
          aria-label={`${t("settings.help")} ${index + 1}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-text-primary hover:bg-sidebar-hover"
        >
          <Icon name="info" size={20} />
        </button>
      ))}
    </div>
  );
}

const meta = {
  title: "Shared/Layout/ScrollArea",
  component: ScrollArea,
  args: {
    children: null,
    axis: "y",
    scrollbar: "visible",
    horizontalWheel: true,
    className: "h-52 max-w-sm rounded-lg border border-border-subtle p-4",
    tabIndex: 0,
  },
  render: (args) => (
    <ScrollArea {...args} aria-label={t("settings.help")}>
      {Array.from({ length: 20 }, (_, index) => (
        <p key={index} className="py-2 text-sm text-text-primary">
          {t("settings.statusDialogHint")}
        </p>
      ))}
    </ScrollArea>
  ),
  argTypes: { children: { control: false } },
} satisfies Meta<typeof ScrollArea>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const VerticalHidden: Story = {
  args: { scrollbar: "hidden" },
};

export const Horizontal: Story = {
  args: {
    axis: "x",
    className: "max-w-sm rounded-lg border border-border-subtle p-2",
  },
  render: (args) => (
    <ScrollArea {...args} aria-label={t("settings.help")}>
      <HorizontalItems />
    </ScrollArea>
  ),
};

export const HorizontalHidden: Story = {
  ...Horizontal,
  args: { ...Horizontal.args, scrollbar: "hidden" },
};

export const HorizontalNativeWheel: Story = {
  ...Horizontal,
  args: { ...Horizontal.args, horizontalWheel: false },
};

export const HorizontalWithOuterScroll: Story = {
  args: { ...Horizontal.args, scrollbar: "hidden" },
  render: (args) => (
    <ScrollArea
      className="h-64 max-w-sm rounded-lg border border-border-subtle p-4"
      aria-label={t("settings.statusDialogHint")}
      tabIndex={0}
    >
      <div className="h-24 text-text-primary">{t("settings.statusDialogHint")}</div>
      <ScrollArea {...args} aria-label={t("settings.help")}>
        <HorizontalItems />
      </ScrollArea>
      <div className="h-96 text-text-primary">{t("settings.statusDialogHint")}</div>
    </ScrollArea>
  ),
};

export const BothAxes: Story = {
  args: { axis: "both" },
  render: (args) => (
    <ScrollArea {...args} aria-label={t("settings.help")}>
      <div className="w-[48rem]">
        {Array.from({ length: 20 }, (_, index) => (
          <p key={index} className="py-2 text-sm text-text-primary">
            {t("settings.statusDialogHint")}
          </p>
        ))}
      </div>
    </ScrollArea>
  ),
};

export const ShortContent: Story = {
  render: (args) => (
    <ScrollArea {...args} aria-label={t("settings.help")}>
      <p>{t("settings.help")}</p>
    </ScrollArea>
  ),
};
