import { Copy } from "lucide-react";
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
  onStart: () => void;
  onStop?: () => void;
  onFail?: () => void;
  startDisabled?: boolean;
  stopDisabled?: boolean;
  failDisabled?: boolean;
};

export function MeetingHeader({
  statusLabel,
  meetingId,
  sessionId,
  jobAiId,
  companyName,
  meetingAt,
  prototypeEntryUrl,
  onStart,
  onStop,
  onFail,
  startDisabled = false,
  stopDisabled = true,
  failDisabled = true
}: MeetingHeaderProps) {
  return (
    <header className="relative flex flex-col items-start gap-4 md:gap-6">
      <div className="w-full max-w-[420px]">
        <div className="rounded-xl border-0 bg-[#d9dee7] p-2 shadow-[-8px_-8px_16px_rgba(255,255,255,.9),8px_8px_18px_rgba(163,177,198,.55)]">
          <div className="relative">
            <Input
              value={prototypeEntryUrl ?? "Ссылка на интерфейс кандидата (прототип, без Zoom)"}
              readOnly
              className="h-11 rounded-lg border-0 bg-[#d9dee7] pr-12 text-slate-500 shadow-none focus-visible:ring-0"
            />
            <Copy className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          </div>
        </div>
      </div>

      <Card className="w-full max-w-[420px] rounded-2xl border-0 bg-[#d9dee7] shadow-[-8px_-8px_16px_rgba(255,255,255,.9),8px_8px_18px_rgba(163,177,198,.55)]">
        <CardHeader className="pb-1">
          <CardTitle className="text-base font-semibold text-slate-600">Видеособеседование</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-slate-500">
          <p>Компания: {companyName ?? "—"}</p>
          <p>JobAI ID: {jobAiId ?? "—"}</p>
          <p>Nullxes ID: {meetingId ?? "—"}</p>
          <p>Дата проведения: {meetingAt ? new Date(meetingAt).toLocaleString("ru-RU") : "—"}</p>
          <p>Session ID: {sessionId ?? "—"}</p>
          <div className="flex items-center gap-3 pt-2">
            <Badge className="bg-[#8aa0bb] text-white">{statusLabel}</Badge>
            <Button
              onClick={onStart}
              disabled={startDisabled}
              className="h-8 rounded-lg bg-[#3a8edb] px-4 text-xs text-white hover:bg-[#2f7bc0]"
            >
              Start Session (debug)
            </Button>
            <Button
              onClick={onStop}
              disabled={stopDisabled}
              variant="destructive"
              className="h-8 rounded-lg px-4 text-xs"
            >
              Stop Interview
            </Button>
            <Button
              onClick={onFail}
              disabled={failDisabled}
              variant="secondary"
              className="h-8 rounded-lg px-4 text-xs"
            >
              Fail Interview
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="pointer-events-none absolute left-1/2 top-2 hidden -translate-x-1/2 text-center md:block">
        <h1 className="text-6xl font-black tracking-tight text-[#0f1114]">
          JOB <span className="rounded-xl bg-sky-500 px-3 py-1 text-white">AI</span>
        </h1>
      </div>
    </header>
  );
}
