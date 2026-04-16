"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { StreamVideoClient } from "@stream-io/video-react-sdk";
import { useInterviewSession, type InterviewStartContext } from "@/hooks/use-interview-session";
import {
  getInterviewById,
  listInterviews,
  type InterviewDetail,
  type InterviewListRow
} from "@/lib/api";
import { AvatarStreamCard } from "./avatar-stream-card";
import { CandidateStreamCard } from "./candidate-stream-card";
import { InterviewsTablePreview } from "./interviews-table-preview";
import { MeetingHeader } from "./meeting-header";
import { ParticipantCard } from "./participant-card";

const HARD_CONTEXT_GUARD_ENABLED = process.env.NEXT_PUBLIC_INTERVIEW_HARD_GUARD === "1";
const SHOW_INTERNAL_DEBUG_UI = process.env.NEXT_PUBLIC_INTERNAL_DEBUG_UI === "1";

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
    statusLabel,
    phase,
    error,
    remoteAudioStream,
    setObserverTalkIsolation
  } =
    useInterviewSession();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [origin, setOrigin] = useState("");
  const [rows, setRows] = useState<InterviewListRow[]>([]);
  const [selectedInterviewId, setSelectedInterviewId] = useState<number | null>(null);
  const [selectedInterviewDetail, setSelectedInterviewDetail] = useState<InterviewDetail | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [rowsWarning, setRowsWarning] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [sharedStreamClient, setSharedStreamClient] = useState<StreamVideoClient | null>(null);
  const [sharedStreamCall, setSharedStreamCall] = useState<ReturnType<StreamVideoClient["call"]> | null>(null);

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

  const selectedRow = useMemo(
    () => rows.find((entry) => entry.jobAiId === selectedInterviewId) ?? null,
    [rows, selectedInterviewId]
  );

  const selectedInterviewDetailMatched = useMemo(() => {
    if (!selectedInterviewDetail || !selectedInterviewId) {
      return null;
    }
    return selectedInterviewDetail.interview.id === selectedInterviewId ? selectedInterviewDetail : null;
  }, [selectedInterviewDetail, selectedInterviewId]);

  const candidateFio = useMemo(() => {
    const sourceFullName = selectedInterviewDetailMatched?.prototypeCandidate?.sourceFullName?.trim();
    if (sourceFullName) {
      return sourceFullName;
    }
    const fromRow = [selectedRow?.candidateFirstName, selectedRow?.candidateLastName].filter(Boolean).join(" ").trim();
    if (fromRow) {
      return fromRow;
    }
    const fromInterview = [
      selectedInterviewDetailMatched?.interview.candidateFirstName,
      selectedInterviewDetailMatched?.interview.candidateLastName
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
    return fromInterview;
  }, [selectedInterviewDetailMatched, selectedRow]);

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

  useEffect(() => {
    if (phase !== "connected") {
      return;
    }
    void setObserverTalkIsolation(false);
  }, [phase, setObserverTalkIsolation]);

  return (
    <div className="min-h-screen w-full bg-[#dfe4ec] px-4 py-6 sm:px-6 sm:py-8 md:px-10">
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
          showDebugActions={SHOW_INTERNAL_DEBUG_UI}
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
        {selectedRow && !contextHardReady ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 shadow-sm">
            {HARD_CONTEXT_GUARD_ENABLED
              ? "Start Session заблокирован: для безопасного запуска агента нужны кандидат, должность, текст вакансии, компания и вопросы из JobAI."
              : "Внимание: контекст интервью неполный (кандидат/должность/текст вакансии/компания/вопросы)."}
          </p>
        ) : null}
        {SHOW_INTERNAL_DEBUG_UI ? (
          <section className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-700 shadow-sm">
              <p className="font-medium text-slate-800">Сигнал HR-аватара</p>
              <p className="mt-1">{avatarReady ? "avatar_ready получен" : "avatar_ready пока не получен"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-700 shadow-sm">
              <p className="font-medium text-slate-800">Контекст для агента</p>
              <p className="mt-1">
                {contextReadiness.candidateReady ? "✅" : "⬜"} Кандидат ·{" "}
                {contextReadiness.jobTitleReady ? "✅" : "⬜"} Должность ·{" "}
                {contextReadiness.vacancyTextReady ? "✅" : "⬜"} Вакансия ·{" "}
                {contextReadiness.companyReady ? "✅" : "⬜"} Компания ·{" "}
                {contextReadiness.questionsReady ? "✅" : "⬜"} Вопросы ({contextReadiness.questionsCount})
              </p>
            </div>
          </section>
        ) : null}

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
            showControls={SHOW_INTERNAL_DEBUG_UI}
          />
          <AvatarStreamCard
            participantName="HR Avatar"
            enabled={phase === "connected"}
            avatarReady={avatarReady}
            sharedClient={sharedStreamClient}
            sharedCall={sharedStreamCall}
            showControls={SHOW_INTERNAL_DEBUG_UI}
          />
          <ParticipantCard roleLabel="Наблюдатель" participantName="Временно на паузе" placeholder showControls={false} />
        </main>
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
