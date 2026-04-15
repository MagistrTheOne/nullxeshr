"use client";

import { useEffect, useState } from "react";
import { CallingState, SpeakerLayout, StreamCall, StreamTheme, StreamVideo, StreamVideoClient, useCallStateHooks } from "@stream-io/video-react-sdk";
import { sendRealtimeEvent } from "@/lib/api";
import { StreamParticipantShell } from "@/components/interview/stream-participant-shell";
import { Badge } from "@/components/ui/badge";

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
  return <SpeakerLayout participantsBarPosition="bottom" />;
}

type AvatarStreamCardProps = {
  meetingId: string | null;
  sessionId: string | null;
  participantName: string;
};

export function AvatarStreamCard({ meetingId, sessionId, participantName }: AvatarStreamCardProps) {
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<ReturnType<StreamVideoClient["call"]> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let localClient: StreamVideoClient | null = null;
    let localCall: ReturnType<StreamVideoClient["call"]> | null = null;

    async function connectAvatar() {
      if (!meetingId || !sessionId) return;

      try {
        const response = await fetch("/api/stream/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "admin",
            meetingId,
            userName: "HR Avatar"
          })
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { message?: string };
          throw new Error(payload.message ?? "Failed to issue Stream token for avatar");
        }

        const payload = (await response.json()) as StreamTokenResponse;
        const streamClient = new StreamVideoClient({
          apiKey: payload.apiKey,
          token: payload.token,
          user: payload.user
        });
        localClient = streamClient;
        const streamCall = streamClient.call(payload.callType, payload.callId);
        localCall = streamCall;
        await streamCall.camera.disable().catch(() => undefined);
        await streamCall.join({ create: true, video: false });

        if (!mounted) {
          await streamCall.leave().catch(() => undefined);
          await streamClient.disconnectUser().catch(() => undefined);
          return;
        }

        setClient(streamClient);
        setCall(streamCall);

        await sendRealtimeEvent(sessionId, {
          type: "avatar.stream.joined",
          meetingId,
          streamCallId: payload.callId
        });
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to connect avatar stream");
        }
      }
    }

    void connectAvatar();

    return () => {
      mounted = false;
      if (localCall) {
        void localCall.leave().catch(() => undefined);
      }
      if (localClient) {
        void localClient.disconnectUser().catch(() => undefined);
      }
    };
  }, [meetingId, sessionId]);

  return (
    <StreamParticipantShell
      title="HR аватар"
      footer={
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="min-h-5 truncate text-sm leading-snug text-slate-600">{participantName}</p>
            <Badge variant="secondary" className="shrink-0">
              {call ? "Connected" : "Idle"}
            </Badge>
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            Один Stream call с кандидатом: общий <code className="rounded bg-white/40 px-1">meetingId</code>.
          </p>
        </>
      }
      error={error ? <p className="w-full rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
    >
      {client && call ? (
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
        <div className="flex h-full items-center justify-center text-sm text-slate-400">Ожидание подключения HR-аватара</div>
      )}
    </StreamParticipantShell>
  );
}
