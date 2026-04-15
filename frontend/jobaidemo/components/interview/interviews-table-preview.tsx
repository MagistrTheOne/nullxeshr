"use client";

import { useCallback, useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getInterviewById, type InterviewDetail, type InterviewListRow } from "@/lib/api";

type InterviewsTablePreviewProps = {
  rows: InterviewListRow[];
  selectedInterviewId: number | null;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onSelect?: (row: InterviewListRow) => void;
};

function openPath(path: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.open(`${window.location.origin}${path}`, "_blank", "noopener,noreferrer");
}

function copyText(text: string): void {
  void navigator.clipboard.writeText(text);
  toast.success("Скопировано", {
    description: "Ссылка сохранена в буфер обмена."
  });
}

export function InterviewsTablePreview({
  rows,
  selectedInterviewId,
  loading = false,
  error = null,
  onRefresh,
  onSelect
}: InterviewsTablePreviewProps) {
  const [refOpen, setRefOpen] = useState(false);
  const [refBusy, setRefBusy] = useState(false);
  const [refDetail, setRefDetail] = useState<InterviewDetail | null>(null);
  const [refError, setRefError] = useState<string | null>(null);

  const openReference = useCallback(async (jobAiId: number) => {
    setRefBusy(true);
    setRefError(null);
    try {
      const detail = await getInterviewById(jobAiId);
      setRefDetail(detail);
      setRefOpen(true);
    } catch (err) {
      setRefError(err instanceof Error ? err.message : "Не удалось загрузить данные");
    } finally {
      setRefBusy(false);
    }
  }, []);

  const orderedQuestions =
    refDetail?.interview.specialty?.questions?.slice().sort((a, b) => a.order - b.order) ?? [];

  return (
    <Card className="rounded-2xl border-0 bg-[#d9dee7] shadow-[-10px_-10px_20px_rgba(255,255,255,.9),10px_10px_22px_rgba(163,177,198,.55)]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base text-slate-700">Список собеседований</CardTitle>
        <Button size="sm" variant="secondary" onClick={onRefresh} disabled={loading}>
          {loading ? "Обновление..." : "Обновить"}
        </Button>
      </CardHeader>
      <CardContent>
        {error ? <p className="mb-3 rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        <div className="overflow-x-auto rounded-xl bg-white/50">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID Nullxes</TableHead>
                <TableHead>ID JobAI</TableHead>
                <TableHead>Имя</TableHead>
                <TableHead>Фамилия</TableHead>
                <TableHead>Компания</TableHead>
                <TableHead>meetingAt</TableHead>
                <TableHead>Nullxes</TableHead>
                <TableHead>JobAI</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-slate-500">
                    Нет загруженных интервью
                  </TableCell>
                </TableRow>
              ) : null}
              {rows.map((row) => (
                <TableRow key={row.jobAiId} className={selectedInterviewId === row.jobAiId ? "bg-sky-100/40" : ""}>
                  <TableCell className="font-medium">{row.nullxesMeetingId ?? "—"}</TableCell>
                  <TableCell>{row.jobAiId}</TableCell>
                  <TableCell>{row.candidateFirstName}</TableCell>
                  <TableCell>{row.candidateLastName}</TableCell>
                  <TableCell>{row.companyName}</TableCell>
                  <TableCell>{new Date(row.meetingAt).toLocaleString("ru-RU")}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" title={row.nullxesBusinessKey}>
                      {row.nullxesBusinessLabel}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.jobAiStatus}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => onSelect?.(row)}>
                        Детали
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => void openReference(row.jobAiId)} disabled={refBusy}>
                        Справочно
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          if (typeof window === "undefined") {
                            return;
                          }
                          copyText(`${window.location.origin}${row.candidateEntryPath}`);
                        }}
                      >
                        Ссылка кандидата
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          if (typeof window === "undefined") {
                            return;
                          }
                          copyText(`${window.location.origin}${row.spectatorEntryPath}`);
                        }}
                      >
                        Ссылка наблюдателя
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openPath(row.spectatorEntryPath)}>
                        Вход наблюдателя
                      </Button>
                      <Button size="icon" variant="secondary" aria-label="Открыть наблюдателя" onClick={() => openPath(row.spectatorEntryPath)}>
                        <ExternalLink className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Dialog open={refOpen} onOpenChange={setRefOpen}>
          <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Справочно по собеседованию</DialogTitle>
              <DialogDescription>JobAI ID: {refDetail?.interview.id ?? "—"}</DialogDescription>
            </DialogHeader>
            {refError ? <p className="text-sm text-rose-700">{refError}</p> : null}
            {refDetail ? (
              <div className="space-y-4 text-sm text-slate-600">
                <div>
                  <p className="font-medium text-slate-700">Вакансия (vacancyText)</p>
                  <p className="mt-1 whitespace-pre-wrap rounded-lg bg-white/60 p-2">{refDetail.interview.vacancyText ?? "—"}</p>
                </div>
                <div>
                  <p className="font-medium text-slate-700">Приветствие</p>
                  <p className="mt-1 whitespace-pre-wrap rounded-lg bg-white/60 p-2">
                    {refDetail.interview.greetingSpeechResolved ?? refDetail.interview.greetingSpeech ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-slate-700">Прощание</p>
                  <p className="mt-1 whitespace-pre-wrap rounded-lg bg-white/60 p-2">
                    {refDetail.interview.finalSpeechResolved ?? refDetail.interview.finalSpeech ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-slate-700">Вопросы (specialty.questions)</p>
                  <ol className="mt-1 list-decimal space-y-1 pl-5">
                    {orderedQuestions.length === 0 ? <li className="text-slate-500">Нет вопросов</li> : null}
                    {orderedQuestions.map((q) => (
                      <li key={`${q.order}-${q.text}`}>{q.text}</li>
                    ))}
                  </ol>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
