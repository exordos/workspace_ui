import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";
import React from "react";
import { Icon, type IconName } from "./icon";
import type {
  DropdownMenuCustomRenderContext,
  DropdownMenuContentVariant,
  DropdownMenuItem,
  DropdownMenuRenderStyles,
} from "./dropdown-menu";

/**
 * Базовые визуальные классы контейнера меню, общие для всех вариантов.
 */
const CONTENT_BASE_CLASS_NAME =
  "z-dropdown rounded-lg border border-border-subtle bg-bg-elevated shadow-lg";

/**
 * Карта классов для семантических вариантов контейнера.
 */
const CONTENT_VARIANT_CLASS_NAMES: Record<DropdownMenuContentVariant, string> = {
  narrow: "min-w-context-menu-narrow py-1",
  default: "min-w-context-menu py-1",
  wide: "min-w-context-menu-wide py-1",
  message: "min-w-context-menu-message py-1",
};

/**
 * Базовый hover/focus/disabled-контракт item-элемента меню.
 */
const DEFAULT_ITEM_CLASS_NAME =
  "data-[highlighted]:bg-sidebar-hover hover:bg-sidebar-hover flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary outline-none transition-colors focus-visible:outline-none focus-visible:outline-0 focus-visible:outline-offset-0 data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

/**
 * Базовый danger-контракт (подмешивается поверх базового item-контракта).
 */
const DEFAULT_DANGER_ITEM_CLASS_NAME =
  "text-notice-base data-[highlighted]:bg-notice-base/10 hover:bg-notice-base/10 data-[highlighted]:text-notice-base hover:text-notice-base";

/**
 * Базовый separator-контракт.
 */
const DEFAULT_SEPARATOR_CLASS_NAME = "mx-2 my-1 h-px bg-border-subtle";

/**
 * Минимальный контракт данных, достаточный для вычисления классов item-элемента.
 */
interface MenuClassInput {
  danger?: boolean;
  className?: string;
}

/**
 * Допустимый источник иконки для рендера:
 * - имя из реестра `Icon`;
 * - готовый React-узел.
 */
type MenuIconLike = IconName | React.ReactNode;

/**
 * Нормализует иконку пункта меню:
 * - строковые значения резолвятся через `Icon`;
 * - готовый React-узел возвращается как есть.
 */
function resolveIconNode(icon: MenuIconLike | undefined): React.ReactElement | null {
  if (icon == null) {
    return null;
  }
  if (typeof icon === "string") {
    return <Icon name={icon} size={14} className="text-current opacity-70" />;
  }
  return <>{icon}</>;
}

/**
 * Простой join для className с фильтрацией `undefined`/пустых строк.
 */
function joinClassNames(...parts: (string | undefined)[]): string {
  return parts.filter((part) => part != null && part.length > 0).join(" ");
}

/**
 * Строит className для item-элемента с учетом override-ов и danger-состояния.
 */
function resolveItemClassName(
  item: MenuClassInput,
  classNameOverride: string | undefined,
  styles: DropdownMenuRenderStyles,
): string {
  return joinClassNames(
    classNameOverride ?? styles.itemClassName ?? DEFAULT_ITEM_CLASS_NAME,
    item.danger ? (styles.dangerItemClassName ?? DEFAULT_DANGER_ITEM_CLASS_NAME) : undefined,
    item.className,
  );
}

function suppressContextMenuPointerUp(
  event: React.PointerEvent<HTMLElement>,
  ctx: DropdownMenuCustomRenderContext,
): void {
  if (ctx.source !== "context") return;
  if (event.button !== 2 && !event.ctrlKey) return;

  // Гасим только release от ПКМ-жеста, открывшего меню: Radix иначе может
  // синтетически выбрать item под курсором. Обычный левый клик по меню не трогаем.
  event.preventDefault();
}

/**
 * Строит полный className контейнера меню из variant + overrides.
 */
