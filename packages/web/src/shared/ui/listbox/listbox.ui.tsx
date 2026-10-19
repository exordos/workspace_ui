import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { getListboxOptionId } from "./listbox.lib";
import type { ListboxProps } from "./listbox.types";
import type { CSSProperties } from "react";

export function Listbox({
  id,
  anchorRef,
  options,
  value,
  activeValue,
  emptyText,
  ariaLabel,
  ariaLabelledBy,
  onActiveChange,
  onSelect,
  onClose,
}: Readonly<ListboxProps>) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>();
  const [portalHost, setPortalHost] = useState<Element | null>(null);
  // Keep a portaled list inside its owning dialog's focus/dismiss boundary.
  useLayoutEffect(() => {
    setPortalHost(anchorRef.current?.closest('[role="dialog"]') ?? document.body);
  }, [anchorRef]);

  useLayoutEffect(() => {
    const popover = panelRef.current;
    popover?.showPopover?.();
    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (rect == null || panel == null) return;
      const margin = 8;
      const gap = 6;
      const below = window.innerHeight - rect.bottom - gap - margin;
      const above = rect.top - gap - margin;
      const desiredHeight = Math.min(320, panel.scrollHeight);
      const placeAbove = below < desiredHeight && above > below;
      const maxHeight = Math.max(0, Math.min(320, placeAbove ? above : below));
      const width = Math.min(rect.width, window.innerWidth - margin * 2);
      const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
      const top = placeAbove
        ? rect.top - gap - Math.min(desiredHeight, maxHeight)
        : rect.bottom + gap;
      setPanelStyle({ position: "fixed", left, top, width, maxHeight });
    };
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !anchorRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        onClose();
      }
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      const target = event.target;
      if (
        !(target instanceof Node) ||
        (!anchorRef.current?.contains(target) && !panelRef.current?.contains(target))
      )
        return;
      // Close the suggestion list before the dialog's document capture handler.
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    updatePosition();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePosition);
    if (anchorRef.current != null) observer?.observe(anchorRef.current);
    if (panelRef.current != null) observer?.observe(panelRef.current);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("keydown", dismissOnEscape, true);
    document.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", dismissOutside);
    return () => {
      popover?.hidePopover?.();
      observer?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("keydown", dismissOnEscape, true);
      document.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", dismissOutside);
    };
  }, [anchorRef, onClose, portalHost]);

  useLayoutEffect(() => {
    if (activeValue == null) return;
    document
      .getElementById(getListboxOptionId(id, activeValue))
      ?.scrollIntoView?.({ block: "nearest" });
  }, [activeValue, id]);

  if (portalHost == null) return null;

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      role="listbox"
      tabIndex={-1}
      popover={typeof HTMLElement.prototype.showPopover === "function" ? "manual" : undefined}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className="z-modal m-0 overflow-y-auto overscroll-contain rounded-xl border border-border-subtle bg-bg-elevated p-1 text-text-primary shadow-xl"
      style={panelStyle ?? { position: "fixed", visibility: "hidden" }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {options.length === 0 ? (
        <div className="px-3 py-4 text-sm text-text-muted" role="status">
          {emptyText ?? t("selector.noOptions")}
        </div>
      ) : (
        options.map((option) => (
          <div
            key={option.value}
            id={getListboxOptionId(id, option.value)}
            role="option"
            tabIndex={-1}
            aria-label={option.label}
            aria-describedby={
              option.description != null
                ? `${getListboxOptionId(id, option.value)}-description`
                : undefined
            }
            aria-selected={option.value === value}
            aria-disabled={option.disabled}
            data-active={option.value === activeValue || undefined}
            className={`flex min-h-9 items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-text-primary ${option.disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:bg-card-bg-active"} ${option.value === activeValue ? "bg-card-bg-active" : ""}`}
            onPointerMove={() => {
              if (!option.disabled) onActiveChange?.(option.value);
            }}
            onClick={() => {
              if (!option.disabled) onSelect(option.value);
            }}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate" title={option.label}>
                {option.label}
              </span>
              {option.description != null ? (
                <span
                  id={`${getListboxOptionId(id, option.value)}-description`}
                  className="mt-0.5 block truncate text-xs text-text-muted"
                  title={option.description}
                >
                  {option.description}
                </span>
              ) : null}
            </span>
            <span className="flex w-4 shrink-0 items-center justify-center text-accent" aria-hidden>
              {option.value === value ? <Icon name="check" size={16} /> : null}
            </span>
          </div>
        ))
      )}
    </div>,
    portalHost,
  );
}
