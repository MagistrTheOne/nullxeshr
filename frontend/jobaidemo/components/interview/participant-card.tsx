import { Mic, Video } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type ParticipantCardProps = {
  roleLabel: string;
  participantName: string;
  imageSrc?: string;
  placeholder?: boolean;
  showControls?: boolean;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  controlsDisabled?: boolean;
};

export function ParticipantCard({
  roleLabel,
  participantName,
  imageSrc,
  placeholder = false,
  showControls = true,
  primaryActionLabel = "Выйти",
  secondaryActionLabel = "Завершить",
  onPrimaryAction,
  onSecondaryAction,
  controlsDisabled = false
}: ParticipantCardProps) {
  return (
    <section className="flex w-full flex-col items-center gap-4">
      <h3 className="text-[30px] font-medium text-slate-600">{roleLabel}</h3>
      <Card className="w-full rounded-2xl border-0 bg-[#d9dee7] p-3 shadow-[-8px_-8px_16px_rgba(255,255,255,.9),8px_8px_18px_rgba(163,177,198,.55)]">
        <CardContent className="p-2">
          <div className="h-[260px] overflow-hidden rounded-xl border border-white/50 bg-[#d0d6e0]">
            {placeholder ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">Нет видео</div>
            ) : (
              <Avatar className="h-full w-full rounded-none">
                <AvatarImage src={imageSrc} alt={participantName} className="h-full w-full object-cover" />
                <AvatarFallback className="rounded-none bg-[#cfd5df] text-slate-500">
                  {participantName
                    .split(" ")
                    .map((item) => item[0])
                    .join("")
                    .slice(0, 2)}
                </AvatarFallback>
              </Avatar>
            )}
          </div>
        </CardContent>
      </Card>
      <p className="w-full px-2 text-left text-sm text-slate-500">{participantName}</p>
      {showControls ? (
        <>
          <div className="flex items-center gap-6 text-slate-500">
            <Mic size={18} />
            <Video size={18} />
          </div>
          <div className="flex gap-4">
            <Button
              variant="secondary"
              disabled={controlsDisabled}
              onClick={onPrimaryAction}
              className="rounded-xl bg-[#d9dee7] px-6 text-slate-600 shadow-[-6px_-6px_12px_rgba(255,255,255,.85),6px_6px_12px_rgba(163,177,198,.5)] hover:bg-[#d5dbe4]"
            >
              {primaryActionLabel}
            </Button>
            <Button
              variant="secondary"
              disabled={controlsDisabled}
              onClick={onSecondaryAction}
              className="rounded-xl bg-[#d9dee7] px-6 text-slate-600 shadow-[-6px_-6px_12px_rgba(255,255,255,.85),6px_6px_12px_rgba(163,177,198,.5)] hover:bg-[#d5dbe4]"
            >
              {secondaryActionLabel}
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
