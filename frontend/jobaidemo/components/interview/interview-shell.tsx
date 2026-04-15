"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { StreamVideoClient } from "@stream-io/video-react-sdk";
import { useInterviewSession, type InterviewStartContext } from "@/hooks/use-interview-session";
import {
  getInterviewById,
  getJobAiSourceStatus,
  listInterviews,
  savePrototypeCandidateFio,
  sendRealtimeEvent,
  type InterviewDetail,
  type InterviewListRow,
  type JobAiSourceStatus
} from "@/lib/api";
import { AvatarStreamCard } from "./avatar-stream-card";
import { AvatarScriptCard } from "./avatar-script-card";
import { CandidateStreamCard } from "./candidate-stream-card";
import { InterviewsTablePreview } from "./interviews-table-preview";
import { JobAiSourceCard } from "./jobai-source-card";
import { MeetingHeader } from "./meeting-header";
import { ParticipantCard } from "./participant-card";
import {
  getObserverControlState,
  setObserverControlState,
  subscribeObserverControlState,
  type ObserverControlState
} from "@/lib/observer-control";

const HARD_CONTEXT_GUARD_ENABLED = process.env.NEXT_PUBLIC_INTERVIEW_HARD_GUARD === "1";

function candidateFioStorageKey(jobAiId: number | null): string {
  return jobAiId != null && jobAiId > 0 ? `jobaidemo:candidateFio:${jobAiId}` : "jobaidemo:candidateFio:default";
}

function isJobAiNotConfiguredError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("JobAI API is not configured") || message.includes("not configured");
}