export function resolveContentClassName(
  variant: DropdownMenuContentVariant | undefined,
  className: string | undefined,
): string {
  const resolvedVariant = variant ?? "default";
  return joinClassNames(
    CONTENT_BASE_CLASS_NAME,
    CONTENT_VARIANT_CLASS_NAMES[resolvedVariant],
    className,
  );
}

/**
 * Рекурсивный renderer массива `DropdownMenuItem`.
 * Унифицирует поведение action/checkbox/submenu/separator/custom.
 */
export function renderDropdownMenuItems(
  items: readonly DropdownMenuItem[],
  styles: DropdownMenuRenderStyles,
  ctx: DropdownMenuCustomRenderContext,
): React.ReactNode {
  return items.map((item, index) => {
    const key = item.key ?? `${item.type}-${index}`;

    if (item.type === "separator") {
      return (
        <RadixDropdownMenu.Separator
          key={key}
          className={joinClassNames(
            styles.separatorClassName ?? DEFAULT_SEPARATOR_CLASS_NAME,
            item.className,
          )}
        />
      );
    }

    if (item.type === "custom") {
      return <React.Fragment key={key}>{item.render(ctx)}</React.Fragment>;
    }

    if (item.type === "submenu") {
      const submenuTriggerClassName = resolveItemClassName(
        item,
        styles.submenuTriggerClassName,
        styles,
      );
      return (
        <RadixDropdownMenu.Sub key={key}>
          <RadixDropdownMenu.SubTrigger
            className={submenuTriggerClassName}
            disabled={item.disabled}
            onPointerUp={(event) => {
              suppressContextMenuPointerUp(event, ctx);
            }}
            onSelect={(event) => {
              if (item.keepOpenOnSelect) {
                event.preventDefault();
              }
            }}
          >
            {resolveIconNode(item.icon)}
            {item.label}
            {(item.showChevron ?? true) && (
              <span className="ml-auto opacity-60">
                {resolveIconNode(item.chevron ?? "chevron-right")}
              </span>
            )}
          </RadixDropdownMenu.SubTrigger>
          <RadixDropdownMenu.Portal>
            <RadixDropdownMenu.SubContent
              className={resolveContentClassName(
                item.contentVariant ?? styles.subContentVariant ?? styles.contentVariant,
                joinClassNames(styles.subContentClassName, item.contentClassName),
              )}
              sideOffset={item.sideOffset}
              alignOffset={item.alignOffset}
            >
              {renderDropdownMenuItems(item.items, styles, ctx)}
            </RadixDropdownMenu.SubContent>
          </RadixDropdownMenu.Portal>
        </RadixDropdownMenu.Sub>
      );
    }

    if (item.type === "checkbox") {
      const checkboxItemClassName = resolveItemClassName(
        item,
        styles.checkboxItemClassName,
        styles,
      );
      return (
        <RadixDropdownMenu.CheckboxItem
          key={key}
          className={checkboxItemClassName}
          disabled={item.disabled}
          checked={item.checked}
          onPointerUp={(event) => {
            suppressContextMenuPointerUp(event, ctx);
          }}
          onCheckedChange={item.onCheckedChange}
          onSelect={(event) => {
            if (item.keepOpenOnSelect) {
              event.preventDefault();
            }
            item.onSelect?.();
          }}
        >
          {resolveIconNode(item.icon)}
          {item.label}
        </RadixDropdownMenu.CheckboxItem>
      );
    }

    const actionClassName = resolveItemClassName(item, styles.itemClassName, styles);
    return (
      <RadixDropdownMenu.Item
        key={key}
        className={actionClassName}
        disabled={item.disabled}
        onPointerUp={(event) => {
          suppressContextMenuPointerUp(event, ctx);
        }}
        onSelect={(event) => {
          if (item.keepOpenOnSelect) {
            event.preventDefault();
          }
          item.onSelect?.();
        }}
      >
        {resolveIconNode(item.icon)}
        {item.label}
      </RadixDropdownMenu.Item>
    );
  });
}
