import type { InterviewProjection, JobAiInterview, JobAiInterviewStatus, StoredInterview } from "../types/interview";
import { resolveNullxesBusiness } from "./nullxesBusinessStatus";

export class InMemoryInterviewStore {
  private readonly byJobAiId = new Map<number, StoredInterview>();
  private lastSyncAt: string | null = null;
  private lastSyncResult: "idle" | "success" | "error" = "idle";
  private lastSyncError: string | null = null;

  upsert(rawPayload: JobAiInterview): StoredInterview {
    const existing = this.byJobAiId.get(rawPayload.id);
    const nullxesStatus = this.resolveNullxesStatus(rawPayload.status, existing?.projection.nullxesStatus);
    const business = resolveNullxesBusiness(rawPayload.status, nullxesStatus);
    const projection: InterviewProjection = {
      jobAiId: rawPayload.id,
      nullxesMeetingId: existing?.projection.nullxesMeetingId,
      sessionId: existing?.projection.sessionId,
      candidateFirstName: rawPayload.candidateFirstName ?? "",
      candidateLastName: rawPayload.candidateLastName ?? "",
      companyName: rawPayload.companyName,
      meetingAt: rawPayload.meetingAt,
      jobAiStatus: rawPayload.status,
      nullxesStatus,
      candidateEntryPath: `/?jobAiId=${rawPayload.id}`,
      spectatorEntryPath: `/spectator?jobAiId=${rawPayload.id}`,
      nullxesBusinessKey: business.key,
      nullxesBusinessLabel: business.label,
      updatedAt: new Date().toISOString()
    };

    const stored: StoredInterview = {
      jobAiId: rawPayload.id,
      rawPayload,
      projection
    };
    this.byJobAiId.set(rawPayload.id, stored);
    return stored;
  }

  getByJobAiId(jobAiId: number): StoredInterview | undefined {
    return this.byJobAiId.get(jobAiId);
  }

  list(skip = 0, take = 20): { interviews: StoredInterview[]; count: number } {
    const all = Array.from(this.byJobAiId.values()).sort((a, b) => {
      return new Date(b.rawPayload.meetingAt).getTime() - new Date(a.rawPayload.meetingAt).getTime();
    });
    return {
      interviews: all.slice(skip, skip + take),
      count: all.length
    };
  }

  setRuntimeSession(
    jobAiId: number,
    params: { meetingId: string; sessionId?: string; nullxesStatus?: InterviewProjection["nullxesStatus"] }
  ): StoredInterview {
    const existing = this.byJobAiId.get(jobAiId);
    if (!existing) {
      throw new Error(`Interview not found: ${jobAiId}`);
    }

    existing.projection.nullxesMeetingId = params.meetingId;
    existing.projection.sessionId = params.sessionId ?? existing.projection.sessionId;
    if (params.nullxesStatus) {
      existing.projection.nullxesStatus = params.nullxesStatus;
    }
    const business = resolveNullxesBusiness(existing.rawPayload.status, existing.projection.nullxesStatus);
    existing.projection.nullxesBusinessKey = business.key;
    existing.projection.nullxesBusinessLabel = business.label;
    existing.projection.updatedAt = new Date().toISOString();
    return existing;
  }

  setSyncState(result: { status: "success" | "error"; error?: string }): void {
    this.lastSyncAt = new Date().toISOString();
    this.lastSyncResult = result.status;
    this.lastSyncError = result.error ?? null;
  }

  getSyncState(): { lastSyncAt: string | null; lastSyncResult: "idle" | "success" | "error"; lastSyncError: string | null; storedCount: number } {
    return {
      lastSyncAt: this.lastSyncAt,
      lastSyncResult: this.lastSyncResult,
      lastSyncError: this.lastSyncError,
      storedCount: this.byJobAiId.size
    };
  }

  private resolveNullxesStatus(
    jobAiStatus: JobAiInterviewStatus,
    current: InterviewProjection["nullxesStatus"] | undefined
  ): InterviewProjection["nullxesStatus"] {
    if (current === "in_meeting" && jobAiStatus === "in_meeting") {
      return "in_meeting";
    }

    if (jobAiStatus === "completed") {
      return "completed";
    }

    if (jobAiStatus === "stopped_during_meeting" || jobAiStatus === "canceled" || jobAiStatus === "meeting_not_started") {
      return "stopped_during_meeting";
    }

    return current ?? "idle";
  }
}
