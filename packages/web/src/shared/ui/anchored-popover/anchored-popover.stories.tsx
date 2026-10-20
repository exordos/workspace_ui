import { useArgs } from "storybook/preview-api";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { AnchoredPopover } from "./anchored-popover.ui";
import type { AnchoredPopoverProps } from "./anchored-popover.types";
import type { Meta, StoryObj } from "@storybook/react-vite";

function PopoverExample(args: Readonly<AnchoredPopoverProps>) {
  const [{ open }, updateArgs] = useArgs<AnchoredPopoverProps>();
  return (
    <>
      <Button onClick={() => updateArgs({ open: true })}>{t("common.open")}</Button>
      <AnchoredPopover
        {...args}
        open={open}
        onClose={() => updateArgs({ open: false })}
        ariaLabel={t("settings.help")}
      >
        <div className="space-y-4 p-4 text-sm text-text-primary">
          <p>{t("settings.serviceCatalogHint")}</p>
          <Button variant="neutral" onClick={() => updateArgs({ open: false })}>
            {t("common.close")}
          </Button>
        </div>
      </AnchoredPopover>
    </>
  );
}

const meta = {
  title: "Shared/Overlays/AnchoredPopover",
  component: AnchoredPopover,
  args: {
    open: false,
    onClose: () => {},
    ariaLabel: "Help",
    children: null,
    panelStyle: { left: 24, top: 96, width: 320, maxWidth: "calc(100vw - 48px)" },
  },
  argTypes: {
    children: { control: false },
    ariaLabel: { control: false },
    onClose: { control: false },
  },
  render: PopoverExample,
  parameters: {
    docs: {
      description: {
        component:
          "Caller-positioned panel with outside-click and Escape dismissal. The caller supplies viewport coordinates and owns focus and trigger behavior.",
      },
    },
  },
} satisfies Meta<typeof AnchoredPopover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Open: Story = { args: { open: true } };
