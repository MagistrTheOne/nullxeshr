"use client";

import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

function SpectatorBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawJobAiId = searchParams.get("jobAiId");
  const jobAiId = useMemo(() => {
    if (!rawJobAiId) return null;
    const parsed = Number(rawJobAiId);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [rawJobAiId]);

  return (
    <div className="min-h-screen bg-[#dfe4ec] px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-white/60 bg-white/75 p-6 text-sm text-slate-700 shadow-sm">
        <p className="text-lg font-semibold text-slate-800">Режим наблюдателя временно на паузе</p>
        <p className="mt-2 leading-relaxed">
          Сейчас стенд сфокусирован на основном потоке кандидата и агента. Возврат observer-функционала включим после
          стабилизации основного сценария.
        </p>
        <p className="mt-3">
          JobAI ID: <code className="rounded bg-white/70 px-1">{jobAiId ?? "—"}</code>
        </p>
        <Button
          type="button"
          className="mt-5 w-full sm:w-auto"
          onClick={() => {
            router.push(jobAiId ? `/?jobAiId=${encodeURIComponent(jobAiId)}` : "/");
          }}
        >
          Вернуться к интервью кандидата
        </Button>
      </div>
    </div>
  );
}

export default function SpectatorPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#dfe4ec] text-slate-600">Загрузка…</div>}>
      <SpectatorBody />
    </Suspense>
  );
}
