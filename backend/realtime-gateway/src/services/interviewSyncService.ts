import { HttpError } from "../middleware/errorHandler";
import type { InMemoryInterviewStore } from "./interviewStore";
import { JobAiClient } from "./jobaiClient";
import { allowedJobAiTransitions, type JobAiInterview, type JobAiInterviewStatus, type StoredInterview } from "../types/interview";

const KNOWN_STATUSES = new Set<string>(Object.keys(allowedJobAiTransitions));

type ListOptions = {
  skip?: number;
  take?: number;
  sync?: boolean;
};

export class InterviewSyncService {
  constructor(
    private readonly jobAiClient: JobAiClient,
    private readonly store: InMemoryInterviewStore
  ) {}

  async ingestWebhook(payload: unknown): Promise<StoredInterview> {
    const interview = this.unwrapInterview(payload);
    return this.store.upsert(interview);
  }

  async synchronize(skip = 0, take = 20): Promise<{ synced: number; total: number }> {
    if (!this.jobAiClient.isConfigured()) {
      throw new HttpError(503, "JobAI API is not configured");
    }

    try {
      const list = await this.jobAiClient.getInterviews(skip, take);
      for (const candidate of list.interviews) {
        const full = await this.jobAiClient.getInterviewById(candidate.id);
        this.store.upsert(full);
      }
      this.store.setSyncState({ status: "success" });
      return {
        synced: list.interviews.length,
        total: list.count
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sync interviews";
      this.store.setSyncState({ status: "error", error: message });
      throw error;
    }
  }

  async listInterviews(options: ListOptions): Promise<{ interviews: StoredInterview[]; count: number }> {
    if (options.sync) {
      await this.synchronize(options.skip ?? 0, options.take ?? 20);
    }
    return this.store.list(options.skip ?? 0, options.take ?? 20);
  }

  async getInterview(jobAiId: number, forceSync = false): Promise<StoredInterview> {
    if (forceSync && this.jobAiClient.isConfigured()) {
      const full = await this.jobAiClient.getInterviewById(jobAiId);
      this.store.upsert(full);
    }
    const interview = this.store.getByJobAiId(jobAiId);
    if (!interview) {
      throw new HttpError(404, "Interview not found");
    }
    return interview;
  }

  async transitionStatus(jobAiId: number, status: JobAiInterviewStatus): Promise<StoredInterview> {
    const current = await this.getInterview(jobAiId, !this.store.getByJobAiId(jobAiId));
    const fromStatus = current.rawPayload.status;
    const allowedTargets = (allowedJobAiTransitions[fromStatus] ?? []) as readonly JobAiInterviewStatus[];
    if (!allowedTargets.includes(status)) {
      throw new HttpError(400, "interviews.status_change_not_allowed", {
        fromStatus,
        toStatus: status
      });
    }

    if (!this.jobAiClient.isConfigured()) {
      throw new HttpError(503, "JobAI API is not configured");
    }

    const updated = await this.jobAiClient.updateInterviewStatus(jobAiId, status);
    return this.store.upsert(updated);
  }

  async cancelInterview(jobAiId: number): Promise<StoredInterview> {
    return this.transitionStatus(jobAiId, "canceled");
  }

  attachSession(
    jobAiId: number,
    params: { meetingId: string; sessionId?: string; nullxesStatus?: "idle" | "in_meeting" | "completed" | "stopped_during_meeting" | "failed" }
  ): StoredInterview {
    return this.store.setRuntimeSession(jobAiId, params);
  }

  getEntryPaths(jobAiId: number): { candidateEntryPath: string; spectatorEntryPath: string } {
    const stored = this.store.getByJobAiId(jobAiId);
    if (!stored) {
      throw new HttpError(404, "Interview not found");
    }
    return {
      candidateEntryPath: stored.projection.candidateEntryPath,
      spectatorEntryPath: stored.projection.spectatorEntryPath
    };
  }

  getIntegrationStatus(): {
    endpoints: Array<{ endpoint: string; status: "active" | "queued" | "disabled" }>;
    sync: ReturnType<InMemoryInterviewStore["getSyncState"]>;
  } {
    return {
      endpoints: [
        { endpoint: "GET /ai-api/interviews/{id}", status: this.jobAiClient.isConfigured() ? "active" : "disabled" },
        { endpoint: "GET /ai-api/interviews", status: this.jobAiClient.isConfigured() ? "active" : "disabled" },
        { endpoint: "POST /ai-api/interviews/{id}/status", status: this.jobAiClient.isConfigured() ? "queued" : "disabled" }
      ],
      sync: this.store.getSyncState()
    };
  }

  private unwrapInterview(payload: unknown): JobAiInterview {
    if (!payload || typeof payload !== "object") {
      throw new HttpError(400, "Invalid webhook payload");
    }

    const asRecord = payload as Record<string, unknown>;
    const candidate = (asRecord.interview ?? asRecord) as unknown;
    if (!candidate || typeof candidate !== "object") {
      throw new HttpError(400, "Invalid webhook payload");
    }
    const interview = candidate as Record<string, unknown>;
    if (typeof interview.id !== "number" || typeof interview.status !== "string") {
      throw new HttpError(400, "Invalid interview object");
    }
    if (!KNOWN_STATUSES.has(interview.status)) {
      throw new HttpError(400, "Invalid interview status");
    }

    return interview as unknown as JobAiInterview;
  }
}
