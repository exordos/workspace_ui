import { useEffect, useId } from "react";
import { fn } from "storybook/test";
import { t, useTranslation } from "~/i18n/i18n";
import { useToastStore } from "~/shared/lib/toast/toast.model";
import { ToastHost } from "./toast-host.ui";
import { ToastItem } from "./toast-item.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

function HostExample() {
  const id = useId();
  const { locale } = useTranslation();
  useEffect(() => {
    const entries = [
      { id: `${id}-success`, variant: "success" as const, message: t("common.save"), createdAt: 0 },
      { id: `${id}-error`, variant: "error" as const, message: t("app.loadFailed"), createdAt: 0 },
    ];
    // Direct synthetic entries avoid real auto-dismiss timers and preserve other stories' entries.
    useToastStore.setState((state) => ({ toasts: [...state.toasts, ...entries] }));
    return () => {
      for (const entry of entries) useToastStore.getState().dismiss(entry.id);
    };
  }, [id, locale]);
  return (
    <>
      <p>{t("settings.statusDialogHint")}</p>
      <ToastHost />
    </>
  );
}

const meta = {
  title: "Shared/Feedback/Toast",
  component: ToastItem,
  args: {
    toast: { id: "synthetic-toast", variant: "info", message: "", createdAt: 0 },
    onDismiss: fn(),
  },
  render: (args) => (
    <ToastItem {...args} toast={{ ...args.toast, message: t("settings.statusDialogHint") }} />
  ),
  argTypes: { toast: { control: false }, onDismiss: { control: false } },
} satisfies Meta<typeof ToastItem>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Variants: Story = {
  render: (args) => (
    <div className="space-y-3">
      {(["info", "success", "error"] as const).map((variant) => (
        <ToastItem
          key={variant}
          {...args}
          toast={{
            id: variant,
            variant,
            message: t(variant === "error" ? "app.loadFailed" : "settings.statusDialogHint"),
            createdAt: 0,
          }}
        />
      ))}
    </div>
  ),
};
export const Host: Story = { render: () => <HostExample /> };
