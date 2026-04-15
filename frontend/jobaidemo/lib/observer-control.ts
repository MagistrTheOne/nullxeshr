"use client";

export type ObserverVisibility = "hidden" | "visible";
export type ObserverTalk = "off" | "on";

export type ObserverControlState = {
  visibility: ObserverVisibility;
  talk: ObserverTalk;
  updatedAt: string;
};

const DEFAULT_STATE: ObserverControlState = {
  visibility: "hidden",
  talk: "off",
  updatedAt: ""
};

const OBSERVER_CONTROL_EVENT = "jobaidemo:observer-control:changed";

function storageKey(jobAiId: number | null): string | null {
  return jobAiId && jobAiId > 0 ? `jobaidemo:observer-control:${jobAiId}` : null;
}

export function getObserverControlState(jobAiId: number | null): ObserverControlState {
  if (typeof window === "undefined") {
    return DEFAULT_STATE;
  }
  const key = storageKey(jobAiId);
  if (!key) {
    return DEFAULT_STATE;
  }
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return DEFAULT_STATE;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ObserverControlState>;
    const visibility: ObserverVisibility = parsed.visibility === "visible" ? "visible" : "hidden";
    const talk: ObserverTalk = parsed.talk === "on" ? "on" : "off";
    return {
      visibility,
      talk: visibility === "hidden" ? "off" : talk,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : ""
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function setObserverControlState(jobAiId: number | null, next: ObserverControlState): void {
  if (typeof window === "undefined") {
    return;
  }
  const key = storageKey(jobAiId);
  if (!key) {
    return;
  }
  const normalized: ObserverControlState = {
    visibility: next.visibility === "visible" ? "visible" : "hidden",
    talk: next.visibility === "hidden" ? "off" : next.talk === "on" ? "on" : "off",
    updatedAt: next.updatedAt || new Date().toISOString()
  };
  window.localStorage.setItem(key, JSON.stringify(normalized));
  window.dispatchEvent(
    new CustomEvent(OBSERVER_CONTROL_EVENT, {
      detail: {
        jobAiId,
        state: normalized
      }
    })
  );
}

export function subscribeObserverControlState(
  jobAiId: number | null,
  onChange: (next: ObserverControlState) => void
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const onStorage = (event: StorageEvent) => {
    const key = storageKey(jobAiId);
    if (!key || event.key !== key) {
      return;
    }
    onChange(getObserverControlState(jobAiId));
  };

  const onCustom = (event: Event) => {
    const customEvent = event as CustomEvent<{ jobAiId: number | null }>;
    if (customEvent.detail?.jobAiId !== jobAiId) {
      return;
    }
    onChange(getObserverControlState(jobAiId));
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(OBSERVER_CONTROL_EVENT, onCustom as EventListener);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(OBSERVER_CONTROL_EVENT, onCustom as EventListener);
  };
}
