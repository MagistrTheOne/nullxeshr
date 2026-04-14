import { NextRequest, NextResponse } from "next/server";
import { StreamClient } from "@stream-io/node-sdk";

export const runtime = "nodejs";

type TokenRequestBody = {
  meetingId?: string;
  role?: "candidate" | "spectator" | "admin";
  userId?: string;
  userName?: string;
  callId?: string;
  callType?: string;
};

function sanitizeIdentifier(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized.length > 0 ? normalized : fallback;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.STREAM_API_KEY;
  const secret = process.env.STREAM_SECRET_KEY;

  if (!apiKey || !secret) {
    return NextResponse.json(
      { message: "Missing Stream configuration. Set STREAM_API_KEY and STREAM_SECRET_KEY." },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as TokenRequestBody;
  const role = body.role ?? "candidate";
  const meetingId = sanitizeIdentifier(body.meetingId ?? "demo-call", "demo-call");
  const userId = sanitizeIdentifier(body.userId ?? `${role}-${meetingId}`, `${role}-demo`);
  const userName = (body.userName ?? (role === "candidate" ? "Candidate" : "Spectator")).trim() || "Participant";
  const callId = sanitizeIdentifier(body.callId ?? meetingId, meetingId);
  const callType = sanitizeIdentifier(body.callType ?? "default", "default");

  const serverClient = new StreamClient(apiKey, secret);
  const token = serverClient.generateUserToken({
    user_id: userId,
    validity_in_seconds: 60 * 60
  });

  return NextResponse.json({
    apiKey,
    token,
    user: {
      id: userId,
      name: userName
    },
    callId,
    callType
  });
}
