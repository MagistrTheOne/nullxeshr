"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  closeRealtimeSession,
  failMeeting,
  getRealtimeSessionState,
  getInterviewById,
  linkInterviewSession,
  startMeeting,
  stopMeeting,
  updateInterviewStatus,
  type JobAiInterviewStatus
} from "@/lib/api";
import { WebRtcInterviewClient, type WebRtcConnectionState } from "@/lib/webrtc-client";

export type InterviewPhase = "idle" | "starting" | "connected" | "stopping" | "failed";
export type InterviewStartResult = {
  meetingId: string;
  sessionId: string;
};

export type InterviewStartContext = {
  candidateFirstName?: string;
  candidateLastName?: string;
  candidateFullName?: string;
  jobTitle?: string;
  vacancyText?: string;
  companyName?: string;
  greetingSpeech?: string;
  finalSpeech?: string;
  questions?: Array<{ text: string; order: number }>;
};

export type AgentContextTrace = {
  sentAt: string;
  interviewId?: number;
  meetingId: string;
  sessionId: string;
  candidateFullName?: string;
  companyName?: string;
  jobTitle?: string;
  questionsCount: number;
};

type StartOptions = {
  triggerSource?: string;
  interviewId?: number;
  meetingAt?: string;
  bypassMeetingAtGuard?: boolean;
  interviewContext?: InterviewStartContext;
};

const AVATAR_READY_EVENT_TYPES = [
  "avatar_ready",
  "avatar.ready",
  "agent.avatar.ready",
  "avatar.stream.joined"
];
const HARD_CONTEXT_GUARD_ENABLED = process.env.NEXT_PUBLIC_INTERVIEW_HARD_GUARD === "1";

function isIgnorableStatusTransitionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("interviews.status_change_not_allowed") || message.includes("status_change_failed");
}

type RequiredContextCheck = {
  candidateReady: boolean;
  companyReady: boolean;
  jobTitleReady: boolean;
  vacancyTextReady: boolean;
  questionsReady: boolean;
  questionsCount: number;
};

function evaluateRequiredContext(context?: InterviewStartContext): RequiredContextCheck {
  const candidateReady = Boolean(
    context?.candidateFullName?.trim() ||
      context?.candidateFirstName?.trim() ||
      context?.candidateLastName?.trim()
  );
  const companyReady = Boolean(context?.companyName?.trim());
  const jobTitleReady = Boolean(context?.jobTitle?.trim());
  const vacancyTextReady = Boolean(context?.vacancyText?.trim());
  const questionsCount = context?.questions?.length ?? 0;
  const questionsReady = questionsCount > 0;

  return {
    candidateReady,
    companyReady,
    jobTitleReady,
    vacancyTextReady,
    questionsReady,
    questionsCount
  };
}

