import { Avatar } from "./avatar";
import type { ReactNode } from "react";
import "./avatar-group.css";

export interface AvatarGroupItem {
  id: string;
  name: string;
  src?: string | null;
}

export interface AvatarGroupProps<Item extends AvatarGroupItem = AvatarGroupItem> {
  items: readonly Item[];
  max?: number;
  size?: number;
  overlap?: number;
  ariaLabel?: string;
  className?: string;
  getAvatarSrc?: (item: Item) => string | null | undefined;
  renderAvatar?: (item: Item) => ReactNode;
}

/** The caller owns identity loading, ordering, overflow copy and interactions. */
export function AvatarGroup<Item extends AvatarGroupItem>({
  items,
  max = 5,
  size = 28,
  overlap = 8,
  ariaLabel,
  className = "",
  getAvatarSrc,
  renderAvatar,
}: Readonly<AvatarGroupProps<Item>>) {
  const visible = items.slice(0, Math.max(0, max));
  if (visible.length === 0) return null;
  return (
    <span
      className={`avatar-group ${className}`}
      role={ariaLabel ? "group" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      {visible.map((item, index) => (
        <span
          key={item.id}
          className="avatar-group-item"
          title={item.name}
          style={{ width: size, height: size, marginLeft: index > 0 ? -overlap : 0 }}
        >
          {renderAvatar?.(item) ?? (
            <Avatar size="sm" src={getAvatarSrc ? getAvatarSrc(item) : item.src}>
              {item.name.slice(0, 1)}
            </Avatar>
          )}
        </span>
      ))}
    </span>
  );
}
