import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

import { LatestFragmentQueue } from "../../core/latest-fragment-queue";
import {
  cameraHealthSchema,
  type AgentHealth,
  type CameraHealth
} from "../../shared/contracts";
import { PageHeading } from "../components/PageHeading";
import { StatusCard } from "../components/StatusCard";

interface CameraPageProps {
  readonly robotHealth: AgentHealth | null;
}

const rtcAnswerSchema = z.object({
  sdp: z.string(),
  type: z.literal("answer")
});
const CAMERA_REQUEST_TIMEOUT_MS = 1500;

/** Single-camera H.264, WebRTC audio and bounded Feetech gimbal console. */
export function CameraPage({ robotHealth }: CameraPageProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const audioMutedRef = useRef(false);
  const [health, setHealth] = useState<CameraHealth | null>(null);
  const [videoState, setVideoState] = useState("连接 H.264 视频");
  const [audioState, setAudioState] = useState("连接现场声音");
  const [gimbalStep, setGimbalStep] = useState(5);
  const [reloadGeneration, setReloadGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let source: MediaSource | null = null;
    let sourceBuffer: SourceBuffer | null = null;
    let objectUrl: string | null = null;
    const queue = new LatestFragmentQueue();
    let waitingForInitialization = true;

    const appendNext = (): void => {
      if (sourceBuffer === null || sourceBuffer.updating) {
        return;
      }
      const initialization = queue.takeInitialization();
      const payload = initialization ?? queue.takeLatest();
      if (payload !== null) {
        try {
          sourceBuffer.appendBuffer(payload);
        } catch {
          socket?.close();
        }
      }
    };

    const connect = (): void => {
      if (cancelled) {
        return;
      }
      if (
        !("MediaSource" in window) ||
        !MediaSource.isTypeSupported(window.rescue.camera.codec)
      ) {
        setVideoState("当前 Chromium 不支持摄像头 H.264 编码");
        return;
      }
      queue.reset();
      waitingForInitialization = true;
      sourceBuffer = null;
      if (objectUrl !== null) {
        URL.revokeObjectURL(objectUrl);
      }
      const nextSource = new MediaSource();
      source = nextSource;
      objectUrl = URL.createObjectURL(nextSource);
      const video = videoRef.current;
      if (video !== null) {
        video.src = objectUrl;
        void video.play().catch(() => undefined);
      }
      nextSource.addEventListener(
        "sourceopen",
        () => {
          if (source !== nextSource || cancelled) {
            return;
          }
          try {
            const nextBuffer = nextSource.addSourceBuffer(window.rescue.camera.codec);
            sourceBuffer = nextBuffer;
            nextBuffer.mode = "segments";
            nextBuffer.addEventListener("updateend", () => {
              if (sourceBuffer !== nextBuffer) {
                return;
              }
              const currentBuffer = nextBuffer;
              const currentVideo = videoRef.current;
              if (
                currentBuffer !== null &&
                currentVideo !== null &&
                currentBuffer.buffered.length > 0
              ) {
                const last = currentBuffer.buffered.length - 1;
                const start = currentBuffer.buffered.start(last);
                const end = currentBuffer.buffered.end(last);
                if (currentVideo.currentTime < start || end - currentVideo.currentTime > 0.3) {
                  currentVideo.currentTime = Math.max(start, end - 0.08);
                }
                if (!currentBuffer.updating && end - start > 2) {
                  currentBuffer.remove(start, Math.max(start, end - 0.8));
                  return;
                }
              }
              appendNext();
            });
            appendNext();
          } catch {
            setVideoState("无法创建 H.264 视频缓冲");
            socket?.close();
          }
        },
        { once: true }
      );

      socket = new WebSocket(window.rescue.camera.videoWebSocketUrl);
      socket.binaryType = "arraybuffer";
      socket.onopen = () => setVideoState("H.264 视频已连接");
      socket.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        const bytes = new Uint8Array(event.data);
        if (waitingForInitialization) {
          waitingForInitialization = false;
          queue.setInitialization(bytes);
        } else {
          queue.push(bytes);
        }
        appendNext();
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        if (cancelled) {
          return;
        }
        setVideoState("视频重连中");
        reconnectTimer = setTimeout(connect, 350);
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
      }
      socket?.close();
      queue.reset();
      if (objectUrl !== null) {
        URL.revokeObjectURL(objectUrl);
      }
      const video = videoRef.current;
      if (video !== null) {
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [reloadGeneration]);

  useEffect(() => {
    let cancelled = false;
    let busy = false;
    const read = async (): Promise<void> => {
      if (busy) {
        return;
      }
      busy = true;
      try {
        const response = await fetch(window.rescue.camera.healthUrl, {
          cache: "no-store",
          signal: AbortSignal.timeout(CAMERA_REQUEST_TIMEOUT_MS)
        });
        const raw: unknown = await response.json();
        const next = cameraHealthSchema.parse(raw);
        if (!cancelled) {
          setHealth(next);
        }
      } catch {
        if (!cancelled) {
          setHealth(null);
        }
      } finally {
        busy = false;
      }
    };
    void read();
    const timer = setInterval(() => void read(), 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const connectAudio = useCallback(async (): Promise<void> => {
    if (peerRef.current !== null) {
      return;
    }
    setAudioState("现场声音连接中");
    const peer = new RTCPeerConnection({ iceServers: [] });
    peerRef.current = peer;
    peer.addTransceiver("audio", { direction: "recvonly" });
    peer.ontrack = (event) => {
      const audio = audioRef.current;
      if (audio === null) {
        return;
      }
      audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      audio.muted = audioMutedRef.current;
      void audio
        .play()
        .then(() => setAudioState("现场声音开启"))
        .catch(() => setAudioState("点击启用现场声音"));
    };
    peer.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
        peer.close();
        if (peerRef.current === peer) {
          peerRef.current = null;
        }
        setAudioState("现场声音已断开");
      }
    };
    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const response = await fetch(window.rescue.camera.audioOfferUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(peer.localDescription),
        signal: AbortSignal.timeout(CAMERA_REQUEST_TIMEOUT_MS)
      });
      const raw: unknown = await response.json();
      const answer = rtcAnswerSchema.parse(raw);
      if (!response.ok) {
        throw new Error(`Camera audio HTTP ${response.status}`);
      }
      await peer.setRemoteDescription(answer);
    } catch {
      peer.close();
      if (peerRef.current === peer) {
        peerRef.current = null;
      }
      setAudioState("现场声音不可用");
    }
  }, []);

  useEffect(() => {
    void connectAudio();
    return () => {
      peerRef.current?.close();
      peerRef.current = null;
    };
  }, [connectAudio]);

  const toggleAudio = (): void => {
    const audio = audioRef.current;
    if (audio === null || peerRef.current === null) {
      void connectAudio();
      return;
    }
    const nextMuted = !audio.muted;
    audio.muted = nextMuted;
    audioMutedRef.current = nextMuted;
    setAudioState(nextMuted ? "现场声音静音" : "现场声音开启");
    if (!nextMuted) {
      void audio.play().catch(() => setAudioState("点击启用现场声音"));
    }
  };

  const gimbal = (
    axis: "pan" | "tilt",
    direction: -1 | 1
  ): void => {
    void window.rescue.invokeCapability({
      name: "gimbal",
      body: { action: "jog", axis, direction, stepDeg: gimbalStep }
    });
  };

  const feedback = robotHealth?.pi?.feetech?.feedback;
  const panRaw = feedback?.["4"]?.positionRaw;
  const tiltRaw = feedback?.["5"]?.positionRaw;

  return (
    <div className="page camera-page">
      <PageHeading
        description="单路 UGREEN · 1080p30 H.264 · 最新帧优先 · 48 kHz Opus"
        kicker="VISION / 04"
        title="主驾驶摄像头"
      />
      <div className="camera-status-row">
        <StatusCard
          detail={health === null ? undefined : `${health.reconnectCount} 次重连`}
          label="VIDEO"
          state={health?.ok ? "good" : "bad"}
          value={videoState}
        />
        <StatusCard
          detail={
            health === null
              ? undefined
              : `${health.actualFps.toFixed(1)} FPS · ${health.actualBitrateKbps ?? 0} kbps`
          }
          label="FORMAT"
          state={health?.degraded ? "warning" : "good"}
          value={health === null ? "等待数据" : `${health.width}×${health.height}`}
        />
        <StatusCard
          label="LATENCY"
          state={(health?.frameAgeMs ?? 9999) < 200 ? "good" : "warning"}
          value={health?.frameAgeMs == null ? "-- ms" : `${health.frameAgeMs} ms`}
        />
        <StatusCard
          label="POWER"
          state={health?.powerWarning ? "warning" : "good"}
          value={health?.powerWarning ? "检测到欠压记录" : "电源正常"}
        />
      </div>
      <div className="camera-layout">
        <section className="video-frame">
          <video autoPlay muted playsInline ref={videoRef} />
          <div className="video-hud top">
            <span>UGREEN / MAIN</span>
            <button onClick={() => setReloadGeneration((value) => value + 1)} type="button">
              重新连接
            </button>
          </div>
          <div className="reticle" aria-hidden="true" />
          <div className="video-hud bottom">
            <span>{health?.format ?? "H.264"}</span>
            <button onClick={toggleAudio} type="button">
              {audioState}
            </button>
          </div>
        </section>
        <section className="gimbal-panel">
          <span>FEETECH GIMBAL</span>
          <h3>云台控制</h3>
          <div className="gimbal-pad">
            <button aria-label="云台向上" onClick={() => gimbal("tilt", 1)} type="button">
              ▲
            </button>
            <button aria-label="云台向左" onClick={() => gimbal("pan", -1)} type="button">
              ◀
            </button>
            <button
              aria-label="云台回中"
              onClick={() =>
                void window.rescue.invokeCapability({
                  name: "gimbal",
                  body: { action: "center" }
                })
              }
              type="button"
            >
              ●
            </button>
            <button aria-label="云台向右" onClick={() => gimbal("pan", 1)} type="button">
              ▶
            </button>
            <button aria-label="云台向下" onClick={() => gimbal("tilt", -1)} type="button">
              ▼
            </button>
          </div>
          <label>
            单步
            <input
              max="15"
              min="1"
              onChange={(event) => setGimbalStep(Number(event.currentTarget.value))}
              type="number"
              value={gimbalStep}
            />
            °
          </label>
          <div className="gimbal-feedback">
            <span>ID4 左右</span>
            <strong>{panRaw ?? "----"}</strong>
            <span>ID5 上下</span>
            <strong>{tiltRaw ?? "----"}</strong>
          </div>
        </section>
      </div>
      <audio autoPlay ref={audioRef} />
    </div>
  );
}
