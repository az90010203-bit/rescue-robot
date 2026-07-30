import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RescueBridge } from "../../shared/bridge";
import { CameraPage } from "./CameraPage";

class FakeMediaSource extends EventTarget {
  public static isTypeSupported(): boolean {
    return true;
  }
}

class FakeWebSocket {
  public static readonly instances: FakeWebSocket[] = [];
  public binaryType = "";
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null = null;
  public onopen: ((event: Event) => void) | null = null;

  public constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  public close(): void {
    this.onclose?.(new CloseEvent("close"));
  }
}

class FakePeerConnection {
  public connectionState = "new";
  public localDescription: RTCSessionDescriptionInit | null = null;
  public onconnectionstatechange: (() => void) | null = null;
  public ontrack: ((event: RTCTrackEvent) => void) | null = null;

  public addTransceiver(): void {}

  public close(): void {
    this.connectionState = "closed";
  }

  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: "offer", sdp: "mock-offer" };
  }

  public async setLocalDescription(
    description: RTCSessionDescriptionInit
  ): Promise<void> {
    this.localDescription = description;
  }

  public async setRemoteDescription(): Promise<void> {}
}

describe("CameraPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances.length = 0;
    Object.defineProperty(window, "rescue", {
      configurable: true,
      value: {
        invokeCapability: vi
          .fn<RescueBridge["invokeCapability"]>()
          .mockResolvedValue(),
        camera: {
          healthUrl: "http://192.168.55.131:8080/health",
          videoWebSocketUrl: "ws://192.168.55.131:8080/video-ws",
          audioOfferUrl: "http://192.168.55.131:8080/audio-offer",
          codec: 'video/mp4; codecs="avc1.640028"'
        }
      }
    });
    vi.stubGlobal("MediaSource", FakeMediaSource);
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-camera");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = String(input);
        const payload = url.endsWith("/health")
          ? {
              ok: true,
              format: "H.264 fMP4",
              codec: "h264",
              width: 1920,
              height: 1080,
              actualFps: 30,
              actualBitrateKbps: 8000,
              frameAgeMs: 42,
              reconnectCount: 0,
              degraded: false,
              powerWarning: false,
              audioAvailable: true,
              lastError: null
            }
          : { type: "answer", sdp: "mock-answer" };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reconnects a closed video socket without reloading the application", async () => {
    render(<CameraPage robotHealth={null} />);
    expect(FakeWebSocket.instances).toHaveLength(1);

    await act(async () => {
      FakeWebSocket.instances[0]?.onclose?.(new CloseEvent("close"));
      await vi.advanceTimersByTimeAsync(351);
    });

    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[1]?.url).toBe(
      "ws://192.168.55.131:8080/video-ws"
    );
  });
});
