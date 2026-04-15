export type SessionTokenResponse = {
  sessionId: string;
  token: string;
  expiresAt?: number;
  session: Record<string, unknown>;
};

export type RealtimeSessionState = {
  session: {
    id: string;
    status: "starting" | "active" | "closing" | "closed" | "error";
    createdAt: number;
    updatedAt: number;
    lastActivityAt: number;
    closedAt?: number;
    remoteCallId?: string;
    lastError?: string;
    eventCount: number;
    eventTypeCounts: Record<string, number>;
  };
};

export type StartMeetingInput = {
  internalMeetingId: string;
  triggerSource: string;
  metadata?: Record<string, unknown>;
  sessionId?: string;
};

export type StopMeetingInput = {
  reason: "manual_stop" | "superseded_by_other_meeting" | "error";
  finalStatus?: "stopped_during_meeting" | "completed";
  metadata?: Record<string, unknown>;
};

export type FailMeetingInput = {
  status: "failed_audio_pool_busy" | "failed_connect_ws_audio";
  reason: string;
  metadata?: Record<string, unknown>;
};

export type JobAiInterviewStatus =
  | "pending"
  | "received"
  | "in_meeting"
  | "completed"
  | "stopped_during_meeting"
  | "canceled"
  | "meeting_not_started";

export type NullxesRuntimeStatus = "idle" | "in_meeting" | "completed" | "stopped_during_meeting" | "failed";

export type NullxesBusinessKey =
  | "awaiting_registration"
  | "accepted_by_ai"
  | "meeting_in_progress"
  | "canceled"
  | "stopped_mid_meeting"
  | "completed"
  | "start_error";

export type InterviewListRow = {
  jobAiId: number;
  nullxesMeetingId?: string;
  sessionId?: string;
  candidateFirstName: string;
  candidateLastName: string;
  candidateEntryPath: string;
  spectatorEntryPath: string;
  nullxesBusinessKey: NullxesBusinessKey;
  nullxesBusinessLabel: string;
  companyName: string;
  meetingAt: string;
  jobAiStatus: JobAiInterviewStatus;
  nullxesStatus: NullxesRuntimeStatus;
  updatedAt: string;
  statusChangedAt?: string;
  createdAt: string;
  greetingSpeechResolved?: string;
  finalSpeechResolved?: string;
};

export type PrototypeCandidatePayload = {
  candidateFirstName: string;
  candidateLastName: string;
  sourceFullName: string;
  updatedAt: string;
};

export type InterviewDetail = {
  interview: Record<string, unknown> & {
    id: number;
    jobTitle: string;
    vacancyText?: string;
    status: JobAiInterviewStatus;
    candidateFirstName: string;
    candidateLastName: string;
    companyName: string;
    meetingAt: string;
    greetingSpeech?: string;
    finalSpeech?: string;
    greetingSpeechResolved?: string;
    finalSpeechResolved?: string;
    specialty?: {
      id: number;
      name: string;
      questions?: Array<{ text: string; order: number }>;
    };
  };
  projection: InterviewListRow;
  /** ФИО из прототипа, сохранённые на gateway (raw JobAI не меняются). */
  prototypeCandidate?: PrototypeCandidatePayload | null;
};

export type JobAiSourceStatus = {
  endpoints: Array<{ endpoint: string; status: "active" | "queued" | "disabled" }>;
  sync: {
    lastSyncAt: string | null;
    lastSyncResult: "idle" | "success" | "error";
    lastSyncError: string | null;
    storedCount: number;
  };
};

type JsonRecord = Record<string, unknown>;

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/gateway/${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const payload = (await response.json()) as JsonRecord;
  if (!response.ok) {
    const message =
      typeof payload.message === "string"
        ? payload.message
        : typeof payload.error === "string"
          ? payload.error
          : "Request failed";
    throw new Error(message);
  }

  return payload as T;
}

