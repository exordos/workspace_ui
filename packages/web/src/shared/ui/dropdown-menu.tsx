import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";
import React from "react";
import { renderDropdownMenuItems, resolveContentClassName } from "./dropdown-menu.helpers";
import type { IconName } from "./icon";

/**
 * Набор преднастроенных размеров/отступов контейнера меню.
 * Используется как семантический слой поверх tailwind-классов, чтобы потребители
 * задавали не конкретные классы, а типовую ширину меню.
 */
export type DropdownMenuContentVariant = "narrow" | "default" | "wide" | "message";

/**
 * Состояние checkbox-элемента меню в терминах Radix:
 * - `true`/`false` для обычного checked;
 * - `"indeterminate"` для промежуточного состояния.
 */
export type DropdownMenuCheckedState = boolean | "indeterminate";

/**
 * Источник открытия меню:
 * - `trigger`: обычный клик по visible trigger.
 * - `context`: контекстное открытие по координатному якорю.
 */
export type DropdownMenuSource = "trigger" | "context";

/**
 * Координатный якорь для контекстного режима меню.
 */
export interface DropdownMenuContextAnchor {
  left: number;
  top: number;
}

/**
 * Контекст, который передается в custom-элемент меню.
 */
export interface DropdownMenuCustomRenderContext {
  close: () => void;
  setOpen: (open: boolean) => void;
  source: DropdownMenuSource;
}

/**
 * Допустимый источник иконки для пункта меню:
 * - имя из реестра `Icon`;
 * - готовый React-узел, если нужна кастомная иконка/бейдж.
 */
type MenuIcon = IconName | React.ReactNode;

/**
 * Общие свойства для интерактивных пунктов меню.
 */
interface DropdownMenuBaseItem {
  key?: string;
  className?: string;
  disabled?: boolean;
  danger?: boolean;
  keepOpenOnSelect?: boolean;
  icon?: MenuIcon;
}

/**
 * Обычный action-пункт меню (клик/enter выполняет действие).
 */
export interface DropdownMenuActionItem extends DropdownMenuBaseItem {
  type: "action";
  label: React.ReactNode;
  onSelect?: () => void;
}

/**
 * Checkbox-пункт меню с синхронизацией checked-состояния.
 */
export interface DropdownMenuCheckboxItem extends DropdownMenuBaseItem {
  type: "checkbox";
  label: React.ReactNode;
  checked: DropdownMenuCheckedState;
  onSelect?: () => void;
  onCheckedChange?: (checked: DropdownMenuCheckedState) => void;
}

/**
 * Подменю (submenu), открывающее вложенный список пунктов.
 */
export interface DropdownMenuSubmenuItem extends DropdownMenuBaseItem {
  type: "submenu";
  label: React.ReactNode;
  items: readonly DropdownMenuItem[];
  contentVariant?: DropdownMenuContentVariant;
  contentClassName?: string;
  sideOffset?: number;
  alignOffset?: number;
  showChevron?: boolean;
  chevron?: MenuIcon;
}

/**
 * Разделитель между логическими группами пунктов меню.
 */
export interface DropdownMenuSeparatorItem {
  type: "separator";
  key?: string;
  className?: string;
}

/**
 * Произвольный кастомный блок в меню.
 */
export interface DropdownMenuCustomItem {
  type: "custom";
  key?: string;
  render: (ctx: DropdownMenuCustomRenderContext) => React.ReactNode;
}

/**
 * Дискриминированный union всех поддерживаемых типов пункта меню.
 */
export type DropdownMenuItem =
  | DropdownMenuActionItem
  | DropdownMenuCheckboxItem
  | DropdownMenuSubmenuItem
  | DropdownMenuSeparatorItem
  | DropdownMenuCustomItem;

/**
 * Набор style-переопределений для renderer-а меню.
 * Позволяет централизованно менять визуальный контракт для item/submenu/checkbox.
 */
