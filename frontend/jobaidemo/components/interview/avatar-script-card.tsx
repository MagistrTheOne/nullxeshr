import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AvatarScriptCardProps = {
  title?: string;
  greetingSpeech?: string;
  finalSpeech?: string;
  questions?: Array<{ text: string; order: number }>;
};

const fallbackQuestions = [
  "Расскажите о себе и вашем опыте.",
  "Как вы решали самый сложный production-инцидент?",
  "Как строите взаимодействие с продуктовой командой?"
];

export function AvatarScriptCard({ title, greetingSpeech, finalSpeech, questions }: AvatarScriptCardProps) {
  const orderedQuestions = questions && questions.length > 0
    ? [...questions].sort((a, b) => a.order - b.order).map((entry) => entry.text)
    : fallbackQuestions;

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
          {greetingSpeech ?? "Здравствуйте, это видеособеседование. Как я могу к Вам обращаться?"}
        </p>
        <div className="rounded-lg bg-white/55 px-3 py-2">
          <p className="mb-2 font-medium">Questions (specialty.questions):</p>
          <ol className="list-decimal space-y-1 pl-5">
            {orderedQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
        </div>
        <p className="rounded-lg bg-white/55 px-3 py-2">
          <strong>Final:</strong> {finalSpeech ?? "Спасибо за собеседование. До встречи!"}
        </p>
      </CardContent>
    </Card>
  );
}
