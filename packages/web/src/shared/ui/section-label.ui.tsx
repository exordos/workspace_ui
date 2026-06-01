import React from "react";

export type SectionLabelTone = "default" | "muted";

export interface SectionLabelProps {
  children: React.ReactNode;
  className?: string;
  as?: "p" | "span";
  tone?: SectionLabelTone;
}

const BASE_CLASS = "text-[11px] font-medium uppercase tracking-wide";

const TONE_CLASS: Record<SectionLabelTone, string> = {
  default: "text-text-secondary",
  muted: "text-text-muted",
};

export const SectionLabel: React.FC<SectionLabelProps> = ({
  children,
  className = "",
  as: Tag = "p",
  tone = "default",
}) => <Tag className={`${BASE_CLASS} ${TONE_CLASS[tone]} ${className}`.trim()}>{children}</Tag>;
