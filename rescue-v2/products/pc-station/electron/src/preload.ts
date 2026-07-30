import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { z } from "zod";

import type {
  AgentHealth,
  CapabilityInvocation,
  MotionIntentPayload,
  SpeedLimitsPayload,
  StopReason
} from "./shared/contracts";
import { agentHealthSchema } from "./shared/contracts";
import type {
  OperationNotice,
  RescueBridge,
  Unsubscribe
} from "./shared/bridge";
import { CHANNELS } from "./shared/channels";

const operationNoticeSchema = z.object({
  level: z.enum(["error", "info", "warning"]),
  message: z.string()
});

const camera = Object.freeze({
  healthUrl: "http://192.168.55.131:8080/health",
  videoWebSocketUrl: "ws://192.168.55.131:8080/video-ws",
  audioOfferUrl: "http://192.168.55.131:8080/audio-offer",
  codec: 'video/mp4; codecs="avc1.640028"'
});

const invokeVoid = async (channel: string, payload?: object | string): Promise<void> => {
  await ipcRenderer.invoke(channel, payload);
};

const bridge: RescueBridge = {
  async getHealth(): Promise<AgentHealth | null> {
    const raw: unknown = await ipcRenderer.invoke(CHANNELS.getHealth);
    return agentHealthSchema.nullable().parse(raw);
  },
  onHealth(listener: (health: AgentHealth | null) => void): Unsubscribe {
    const handler = (_event: IpcRendererEvent, raw: unknown): void => {
      listener(agentHealthSchema.nullable().parse(raw));
    };
    ipcRenderer.on(CHANNELS.healthChanged, handler);
    return () => ipcRenderer.removeListener(CHANNELS.healthChanged, handler);
  },
  onOperation(listener: (notice: OperationNotice) => void): Unsubscribe {
    const handler = (_event: IpcRendererEvent, raw: unknown): void => {
      listener(operationNoticeSchema.parse(raw));
    };
    ipcRenderer.on(CHANNELS.operation, handler);
    return () => ipcRenderer.removeListener(CHANNELS.operation, handler);
  },
  setMotion(motion: MotionIntentPayload): Promise<void> {
    return invokeVoid(CHANNELS.setMotion, motion);
  },
  clearMotion(): Promise<void> {
    return invokeVoid(CHANNELS.clearMotion);
  },
  setSpeedLimits(limits: SpeedLimitsPayload): Promise<void> {
    return invokeVoid(CHANNELS.setSpeedLimits, limits);
  },
  arm(): Promise<void> {
    return invokeVoid(CHANNELS.arm);
  },
  stop(reason: StopReason): Promise<void> {
    return invokeVoid(CHANNELS.stop, reason);
  },
  invokeCapability(invocation: CapabilityInvocation): Promise<void> {
    return invokeVoid(CHANNELS.capability, invocation);
  },
  restartSoftware(): Promise<void> {
    return invokeVoid(CHANNELS.restart);
  },
  camera
};

contextBridge.exposeInMainWorld("rescue", Object.freeze(bridge));
