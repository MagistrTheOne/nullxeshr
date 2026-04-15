"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CallingState,
  PaginatedGridLayout,
  StreamCall,
  StreamTheme,
  StreamVideo,
  StreamVideoClient,
  useCallStateHooks
} from "@stream-io/video-react-sdk";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import { getInterviewById, type InterviewDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StreamParticipantShell } from "@/components/interview/stream-participant-shell";
import {
  getObserverControlState,
  subscribeObserverControlState,
  type ObserverControlState
} from "@/lib/observer-control";

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

function CallGridBody() {
  const { useCallCallingState } = useCallStateHooks();
  const state = useCallCallingState();

  if (state !== CallingState.JOINED && state !== CallingState.JOINING) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-500">Stream is not connected</div>;
  }

  return <PaginatedGridLayout />;
}

function StreamViewport({
  client,
  call,
  emptyLabel
}: {
  client: StreamVideoClient | null;
  call: ReturnType<StreamVideoClient["call"]> | null;
  emptyLabel: string;
}) {
  if (!client || !call) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">{emptyLabel}</div>;
  }

  return (
    <div className="h-full w-full">
      <StreamVideo client={client}>
        <StreamTheme>
          <StreamCall call={call}>
            <CallGridBody />
          </StreamCall>
        </StreamTheme>
      </StreamVideo>
    </div>
  );
}

function SpectatorBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawJobAiId = searchParams.get("jobAiId");
  const jobAiId = useMemo(() => {
    if (!rawJobAiId) return null;
    const parsed = Number(rawJobAiId);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [rawJobAiId]);
  const [detail, setDetail] = useState<InterviewDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<ReturnType<StreamVideoClient["call"]> | null>(null);
  const [micEnabled, setMicEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [observerControl, setObserverControl] = useState<ObserverControlState>(() => ({
    visibility: "hidden",
    talk: "off",
    updatedAt: ""
  }));
  const autoJoinAttemptForRef = useRef<string | null>(null);

  const loadInterviewDetail = useCallback(async () => {
    if (!jobAiId) {
      setDetail(null);
      setLoadError("Укажите корректный jobAiId в URL.");
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const result = await getInterviewById(jobAiId, true);
      setDetail(result);
    } catch (err) {
      setDetail(null);
      setLoadError(err instanceof Error ? err.message : "Не удалось загрузить интервью.");
    } finally {
      setLoading(false);
    }
  }, [jobAiId]);

  useEffect(() => {
    void loadInterviewDetail();
  }, [loadInterviewDetail]);

  useEffect(() => {
    setObserverControl(getObserverControlState(jobAiId));
    return subscribeObserverControlState(jobAiId, (next) => {
      setObserverControl(next);
    });
  }, [jobAiId]);

  useEffect(() => {
    if (!jobAiId) return;
    const timer = setInterval(() => {
      void loadInterviewDetail();
    }, 3000);
    return () => clearInterval(timer);
  }, [jobAiId, loadInterviewDetail]);

  const meetingId = detail?.projection.nullxesMeetingId ?? null;
  const sessionId = detail?.projection.sessionId ?? null;
  const participantName =
    [detail?.interview.candidateFirstName, detail?.interview.candidateLastName].filter(Boolean).join(" ").trim() ||
    "Кандидат";

  const startSpectatorStream = useCallback(async () => {
    if (!meetingId) {
      setStreamError("Сессия ещё не стартовала: nullxesMeetingId отсутствует.");
      return;
    }
    setBusy(true);
    setStreamError(null);
    try {
      const response = await fetch("/api/stream/token", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "spectator",
          meetingId,
          userName: `Spectator-${jobAiId ?? "guest"}`
        })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(payload.message ?? "Не удалось получить Stream token для наблюдателя.");
      }
      const payload = (await response.json()) as StreamTokenResponse;
      const streamClient = new StreamVideoClient({
        apiKey: payload.apiKey,
        token: payload.token,
        user: payload.user
      });
      const streamCall = streamClient.call(payload.callType, payload.callId);
      await streamCall.join({ create: false, video: false });
      await streamCall.microphone.disable().catch(() => undefined);
      await streamCall.camera.disable().catch(() => undefined);
      setClient(streamClient);
      setCall(streamCall);
      setMicEnabled(false);
      setCameraEnabled(false);
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : "Не удалось подключиться как наблюдатель.");
    } finally {
      setBusy(false);
    }
  }, [jobAiId, meetingId]);

  const observerVisible = observerControl.visibility === "visible";
  const observerTalkAllowed = observerVisible && observerControl.talk === "on";

  useEffect(() => {
    if (!call) {
      return;
    }
    void (async () => {
      if (!observerVisible) {
        await call.microphone.disable().catch(() => undefined);
        await call.camera.disable().catch(() => undefined);
        setMicEnabled(false);
        setCameraEnabled(false);
        return;
      }
      if (!observerTalkAllowed) {
        await call.microphone.disable().catch(() => undefined);
        setMicEnabled(false);
      }
    })();
  }, [call, observerTalkAllowed, observerVisible]);

  useEffect(() => {
    if (!meetingId || call || busy) {
      return;
    }
    if (autoJoinAttemptForRef.current === meetingId) {
      return;
    }
    autoJoinAttemptForRef.current = meetingId;
    void startSpectatorStream();
  }, [busy, call, meetingId, startSpectatorStream]);

  const leaveStream = useCallback(async () => {
    setBusy(true);
    setStreamError(null);
    try {
      if (call) {
        await call.leave();
      }
      if (client) {
        await client.disconnectUser();
      }
      setCall(null);
      setClient(null);
      setMicEnabled(false);
      setCameraEnabled(false);
      autoJoinAttemptForRef.current = null;
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : "Не удалось выйти из spectator-сессии.");
    } finally {
      setBusy(false);
    }
  }, [call, client]);

  const toggleMicrophone = useCallback(async () => {
    if (!call || busy || !observerTalkAllowed) {
      return;
    }
    try {
      await call.microphone.toggle();
      setMicEnabled((prev) => !prev);
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : "Не удалось переключить микрофон наблюдателя.");
    }
  }, [busy, call, observerTalkAllowed]);

  const toggleCamera = useCallback(async () => {
    if (!call || busy || !observerVisible) {
      return;
    }
    try {
      await call.camera.toggle();
      setCameraEnabled((prev) => !prev);
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : "Не удалось переключить камеру наблюдателя.");
    }
  }, [busy, call, observerVisible]);

  useEffect(() => {
    return () => {
      if (call) {
        void call.leave().catch(() => undefined);
      }
      if (client) {
        void client.disconnectUser().catch(() => undefined);
      }
    };
  }, [call, client]);

  return (
    <div className="min-h-screen bg-[#dfe4ec] px-6 py-10">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
        <div className="rounded-2xl border border-white/60 bg-white/70 px-5 py-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1 text-sm text-slate-700">
              <p className="text-base font-semibold text-slate-800">Режим наблюдателя</p>
              <p>
                JobAI ID: <code className="rounded bg-white/70 px-1">{jobAiId ?? "—"}</code>
                {" · "}Meeting: <code className="rounded bg-white/70 px-1">{meetingId ?? "ожидаем Start Session"}</code>
                {" · "}Session: <code className="rounded bg-white/70 px-1">{sessionId ?? "ожидаем Start Session"}</code>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{call ? "Connected" : loading ? "Loading" : "Idle"}</Badge>
              <Badge variant="secondary">{observerVisible ? "Observer visible" : "Observer hidden"}</Badge>
              <Badge variant="secondary">{observerTalkAllowed ? "Talk enabled" : "Talk disabled"}</Badge>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  router.push(jobAiId ? `/?jobAiId=${encodeURIComponent(jobAiId)}` : "/");
                }}
              >
                На главную интервью
              </Button>
            </div>
          </div>
          {loadError ? <p className="mt-3 rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-700">{loadError}</p> : null}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-stretch">
          <StreamParticipantShell
            title="Наблюдатель"
            footer={
              <>
                <p className="min-h-5 truncate text-sm leading-snug text-slate-600">
                  {observerVisible ? "Observer visible" : "Observer hidden by default"} ·{" "}
                  {observerTalkAllowed ? "talk with candidate enabled" : "talk with candidate disabled"}.
                </p>
                <div className="flex flex-wrap gap-2">
                  {!call ? (
                    <Button size="sm" onClick={startSpectatorStream} disabled={busy || !meetingId}>
                      Join Spectator
                    </Button>
                  ) : (
                    <Button size="sm" variant="destructive" onClick={leaveStream} disabled={busy}>
                      Leave
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => void loadInterviewDetail()} disabled={loading}>
                    Обновить статус
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant={micEnabled ? "secondary" : "destructive"}
                    className="size-8"
                    onClick={toggleMicrophone}
                    disabled={!call || busy || !observerTalkAllowed}
                    aria-label="Toggle spectator microphone"
                    title={observerTalkAllowed ? "Microphone" : "Observer talk is disabled in control panel"}
                  >
                    {micEnabled ? <Mic size={14} /> : <MicOff size={14} />}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant={cameraEnabled ? "secondary" : "destructive"}
                    className="size-8"
                    onClick={toggleCamera}
                    disabled={!call || busy || !observerVisible}
                    aria-label="Toggle spectator camera"
                    title={observerVisible ? "Camera" : "Observer is hidden in control panel"}
                  >
                    {cameraEnabled ? <Video size={14} /> : <VideoOff size={14} />}
                  </Button>
                </div>
                <p className="text-xs leading-relaxed text-slate-400">
                  Наблюдатель подключается к существующему call по текущему{" "}
                  <code className="rounded bg-white/50 px-1">nullxesMeetingId</code> без управления сессией кандидата.
                </p>
              </>
            }
            error={
              streamError ? <p className="w-full rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-700">{streamError}</p> : null
            }
          >
            <StreamViewport
              client={client}
              call={call}
              emptyLabel={meetingId ? "Ожидание подключения наблюдателя" : "Ожидаем Start Session на основной странице"}
            />
          </StreamParticipantShell>

          <StreamParticipantShell
            title="Кандидат"
            footer={
              <p className="text-xs leading-relaxed text-slate-500">
                Кандидат и HR-аватар показываются в том же shared call, что и на основной странице интервью.
              </p>
            }
          >
            <StreamViewport client={client} call={call} emptyLabel="Ожидание видео кандидата" />
          </StreamParticipantShell>

          <StreamParticipantShell
            title="HR аватар"
            footer={
              <p className="text-xs leading-relaxed text-slate-500">
                HR-окно наблюдателя подключено к тому же call и повторяет боевой поток интервью.
              </p>
            }
          >
            <StreamViewport client={client} call={call} emptyLabel="Ожидание видео HR-аватара" />
          </StreamParticipantShell>
        </div>

        <div className="rounded-2xl border border-white/60 bg-white/70 p-5 text-sm text-slate-700 shadow-sm">
          <p className="font-medium text-slate-800">Статус интервью</p>
          <div className="mt-3 space-y-2">
            <p>
              Кандидат:{" "}
              <span className="font-medium">
                {[detail?.interview.candidateFirstName, detail?.interview.candidateLastName].filter(Boolean).join(" ") || "—"}
              </span>
            </p>
            <p>
              Компания: <span className="font-medium">{detail?.interview.companyName || "—"}</span>
            </p>
            <p>
              Вакансия: <span className="font-medium">{detail?.interview.jobTitle || "—"}</span>
            </p>
            <p>
              Статус Nullxes: <span className="font-medium">{detail?.projection.nullxesBusinessLabel || "—"}</span>
            </p>
            <p>
              Статус JobAI: <span className="font-medium">{detail?.projection.jobAiStatus || "—"}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SpectatorPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#dfe4ec] text-slate-600">Загрузка…</div>}>
      <SpectatorBody />
    </Suspense>
  );
}
