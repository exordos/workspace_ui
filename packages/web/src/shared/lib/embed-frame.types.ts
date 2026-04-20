import type { EmbedSandbox } from "./embed.lib";
import type { ReactNode } from "react";

export interface EmbedFrameProps {
  url: string;
  title: string;
  sandbox?: EmbedSandbox;
  className?: string;
  onLoad?: () => void;
  onError?: () => void;
  fallback?: ReactNode;
}
