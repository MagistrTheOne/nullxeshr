"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function SpectatorBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobAiId = searchParams.get("jobAiId");

  return (
    <div className="min-h-screen bg-[#dfe4ec] px-6 py-10">
      <Card className="mx-auto max-w-lg rounded-2xl border-0 bg-[#d9dee7] shadow-[-10px_-10px_20px_rgba(255,255,255,.9),10px_10px_22px_rgba(163,177,198,.55)]">
        <CardHeader>
          <CardTitle className="text-slate-700">Режим наблюдателя (прототип)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          <p>
            Вход в комнату — через Stream и общий{" "}
            <code className="rounded bg-white/60 px-1">meetingId</code> на основной странице интервью.
          </p>
          <p>
            JobAI ID: <span className="font-medium">{jobAiId ?? "—"}</span>
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              router.push(jobAiId ? `/?jobAiId=${encodeURIComponent(jobAiId)}` : "/");
            }}
          >
            На главную интервью
          </Button>
        </CardContent>
      </Card>
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
