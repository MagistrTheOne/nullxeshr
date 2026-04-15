"use client";

import { CallingState, PaginatedGridLayout, StreamCall, StreamTheme, StreamVideo, StreamVideoClient, useCallStateHooks } from "@stream-io/video-react-sdk";
import { StreamParticipantShell } from "@/components/interview/stream-participant-shell";
import { Badge } from "@/components/ui/badge";

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
};

export function AvatarStreamCard({
  participantName,
  enabled,
  avatarReady,
  sharedClient,
  sharedCall
}: AvatarStreamCardProps) {
  const canRenderAvatarWindow = enabled && avatarReady && Boolean(sharedClient && sharedCall);

  return (
    <StreamParticipantShell
      title="HR аватар"
      footer={
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="min-h-5 truncate text-sm leading-snug text-slate-600">{participantName}</p>
            <Badge variant="secondary" className="shrink-0">
              {canRenderAvatarWindow ? "Connected" : avatarReady ? "Ready" : "Idle"}
            </Badge>
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            Подключение аватара открывается только после сигнала <code className="rounded bg-white/40 px-1">avatar_ready</code>.
          </p>
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
            ? avatarReady
              ? "Ожидание Stream-call кандидата"
              : "Ожидание сигнала avatar_ready"
            : "Нажмите Start Session для подключения HR-аватара"}
        </div>
      )}
    </StreamParticipantShell>
  );
}
