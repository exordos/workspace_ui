import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";
import React from "react";
import { Icon, type IconName } from "./icon";
import type {
  DropdownMenuCustomRenderContext,
  DropdownMenuContentVariant,
  DropdownMenuItem,
  DropdownMenuRenderStyles,
} from "./dropdown-menu";

/** Base menu container classes shared by all variants.
 * Uses bg-elevated so menus match header/sidebar chrome across all palettes.
 */
const CONTENT_BASE_CLASS_NAME =
  "z-dropdown rounded-lg border border-border-subtle bg-bg-elevated shadow-lg";

/** Semantic container width/padding variants. */
const CONTENT_VARIANT_CLASS_NAMES: Record<DropdownMenuContentVariant, string> = {
  narrow: "min-w-context-menu-narrow py-1",
  default: "min-w-context-menu py-1",
  wide: "min-w-context-menu-wide py-1",
  message: "min-w-context-menu-message py-1",
};

/** Base hover/focus/disabled contract for menu items. */
const DEFAULT_ITEM_CLASS_NAME =
  "data-[highlighted]:bg-sidebar-hover hover:bg-sidebar-hover flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary outline-none transition-colors focus-visible:outline-none focus-visible:outline-0 focus-visible:outline-offset-0 data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

/** Danger styling layered on top of the base item contract. */
const DEFAULT_DANGER_ITEM_CLASS_NAME =
  "text-notice-base data-[highlighted]:bg-notice-base/10 hover:bg-notice-base/10 data-[highlighted]:text-notice-base hover:text-notice-base";

/** Base separator styling. */
const DEFAULT_SEPARATOR_CLASS_NAME = "mx-2 my-1 h-px bg-border-subtle";

/** Minimal item data needed to resolve item class names. */
interface MenuClassInput {
  danger?: boolean;
  className?: string;
}

/** Icon source: registry `IconName` or a pre-built React node. */
type MenuIconLike = IconName | React.ReactNode;

/** Resolves string icons via `Icon`; passes through ready-made React nodes. */
function resolveIconNode(icon: MenuIconLike | undefined): React.ReactElement | null {
  if (icon == null) {
    return null;
  }
  if (typeof icon === "string") {
    return <Icon name={icon} size={14} className="text-current opacity-70" />;
  }
  return <>{icon}</>;
}

/** Joins className parts, dropping undefined/empty segments. */
function joinClassNames(...parts: (string | undefined)[]): string {
  return parts.filter((part) => part != null && part.length > 0).join(" ");
}

/** Builds item className from overrides and danger state. */
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

  // Suppress only the pointer-up from the RMB gesture that opened the menu — Radix may
  // otherwise synthetically select the item under the cursor. Left clicks are untouched.
  event.preventDefault();
}

/** Builds full menu container className from variant and overrides. */
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

/** Recursively renders a `DropdownMenuItem` array (action/checkbox/submenu/separator/custom). */
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
