import { ReactNode, useEffect, useRef } from "react";
import type { CameraStreamMode } from "../../lib/storage";

export type CameraEffectiveMode = CameraStreamMode | "mjpegFallback";

interface CameraViewerProps {
  alt: string;
  forceMjpeg?: boolean;
  mode: CameraStreamMode;
  offerUrl: string;
  onError: () => void;
  onLoad: () => void;
  onWebrtcFallback: (error: string) => void;
  placeholder: ReactNode;
  streamUrl: string;
}

export function CameraViewer({
  alt,
  forceMjpeg = false,
  mode,
  offerUrl,
  onError,
  onLoad,
  onWebrtcFallback,
  placeholder,
  streamUrl
}: CameraViewerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const effectiveMode: CameraEffectiveMode = mode === "webrtc" && !forceMjpeg ? "webrtc" : mode === "webrtc" ? "mjpegFallback" : "mjpeg";

  useEffect(() => {
    if (!streamUrl || effectiveMode !== "webrtc") {
      return undefined;
    }

    let cancelled = false;
    let peerConnection: RTCPeerConnection | null = null;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);

    async function connectWebrtc() {
      try {
        if (!offerUrl) {
          throw new Error("WebRTC offer URL is not configured");
        }

        peerConnection = new RTCPeerConnection({ iceServers: [] });
        peerConnection.addTransceiver("video", { direction: "recvonly" });
        peerConnection.addEventListener("connectionstatechange", () => {
          if (!cancelled && peerConnection && ["failed", "closed", "disconnected"].includes(peerConnection.connectionState)) {
            onWebrtcFallback(`WebRTC ${peerConnection.connectionState}`);
          }
        });
        peerConnection.addEventListener("track", (event) => {
          const [stream] = event.streams;
          if (videoRef.current) {
            videoRef.current.srcObject = stream ?? new MediaStream([event.track]);
          }
        });

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        await waitForIceGatheringComplete(peerConnection);

        const localDescription = peerConnection.localDescription;
        if (!localDescription) {
          throw new Error("WebRTC local description was not created");
        }

        const response = await fetch(offerUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sdp: localDescription.sdp, type: localDescription.type }),
          cache: "no-store",
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error(`WebRTC offer returned ${response.status}`);
        }

        const answer = (await response.json()) as { sdp?: unknown; type?: unknown; error?: unknown };
        if (typeof answer.sdp !== "string" || typeof answer.type !== "string") {
          throw new Error(typeof answer.error === "string" ? answer.error : "WebRTC answer is invalid");
        }

        await peerConnection.setRemoteDescription({ sdp: answer.sdp, type: answer.type as RTCSdpType });
      } catch (error) {
        if (!cancelled) {
          onWebrtcFallback(error instanceof Error && error.message ? error.message : "WebRTC failed");
        }
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void connectWebrtc();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      peerConnection?.close();
    };
  }, [effectiveMode, offerUrl, onWebrtcFallback, streamUrl]);

  useEffect(() => {
    if (!streamUrl || effectiveMode === "webrtc") {
      return undefined;
    }

    const markLoadedIfReady = () => {
      if (imageRef.current?.complete && imageRef.current.naturalWidth > 0) {
        onLoad();
        return true;
      }
      return false;
    };

    if (markLoadedIfReady()) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      if (markLoadedIfReady()) {
        window.clearInterval(timer);
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [effectiveMode, onLoad, streamUrl]);

  if (!streamUrl) {
    return <>{placeholder}</>;
  }

  if (effectiveMode === "webrtc") {
    return <video ref={videoRef} autoPlay muted playsInline aria-label={alt} onCanPlay={onLoad} onError={onError} />;
  }

  return <img ref={imageRef} alt={alt} src={streamUrl} onError={onError} onLoad={onLoad} />;
}

function waitForIceGatheringComplete(peerConnection: RTCPeerConnection, timeoutMs = 1200): Promise<void> {
  if (peerConnection.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = window.setTimeout(done, timeoutMs);

    function done() {
      window.clearTimeout(timeout);
      peerConnection.removeEventListener("icegatheringstatechange", handleStateChange);
      resolve();
    }

    function handleStateChange() {
      if (peerConnection.iceGatheringState === "complete") {
        done();
      }
    }

    peerConnection.addEventListener("icegatheringstatechange", handleStateChange);
  });
}
