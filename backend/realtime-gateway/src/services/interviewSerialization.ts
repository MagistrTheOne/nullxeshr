import type { StoredInterview } from "../types/interview";
import { applyInterviewTemplates } from "./templateInterpolation";

function templateVars(interview: StoredInterview["rawPayload"]) {
  return {
    job_title: interview.jobTitle ?? "",
    first_name: interview.candidateFirstName ?? "",
    company_name: interview.companyName ?? ""
  };
}

export function serializeInterviewListItem(entry: StoredInterview): Record<string, unknown> {
  const vars = templateVars(entry.rawPayload);
  return {
    ...entry.projection,
    statusChangedAt: entry.rawPayload.statusChangedAt,
    createdAt: entry.rawPayload.createdAt,
    greetingSpeechResolved: applyInterviewTemplates(entry.rawPayload.greetingSpeech, vars),
    finalSpeechResolved: applyInterviewTemplates(entry.rawPayload.finalSpeech, vars)
  };
}

export function serializeInterviewDetail(entry: StoredInterview): {
  interview: Record<string, unknown>;
  projection: StoredInterview["projection"];
} {
  const vars = templateVars(entry.rawPayload);
  return {
    interview: {
      ...entry.rawPayload,
      greetingSpeechResolved: applyInterviewTemplates(entry.rawPayload.greetingSpeech, vars),
      finalSpeechResolved: applyInterviewTemplates(entry.rawPayload.finalSpeech, vars)
    },
    projection: entry.projection
  };
}
