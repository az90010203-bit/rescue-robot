import { ReactNode, useEffect, useRef } from "react";
import type { CameraStreamMode } from "@adapters/persistence/storage";

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
  const onErrorRef = useRef(onError);
  const onLoadRef = useRef(onLoad);
  const onWebrtcFallbackRef = useRef(onWebrtcFallback);
  const effectiveMode: CameraEffectiveMode = mode === "webrtc" && !forceMjpeg ? "webrtc" : mode === "webrtc" ? "mjpegFallback" : "mjpeg";

  useEffect(() => {
    onErrorRef.current = onError;
    onLoadRef.current = onLoad;
    onWebrtcFallbackRef.current = onWebrtcFallback;
  }, [onError, onLoad, onWebrtcFallback]);

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
            onWebrtcFallbackRef.current(`WebRTC ${peerConnection.connectionState}`);
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
          onWebrtcFallbackRef.current(error instanceof Error && error.message ? error.message : "WebRTC failed");
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
  }, [effectiveMode, offerUrl, streamUrl]);

  useEffect(() => {
    if (!streamUrl || effectiveMode === "webrtc") {
      return undefined;
    }

    const markLoadedIfReady = () => {
      if (imageRef.current?.complete && imageRef.current.naturalWidth > 0) {
        onLoadRef.current();
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
  }, [effectiveMode, streamUrl]);

  if (!streamUrl) {
    return <>{placeholder}</>;
  }

  if (effectiveMode === "webrtc") {
    return <video ref={videoRef} autoPlay muted playsInline aria-label={alt} onCanPlay={() => onLoadRef.current()} onError={() => onErrorRef.current()} />;
  }

  return <img ref={imageRef} alt={alt} src={streamUrl} onError={() => onErrorRef.current()} onLoad={() => onLoadRef.current()} />;
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
