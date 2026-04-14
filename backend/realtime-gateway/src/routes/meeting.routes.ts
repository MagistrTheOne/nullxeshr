import express, { type Request, type Response } from "express";
import { z } from "zod";
import { HttpError } from "../middleware/errorHandler";
import { MeetingOrchestrator } from "../services/meetingOrchestrator";
import type { FailMeetingInput, StartMeetingInput, StopMeetingInput } from "../types/meeting";

const startMeetingSchema = z.object({
  internalMeetingId: z.string().min(1),
  triggerSource: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  sessionId: z.string().min(1).optional()
});

const stopMeetingSchema = z.object({
  reason: z.enum(["manual_stop", "superseded_by_other_meeting", "error"]),
  finalStatus: z.enum(["stopped_during_meeting", "completed"]).optional(),
  metadata: z.record(z.unknown()).optional()
});

const failMeetingSchema = z.object({
  status: z.enum(["failed_audio_pool_busy", "failed_connect_ws_audio"]),
  reason: z.string().min(1),
  metadata: z.record(z.unknown()).optional()
});

function asyncHandler(
  handler: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response, next: express.NextFunction) => void {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, "Invalid request payload", parsed.error.flatten());
  }
  return parsed.data;
}

export function createMeetingRouter(orchestrator: MeetingOrchestrator): express.Router {
  const router = express.Router();

  router.post("/start", asyncHandler(async (req: Request, res: Response) => {
    const input = parseBody<StartMeetingInput>(startMeetingSchema, req.body);
    const result = orchestrator.startMeeting(input);
    res.status(201).json(result);
  }));

  router.post("/:meetingId/stop", asyncHandler(async (req: Request, res: Response) => {
    const input = parseBody<StopMeetingInput>(stopMeetingSchema, req.body);
    const result = orchestrator.stopMeeting(req.params.meetingId, input);
    res.status(200).json(result);
  }));

  router.post("/:meetingId/fail", asyncHandler(async (req: Request, res: Response) => {
    const input = parseBody<FailMeetingInput>(failMeetingSchema, req.body);
    const result = orchestrator.failMeeting(req.params.meetingId, input);
    res.status(200).json(result);
  }));

  router.get("/:meetingId", (req: Request, res: Response) => {
    const result = orchestrator.getMeeting(req.params.meetingId);
    res.status(200).json(result);
  });

  router.get("/", (_req: Request, res: Response) => {
    res.status(200).json({
      meetings: orchestrator.listMeetings()
    });
  });

  return router;
}
