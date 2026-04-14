import { createRealtimeSession, getRealtimeToken, sendRealtimeEvent } from "@/lib/api";

export type WebRtcConnectionState = "idle" | "connecting" | "connected" | "failed" | "closed";

function normalizeSdp(input: string): string {
  const normalized = input.replace(/\r?\n/g, "\r\n").trim();
  return `${normalized}\r\n`;
}

function waitForIceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const onIceStateChange = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", onIceStateChange);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", onIceStateChange);
  });
}

export class WebRtcInterviewClient {
  private peerConnection: RTCPeerConnection | null = null;
  private mediaStream: MediaStream | null = null;
  private sessionId: string | null = null;
  private state: WebRtcConnectionState = "idle";
  private onState?: (state: WebRtcConnectionState) => void;
  private onRemoteStream?: (stream: MediaStream) => void;

  constructor(options?: {
    onStateChange?: (state: WebRtcConnectionState) => void;
    onRemoteStream?: (stream: MediaStream) => void;
  }) {
    this.onState = options?.onStateChange;
    this.onRemoteStream = options?.onRemoteStream;
  }

  private setState(nextState: WebRtcConnectionState): void {
    this.state = nextState;
    this.onState?.(nextState);
  }

  async connect(): Promise<{ sessionId: string }> {
    this.setState("connecting");
    await getRealtimeToken();

    const pc = new RTCPeerConnection();
    this.peerConnection = pc;

    pc.addTransceiver("audio", { direction: "sendrecv" });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.mediaStream = stream;
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }
    } catch {
      // Audio capture is optional for initial prototype.
    }

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        this.onRemoteStream?.(remoteStream);
      }
    };

    const dataChannel = pc.createDataChannel("events");
    dataChannel.onopen = () => {
      if (this.sessionId) {
        void sendRealtimeEvent(this.sessionId, {
          type: "session.update",
          source: "frontend",
          message: "datachannel_open"
        });
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(pc);

    const localSdp = pc.localDescription?.sdp;
    if (!localSdp) {
      this.setState("failed");
      throw new Error("Failed to generate local SDP offer");
    }

    const normalizedLocalSdp = normalizeSdp(localSdp);
    const { answerSdp, sessionId } = await createRealtimeSession(normalizedLocalSdp);
    if (!sessionId) {
      this.setState("failed");
      throw new Error("Gateway response missing session id");
    }
    this.sessionId = sessionId;

    await pc.setRemoteDescription({
      type: "answer",
      sdp: normalizeSdp(answerSdp)
    });

    this.setState("connected");
    return { sessionId };
  }

  async postEvent(payload: Record<string, unknown>): Promise<void> {
    if (!this.sessionId) {
      return;
    }
    await sendRealtimeEvent(this.sessionId, payload);
  }

  close(): void {
    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.sessionId = null;
    this.setState("closed");
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getState(): WebRtcConnectionState {
    return this.state;
  }
}