function buildInterviewInstructions(context?: InterviewStartContext): string {
  const candidateFullName =
    context?.candidateFullName?.trim() ||
    [context?.candidateFirstName?.trim(), context?.candidateLastName?.trim()].filter(Boolean).join(" ").trim() ||
    "кандидат";
  const company = context?.companyName?.trim() || "компания не указана";
  const jobTitle = context?.jobTitle?.trim() || "должность не указана";
  const vacancyText = context?.vacancyText?.trim() || "";
  const greeting =
    context?.greetingSpeech?.trim() ||
    `Здравствуйте, ${candidateFullName}. Это интервью на позицию ${jobTitle} в компанию ${company}. Вы готовы пройти интервью?`;
  const finalSpeech = context?.finalSpeech?.trim() || "Спасибо за интервью.";
  const questions = (context?.questions ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((q, idx) => `${idx + 1}. ${q.text}`)
    .join("\n");

  return [
    "Ты HR-аватар для технического интервью.",
    "Никогда не представляйся именем кандидата и не говори о себе как о кандидате.",
    "Ты представитель интервьюера (HR-аватар), кандидат — это отдельный человек из контекста.",
    "Используй только контекст интервью ниже, не придумывай новые факты и не меняй компанию/должность/имя кандидата.",
    "Если кандидат спрашивает «по какому собеседованию мы проводимся?», отвечай строго из этого контекста: должность + компания + имя кандидата.",
    `Кандидат: ${candidateFullName}`,
    `Компания: ${company}`,
    `Должность: ${jobTitle}`,
    vacancyText ? `Описание вакансии: ${vacancyText}` : "Описание вакансии: не предоставлено",
    questions ? `Вопросы для интервью:\n${questions}` : "Вопросы для интервью: не предоставлены",
    `Приветствие (использовать дословно в начале): ${greeting}`,
    `Финальная фраза (использовать дословно в конце): ${finalSpeech}`,
    "Начни с приветствия и обязательно спроси: «Вы готовы пройти интервью?»"
  ].join("\n\n");
}

function buildOpeningUtterance(context?: InterviewStartContext): string {
  const candidateFullName =
    context?.candidateFullName?.trim() ||
    [context?.candidateFirstName?.trim(), context?.candidateLastName?.trim()].filter(Boolean).join(" ").trim() ||
    "кандидат";
  const company = context?.companyName?.trim() || "компания не указана";
  const jobTitle = context?.jobTitle?.trim() || "должность не указана";
  const greeting =
    context?.greetingSpeech?.trim() ||
    `Здравствуйте, ${candidateFullName}, это собеседование по вакансии ${jobTitle} в компанию ${company}.`;
  return `${greeting} Вы готовы пройти интервью?`;
}

async function transitionJobAiToInMeeting(interviewId: number): Promise<void> {
  const detail = await getInterviewById(interviewId).catch(() => null);
  const currentStatus = (detail?.projection.jobAiStatus ?? detail?.interview.status) as JobAiInterviewStatus | undefined;

  if (!currentStatus) {
    return;
  }
  if (currentStatus === "in_meeting") {
    return;
  }
  if (currentStatus === "pending") {
    await updateInterviewStatus(interviewId, "received");
    await updateInterviewStatus(interviewId, "in_meeting");
    return;
  }
  if (currentStatus === "received") {
    await updateInterviewStatus(interviewId, "in_meeting");
  }
}

async function transitionJobAiToCompleted(interviewId: number): Promise<void> {
  const detail = await getInterviewById(interviewId).catch(() => null);
  const currentStatus = (detail?.projection.jobAiStatus ?? detail?.interview.status) as JobAiInterviewStatus | undefined;

  if (!currentStatus || currentStatus === "completed") {
    return;
  }

  if (currentStatus === "pending") {
    await updateInterviewStatus(interviewId, "received");
    await updateInterviewStatus(interviewId, "in_meeting");
    await updateInterviewStatus(interviewId, "completed");
    return;
  }
  if (currentStatus === "received") {
    await updateInterviewStatus(interviewId, "in_meeting");
    await updateInterviewStatus(interviewId, "completed");
    return;
  }
  if (currentStatus === "in_meeting") {
    await updateInterviewStatus(interviewId, "completed");
  }
}

export function useInterviewSession() {
  const [phase, setPhase] = useState<InterviewPhase>("idle");
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avatarReady, setAvatarReady] = useState(false);
  const [lastAgentContextTrace, setLastAgentContextTrace] = useState<AgentContextTrace | null>(null);
  const [rtcState, setRtcState] = useState<WebRtcConnectionState>("idle");
  const [remoteAudioStream, setRemoteAudioStream] = useState<MediaStream | null>(null);
  const [agentInputEnabled, setAgentInputEnabled] = useState(true);

  const rtcRef = useRef<WebRtcInterviewClient | null>(null);

  const ensureClient = useCallback(() => {
    if (!rtcRef.current) {
      rtcRef.current = new WebRtcInterviewClient({
        onStateChange: setRtcState,
        onRemoteStream: setRemoteAudioStream
      });
    }
    return rtcRef.current;
  }, []);

  const setObserverTalkIsolation = useCallback(
    async (observerTalkActive: boolean) => {
      const rtc = ensureClient();
      const nextAgentInputEnabled = !observerTalkActive;
      rtc.setAudioInputEnabled(nextAgentInputEnabled);
      setAgentInputEnabled(nextAgentInputEnabled);

      const activeSessionId = rtc.getSessionId();
      if (!activeSessionId) {
        return;
      }
      try {
        await rtc.postEvent({
          type: "observer.agent_isolation.enforced",
          observerTalkActive,
          agentInputEnabled: nextAgentInputEnabled
        });
      } catch {
        // Ignore telemetry delivery errors; isolation is enforced locally.
      }
    },
    [ensureClient]
  );

  useEffect(() => {
    if (!sessionId || phase !== "connected") {
      setAvatarReady(false);
      return;
    }

    let cancelled = false;

    const checkAvatarReady = async () => {
      try {
        const state = await getRealtimeSessionState(sessionId);
        const counts = state.session.eventTypeCounts ?? {};
        const isReady = AVATAR_READY_EVENT_TYPES.some((type) => (counts[type] ?? 0) > 0);
        if (!cancelled) {
          setAvatarReady(isReady);
        }
      } catch {
        if (!cancelled) {
          setAvatarReady(false);
        }
      }
    };

    void checkAvatarReady();
    const timer = setInterval(() => {
      void checkAvatarReady();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [phase, sessionId]);

  const start = useCallback(async (options?: StartOptions): Promise<InterviewStartResult> => {
    if (phase === "connected" && meetingId && sessionId) {
      return { meetingId, sessionId };
    }
    if (phase === "starting") {
      throw new Error("Interview session is already starting");
    }

    const internalMeetingId = `meeting-${Date.now()}`;
    const triggerSource = options?.triggerSource ?? "frontend_manual";

    if (options?.meetingAt && !options?.bypassMeetingAtGuard) {
      const meetingTimestamp = new Date(options.meetingAt).getTime();
      if (Number.isFinite(meetingTimestamp) && Date.now() < meetingTimestamp) {
        throw new Error("Interview cannot start before meetingAt");
      }
    }

    const requiredContext = evaluateRequiredContext(options?.interviewContext);
    if (
      HARD_CONTEXT_GUARD_ENABLED &&
      (!requiredContext.candidateReady ||
        !requiredContext.companyReady ||
        !requiredContext.jobTitleReady ||
        !requiredContext.vacancyTextReady ||
        !requiredContext.questionsReady)
    ) {
      throw new Error(
        "Start Session blocked: interview context is incomplete (candidate, company, job title, vacancy text, questions)."
      );
    }

    setPhase("starting");
    setError(null);

    try {
      await startMeeting({
        internalMeetingId,
        triggerSource,
        metadata: {
          source: "jobaidemo",
          jobAiInterviewId: options?.interviewId,
          interviewContext: options?.interviewContext,
          interviewContextMeta: {
            contextVersion: "INTERVIEW_UI_CONTRACT_v1",
            hardContextGuardEnabled: HARD_CONTEXT_GUARD_ENABLED,
            hasCandidateName: requiredContext.candidateReady,
            hasJobTitle: Boolean(options?.interviewContext?.jobTitle),
            hasVacancyText: Boolean(options?.interviewContext?.vacancyText),
            hasCompanyName: Boolean(options?.interviewContext?.companyName),
            questionCount: requiredContext.questionsCount
          }
        }
      });
      setMeetingId(internalMeetingId);

      const rtc = ensureClient();
      const connected = await rtc.connect();
      setSessionId(connected.sessionId);

      if (options?.interviewId) {
        try {
          await linkInterviewSession({
            interviewId: options.interviewId,
            meetingId: internalMeetingId,
            sessionId: connected.sessionId,
            nullxesStatus: "in_meeting"
          });
          await transitionJobAiToInMeeting(options.interviewId);
        } catch (statusError) {
          if (isIgnorableStatusTransitionError(statusError)) {
            console.warn("Skipping non-critical JobAI status transition error", statusError);
          } else {
            setError(statusError instanceof Error ? statusError.message : "Failed to update JobAI status");
          }
        }
      }

      const runtimeInstructions = buildInterviewInstructions(options?.interviewContext);
      setLastAgentContextTrace({
        sentAt: new Date().toISOString(),
        interviewId: options?.interviewId,
        meetingId: internalMeetingId,
        sessionId: connected.sessionId,
        candidateFullName:
          options?.interviewContext?.candidateFullName ||
          [options?.interviewContext?.candidateFirstName, options?.interviewContext?.candidateLastName]
            .filter(Boolean)
            .join(" ")
            .trim(),
        companyName: options?.interviewContext?.companyName,
        jobTitle: options?.interviewContext?.jobTitle,
        questionsCount: options?.interviewContext?.questions?.length ?? 0
      });
      await rtc.postEvent({
        type: "session.update",
        session: {
          instructions: runtimeInstructions
        }
      });
      const openingUtterance = buildOpeningUtterance(options?.interviewContext);
      await rtc.postEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Старт интервью. Произнеси в начале дословно: "${openingUtterance}". Представляйся только как HR-аватар, не как кандидат. Затем дождись ответа кандидата.`
            }
          ]
        }
      });
      await rtc.postEvent({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          instructions: `Сейчас начни интервью и скажи дословно: "${openingUtterance}". Ты HR-аватар и не должен называть себя именем кандидата. Не упоминай другие вакансии, компании или роли.`
        }
      });

      setPhase("connected");
      return {
        meetingId: internalMeetingId,
        sessionId: connected.sessionId
      };
    } catch (err) {
      setPhase("failed");
      const startError = err instanceof Error ? err : new Error("Failed to start session");
      setError(startError.message);
      if (internalMeetingId) {
        try {
          await failMeeting(internalMeetingId, {
            status: "failed_connect_ws_audio",
            reason: "frontend_start_failed"
          });
        } catch {
          // Ignore secondary fail-notification errors in prototype.
        }
      }
      throw startError;
    }
  }, [ensureClient, meetingId, phase, sessionId]);

  const stop = useCallback(async (options?: { interviewId?: number }) => {
    if (!meetingId) {
      return;
    }

    setPhase("stopping");
    try {
      const activeMeetingId = meetingId;
      const activeSessionId = sessionId;
      const rtc = ensureClient();
      await rtc.postEvent({
        type: "session.update",
        source: "frontend",
        message: "session_stopping"
      });

      await stopMeeting(activeMeetingId, {
        reason: "manual_stop",
        finalStatus: "completed"
      });

      if (options?.interviewId) {
        try {
          await transitionJobAiToCompleted(options.interviewId);
          await linkInterviewSession({
            interviewId: options.interviewId,
            meetingId: activeMeetingId,
            sessionId: activeSessionId ?? undefined,
            nullxesStatus: "completed"
          });
        } catch (statusError) {
          if (isIgnorableStatusTransitionError(statusError)) {
            console.warn("Skipping non-critical JobAI status transition error", statusError);
          } else {
            setError(statusError instanceof Error ? statusError.message : "Failed to update JobAI status");
          }
        }
      }
      rtc.close();
      if (activeSessionId) {
        await closeRealtimeSession(activeSessionId).catch(() => undefined);
      }
      setMeetingId(null);
      setSessionId(null);
      setAvatarReady(false);
      setAgentInputEnabled(true);
      setPhase("idle");
    } catch (err) {
      setPhase("failed");
      setError(err instanceof Error ? err.message : "Failed to stop session");
    }
  }, [ensureClient, meetingId, sessionId]);

  const markFailed = useCallback(async () => {
    if (!meetingId) {
      return;
    }
    await failMeeting(meetingId, {
      status: "failed_connect_ws_audio",
      reason: "manual_mark_failed"
    });
    setPhase("failed");
  }, [meetingId]);

  const statusLabel = useMemo(() => {
    if (phase === "idle") return "Idle";
    if (phase === "starting") return "Starting";
    if (phase === "connected") return "Connected";
    if (phase === "stopping") return "Stopping";
    return "Failed";
  }, [phase]);

  return {
    phase,
    statusLabel,
    meetingId,
    sessionId,
    avatarReady,
    lastAgentContextTrace,
    rtcState,
    error,
    remoteAudioStream,
    agentInputEnabled,
    start,
    stop,
    markFailed,
    setObserverTalkIsolation
  };
}
