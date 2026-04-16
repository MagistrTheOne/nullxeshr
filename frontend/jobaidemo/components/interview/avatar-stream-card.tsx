"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CallingState, PaginatedGridLayout, StreamCall, StreamTheme, StreamVideo, StreamVideoClient, useCallStateHooks } from "@stream-io/video-react-sdk";
import { Maximize, Mic, Minimize, Video } from "lucide-react";
import { StreamParticipantShell } from "@/components/interview/stream-participant-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeviceSettings } from "@stream-io/video-react-sdk";

type StreamTokenResponse = {
  apiKey: string;
  token: string;
  user: {
    id: string;
    name: string;
  };
  callId: string;
  callType: string;
};

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
  meetingId: string | null;
  showControls?: boolean;
};

export function AvatarStreamCard({
  participantName,
  enabled,
  avatarReady,
  meetingId,
  showControls = true
}: AvatarStreamCardProps) {
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<ReturnType<StreamVideoClient["call"]> | null>(null);
  const canRenderAvatarWindow = enabled && Boolean(client && call);
  const [showDevices, setShowDevices] = useState(false);
  const [busy, setBusy] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const streamViewportRef = useRef<HTMLDivElement | null>(null);
  const autoJoinAttemptForRef = useRef<string | null>(null);

  const disconnectStream = useCallback(async () => {
    if (call) {
      await call.leave().catch(() => undefined);
    }
    if (client) {
      await client.disconnectUser().catch(() => undefined);
    }
    setCall(null);
    setClient(null);
    setMicEnabled(true);
    setCameraEnabled(false);
    setShowDevices(false);
  }, [call, client]);

  const startStream = useCallback(async () => {
    if (!meetingId) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/stream/token", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "admin",
          meetingId,
          userId: `agent-${meetingId}`,
          userName: participantName
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(payload.message ?? "Failed to issue HR stream token");
      }

      const payload = (await response.json()) as StreamTokenResponse;
      const streamClient = new StreamVideoClient({
        apiKey: payload.apiKey,
        token: payload.token,
        user: payload.user
      });
      const streamCall = streamClient.call(payload.callType, payload.callId);
      await streamCall.join({ create: true, video: false });

      setClient(streamClient);
      setCall(streamCall);
      setMicEnabled(true);
      setCameraEnabled(false);
    } finally {
      setBusy(false);
    }
  }, [meetingId, participantName]);

  useEffect(() => {
    if (!enabled || !meetingId || call || busy) {
      return;
    }
    const autoJoinKey = meetingId;
    if (autoJoinAttemptForRef.current === autoJoinKey) {
      return;
    }
    autoJoinAttemptForRef.current = autoJoinKey;
    void startStream();
  }, [busy, call, enabled, meetingId, startStream]);

  useEffect(() => {
    if (enabled && meetingId) {
      return;
    }
    void disconnectStream();
  }, [disconnectStream, enabled, meetingId]);

  const toggleMicrophone = async () => {
    if (!call || busy || !canRenderAvatarWindow) {
      return;
    }
    try {
      setBusy(true);
      await call.microphone.toggle();
      setMicEnabled((prev) => !prev);
    } finally {
      setBusy(false);
    }
  };

  const toggleCamera = async () => {
    if (!call || busy || !canRenderAvatarWindow) {
      return;
    }
    try {
      setBusy(true);
      await call.camera.toggle();
      setCameraEnabled((prev) => !prev);
    } finally {
      setBusy(false);
    }
  };

  const leaveSharedCall = async () => {
    if (!call || busy || !canRenderAvatarWindow) {
      return;
    }
    try {
      setBusy(true);
      await disconnectStream();
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
          <div className="flex flex-wrap items-center justify-between gap-2 text-slate-600">
            <p className="min-h-5 min-w-0 flex-1 truncate text-sm leading-snug">{participantName}</p>
            {showControls ? (
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="shrink-0 rounded-full px-2.5">
                  {canRenderAvatarWindow ? "Connected" : avatarReady ? "Ready" : "Idle"}
                </Badge>
                <Button
                  type="button"
                  size="icon"
                  variant={micEnabled ? "secondary" : "destructive"}
                  className="size-8 rounded-full"
                  onClick={toggleMicrophone}
                  disabled={!canRenderAvatarWindow || !call || busy}
                  aria-label="Toggle microphone"
                >
                  <Mic size={14} />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={cameraEnabled ? "secondary" : "destructive"}
                  className="size-8 rounded-full"
                  onClick={toggleCamera}
                  disabled={!canRenderAvatarWindow || !call || busy}
                  aria-label="Toggle camera"
                >
                  <Video size={14} />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="size-8 rounded-full"
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
                className="rounded-full px-3"
                onClick={() => setShowDevices((v) => !v)}
                disabled={!canRenderAvatarWindow || !call}
              >
                Устройства
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="rounded-full px-3"
                onClick={() => {
                  void leaveSharedCall();
                }}
                disabled={!canRenderAvatarWindow || !call || busy}
              >
                Выйти
              </Button>
            </div>
          ) : null}

          {showControls && showDevices && canRenderAvatarWindow && call ? (
            <div className="max-h-[100px] overflow-y-auto rounded-lg border border-white/60 bg-white/60 p-2">
              <DeviceSettings />
            </div>
          ) : null}

        </>
      }
    >
      {canRenderAvatarWindow && client && call ? (
        <div className="h-full w-full">
          <StreamVideo client={client}>
            <StreamTheme>
              <StreamCall call={call}>
                <AvatarCallBody />
              </StreamCall>
            </StreamTheme>
          </StreamVideo>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-slate-400">Загрузка</div>
      )}
    </StreamParticipantShell>
  );
}
