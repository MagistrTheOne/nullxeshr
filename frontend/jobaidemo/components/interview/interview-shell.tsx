"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useInterviewSession } from "@/hooks/use-interview-session";
import { getInterviewById, getJobAiSourceStatus, listInterviews, type InterviewDetail, type InterviewListRow, type JobAiSourceStatus } from "@/lib/api";
import { AvatarStreamCard } from "./avatar-stream-card";
import { AvatarScriptCard } from "./avatar-script-card";
import { CandidateStreamCard } from "./candidate-stream-card";
import { InterviewsTablePreview } from "./interviews-table-preview";
import { JobAiSourceCard } from "./jobai-source-card";
import { MeetingHeader } from "./meeting-header";
import { ParticipantCard } from "./participant-card";

export function InterviewShell() {
  const searchParams = useSearchParams();
  const { start, stop, markFailed, meetingId, sessionId, statusLabel, phase, error, remoteAudioStream } =
    useInterviewSession();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [origin, setOrigin] = useState("");
  const [rows, setRows] = useState<InterviewListRow[]>([]);
  const [sourceStatus, setSourceStatus] = useState<JobAiSourceStatus | null>(null);
  const [selectedInterviewId, setSelectedInterviewId] = useState<number | null>(null);
  const [selectedInterviewDetail, setSelectedInterviewDetail] = useState<InterviewDetail | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);

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
    const raw = searchParams.get("jobAiId");
    if (!raw) {
      return;
    }
    const id = Number(raw);
    if (Number.isInteger(id) && id > 0) {
      setSelectedInterviewId(id);
    }
  }, [searchParams]);

  const selectedRow = useMemo(
    () => rows.find((entry) => entry.jobAiId === selectedInterviewId) ?? null,
    [rows, selectedInterviewId]
  );

  const loadInterviews = useCallback(async () => {
    setLoadingRows(true);
    setRowsError(null);
    try {
      const [list, source] = await Promise.all([
        listInterviews({ skip: 0, take: 20, sync: true }),
        getJobAiSourceStatus()
      ]);
      setRows(list.interviews);
      setSourceStatus(source);
      setSelectedInterviewId((current) => {
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
  }, []);

  const loadInterviewDetail = useCallback(async (jobAiId: number) => {
    try {
      const detail = await getInterviewById(jobAiId);
      setSelectedInterviewDetail(detail);
    } catch (detailError) {
      setRowsError(detailError instanceof Error ? detailError.message : "Failed to load interview details");
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
    void loadInterviewDetail(selectedInterviewId);
  }, [loadInterviewDetail, selectedInterviewId]);

  return (
    <div className="min-h-screen w-full bg-[#dfe4ec] px-6 py-8 md:px-10">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-8">
        <MeetingHeader
          statusLabel={statusLabel}
          meetingId={meetingId}
          sessionId={sessionId}
          jobAiId={selectedRow?.jobAiId}
          companyName={selectedRow?.companyName}
          meetingAt={selectedRow?.meetingAt}
          prototypeEntryUrl={
            selectedRow && origin ? `${origin}${selectedRow.candidateEntryPath}` : undefined
          }
          onStart={() => {
            void start({
              triggerSource: "manual_debug_button",
              interviewId: selectedRow?.jobAiId,
              meetingAt: selectedRow?.meetingAt,
              bypassMeetingAtGuard: true
            });
          }}
          onStop={() => {
            void stop({ interviewId: selectedRow?.jobAiId });
          }}
          onFail={markFailed}
          startDisabled={phase === "connected" || busy}
          stopDisabled={phase === "idle" || busy}
          failDisabled={phase === "idle" || busy}
        />

        {error ? (
          <p className="rounded-xl bg-rose-100 px-4 py-2 text-sm text-rose-700 shadow-sm">{error}</p>
        ) : null}

        <main className="mt-2 grid grid-cols-1 gap-8 lg:grid-cols-3">
          <CandidateStreamCard
            meetingId={meetingId}
            sessionId={sessionId}
            participantName="Мезенцев Денис Петрович"
            interviewId={selectedRow?.jobAiId}
            meetingAt={selectedRow?.meetingAt}
            onEnsureInterviewStart={start}
          />
          <AvatarStreamCard meetingId={meetingId} sessionId={sessionId} participantName="HR Avatar" />
          <ParticipantCard roleLabel="Наблюдатель" participantName=" " placeholder />
        </main>
        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <JobAiSourceCard sourceStatus={sourceStatus} />
          </div>
          <div className="lg:col-span-2">
            <AvatarScriptCard
              title={selectedInterviewDetail?.interview.jobTitle}
              greetingSpeech={
                (selectedInterviewDetail?.interview.greetingSpeechResolved as string | undefined) ??
                selectedInterviewDetail?.interview.greetingSpeech
              }
              finalSpeech={
                (selectedInterviewDetail?.interview.finalSpeechResolved as string | undefined) ??
                selectedInterviewDetail?.interview.finalSpeech
              }
              questions={selectedInterviewDetail?.interview.specialty?.questions}
            />
          </div>
        </section>
        <InterviewsTablePreview
          rows={rows}
          selectedInterviewId={selectedInterviewId}
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