export async function getRealtimeToken(): Promise<SessionTokenResponse> {
  return requestJson<SessionTokenResponse>("realtime/token", { method: "GET" });
}

export async function createRealtimeSession(offerSdp: string): Promise<{ answerSdp: string; sessionId?: string }> {
  const response = await fetch("/api/gateway/realtime/session", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/sdp"
    },
    body: offerSdp
  });

  const answerSdp = await response.text();
  if (!response.ok) {
    try {
      const json = JSON.parse(answerSdp) as JsonRecord;
      throw new Error(typeof json.message === "string" ? json.message : "Realtime session failed");
    } catch {
      throw new Error("Realtime session failed");
    }
  }

  return {
    answerSdp,
    sessionId: response.headers.get("x-session-id") ?? undefined
  };
}

export async function sendRealtimeEvent(
  sessionId: string,
  payload: Record<string, unknown>
): Promise<{ status: string; eventType?: string }> {
  return requestJson<{ status: string; eventType?: string }>(`realtime/session/${sessionId}/events`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getRealtimeSessionState(sessionId: string): Promise<RealtimeSessionState> {
  return requestJson<RealtimeSessionState>(`realtime/session/${sessionId}`, { method: "GET" });
}

export async function closeRealtimeSession(sessionId: string): Promise<void> {
  await fetch(`/api/gateway/realtime/session/${sessionId}`, {
    method: "DELETE",
    credentials: "include"
  });
}

export async function startMeeting(input: StartMeetingInput): Promise<JsonRecord> {
  return requestJson<JsonRecord>("meetings/start", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function stopMeeting(meetingId: string, input: StopMeetingInput): Promise<JsonRecord> {
  return requestJson<JsonRecord>(`meetings/${meetingId}/stop`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function failMeeting(meetingId: string, input: FailMeetingInput): Promise<JsonRecord> {
  return requestJson<JsonRecord>(`meetings/${meetingId}/fail`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function listInterviews(params?: { skip?: number; take?: number; sync?: boolean }): Promise<{
  interviews: InterviewListRow[];
  count: number;
}> {
  const skip = params?.skip ?? 0;
  const take = params?.take ?? 20;
  const sync = params?.sync ? "&sync=1" : "";
  return requestJson<{ interviews: InterviewListRow[]; count: number }>(`interviews?skip=${skip}&take=${take}${sync}`, {
    method: "GET"
  });
}

export async function getInterviewById(id: number, sync = false): Promise<InterviewDetail> {
  const suffix = sync ? "?sync=1" : "";
  return requestJson<InterviewDetail>(`interviews/${id}${suffix}`, { method: "GET" });
}

/** Сохранить ФИО кандидата в проекции gateway (разбор: первая лексема → фамилия, остальное → имя+отчество). */
export async function savePrototypeCandidateFio(jobAiId: number, fullName: string): Promise<InterviewDetail> {
  return requestJson<InterviewDetail>(`interviews/${jobAiId}/prototype-candidate-fio`, {
    method: "POST",
    body: JSON.stringify({ fullName })
  });
}

export async function linkInterviewSession(input: {
  interviewId: number;
  meetingId: string;
  sessionId?: string;
  nullxesStatus?: InterviewListRow["nullxesStatus"];
}): Promise<InterviewDetail> {
  return requestJson<InterviewDetail>(`interviews/${input.interviewId}/session-link`, {
    method: "POST",
    body: JSON.stringify({
      meetingId: input.meetingId,
      sessionId: input.sessionId,
      nullxesStatus: input.nullxesStatus
    })
  });
}

export async function updateInterviewStatus(id: number, status: JobAiInterviewStatus): Promise<InterviewDetail> {
  return requestJson<InterviewDetail>(`interviews/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ status })
  });
}

export async function getJobAiSourceStatus(): Promise<JobAiSourceStatus> {
  return requestJson<JobAiSourceStatus>("interviews/source/status", { method: "GET" });
}
