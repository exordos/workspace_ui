import { useState } from "react";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
import type { Meta, StoryObj } from "@storybook/react-vite";

const VARIANTS = ["inside", "outside", "overlay", "label"] as const;
type Variant = (typeof VARIANTS)[number];

/** Visual experiments only; these fixtures never access messages or encryption keys. */
function SpoilerOption({ variant }: { readonly variant: Variant }) {
  const [revealed, setRevealed] = useState(false);
  const lock = <Icon name="chatLock" size={13} />;
  return (
    <span className="inline-flex max-w-full items-center gap-1 align-baseline">
      <Button
        type="button"
        size="sm"
        appearance="ghost"
        variant="neutral"
        className={`relative !h-auto max-w-full !gap-1 !rounded !px-1 !py-0.5 !text-sm !font-normal !leading-5 !text-text-primary ${revealed ? "!bg-transparent" : "!bg-border-subtle"}`}
        aria-label={t(revealed ? "e2ee.hideSecretFragment" : "e2ee.showSecretFragment")}
        aria-expanded={revealed}
        title={t("e2ee.spoilerVariants.encrypted")}
        onClick={() => setRevealed((previous) => !previous)}
      >
        {(variant === "inside" || (variant === "overlay" && revealed)) && lock}
        <span
          className={revealed ? "" : "pointer-events-none select-none blur-[0.22rem]"}
          aria-hidden={!revealed}
        >
          {t("e2ee.spoilerVariants.sampleSecret")}
        </span>
        {variant === "overlay" && !revealed && (
          <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            {lock}
          </span>
        )}
      </Button>
      {(variant === "outside" || variant === "label") && (
        <span
          className="inline-flex shrink-0 items-center gap-1 text-xs text-text-muted"
          title={t("e2ee.spoilerVariants.encrypted")}
        >
          {lock}
          {variant === "label" && t("e2ee.spoilerVariants.encrypted")}
        </span>
      )}
    </span>
  );
}

function EncryptedSpoilerOptions() {
  const [revision, setRevision] = useState(0);
  return (
    <main className="min-h-screen bg-bg p-6 text-text-primary">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">{t("e2ee.spoilerVariants.title")}</h1>
            <p className="max-w-2xl text-sm text-text-muted">
              {t("e2ee.spoilerVariants.description")}
            </p>
          </div>
          <Button
            appearance="outline"
            variant="neutral"
            size="sm"
            onClick={() => setRevision((previous) => previous + 1)}
          >
            {t("e2ee.spoilerVariants.reset")}
          </Button>
        </header>
        <div className="grid gap-4 md:grid-cols-2" key={revision}>
          {VARIANTS.map((variant, index) => (
            <section
              key={variant}
              className="space-y-5 rounded-xl border border-border-subtle bg-bg-elevated p-5"
            >
              <div className="space-y-1">
                <h2 className="text-base font-semibold">
                  {index + 1}. {t(`e2ee.spoilerVariants.${variant}`)}
                </h2>
                <p className="text-xs text-text-muted">
                  {t(`e2ee.spoilerVariants.${variant}Hint`)}
                </p>
              </div>
              <div className="space-y-3">
                {[false, true].map((own) => (
                  <div
                    key={String(own)}
                    className={`flex ${own ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-full rounded-2xl px-3 py-2 text-sm ${own ? "rounded-br-md bg-msg-own-bg" : "rounded-bl-md bg-msg-bg"}`}
                    >
                      <p className="mb-1 text-xs text-text-muted">
                        {t(own ? "e2ee.spoilerVariants.you" : "e2ee.previewPerson")}
                      </p>
                      <p className="leading-6">
                        {t("e2ee.spoilerVariants.samplePublic")} <SpoilerOption variant={variant} />
                      </p>
                      <p className="mt-1 text-right text-xs text-text-muted">19:14</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

const meta = {
  title: "Features/Encrypted chat/Spoiler options",
  component: EncryptedSpoilerOptions,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof EncryptedSpoilerOptions>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Comparison: Story = {};
