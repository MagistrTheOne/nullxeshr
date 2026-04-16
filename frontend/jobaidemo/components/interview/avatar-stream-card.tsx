"use client";

import { useRef, useState } from "react";
import { CallingState, PaginatedGridLayout, StreamCall, StreamTheme, StreamVideo, StreamVideoClient, useCallStateHooks } from "@stream-io/video-react-sdk";
import { Maximize, Mic, Minimize, Video } from "lucide-react";
import { StreamParticipantShell } from "@/components/interview/stream-participant-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeviceSettings } from "@stream-io/video-react-sdk";

function AvatarCallBody() {
  const { useCallCallingState } = useCallStateHooks();
  const state = useCallCallingState();
  if (state !== CallingState.JOINED && state !== CallingState.JOINING) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-500">Ожидание подключения аватара...</div>;
  }
  return <PaginatedGridLayout />;
}

type AvatarStreamCardProps = {
  participantName: string;
  enabled: boolean;
  avatarReady: boolean;
  sharedClient: StreamVideoClient | null;
  sharedCall: ReturnType<StreamVideoClient["call"]> | null;
  showControls?: boolean;
};

export function AvatarStreamCard({
  participantName,
  enabled,
  avatarReady,
  sharedClient,
  sharedCall,
  showControls = true
}: AvatarStreamCardProps) {
  const canRenderAvatarWindow = enabled && Boolean(sharedClient && sharedCall);
  const [showDevices, setShowDevices] = useState(false);
  const [busy, setBusy] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const streamViewportRef = useRef<HTMLDivElement | null>(null);

  const toggleMicrophone = async () => {
    if (!sharedCall || busy || !canRenderAvatarWindow) {
      return;
    }
    try {
      setBusy(true);
      await sharedCall.microphone.toggle();
      setMicEnabled((prev) => !prev);
    } finally {
      setBusy(false);
    }
  };

  const toggleCamera = async () => {
    if (!sharedCall || busy || !canRenderAvatarWindow) {
      return;
    }
    try {
      setBusy(true);
      await sharedCall.camera.toggle();
      setCameraEnabled((prev) => !prev);
    } finally {
      setBusy(false);
    }
  };

  const leaveSharedCall = async () => {
    if (!sharedCall || busy || !canRenderAvatarWindow) {
      return;
    }
    try {
      setBusy(true);
      await sharedCall.leave();
    } finally {
      setBusy(false);
    }
  };

  const toggleFullscreen = async () => {
    const element = streamViewportRef.current;
    if (!element) {
      return;
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      setIsFullscreen(false);
      return;
    }
    await element.requestFullscreen();
    setIsFullscreen(true);
  };

  return (
    <StreamParticipantShell
      title="HR аватар"
      videoRef={streamViewportRef}
      footer={
        <>
          <div className="flex items-center justify-between gap-2 text-slate-600">
            <p className="min-h-5 truncate text-sm leading-snug">{participantName}</p>
            {showControls ? (
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="secondary" className="shrink-0">
                  {canRenderAvatarWindow ? "Connected" : avatarReady ? "Ready" : "Idle"}
                </Badge>
                <Button
                  type="button"
                  size="icon"
                  variant={micEnabled ? "secondary" : "destructive"}
                  className="size-7"
                  onClick={toggleMicrophone}
                  disabled={!canRenderAvatarWindow || !sharedCall || busy}
                  aria-label="Toggle microphone"
                >
                  <Mic size={14} />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={cameraEnabled ? "secondary" : "destructive"}
                  className="size-7"
                  onClick={toggleCamera}
                  disabled={!canRenderAvatarWindow || !sharedCall || busy}
                  aria-label="Toggle camera"
                >
                  <Video size={14} />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="size-7"
                  onClick={() => {
                    void toggleFullscreen();
                  }}
                  aria-label="Toggle fullscreen"
                >
                  {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
                </Button>
              </div>
            ) : null}
          </div>

          {showControls ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowDevices((v) => !v)}
                disabled={!canRenderAvatarWindow || !sharedCall}
              >
                Devices
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  void leaveSharedCall();
                }}
                disabled={!canRenderAvatarWindow || !sharedCall || busy}
              >
                Leave
              </Button>
            </div>
          ) : null}

          {showControls && showDevices && canRenderAvatarWindow && sharedCall ? (
            <div className="max-h-[100px] overflow-y-auto rounded-lg border border-white/60 bg-white/60 p-2">
              <DeviceSettings />
            </div>
          ) : null}

        </>
      }
    >
      {canRenderAvatarWindow && sharedClient && sharedCall ? (
        <div className="h-full w-full">
          <StreamVideo client={sharedClient}>
            <StreamTheme>
              <StreamCall call={sharedCall}>
                <AvatarCallBody />
              </StreamCall>
            </StreamTheme>
          </StreamVideo>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-slate-400">
          {enabled
            ? "Ожидание Stream-call кандидата"
            : "Нажмите «Начать собеседование» для подключения HR-аватара"}
        </div>
      )}
    </StreamParticipantShell>
  );
}