export interface DropdownMenuRenderStyles {
  contentVariant?: DropdownMenuContentVariant;
  contentClassName?: string;
  subContentVariant?: DropdownMenuContentVariant;
  subContentClassName?: string;
  itemClassName?: string;
  submenuTriggerClassName?: string;
  checkboxItemClassName?: string;
  dangerItemClassName?: string;
  separatorClassName?: string;
}

/**
 * Позиционирование и lifecycle-хуки для `RadixDropdownMenu.Content`.
 */
export interface DropdownMenuContentProps {
  sideOffset?: number;
  alignOffset?: number;
  side?: RadixDropdownMenu.DropdownMenuContentProps["side"];
  align?: RadixDropdownMenu.DropdownMenuContentProps["align"];
  avoidCollisions?: RadixDropdownMenu.DropdownMenuContentProps["avoidCollisions"];
  onCloseAutoFocus?: RadixDropdownMenu.DropdownMenuContentProps["onCloseAutoFocus"];
  onEscapeKeyDown?: RadixDropdownMenu.DropdownMenuContentProps["onEscapeKeyDown"];
  onPointerDownOutside?: RadixDropdownMenu.DropdownMenuContentProps["onPointerDownOutside"];
  onInteractOutside?: RadixDropdownMenu.DropdownMenuContentProps["onInteractOutside"];
  onFocusOutside?: RadixDropdownMenu.DropdownMenuContentProps["onFocusOutside"];
}

/**
 * High-level API единого меню.
 */
export interface DropdownMenuProps extends DropdownMenuRenderStyles {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly DropdownMenuItem[];
  trigger?: React.ReactNode;
  contextAnchor?: DropdownMenuContextAnchor | null;
  source?: DropdownMenuSource;
  onSourceChange?: (source: DropdownMenuSource) => void;
  modal?: boolean;
  contentProps?: DropdownMenuContentProps;
  triggerContentProps?: DropdownMenuContentProps;
  contextContentProps?: DropdownMenuContentProps;
}

const CONTEXT_ANCHOR_TRIGGER_STYLE: React.CSSProperties = {
  position: "fixed",
  width: 0,
  height: 0,
  margin: 0,
  padding: 0,
  border: 0,
  opacity: 0,
  pointerEvents: "none",
};

function resolveMenuSource(
  source: DropdownMenuSource | undefined,
  hasTrigger: boolean,
  contextAnchor: DropdownMenuContextAnchor | null | undefined,
): DropdownMenuSource {
  if (source != null) {
    return source;
  }
  if (!hasTrigger && contextAnchor != null) {
    return "context";
  }
  return "trigger";
}

const DropdownMenuBody = React.memo(function DropdownMenuBody({
  open,
  onOpenChange,
  source,
  items,
  styles,
  contentProps,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: DropdownMenuSource;
  items: readonly DropdownMenuItem[];
  styles: DropdownMenuRenderStyles;
  contentProps?: DropdownMenuContentProps;
}) {
  const renderCtx = React.useMemo<DropdownMenuCustomRenderContext>(
    () => ({
      close: () => {
        onOpenChange(false);
      },
      setOpen: (nextOpen) => {
        onOpenChange(nextOpen);
      },
      source,
    }),
    [onOpenChange, source],
  );

  return (
    <RadixDropdownMenu.Content
      className={resolveContentClassName(styles.contentVariant, styles.contentClassName)}
      sideOffset={contentProps?.sideOffset}
      alignOffset={contentProps?.alignOffset}
      side={contentProps?.side}
      align={contentProps?.align}
      avoidCollisions={contentProps?.avoidCollisions}
      onCloseAutoFocus={contentProps?.onCloseAutoFocus}
      onEscapeKeyDown={contentProps?.onEscapeKeyDown}
      onPointerDownOutside={contentProps?.onPointerDownOutside}
      onInteractOutside={contentProps?.onInteractOutside}
      onFocusOutside={contentProps?.onFocusOutside}
      data-menu-source={source}
      data-menu-open={open ? "true" : "false"}
    >
      {renderDropdownMenuItems(items, styles, renderCtx)}
    </RadixDropdownMenu.Content>
  );
});

