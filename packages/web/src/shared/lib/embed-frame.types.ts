import type { ReactNode } from "react";
import type { EmbedSandbox } from "./embed.lib";

export interface EmbedFrameProps {
  url: string;
  title: string;
  sandbox?: EmbedSandbox;
  className?: string;
  onLoad?: () => void;
  onError?: () => void;
  fallback?: ReactNode;
}
