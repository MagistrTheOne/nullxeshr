"use client";

import { useMemo, useRef, useState } from "react";
import {
  CallingState,
  DeviceSettings,
  PaginatedGridLayout,
  SpeakerLayout,
  StreamCall,
  StreamTheme,
  StreamVideo,
  StreamVideoClient,
  useCallStateHooks
} from "@stream-io/video-react-sdk";
import { Maximize, Mic, Minimize, Video } from "lucide-react";
import { sendRealtimeEvent } from "@/lib/api";
import type { InterviewStartResult } from "@/hooks/use-interview-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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

function CandidateCallBody({ layout }: { layout: "speaker" | "grid" }) {
  const { useCallCallingState } = useCallStateHooks();
  const state = useCallCallingState();

  if (state !== CallingState.JOINED && state !== CallingState.JOINING) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-500">Stream is not connected</div>;
  }

  return layout === "speaker" ? <SpeakerLayout /> : <PaginatedGridLayout />;
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
  }) => Promise<InterviewStartResult>;
};

export function CandidateStreamCard({
  meetingId,
  sessionId,
  participantName,
  interviewId,
  meetingAt,
  onEnsureInterviewStart
}: CandidateStreamCardProps) {
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<ReturnType<StreamVideoClient["call"]> | null>(null);
  const [layout, setLayout] = useState<"speaker" | "grid">("speaker");
  const [showDevices, setShowDevices] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const streamViewportRef = useRef<HTMLDivElement | null>(null);

  const callRoomId = useMemo(() => meetingId ?? "demo-call", [meetingId]);

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
          meetingAt
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
    <section className="flex w-full flex-col items-center gap-4">
      <h3 className="text-[30px] font-medium text-slate-600">Кандидат</h3>
      <Card className="w-full rounded-2xl border-0 bg-[#d9dee7] p-3 shadow-[-8px_-8px_16px_rgba(255,255,255,.9),8px_8px_18px_rgba(163,177,198,.55)]">
        <CardContent className="space-y-3 p-2">
          <div ref={streamViewportRef} className="h-[260px] overflow-hidden rounded-xl border border-white/50 bg-[#d0d6e0]">
            {client && call ? (
              <StreamVideo client={client}>
                <StreamTheme>
                  <StreamCall call={call}>
                    <CandidateCallBody layout={layout} />
                  </StreamCall>
                </StreamTheme>
              </StreamVideo>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">Нажмите Join Stream</div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 text-slate-600">
            <p className="truncate text-sm">{participantName}</p>
            <div className="flex items-center gap-2">
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
            <Button size="sm" variant={layout === "speaker" ? "default" : "secondary"} onClick={() => setLayout("speaker")}>
              Speaker
            </Button>
            <Button size="sm" variant={layout === "grid" ? "default" : "secondary"} onClick={() => setLayout("grid")}>
              Grid
            </Button>
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
            <div className="rounded-lg border border-white/60 bg-white/60 p-2">
              <DeviceSettings />
            </div>
          ) : null}
        </CardContent>
      </Card>
      {error ? <p className="w-full rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
