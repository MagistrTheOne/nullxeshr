import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type MeetingHeaderProps = {
  statusLabel: string;
  meetingId: string | null;
  sessionId: string | null;
  jobAiId?: number;
  companyName?: string;
  meetingAt?: string;
  prototypeEntryUrl?: string;
  onEntryUrlCommit?: (value: string) => void;
  candidateFio: string;
  onStart: () => void;
  onStop?: () => void;
  onFail?: () => void;
  startDisabled?: boolean;
  stopDisabled?: boolean;
  failDisabled?: boolean;
  showDebugActions?: boolean;
};

export function MeetingHeader({
  statusLabel,
  meetingId,
  sessionId,
  jobAiId,
  companyName,
  meetingAt,
  prototypeEntryUrl,
  onEntryUrlCommit,
  candidateFio,
  onStart,
  onStop,
  onFail,
  startDisabled = false,
  stopDisabled = true,
  failDisabled = true,
  showDebugActions = false
}: MeetingHeaderProps) {
  const [entryUrlInput, setEntryUrlInput] = useState(prototypeEntryUrl ?? "");
  const missingRuntimeIdLabel = jobAiId ? "будет после Start Session" : "—";

  useEffect(() => {
    setEntryUrlInput(prototypeEntryUrl ?? "");
  }, [prototypeEntryUrl]);

  const hasEntryUrl = Boolean(entryUrlInput.trim());

  return (
    <header className="flex w-full min-w-0 flex-col items-center gap-8 md:gap-10">
      <div className="flex w-full justify-center pt-1">
        <h1 className="text-center text-4xl font-black tracking-tight text-[#0f1114] sm:text-5xl md:text-6xl">
          JOB <span className="rounded-xl bg-sky-500 px-3 py-1 text-white">AI</span>
        </h1>
      </div>

      <div className="w-full max-w-xl space-y-2 px-0 sm:px-1">
        <p className="text-center text-xs leading-relaxed text-slate-500 sm:text-left">
          Ссылка кандидата готова после выбора интервью.
        </p>
        <div className="flex items-stretch gap-2 rounded-xl bg-[#d9dee7] p-2 shadow-[-8px_-8px_16px_rgba(255,255,255,.9),8px_8px_18px_rgba(163,177,198,.55)]">
          <Input
            value={entryUrlInput}
            onChange={(e) => setEntryUrlInput(e.target.value)}
            onBlur={() => onEntryUrlCommit?.(entryUrlInput)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onEntryUrlCommit?.(entryUrlInput);
              }
            }}
            placeholder="Ссылка на интерфейс кандидата"
            className="min-h-12 flex-1 rounded-lg border border-transparent bg-white/70 py-3 text-base leading-normal text-slate-800 shadow-none placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-slate-300/60"
          />
          <Button
            type="button"
            variant="secondary"
            size="icon"
            disabled={!hasEntryUrl}
            className="h-12 w-12 shrink-0 rounded-lg border border-slate-300/50 bg-white/80 text-slate-600 shadow-sm disabled:opacity-40"
            title={hasEntryUrl ? "Копировать ссылку" : "Ссылка появится после выбора собеседования"}
            onClick={() => {
              if (hasEntryUrl) {
                void navigator.clipboard.writeText(entryUrlInput.trim());
                toast.success("Скопировано", {
                  description: "Ссылка кандидата сохранена в буфер обмена."
                });
              }
            }}
          >
            <Copy className="size-4" />
          </Button>
        </div>
      </div>

      <Card className="w-full max-w-xl min-w-0 rounded-2xl border-0 bg-[#d9dee7] shadow-[-8px_-8px_16px_rgba(255,255,255,.9),8px_8px_18px_rgba(163,177,198,.55)]">
        <CardHeader className="space-y-1 pb-3">
          <CardTitle className="text-base font-semibold text-slate-600">Видеособеседование</CardTitle>
          <p className="text-xs font-normal leading-relaxed text-slate-500">
            Имя и фамилия кандидата подставляются автоматически из данных собеседования.
          </p>
        </CardHeader>
        <CardContent className="space-y-5 text-sm text-slate-600">
          <p>
            Кандидат: <span className="font-medium text-slate-700">{candidateFio || "—"}</span>
          </p>
          <div className="grid grid-cols-1 gap-x-10 gap-y-2 text-slate-500 sm:grid-cols-2">
            <p>Компания: {companyName ?? "—"}</p>
            <p>JobAI ID: {jobAiId ?? "—"}</p>
            <p>NULLXES ID: {meetingId ?? missingRuntimeIdLabel}</p>
            <p>Дата проведения: {meetingAt ? new Date(meetingAt).toLocaleString("ru-RU") : "—"}</p>
            <p className="break-all sm:col-span-2">Session ID: {sessionId ?? missingRuntimeIdLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-300/40 pt-4">
            <Badge className="shrink-0 bg-[#8aa0bb] text-white">{statusLabel}</Badge>
            <Button
              onClick={onStart}
              disabled={startDisabled}
              className="h-9 w-full shrink-0 rounded-lg bg-[#3a8edb] px-4 text-xs text-white hover:bg-[#2f7bc0] sm:w-auto"
            >
              Начать собеседование
            </Button>
            {showDebugActions ? (
              <>
                <Button
                  onClick={onStop}
                  disabled={stopDisabled}
                  variant="destructive"
                  className="h-9 w-full shrink-0 rounded-lg px-4 text-xs sm:w-auto"
                >
                  Stop Interview
                </Button>
                <Button
                  onClick={onFail}
                  disabled={failDisabled}
                  variant="secondary"
                  className="h-9 w-full shrink-0 rounded-lg px-4 text-xs sm:w-auto"
                >
                  Fail Interview
                </Button>
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </header>
  );
}
