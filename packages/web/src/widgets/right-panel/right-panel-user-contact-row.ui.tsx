import React from "react";
import { Copyable } from "~/shared/ui/copyable";
import { Icon } from "~/shared/ui/icon";
import type { RightPanelUserContactRow } from "./right-panel-user-contact.lib";

export const RightPanelUserContactRowItem = React.memo(function RightPanelUserContactRowItem({
  row,
}: {
  row: RightPanelUserContactRow;
}) {
  const rowValueNode = row.href ? (
    <a
      href={row.href}
      target={row.external ? "_blank" : undefined}
      rel={row.external ? "noreferrer" : undefined}
      className="inline-flex max-w-full items-center text-accent underline-offset-2 hover:underline"
    >
      <span className="truncate whitespace-nowrap">{row.value}</span>
    </a>
  ) : (
    <span className="block truncate whitespace-nowrap text-text-primary">{row.value}</span>
  );

  const renderedRowValue =
    row.copyValue != null ? (
      <Copyable value={row.copyValue} copyAriaLabel={row.copyAriaLabel} className="max-w-full">
        {rowValueNode}
      </Copyable>
    ) : (
      rowValueNode
    );

  return (
    <li className="flex items-start gap-3 rounded-lg px-1 py-1.5 text-sm">
      <Icon name={row.icon} size={20} className="mt-0.5 shrink-0 text-icon-base" />
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
          {row.label}
        </p>
        {renderedRowValue}
      </div>
    </li>
  );
});
