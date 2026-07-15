import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildVisibleMailFolderRows,
  resolveMailFolderExpandedPathsForList,
  toggleMailFolderExpandedPath,
} from "~/entities/mail/mail-folder-tree.lib";
import { getMailFolderIconName, getMailFolderLabelKey } from "~/entities/mail/mail.lib";
import type { MailFolder, MailFolderAction } from "~/entities/mail/mail.types";
import { MailFolderContextMenu } from "~/features/mail-folder-actions/mail-folder-context-menu.ui";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
import type { MailFolderListProps } from "./mail-view.types";

function resolveMailFolderLabel(folder: MailFolder): string {
  const labelKey = getMailFolderLabelKey(folder.path);
  return labelKey != null ? t(labelKey) : folder.name;
}

const MailFolderRow = React.memo<{
  folder: MailFolder;
  delimiter: string;
  active: boolean;
  compact: boolean;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  onSelect: (path: string) => void;
  onToggleExpand: (path: string) => void;
  onFolderAction: (path: string, action: MailFolderAction) => void;
}>(
  ({
    folder,
    delimiter,
    active,
    compact,
    depth,
    hasChildren,
    expanded,
    onSelect,
    onToggleExpand,
    onFolderAction,
  }) => {
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
      if (!active) {
        setMenuOpen(false);
      }
    }, [active]);

    const handleFolderAction = useCallback(
      (action: MailFolderAction) => {
        onFolderAction(folder.path, action);
      },
      [folder.path, onFolderAction],
    );
    const handleClick = useCallback(() => {
      onSelect(folder.path);
    }, [folder.path, onSelect]);

    const handleToggleExpand = useCallback(
      (event: React.MouseEvent) => {
        event.stopPropagation();
        onToggleExpand(folder.path);
      },
      [folder.path, onToggleExpand],
    );

    const label = resolveMailFolderLabel(folder);
    const iconName = getMailFolderIconName(folder.path);
    const rowStateClass = active
      ? "border-l-accent bg-card-bg-active shadow-sm"
      : "border-l-transparent hover:bg-sidebar-hover";
    const indentStyle = compact
      ? undefined
      : ({ "--mail-folder-indent": `${depth > 0 ? 8 + depth * 12 : 8}px` } as React.CSSProperties);

    if (compact) {
      return (
        <div
          className={`mx-1 flex w-auto flex-col items-center rounded-lg border-l-2 ${rowStateClass}`}
        >
          <button
            type="button"
            onClick={handleClick}
            title={folder.path}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className="flex min-h-11 w-full flex-col items-center justify-center gap-0.5 px-0 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          >
            <Icon
              name={iconName}
              size={20}
              className={active ? "text-accent" : "text-text-muted"}
            />
            {folder.unread > 0 ? (
              <span className="text-xs font-semibold leading-none text-accent">
                {folder.unread}
              </span>
            ) : null}
          </button>
        </div>
      );
    }

    return (
      <div
        className={`mx-1 flex w-auto items-stretch rounded-lg border-l-2 px-0 max-lg:flex-col max-lg:items-center lg:pl-[var(--mail-folder-indent)] lg:pr-1 ${rowStateClass}`}
        style={indentStyle}
      >
        {hasChildren ? (
          <button
            type="button"
            data-icon-hover="custom"
            onClick={handleToggleExpand}
            className="flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-none p-0 text-text-muted hover:bg-sidebar-hover hover:text-text-primary max-lg:hidden"
            aria-label={expanded ? t("mail.collapseFolder") : t("mail.expandFolder")}
          >
            <Icon
              name="chevron-down"
              size={12}
              className={`shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`}
            />
          </button>
        ) : (
          <span className="w-6 shrink-0 max-lg:hidden" aria-hidden />
        )}
        <button
          type="button"
          onClick={handleClick}
          aria-current={active ? "page" : undefined}
          className="flex min-h-10 min-w-0 flex-1 items-center gap-2 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent max-lg:min-h-11 max-lg:w-full max-lg:flex-col max-lg:justify-center max-lg:gap-0.5 max-lg:px-0 max-lg:py-1.5"
        >
          <Icon name={iconName} size={18} className="shrink-0 text-text-muted" />
          <span
            className={`min-w-0 flex-1 truncate max-lg:hidden ${active ? "font-medium text-text-primary" : "text-text-primary"}`}
          >
            {label}
          </span>
          {folder.unread > 0 ? (
            <span className="ml-2 shrink-0 text-xs font-medium text-accent max-lg:ml-0">
              {folder.unread}
            </span>
          ) : null}
        </button>
        {active ? (
          <MailFolderContextMenu
            folder={folder}
            delimiter={delimiter}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            onAction={handleFolderAction}
            trigger={
              <button
                type="button"
                data-icon-hover="custom"
                className="flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-none px-0 text-text-muted hover:bg-sidebar-hover hover:text-text-primary max-lg:hidden"
                aria-label={t("mail.folderActions.menu")}
                onClick={(event) => {
                  event.stopPropagation();
                  setMenuOpen(true);
                }}
              >
                <Icon name="moreVert" size={16} />
              </button>
            }
          />
        ) : null}
      </div>
    );
  },
);
MailFolderRow.displayName = "MailFolderRow";

