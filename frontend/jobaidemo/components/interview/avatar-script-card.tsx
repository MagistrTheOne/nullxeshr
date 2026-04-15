import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AvatarScriptCardProps = {
  title?: string;
  greetingSpeech?: string;
  finalSpeech?: string;
  questions?: Array<{ text: string; order: number }>;
};

export function AvatarScriptCard({ title, greetingSpeech, finalSpeech, questions }: AvatarScriptCardProps) {
  const orderedQuestions =
    questions && questions.length > 0 ? [...questions].sort((a, b) => a.order - b.order).map((entry) => entry.text) : [];

  return (
    <Card className="rounded-2xl border-0 bg-[#d9dee7] shadow-[-10px_-10px_20px_rgba(255,255,255,.9),10px_10px_22px_rgba(163,177,198,.55)]">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-slate-700">
          Пакет вопросов для аватара{title ? ` · ${title}` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-slate-600">
        <p className="rounded-lg bg-white/55 px-3 py-2">
          <strong>Greeting:</strong>{" "}
          {greetingSpeech ?? "Нет greetingSpeech из JobAI для выбранного интервью."}
        </p>
        <div className="rounded-lg bg-white/55 px-3 py-2">
          <p className="mb-2 font-medium">Questions (specialty.questions):</p>
          {orderedQuestions.length > 0 ? (
            <ol className="list-decimal space-y-1 pl-5">
              {orderedQuestions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ol>
          ) : (
            <p className="text-slate-500">Нет specialty.questions из JobAI для выбранного интервью.</p>
          )}
        </div>
        <p className="rounded-lg bg-white/55 px-3 py-2">
          <strong>Final:</strong> {finalSpeech ?? "Нет finalSpeech из JobAI для выбранного интервью."}
        </p>
        <p className="text-xs leading-relaxed text-slate-500">
          Источник для аватара по спеке: <strong>GET</strong> <code className="rounded bg-white/50 px-1">/ai-api/interviews/{"{id}"}</code> через
          gateway (<code className="rounded bg-white/50 px-1">GET /interviews/:id</code>). Поля{" "}
          <code className="rounded bg-white/50 px-1">greetingSpeech</code>, <code className="rounded bg-white/50 px-1">specialty.questions</code>,{" "}
          <code className="rounded bg-white/50 px-1">finalSpeech</code>. Демо-фолбэки отключены: показываются только данные из JobAI/gateway.
        </p>
      </CardContent>
    </Card>
  );
}
