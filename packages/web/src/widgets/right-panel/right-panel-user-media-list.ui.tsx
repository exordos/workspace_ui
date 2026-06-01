import React from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import type { IconName } from "~/shared/ui/icon";

interface MediaCounts {
  photos: number;
  videos: number;
  files: number;
  links: number;
}

const MEDIA_ROW_CONFIG: readonly {
  key: keyof MediaCounts;
  icon: IconName;
  labelKey: "info.photos" | "info.videos" | "info.files" | "info.links";
}[] = [
  { key: "photos", icon: "images", labelKey: "info.photos" },
  { key: "videos", icon: "videos", labelKey: "info.videos" },
  { key: "files", icon: "files", labelKey: "info.files" },
  { key: "links", icon: "links", labelKey: "info.links" },
];

const MediaCountRow = React.memo(function MediaCountRow({
  count,
  icon,
  label,
}: {
  count: number;
  icon: IconName;
  label: string;
}) {
  return (
    <li>
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
      >
        <Icon name={icon} size={20} className="shrink-0 text-current" />
        <span>
          {count} {label}
        </span>
      </button>
    </li>
  );
});

export const RightPanelUserMediaList = React.memo(function RightPanelUserMediaList({
  media,
}: {
  media: MediaCounts;
}) {
  const rows = MEDIA_ROW_CONFIG.filter((cfg) => media[cfg.key] > 0);
  if (rows.length === 0) return null;

  return (
    <div>
      <ul className="space-y-1.5">
        {rows.map((cfg) => (
          <MediaCountRow
            key={cfg.key}
            count={media[cfg.key]}
            icon={cfg.icon}
            label={t(cfg.labelKey)}
          />
        ))}
      </ul>
    </div>
  );
});