export const MailFolderList: React.FC<MailFolderListProps> = ({
  folders,
  delimiter,
  selectedFolder,
  compact,
  onSelectFolder,
  onToggleCompact,
  onCreateFolder,
  onFolderAction,
}) => {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setExpandedPaths((current) =>
      resolveMailFolderExpandedPathsForList(folders, current, selectedFolder, delimiter),
    );
  }, [delimiter, folders, selectedFolder]);

  const visibleRows = useMemo(() => {
    if (compact) {
      return folders.map((folder) => ({
        folder,
        depth: 0,
        hasChildren: false,
      }));
    }
    return buildVisibleMailFolderRows(folders, delimiter, expandedPaths);
  }, [compact, delimiter, expandedPaths, folders]);

  const handleToggleCompact = useCallback(() => {
    onToggleCompact();
  }, [onToggleCompact]);

  const handleCreateFolder = useCallback(() => {
    onCreateFolder();
  }, [onCreateFolder]);

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths((current) => toggleMailFolderExpandedPath(current, path));
  }, []);

  return (
    <nav aria-label={t("nav.mail")} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className={`flex min-h-11 shrink-0 border-b border-border-subtle ${
          compact
            ? "flex-col items-center justify-center px-1 py-1.5"
            : "flex-row items-center gap-1 px-2 py-1.5 max-lg:flex-col max-lg:justify-center max-lg:px-1"
        }`}
      >
        <span
          className={`items-center justify-center text-accent ${compact ? "flex" : "flex lg:hidden"}`}
          aria-hidden
        >
          <Icon name="mail" size={20} />
        </span>
        {!compact ? (
          <span className="min-w-0 flex-1 text-xs font-medium uppercase tracking-wide text-text-muted max-lg:hidden">
            {t("mail.foldersLabel")}
          </span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleToggleCompact}
          className="h-8 w-8 shrink-0 px-0 max-lg:hidden"
          aria-label={compact ? t("mail.foldersExpanded") : t("mail.foldersCompact")}
          title={compact ? t("mail.foldersExpanded") : t("mail.foldersCompact")}
        >
          <Icon name={compact ? "list_bulleted" : "grid"} size={18} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto py-1.5">
        {visibleRows.map((row) => (
          <MailFolderRow
            key={row.folder.path}
            folder={row.folder}
            delimiter={delimiter}
            active={row.folder.path === selectedFolder}
            compact={compact}
            depth={row.depth}
            hasChildren={row.hasChildren}
            expanded={expandedPaths.has(row.folder.path)}
            onSelect={onSelectFolder}
            onToggleExpand={handleToggleExpand}
            onFolderAction={onFolderAction}
          />
        ))}
      </div>
      <div
        className={`mt-auto shrink-0 border-t border-border-subtle ${
          compact ? "flex justify-center p-1" : "px-2 py-2"
        }`}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCreateFolder}
          className={
            compact
              ? "h-8 w-8 px-0"
              : "h-8 w-full justify-start gap-2 px-0 max-lg:w-8 max-lg:justify-center"
          }
          aria-label={t("mail.createFolder")}
          title={t("mail.createFolder")}
        >
          <Icon name="add" size={18} />
          {!compact ? <span className="max-lg:hidden">{t("mail.createFolder")}</span> : null}
        </Button>
      </div>
    </nav>
  );
};