/**
 * Публичный единый компонент меню.
 * Снаружи не требует ручной сборки Root/Trigger/Portal/Content.
 */
export const DropdownMenu: React.FC<DropdownMenuProps> = React.memo(function DropdownMenu({
  open,
  onOpenChange,
  items,
  trigger,
  contextAnchor,
  source,
  onSourceChange,
  modal,
  contentVariant,
  contentClassName,
  subContentVariant,
  subContentClassName,
  itemClassName,
  submenuTriggerClassName,
  checkboxItemClassName,
  dangerItemClassName,
  separatorClassName,
  contentProps,
  triggerContentProps,
  contextContentProps,
}) {
  const hasTrigger = trigger != null;
  const resolvedSource = resolveMenuSource(source, hasTrigger, contextAnchor);
  const isTriggerMenuOpen = hasTrigger && open && resolvedSource === "trigger";
  const isContextMenuOpen = contextAnchor != null && open && resolvedSource === "context";
  const styles = React.useMemo<DropdownMenuRenderStyles>(
    () => ({
      contentVariant,
      contentClassName,
      subContentVariant,
      subContentClassName,
      itemClassName,
      submenuTriggerClassName,
      checkboxItemClassName,
      dangerItemClassName,
      separatorClassName,
    }),
    [
      checkboxItemClassName,
      contentClassName,
      contentVariant,
      dangerItemClassName,
      itemClassName,
      separatorClassName,
      subContentClassName,
      subContentVariant,
      submenuTriggerClassName,
    ],
  );
  const resolvedTriggerContentProps = React.useMemo<DropdownMenuContentProps>(
    () => ({ ...contentProps, ...triggerContentProps }),
    [contentProps, triggerContentProps],
  );
  const resolvedContextContentProps = React.useMemo<DropdownMenuContentProps>(
    () => ({ ...contentProps, ...contextContentProps }),
    [contentProps, contextContentProps],
  );

  return (
    <>
      {hasTrigger && (
        <RadixDropdownMenu.Root
          open={isTriggerMenuOpen}
          onOpenChange={(nextOpen) => {
            if (nextOpen) {
              onSourceChange?.("trigger");
            }
            onOpenChange(nextOpen);
          }}
          modal={modal}
        >
          <RadixDropdownMenu.Trigger asChild>{trigger}</RadixDropdownMenu.Trigger>
          <RadixDropdownMenu.Portal>
            <DropdownMenuBody
              open={isTriggerMenuOpen}
              onOpenChange={onOpenChange}
              source="trigger"
              items={items}
              styles={styles}
              contentProps={resolvedTriggerContentProps}
            />
          </RadixDropdownMenu.Portal>
        </RadixDropdownMenu.Root>
      )}

      {contextAnchor != null && (
        <RadixDropdownMenu.Root
          open={isContextMenuOpen}
          onOpenChange={(nextOpen) => {
            if (nextOpen) {
              onSourceChange?.("context");
            }
            onOpenChange(nextOpen);
          }}
          modal={modal}
        >
          <RadixDropdownMenu.Trigger asChild>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              data-context-menu-trigger-source="context"
              style={{
                ...CONTEXT_ANCHOR_TRIGGER_STYLE,
                left: contextAnchor.left,
                top: contextAnchor.top,
              }}
            />
          </RadixDropdownMenu.Trigger>
          <RadixDropdownMenu.Portal>
            <DropdownMenuBody
              open={isContextMenuOpen}
              onOpenChange={onOpenChange}
              source="context"
              items={items}
              styles={styles}
              contentProps={{
                ...resolvedContextContentProps,
                side: resolvedContextContentProps.side ?? "right",
                avoidCollisions: resolvedContextContentProps.avoidCollisions ?? true,
              }}
            />
          </RadixDropdownMenu.Portal>
        </RadixDropdownMenu.Root>
      )}
    </>
  );
});
