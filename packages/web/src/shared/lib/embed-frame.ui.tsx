/**
 * EmbedFrame component.
 *
 * Renders a sandboxed iframe only when the target URL passes the embedding
 * allowlist checks. Provides loading and fallback states for blocked/failed
 * embeds.
 */

import React, { useCallback, useState } from "react";
import { getSandboxPolicy, isEmbedAllowed } from "./embed.lib";
import { createLogger } from "./logger";
import type { EmbedFrameProps } from "./embed-frame.types";

const log = createLogger("embed");

export const EmbedFrame: React.FC<EmbedFrameProps> = ({
  url,
  title,
  sandbox = "strict",
  className = "",
  onLoad,
  onError,
  fallback,
}) => {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const allowed = isEmbedAllowed(url);

  const handleLoad = useCallback(() => {
    setLoading(false);
    log.info("Embed loaded", { url: new URL(url).origin, title });
    onLoad?.();
  }, [url, title, onLoad]);

  const handleError = useCallback(() => {
    setLoading(false);
    setError(true);
    log.warn("Embed failed to load", { url: new URL(url).origin, title });
    onError?.();
  }, [url, title, onError]);

  if (!allowed) {
    log.warn("Embed blocked — origin not in allowlist", { url });
    return fallback ?? null;
  }

  if (error) {
    return fallback ?? null;
  }

  return (
    <div className={`relative ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-border-subtle border-t-accent" />
        </div>
      )}
      <iframe
        src={url}
        title={title}
        sandbox={getSandboxPolicy(sandbox)}
        allow="camera; microphone; fullscreen; display-capture"
        referrerPolicy="strict-origin-when-cross-origin"
        className="h-full w-full border-0"
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
};
