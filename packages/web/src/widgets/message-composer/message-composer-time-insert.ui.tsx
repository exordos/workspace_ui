import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "~/i18n/i18n";
import ClockSvg from "~/shared/assets/icons/composer-schedule.svg?react";
import { formatWorkspaceMessageTime } from "~/shared/lib/workspace-message-time.lib";
import { AnchoredPopover } from "~/shared/ui/anchored-popover";
import { Button } from "~/shared/ui/button";
import { DateTimePicker } from "~/shared/ui/date-time-picker";
import { getFloatingPickerStyle } from "./message-composer-floating.lib";
import { mutateSelection } from "./message-composer-selection.lib";
import { TOOLBAR_BTN } from "./message-composer-styles.lib";
import type { RefObject } from "react";

interface TimeInsertProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

function TimeInsertPopover({
  anchor,
  onClose,
  onInsert,
  disabled,
}: Readonly<{
  anchor: HTMLButtonElement;
  onClose: () => void;
  onInsert: (date: Date) => void;
  disabled: boolean;
}>) {
  const { t } = useTranslation();
  const [value, setValue] = useState<Date>(() => {
    const now = new Date();
    now.setMilliseconds(0);
    return now;
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState(() => getFloatingPickerStyle(anchor, 371, 490));
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const trapTab = (event: KeyboardEvent) => {
      if (panel == null) return;
      if (event.key !== "Tab") return;
      const controls = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
        ),
      ).filter((control) => control.tabIndex >= 0);
      const active = document.activeElement;
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && active instanceof HTMLElement && active === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active instanceof HTMLElement && active === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    panel?.addEventListener("keydown", trapTab);
    const update = () => setStyle(getFloatingPickerStyle(anchor, 371, panel?.offsetHeight ?? 490));
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (panel != null) observer?.observe(panel);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    panel
      ?.querySelector<HTMLButtonElement>('[aria-selected="true"] button')
      ?.focus({ preventScroll: true });
    return () => {
      panel?.removeEventListener("keydown", trapTab);
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchor]);

  return createPortal(
    <AnchoredPopover
      open
      onClose={onClose}
      panelStyle={{ ...style, maxHeight: "calc(100dvh - 16px)", overflowY: "auto" }}
      ariaLabel={t("composer.insertTime")}
    >
      <div role="group" aria-label={t("dateTimePicker.label")} ref={panelRef}>
        <DateTimePicker
          value={value}
          onValueChange={setValue}
          showSeconds
          showArrows={false}
          disabled={disabled}
          className="!w-full"
          datePickerProps={{ className: "!rounded-none !border-0" }}
          timePickerProps={{ className: "!rounded-none !border-x-0 !border-b-0 !pb-2" }}
        />
        <div className="px-4 pb-4 pt-2">
          <Button size="lg" fullWidth disabled={disabled} onClick={() => onInsert(value)}>
            {t("composer.insertTimeConfirm")}
          </Button>
        </div>
      </div>
    </AnchoredPopover>,
    document.body,
  );
}

export function MessageComposerTimeInsert({
  textareaRef,
  onValueChange,
  disabled = false,
}: Readonly<TimeInsertProps>) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const open = anchor != null;
  const close = () => {
    setAnchor(null);
    anchor?.focus({ preventScroll: true });
  };
  return (
    <>
      <button
        type="button"
        className={`${TOOLBAR_BTN} ${open ? "text-icon-active" : "text-composer-icon"}`}
        disabled={disabled}
        aria-label={t("composer.insertTime")}
        title={t("composer.insertTime")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => setAnchor(open ? null : event.currentTarget)}
      >
        <ClockSvg width={24} height={24} data-composer-icon="insert-time" aria-hidden />
      </button>
      {anchor != null && (
        <TimeInsertPopover
          anchor={anchor}
          disabled={disabled}
          onClose={close}
          onInsert={(date) => {
            if (disabled) return;
            const text = formatWorkspaceMessageTime(date);
            mutateSelection(textareaRef, onValueChange, () => ({
              text,
              selectionStartOffset: text.length,
              selectionEndOffset: text.length,
            }));
            setAnchor(null);
          }}
        />
      )}
    </>
  );
}
