import { JitsiMeeting } from "@jitsi/react-sdk";
import React, { useMemo } from "react";
import { t } from "~/i18n/i18n";
import { Spinner } from "~/shared/ui/loading";
import { useJitsiExternalApiLoader } from "./jitsi-call-api-loader.hook";
import type { JitsiCallEmbedProps } from "./jitsi-call.types";

// Session-level Jitsi config — stable across minimize/expand.
const JITSI_CONFIG_OVERWRITE_BASE = {
  startWithAudioMuted: true,
  prejoinConfig: { enabled: false },
} as const;
// Jitsi UI settings independent of modal shell state.
const JITSI_INTERFACE_CONFIG_OVERWRITE = {
  DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
} as const;

// Isolates Jitsi embed from shell re-renders — minimize/expand/resize must not remount.
const JitsiCallEmbed: React.FC<JitsiCallEmbedProps> = React.memo(function JitsiCallEmbed({
  displayName,
  domain,
  roomName,
  startWithVideoMuted,
  onApiReady,
  onIframeReady,
  onReadyToClose,
}) {
  const configOverwrite = useMemo(
    () => ({
      ...JITSI_CONFIG_OVERWRITE_BASE,
      startWithVideoMuted,
    }),
    [startWithVideoMuted],
  );

  if (domain == null || roomName == null) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm text-text-muted">
        {t("call.invalidLink")}
      </div>
    );
  }

  return (
    <JitsiMeeting
      domain={domain}
      roomName={roomName}
      onApiReady={onApiReady}
      getIFrameRef={onIframeReady}
      onReadyToClose={onReadyToClose}
      userInfo={{ displayName, email: "" }}
      configOverwrite={configOverwrite}
      interfaceConfigOverwrite={JITSI_INTERFACE_CONFIG_OVERWRITE}
    />
  );
});

export const JitsiCallContent: React.FC<JitsiCallEmbedProps & { open: boolean }> = ({
  open,
  ...embedProps
}) => {
  const { loadState: jitsiApiLoadState, retry: retryJitsiApiLoad } =
    useJitsiExternalApiLoader(open);

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      {jitsiApiLoadState === "loading" ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-text-muted"
          aria-busy="true"
        >
          <Spinner size="lg" />
          <span>{t("call.apiLoading")}</span>
        </div>
      ) : null}
      {jitsiApiLoadState === "error" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
          <p className="text-sm text-notice-base">{t("call.apiLoadFailed")}</p>
          <button
            type="button"
            onClick={retryJitsiApiLoad}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black"
          >
            {t("app.retry")}
          </button>
        </div>
      ) : null}
      {jitsiApiLoadState === "ready" ? <JitsiCallEmbed {...embedProps} /> : null}
    </div>
  );
};