function extractJobAiIdFromEntryUrl(input: string): number | null {
  const value = input.trim();
  if (!value) {
    return null;
  }

  const fromPlain = value.match(/[?&]jobAiId=(\d+)/i);
  if (fromPlain) {
    const parsed = Number(fromPlain[1]);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  try {
    const url = new URL(value, "http://localhost");
    const raw = url.searchParams.get("jobAiId");
    if (!raw) {
      return null;
    }
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function InterviewShell() {
  const searchParams = useSearchParams();
  const requestedInterviewId = useMemo(() => {
    const raw = searchParams.get("jobAiId");
    if (!raw) {
      return null;
    }
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  }, [searchParams]);
  const {
    start,
    stop,
    markFailed,
    meetingId,
    sessionId,
    avatarReady,
    lastAgentContextTrace,
    statusLabel,
    phase,
    error,
    remoteAudioStream,
    agentInputEnabled,
    setObserverTalkIsolation
  } =
    useInterviewSession();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [origin, setOrigin] = useState("");
  const [rows, setRows] = useState<InterviewListRow[]>([]);
  const [sourceStatus, setSourceStatus] = useState<JobAiSourceStatus | null>(null);
  const [selectedInterviewId, setSelectedInterviewId] = useState<number | null>(null);
  const [selectedInterviewDetail, setSelectedInterviewDetail] = useState<InterviewDetail | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [rowsWarning, setRowsWarning] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [candidateFio, setCandidateFio] = useState("");
  const skipNextFioPersist = useRef(false);
  const candidateFioRef = useRef("");
  const fioSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userEditedFio = useRef(false);
  const hydratedServerFioFor = useRef<number | null>(null);
  const [fioSyncError, setFioSyncError] = useState<string | null>(null);
  const [sharedStreamClient, setSharedStreamClient] = useState<StreamVideoClient | null>(null);
  const [sharedStreamCall, setSharedStreamCall] = useState<ReturnType<StreamVideoClient["call"]> | null>(null);
  const [observerControl, setObserverControl] = useState<ObserverControlState>(() => ({
    visibility: "hidden",
    talk: "off",
    updatedAt: ""
  }));

  const handleSharedCallChange = useCallback(
    ({
      client,
      call
    }: {
      client: StreamVideoClient | null;
      call: ReturnType<StreamVideoClient["call"]> | null;
    }) => {
      setSharedStreamClient(client);
      setSharedStreamCall(call);
    },
    []
  );

  candidateFioRef.current = candidateFio;

  useEffect(() => {
    if (!audioRef.current) {
      return;
    }
    audioRef.current.srcObject = remoteAudioStream;
  }, [remoteAudioStream]);

  const busy = phase === "starting" || phase === "stopping";

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  useEffect(() => {
    if (!requestedInterviewId) {
      return;
    }
    setSelectedInterviewId(requestedInterviewId);
  }, [requestedInterviewId]);

  useEffect(() => {
    const initial = getObserverControlState(selectedInterviewId);
    setObserverControl(initial);
    return subscribeObserverControlState(selectedInterviewId, (next) => {
      setObserverControl(next);
    });
  }, [selectedInterviewId]);

  useEffect(() => {
    userEditedFio.current = false;
    hydratedServerFioFor.current = null;
    setFioSyncError(null);
  }, [selectedInterviewId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const key = candidateFioStorageKey(selectedInterviewId);
    skipNextFioPersist.current = true;
    setCandidateFio(sessionStorage.getItem(key) ?? "");
  }, [selectedInterviewId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (skipNextFioPersist.current) {
      skipNextFioPersist.current = false;
      return;
    }
    const key = candidateFioStorageKey(selectedInterviewId);
    sessionStorage.setItem(key, candidateFio);
  }, [candidateFio, selectedInterviewId]);

  const selectedRow = useMemo(
    () => rows.find((entry) => entry.jobAiId === selectedInterviewId) ?? null,
    [rows, selectedInterviewId]
  );

  const observerVisible = observerControl.visibility === "visible";
  const observerTalkActive = observerVisible && observerControl.talk === "on";

  const selectedInterviewDetailMatched = useMemo(() => {
    if (!selectedInterviewDetail || !selectedInterviewId) {
      return null;
    }
    return selectedInterviewDetail.interview.id === selectedInterviewId ? selectedInterviewDetail : null;
  }, [selectedInterviewDetail, selectedInterviewId]);

  const interviewStartContext = useMemo<InterviewStartContext | undefined>(() => {
    if (!selectedRow && !selectedInterviewDetailMatched) {
      return undefined;
    }
    const first =
      candidateFio.trim() ||
      selectedRow?.candidateFirstName ||
      selectedInterviewDetailMatched?.interview.candidateFirstName ||
      "";
    const last = selectedRow?.candidateLastName || selectedInterviewDetailMatched?.interview.candidateLastName || "";
    const full = candidateFio.trim() || [first, last].filter(Boolean).join(" ").trim();
    return {
      candidateFirstName: first || undefined,
      candidateLastName: last || undefined,
      candidateFullName: full || undefined,
      jobTitle: selectedInterviewDetailMatched?.interview.jobTitle,
      vacancyText: selectedInterviewDetailMatched?.interview.vacancyText,
      companyName: selectedRow?.companyName || selectedInterviewDetailMatched?.interview.companyName,
      greetingSpeech:
        (selectedInterviewDetailMatched?.interview.greetingSpeechResolved as string | undefined) ??
        selectedInterviewDetailMatched?.interview.greetingSpeech,
      finalSpeech:
        (selectedInterviewDetailMatched?.interview.finalSpeechResolved as string | undefined) ??
        selectedInterviewDetailMatched?.interview.finalSpeech,
      questions: selectedInterviewDetailMatched?.interview.specialty?.questions
    };
  }, [candidateFio, selectedInterviewDetailMatched, selectedRow]);

  const contextReadiness = useMemo(() => {
    const candidateReady = Boolean(
      interviewStartContext?.candidateFullName?.trim() ||
        interviewStartContext?.candidateFirstName?.trim() ||
        interviewStartContext?.candidateLastName?.trim()
    );
    const jobTitleReady = Boolean(interviewStartContext?.jobTitle?.trim());
    const vacancyTextReady = Boolean(interviewStartContext?.vacancyText?.trim());
    const companyReady = Boolean(interviewStartContext?.companyName?.trim());
    const questionsCount = interviewStartContext?.questions?.length ?? 0;
    const questionsReady = questionsCount > 0;
    return {
      candidateReady,
      jobTitleReady,
      vacancyTextReady,
      companyReady,
      questionsReady,
      questionsCount
    };
  }, [interviewStartContext]);

  const contextHardReady =
    contextReadiness.candidateReady &&
    contextReadiness.jobTitleReady &&
    contextReadiness.vacancyTextReady &&
    contextReadiness.companyReady &&
    contextReadiness.questionsReady;

  const duplicateJobAiIds = useMemo(() => {
    const byFingerprint = new Map<string, number[]>();
    for (const row of rows) {
      const key = [
        row.candidateFirstName.trim().toLowerCase(),
        row.candidateLastName.trim().toLowerCase(),
        row.companyName.trim().toLowerCase(),
        new Date(row.meetingAt).toISOString()
      ].join("|");
      const bucket = byFingerprint.get(key) ?? [];
      bucket.push(row.jobAiId);
      byFingerprint.set(key, bucket);
    }
    return Array.from(byFingerprint.values())
      .filter((ids) => ids.length > 1)
      .flat();
  }, [rows]);

  const loadInterviews = useCallback(async () => {
    setLoadingRows(true);
    setRowsError(null);
    setRowsWarning(null);
    try {
      try {
        const source = await getJobAiSourceStatus();
        setSourceStatus(source);
      } catch (sourceErr) {
        setSourceStatus(null);
        setRowsWarning(
          sourceErr instanceof Error ? sourceErr.message : "Не удалось получить статус интеграции JobAI"
        );
      }

      let list: { interviews: InterviewListRow[]; count: number };
      try {
        list = await listInterviews({ skip: 0, take: 20, sync: true });
      } catch (syncErr) {
        if (isJobAiNotConfiguredError(syncErr)) {
          setRowsWarning(
            "JobAI API не настроен на gateway — загрузка списка без синхронизации (только локальный кэш). Укажите JOBAI_* в .env бэкенда для GET/POST по Swagger."
          );
          list = await listInterviews({ skip: 0, take: 20, sync: false });
        } else {
          throw syncErr;
        }
      }

      setRows(list.interviews);
      setSelectedInterviewId((current) => {
        if (requestedInterviewId && list.interviews.some((item) => item.jobAiId === requestedInterviewId)) {
          return requestedInterviewId;
        }
        if (current && list.interviews.some((item) => item.jobAiId === current)) {
          return current;
        }
        return list.interviews[0]?.jobAiId ?? null;
      });
    } catch (loadError) {
      setRowsError(loadError instanceof Error ? loadError.message : "Failed to load interviews");
    } finally {
      setLoadingRows(false);
    }
  }, [requestedInterviewId]);

  const loadInterviewDetail = useCallback(async (jobAiId: number, forceSync = false) => {
    setDetailError(null);
    try {
      const detail = await getInterviewById(jobAiId, forceSync);
      setSelectedInterviewDetail(detail);
    } catch (detailErr) {
      const message = detailErr instanceof Error ? detailErr.message : "Failed to load interview details";
      if (!forceSync && message.includes("interviews.not_found")) {
        try {
          const synced = await getInterviewById(jobAiId, true);
          setSelectedInterviewDetail(synced);
          setDetailError(null);
          return;
        } catch {
          // Fall through to soft error handling below.
        }
      }
      setSelectedInterviewDetail(null);
      setDetailError(message);
    }
  }, []);

  useEffect(() => {
    void loadInterviews();
  }, [loadInterviews]);

  useEffect(() => {
    if (!selectedInterviewId) {
      setSelectedInterviewDetail(null);
      return;
    }
    const hasRowInList = rows.some((entry) => entry.jobAiId === selectedInterviewId);
    void loadInterviewDetail(selectedInterviewId, !hasRowInList);
  }, [loadInterviewDetail, rows, selectedInterviewId]);

  useEffect(() => {
    if (!selectedInterviewId || !selectedInterviewDetailMatched) {
      return;
    }
    if (hydratedServerFioFor.current === selectedInterviewId) {
      return;
    }
    const serverFio = selectedInterviewDetailMatched.prototypeCandidate?.sourceFullName?.trim();
    const fallbackFromInterview = [
      selectedInterviewDetailMatched.interview.candidateFirstName?.trim(),
      selectedInterviewDetailMatched.interview.candidateLastName?.trim()
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
    const nextFio =
      serverFio ||
      (!userEditedFio.current && !candidateFioRef.current.trim() ? fallbackFromInterview : "");

    if (nextFio) {
      skipNextFioPersist.current = true;
      setCandidateFio(nextFio);
      if (typeof window !== "undefined") {
        sessionStorage.setItem(candidateFioStorageKey(selectedInterviewId), nextFio);
      }
    }
    hydratedServerFioFor.current = selectedInterviewId;
  }, [selectedInterviewId, selectedInterviewDetailMatched]);

  const pushFioToGateway = useCallback(async () => {
    const id = selectedInterviewId;
    if (!id || id <= 0) {
      setFioSyncError("Выберите собеседование в таблице, затем сохраните ФИО.");
      return;
    }
    setFioSyncError(null);
    try {
      await savePrototypeCandidateFio(id, candidateFioRef.current);
      await Promise.all([loadInterviewDetail(id), loadInterviews()]);
    } catch (err) {
      setFioSyncError(err instanceof Error ? err.message : "Не удалось сохранить ФИО");
    }
  }, [loadInterviewDetail, loadInterviews, selectedInterviewId]);

  useEffect(() => {
    if (!selectedInterviewId || !userEditedFio.current) {
      return;
    }
    if (fioSaveTimer.current) {
      clearTimeout(fioSaveTimer.current);
    }
    fioSaveTimer.current = setTimeout(() => {
      fioSaveTimer.current = null;
      void pushFioToGateway();
    }, 700);
    return () => {
      if (fioSaveTimer.current) {
        clearTimeout(fioSaveTimer.current);
        fioSaveTimer.current = null;
      }
    };
  }, [candidateFio, pushFioToGateway, selectedInterviewId]);

  const flushFioSave = useCallback(() => {
    if (fioSaveTimer.current) {
      clearTimeout(fioSaveTimer.current);
      fioSaveTimer.current = null;
    }
    void pushFioToGateway();
  }, [pushFioToGateway]);

  const handleEntryUrlCommit = useCallback(
    (value: string) => {
      const parsedId = extractJobAiIdFromEntryUrl(value);
      if (!parsedId) {
        return;
      }
      const existsInRows = rows.some((entry) => entry.jobAiId === parsedId);
      setSelectedInterviewId(parsedId);
      void loadInterviewDetail(parsedId, !existsInRows);
      if (!existsInRows) {
        void loadInterviews();
      }
    },
    [loadInterviewDetail, loadInterviews, rows]
  );

  const updateObserverControl = useCallback(
    (next: Partial<ObserverControlState>) => {
      const merged: ObserverControlState = {
        visibility: next.visibility ?? observerControl.visibility,
        talk: next.talk ?? observerControl.talk,
        updatedAt: new Date().toISOString()
      };
      if (merged.visibility === "hidden") {
        merged.talk = "off";
      }
      setObserverControl(merged);
      setObserverControlState(selectedInterviewId, merged);
    },
    [observerControl.talk, observerControl.visibility, selectedInterviewId]
  );

  useEffect(() => {
    if (phase !== "connected") {
      return;
    }
    void setObserverTalkIsolation(observerTalkActive);
  }, [observerTalkActive, phase, setObserverTalkIsolation]);

  useEffect(() => {
    if (!sessionId || phase !== "connected") {
      return;
    }
    void sendRealtimeEvent(sessionId, {
      type: "observer.presence.updated",
      observerVisibility: observerControl.visibility,
      observerTalk: observerControl.talk,
      agentIsolationEnforced: true
    }).catch(() => undefined);
  }, [observerControl.talk, observerControl.visibility, phase, sessionId]);

  return (
    <div className="min-h-screen w-full bg-[#dfe4ec] px-6 py-8 md:px-10">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-10">
        <MeetingHeader
          statusLabel={statusLabel}
          meetingId={meetingId ?? selectedRow?.nullxesMeetingId ?? selectedInterviewDetail?.projection.nullxesMeetingId ?? null}
          sessionId={sessionId ?? selectedRow?.sessionId ?? selectedInterviewDetail?.projection.sessionId ?? null}
          jobAiId={selectedRow?.jobAiId}
          companyName={selectedRow?.companyName}
          meetingAt={selectedRow?.meetingAt}
          prototypeEntryUrl={
            selectedRow && origin ? `${origin}${selectedRow.candidateEntryPath}` : undefined
          }
          onEntryUrlCommit={handleEntryUrlCommit}
          candidateFio={candidateFio}
          onCandidateFioChange={(value) => {
            userEditedFio.current = true;
            setCandidateFio(value);
          }}
          onCandidateFioBlur={flushFioSave}
          onStart={() => {
            void (async () => {
              let contextForStart = interviewStartContext;
              const activeInterviewId = selectedRow?.jobAiId;
              if (
                activeInterviewId &&
                (!selectedInterviewDetailMatched ||
                  !contextForStart?.jobTitle ||
                  !contextForStart?.vacancyText ||
                  !contextForStart?.companyName ||
                  (contextForStart.questions?.length ?? 0) === 0)
              ) {
                try {
                  const syncedDetail = await getInterviewById(activeInterviewId, true);
                  setSelectedInterviewDetail(syncedDetail);
                  contextForStart = {
                    candidateFirstName: candidateFio.trim() || syncedDetail.interview.candidateFirstName,
                    candidateLastName: syncedDetail.interview.candidateLastName,
                    candidateFullName:
                      candidateFio.trim() ||
                      [syncedDetail.interview.candidateFirstName, syncedDetail.interview.candidateLastName]
                        .filter(Boolean)
                        .join(" ")
                        .trim(),
                    jobTitle: syncedDetail.interview.jobTitle,
                    vacancyText: syncedDetail.interview.vacancyText,
                    companyName: syncedDetail.interview.companyName,
                    greetingSpeech:
                      (syncedDetail.interview.greetingSpeechResolved as string | undefined) ??
                      syncedDetail.interview.greetingSpeech,
                    finalSpeech:
                      (syncedDetail.interview.finalSpeechResolved as string | undefined) ??
                      syncedDetail.interview.finalSpeech,
                    questions: syncedDetail.interview.specialty?.questions
                  };
                } catch {
                  // Keep best-effort context if force-sync fails.
                }
              }

              await start({
                triggerSource: "manual_debug_button",
                interviewId: activeInterviewId,
                meetingAt: selectedRow?.meetingAt,
                bypassMeetingAtGuard: true,
                interviewContext: contextForStart
              });
            })();
          }}
          onStop={() => {
            void stop({ interviewId: selectedRow?.jobAiId });
          }}
          onFail={markFailed}
          startDisabled={
            phase === "connected" || busy || !selectedRow || (HARD_CONTEXT_GUARD_ENABLED && !contextHardReady)
          }
          stopDisabled={phase === "idle" || busy}
          failDisabled={phase === "idle" || busy}
        />

        {error ? (
          <p className="rounded-xl bg-rose-100 px-4 py-2 text-sm text-rose-700 shadow-sm">{error}</p>
        ) : null}
        {rowsWarning ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 shadow-sm">
            {rowsWarning}
          </p>
        ) : null}
        {detailError && !selectedRow && !selectedInterviewDetail && !loadingRows ? (
          <p className="rounded-xl border border-slate-200 bg-white/70 px-4 py-2 text-sm text-slate-700 shadow-sm">
            Детали собеседования временно недоступны ({detailError}).
          </p>
        ) : null}
        {fioSyncError ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-2 text-sm text-rose-800 shadow-sm">
            {fioSyncError}
          </p>
        ) : null}
        {selectedRow && !contextHardReady ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 shadow-sm">
            {HARD_CONTEXT_GUARD_ENABLED
              ? "Start Session заблокирован: для безопасного запуска агента нужны кандидат, должность, текст вакансии, компания и вопросы из JobAI."
              : "Внимание: контекст интервью неполный (кандидат/должность/текст вакансии/компания/вопросы). Hard guard временно отключен, Start Session разрешен."}
          </p>
        ) : null}
        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-700 shadow-sm">
            <p className="font-medium text-slate-800">Сигнал HR-аватара</p>
            <p className="mt-1">
              {avatarReady
                ? "avatar_ready получен: HR-окно может подключаться боевым режимом."
                : "Ожидаем avatar_ready от agent-pipeline: боевое подключение HR заблокировано."}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-700 shadow-sm">
            <p className="font-medium text-slate-800">Контекст для агента </p>
            <p className="mt-1">
              {contextReadiness.candidateReady ? "✅" : "⬜"} Кандидат{" · "}
              {contextReadiness.jobTitleReady ? "✅" : "⬜"} Должность{" · "}
              {contextReadiness.vacancyTextReady ? "✅" : "⬜"} Текст вакансии{" · "}
              {contextReadiness.companyReady ? "✅" : "⬜"} Компания{" · "}
              {contextReadiness.questionsReady ? "✅" : "⬜"} Вопросы ({contextReadiness.questionsCount})
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-700 shadow-sm">
            <p className="font-medium text-slate-800">Debug: отправлено в агента</p>
            {lastAgentContextTrace ? (
              <p className="mt-1">
                session: <code className="rounded bg-white/60 px-1">{lastAgentContextTrace.sessionId}</code>
                {" · "}jobAiId: <code className="rounded bg-white/60 px-1">{lastAgentContextTrace.interviewId ?? "—"}</code>
                {" · "}job: <code className="rounded bg-white/60 px-1">{lastAgentContextTrace.jobTitle ?? "—"}</code>
              </p>
            ) : (
              <p className="mt-1 text-slate-500">Пока нет отправленного контекста (запустите Start Session).</p>
            )}
          </div>
        </section>
        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-700 shadow-sm">
            <p className="font-medium text-slate-800">Observer visibility</p>
            <p className="mt-1">{observerVisible ? "visible" : "hidden (default)"}</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                onClick={() => updateObserverControl({ visibility: "hidden" })}
              >
                Hide observer
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                onClick={() => updateObserverControl({ visibility: "visible" })}
              >
                Show observer
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-700 shadow-sm">
            <p className="font-medium text-slate-800">Observer talking</p>
            <p className="mt-1">
              {observerVisible ? (observerTalkActive ? "on" : "off") : "off (observer hidden)"}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                onClick={() => updateObserverControl({ talk: "off" })}
              >
                Talk off
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                onClick={() => updateObserverControl({ visibility: "visible", talk: "on" })}
                disabled={!observerVisible}
              >
                Talk on
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-700 shadow-sm">
            <p className="font-medium text-slate-800">Agent isolation</p>
            <p className="mt-1">
              enforced · uplink to agent:{" "}
              <span className="font-medium">{agentInputEnabled ? "enabled" : "blocked for observer talk"}</span>
            </p>
          </div>
        </section>

        <main className="mt-4 grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-stretch">
          <CandidateStreamCard
            meetingId={meetingId}
            sessionId={sessionId}
            participantName={candidateFio.trim() || "Кандидат"}
            interviewId={selectedRow?.jobAiId}
            meetingAt={selectedRow?.meetingAt}
            interviewContext={interviewStartContext}
            onEnsureInterviewStart={start}
            onSharedCallChange={handleSharedCallChange}
          />
          <AvatarStreamCard
            participantName="HR Avatar"
            enabled={phase === "connected"}
            avatarReady={avatarReady}
            sharedClient={sharedStreamClient}
            sharedCall={sharedStreamCall}
          />
          {observerVisible ? (
            <ParticipantCard roleLabel="Наблюдатель" participantName="Наблюдатель" placeholder />
          ) : (
            <ParticipantCard roleLabel="Наблюдатель" participantName="Observer hidden by default" placeholder showControls={false} />
          )}
        </main>
        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <JobAiSourceCard sourceStatus={sourceStatus} />
          </div>
          <div className="lg:col-span-2">
            <AvatarScriptCard
              title={selectedInterviewDetailMatched?.interview.jobTitle}
              greetingSpeech={
                (selectedInterviewDetailMatched?.interview.greetingSpeechResolved as string | undefined) ??
                selectedInterviewDetailMatched?.interview.greetingSpeech
              }
              finalSpeech={
                (selectedInterviewDetailMatched?.interview.finalSpeechResolved as string | undefined) ??
                selectedInterviewDetailMatched?.interview.finalSpeech
              }
              questions={selectedInterviewDetailMatched?.interview.specialty?.questions}
            />
          </div>
        </section>
        <InterviewsTablePreview
          rows={rows}
          selectedInterviewId={selectedInterviewId}
          duplicateJobAiIds={duplicateJobAiIds}
          loading={loadingRows}
          error={rowsError}
          onRefresh={() => {
            void loadInterviews();
          }}
          onSelect={(row) => {
            setSelectedInterviewId(row.jobAiId);
          }}
        />
        <audio ref={audioRef} autoPlay />
      </div>
    </div>
  );
}
