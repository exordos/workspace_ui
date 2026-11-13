import { useCallback, useEffect, useState } from "react";
import { useCallParticipantsStore } from "~/entities/call/call.model";
import { getLocale, t } from "~/i18n/i18n";
import { getElectronAPI } from "~/shared/lib/electron";
import { toast } from "~/shared/lib/toast/toast";
import { useJitsiCallStore, type ActiveJitsiCall } from "./jitsi-call.model";
import { JitsiCallModal } from "./jitsi-call.ui";

interface JitsiCallPresentationProps {
  call: ActiveJitsiCall;
  openInSeparateWindow: boolean;
}

export function JitsiCallPresentation({
  call,
  openInSeparateWindow,
}: Readonly<JitsiCallPresentationProps>) {
  // This component is keyed by callId, so preference changes apply to the next call.
  const [bridge] = useState(() =>
    openInSeparateWindow ? getElectronAPI()?.callWindow : undefined,
  );
  const [useEmbeddedFallback, setUseEmbeddedFallback] = useState(false);
  const close = useCallback(() => {
    useJitsiCallStore.getState().closeCall(call.callId);
  }, [call.callId]);
  const fallback = useCallback(() => setUseEmbeddedFallback(true), []);

  if (bridge != null && !useEmbeddedFallback) {
    return <SeparateJitsiCall call={call} bridge={bridge} onLaunchFailed={fallback} />;
  }

  return (
    <JitsiCallModal
      open={true}
      meetingUrl={call.meetingUrl}
      locationName={call.locationName}
      displayName={call.displayName}
      startWithVideoMuted={call.startWithVideoMuted}
      onClose={close}
    />
  );
}

interface SeparateJitsiCallProps {
  call: ActiveJitsiCall;
  bridge: JitsiCallWindowHostBridge;
  onLaunchFailed: () => void;
}

function SeparateJitsiCall({ call, bridge, onLaunchFailed }: Readonly<SeparateJitsiCallProps>) {
  useEffect(() => {
    const { callId, meetingUrl } = call;
    let disposed = false;
    let opening = false;

    const isCurrent = () => !disposed && useJitsiCallStore.getState().activeCall?.callId === callId;

    const removeClosedListener = bridge.onClosed((closedCallId) => {
      if (closedCallId === callId && isCurrent()) {
        useJitsiCallStore.getState().closeCall(callId);
      }
    });
    const removeParticipantsListener = bridge.onParticipants((event) => {
      if (event.callId === callId && isCurrent()) {
        useCallParticipantsStore.getState().setParticipants(meetingUrl, event.participants);
      }
    });
    const removeFocusListener = useJitsiCallStore.subscribe((state, previous) => {
      if (opening && state.focusRequestCount !== previous.focusRequestCount && isCurrent()) {
        bridge.focus(callId);
      }
    });

    // The initial Strict Mode effect can be torn down before an IPC request is sent.
    const launch = async () => {
      if (!isCurrent()) return;
      opening = true;
      const { theme: mode, palette: paletteId } = document.documentElement.dataset;
      try {
        const loaded = await bridge.open({
          callId,
          meetingUrl,
          locationName: call.locationName,
          displayName: call.displayName ?? "",
          startWithVideoMuted: call.startWithVideoMuted ?? true,
          language: getLocale(),
          theme:
            paletteId != null && (mode === "light" || mode === "dark")
              ? { mode, paletteId }
              : undefined,
        });
        if (!loaded && isCurrent()) onLaunchFailed();
      } catch {
        if (isCurrent()) {
          // A rejected IPC request does not confirm the separate window is gone.
          useJitsiCallStore.getState().closeCall(callId);
          toast.error(t("app.error"));
        }
      }
    };
    queueMicrotask(() => void launch());

    return () => {
      disposed = true;
      removeClosedListener();
      removeParticipantsListener();
      removeFocusListener();
      if (opening) bridge.close(callId);
      useCallParticipantsStore.getState().clearParticipants(meetingUrl);
    };
  }, [call, bridge, onLaunchFailed]);

  return null;
}
