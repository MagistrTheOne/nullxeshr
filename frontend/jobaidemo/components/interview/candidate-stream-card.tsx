"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CallingState,
  DeviceSettings,
  PaginatedGridLayout,
  StreamCall,
  StreamTheme,
  StreamVideo,
  StreamVideoClient,
  useCallStateHooks
} from "@stream-io/video-react-sdk";
import { Maximize, Mic, Minimize, Video } from "lucide-react";
import { sendRealtimeEvent } from "@/lib/api";
import type { InterviewStartContext, InterviewStartResult } from "@/hooks/use-interview-session";
import { Button } from "@/components/ui/button";
import { StreamParticipantShell } from "@/components/interview/stream-participant-shell";

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

function CandidateCallBody() {
  const { useCallCallingState } = useCallStateHooks();
  const state = useCallCallingState();

  if (state !== CallingState.JOINED && state !== CallingState.JOINING) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-500">Stream is not connected</div>;
  }

  // Use a single stable layout to avoid a duplicated thumbnail strip in the card.
  return <PaginatedGridLayout />;
}

type CandidateStreamCardProps = {
  meetingId: string | null;
  sessionId: string | null;
  participantName: string;
  interviewId?: number;
  meetingAt?: string;
  onEnsureInterviewStart: (options?: {
    triggerSource?: string;
    interviewId?: number;
    meetingAt?: string;
    bypassMeetingAtGuard?: boolean;
    interviewContext?: InterviewStartContext;
  }) => Promise<InterviewStartResult>;
  interviewContext?: InterviewStartContext;
  onSharedCallChange?: (state: {
    client: StreamVideoClient | null;
    call: ReturnType<StreamVideoClient["call"]> | null;
  }) => void;
};

export function CandidateStreamCard({
  meetingId,
  sessionId,
  participantName,
  interviewId,
  meetingAt,
  onEnsureInterviewStart,
  interviewContext,
  onSharedCallChange
}: CandidateStreamCardProps) {
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<ReturnType<StreamVideoClient["call"]> | null>(null);
  const [showDevices, setShowDevices] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const streamViewportRef = useRef<HTMLDivElement | null>(null);

  const callRoomId = useMemo(() => meetingId ?? "demo-call", [meetingId]);

  useEffect(() => {
    onSharedCallChange?.({ client, call });
  }, [call, client, onSharedCallChange]);

  const startStream = async () => {
    setBusy(true);
    setError(null);
    try {
      let effectiveMeetingId = meetingId;
      let effectiveSessionId = sessionId;

      if (!effectiveMeetingId || !effectiveSessionId) {
        const started = await onEnsureInterviewStart({
          triggerSource: "join_stream",
          interviewId,
          meetingAt,
          interviewContext
        });
        effectiveMeetingId = started.meetingId;
        effectiveSessionId = started.sessionId;
      }

      const response = await fetch("/api/stream/token", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "candidate",
          meetingId: effectiveMeetingId,
          userName: participantName
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(payload.message ?? "Failed to issue Stream token");
      }

      const payload = (await response.json()) as StreamTokenResponse;
      const streamClient = new StreamVideoClient({
        apiKey: payload.apiKey,
        token: payload.token,
        user: payload.user
      });
      const streamCall = streamClient.call(payload.callType, payload.callId);
      await streamCall.camera.disable().catch(() => undefined);
      await streamCall.join({ create: true, video: false });

      setClient(streamClient);
      setCall(streamCall);
      setMicEnabled(true);
      setCameraEnabled(false);

      if (effectiveSessionId) {
        await sendRealtimeEvent(effectiveSessionId, {
          type: "candidate.stream.joined",
          meetingId: effectiveMeetingId,
          streamCallId: payload.callId
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start candidate stream");
    } finally {
      setBusy(false);
    }
  };

  const leaveStream = async () => {
    setBusy(true);
    setError(null);
    try {
      if (call) {
        await call.leave();
      }
      if (client) {
        await client.disconnectUser();
      }
      setCall(null);
      setClient(null);
      setMicEnabled(true);
      setCameraEnabled(false);

      if (sessionId) {
        await sendRealtimeEvent(sessionId, {
          type: "candidate.stream.left",
          meetingId: callRoomId
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to leave candidate stream");
    } finally {
      setBusy(false);
    }
  };

  const toggleMicrophone = async () => {
    if (!call || busy) {
      return;
    }
    try {
      await call.microphone.toggle();
      setMicEnabled((prev) => !prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle microphone");
    }
  };

  const toggleCamera = async () => {
    if (!call || busy) {
      return;
    }
    try {
      if (!cameraEnabled && "permissions" in navigator) {
        const permissionStatus = await navigator.permissions.query({
          name: "camera" as PermissionName
        });
        if (permissionStatus.state === "denied") {
          setError("Camera permission is blocked in browser settings.");
          return;
        }
      }
      await call.camera.toggle();
      setCameraEnabled((prev) => !prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle camera");
    }
  };

  const toggleFullscreen = async () => {
    const element = streamViewportRef.current;
    if (!element) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        await element.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle fullscreen");
    }
  };

  return (
    <StreamParticipantShell
      title="Кандидат"
      videoRef={streamViewportRef}
      footer={
        <>
          <div className="flex items-center justify-between gap-2 text-slate-600">
            <p className="min-h-5 truncate text-sm leading-snug">{participantName}</p>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant={micEnabled ? "secondary" : "destructive"}
                className="size-7"
                onClick={toggleMicrophone}
                disabled={!call || busy}
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
                disabled={!call || busy}
                aria-label="Toggle camera"
              >
                <Video size={14} />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="size-7"
                onClick={toggleFullscreen}
                aria-label="Toggle fullscreen"
              >
                {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {!call ? (
              <Button size="sm" onClick={startStream} disabled={busy}>
                Join Stream
              </Button>
            ) : (
              <>
                <Button size="sm" variant="secondary" onClick={() => setShowDevices((v) => !v)}>
                  Devices
                </Button>
                <Button size="sm" variant="destructive" onClick={leaveStream} disabled={busy}>
                  Leave
                </Button>
              </>
            )}
          </div>

          {showDevices && call ? (
            <div className="max-h-[100px] overflow-y-auto rounded-lg border border-white/60 bg-white/60 p-2">
              <DeviceSettings />
            </div>
          ) : null}
        </>
      }
      error={error ? <p className="w-full rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
    >
      {client && call ? (
        <div className="h-full w-full">
          <StreamVideo client={client}>
            <StreamTheme>
              <StreamCall call={call}>
                <CandidateCallBody />
              </StreamCall>
            </StreamTheme>
          </StreamVideo>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-slate-400">Нажмите &quot;Join Stream&quot; для входа</div>
      )}
    </StreamParticipantShell>
  );
}
