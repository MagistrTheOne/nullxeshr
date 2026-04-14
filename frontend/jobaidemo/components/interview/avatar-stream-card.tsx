"use client";

import { useEffect, useState } from "react";
import { CallingState, SpeakerLayout, StreamCall, StreamTheme, StreamVideo, StreamVideoClient, useCallStateHooks } from "@stream-io/video-react-sdk";
import { sendRealtimeEvent } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
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
    <section className="flex w-full flex-col items-center gap-4">
      <h3 className="text-[30px] font-medium text-slate-600">HR аватар</h3>
      <Card className="w-full rounded-2xl border-0 bg-[#d9dee7] p-3 shadow-[-8px_-8px_16px_rgba(255,255,255,.9),8px_8px_18px_rgba(163,177,198,.55)]">
        <CardContent className="space-y-3 p-2">
          <div className="h-[260px] overflow-hidden rounded-xl border border-white/50 bg-[#d0d6e0]">
            {client && call ? (
              <StreamVideo client={client}>
                <StreamTheme>
                  <StreamCall call={call}>
                    <AvatarCallBody />
                  </StreamCall>
                </StreamTheme>
              </StreamVideo>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">HR avatar standby</div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm text-slate-600">{participantName}</p>
            <Badge variant="secondary">{call ? "Connected" : "Idle"}</Badge>
          </div>
        </CardContent>
      </Card>
      {error ? <p className="w-full rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
