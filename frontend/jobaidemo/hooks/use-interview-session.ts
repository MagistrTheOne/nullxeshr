"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  failMeeting,
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

type StartOptions = {
  triggerSource?: string;
  interviewId?: number;
  meetingAt?: string;
  bypassMeetingAtGuard?: boolean;
};

export function useInterviewSession() {
  const [phase, setPhase] = useState<InterviewPhase>("idle");
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rtcState, setRtcState] = useState<WebRtcConnectionState>("idle");
  const [remoteAudioStream, setRemoteAudioStream] = useState<MediaStream | null>(null);

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

    setPhase("starting");
    setError(null);

    try {
      await startMeeting({
        internalMeetingId,
        triggerSource,
        metadata: {
          source: "jobaidemo",
          jobAiInterviewId: options?.interviewId
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
          await updateInterviewStatus(options.interviewId, "in_meeting" satisfies JobAiInterviewStatus);
        } catch (statusError) {
          setError(statusError instanceof Error ? statusError.message : "Failed to update JobAI status");
        }
      }

      await rtc.postEvent({
        type: "conversation.item.create",
        source: "frontend",
        message: "session_started"
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
      const rtc = ensureClient();
      await rtc.postEvent({
        type: "session.update",
        source: "frontend",
        message: "session_stopping"
      });

      await stopMeeting(meetingId, {
        reason: "manual_stop",
        finalStatus: "completed"
      });

      if (options?.interviewId) {
        try {
          await updateInterviewStatus(options.interviewId, "completed" satisfies JobAiInterviewStatus);
        } catch (statusError) {
          setError(statusError instanceof Error ? statusError.message : "Failed to update JobAI status");
        }
      }
      rtc.close();
      setMeetingId(null);
      setSessionId(null);
      setPhase("idle");
    } catch (err) {
      setPhase("failed");
      setError(err instanceof Error ? err.message : "Failed to stop session");
    }
  }, [ensureClient, meetingId]);

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
    rtcState,
    error,
    remoteAudioStream,
    start,
    stop,
    markFailed
  };
}
