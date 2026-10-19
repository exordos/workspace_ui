import { expect, userEvent, waitFor, within } from "storybook/test";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { AppTooltip } from "./app-tooltip.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Shared/Overlays/AppTooltip",
  component: AppTooltip,
  args: { children: <Button>Help</Button>, content: "Help", side: "bottom", align: "center" },
  argTypes: { children: { control: false }, content: { control: false } },
  render: (args) => (
    <AppTooltip {...args} content={t("settings.statusDialogHint")}>
      <Button variant="neutral">{t("settings.help")}</Button>
    </AppTooltip>
  ),
  parameters: { layout: "centered" },
} satisfies Meta<typeof AppTooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AboveTrigger: Story = { args: { side: "top" } };
export const LongContent: Story = {
  render: (args) => (
    <AppTooltip
      {...args}
      content={
        <div className="space-y-3">
          <strong className="block text-text-primary">{t("settings.help")}</strong>
          {Array.from({ length: 8 }, (_, index) => (
            <p key={index}>{t("settings.serviceCatalogHint")}</p>
          ))}
        </div>
      }
    >
      <Button variant="neutral">{t("settings.help")}</Button>
    </AppTooltip>
  ),
};
export const FocusAndEscape: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: t("settings.help") })).toHaveFocus();
    await expect(await page.findByRole("tooltip")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("tooltip")).not.toBeInTheDocument());
  },
};
