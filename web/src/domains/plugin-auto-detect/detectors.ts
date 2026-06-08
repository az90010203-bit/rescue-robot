import { listFirmwarePorts } from "@adapters/firmware/firmwareUpload";
import type { AboardBridgeCommandResult } from "@adapters/pi/piAboardBridge";
import { buildAsmgMdCanConfigCommand, buildAsmgMdReadIdCommand } from "@adapters/hardware/asmgMdCanServo";
import { buildPingFrame, parseFeetechStatusPacket, type PcCommand } from "@adapters/hardware/protocol";
import { WebSerialClient } from "@adapters/web-serial/serial";
import type { MotorFeedbackMap, ServoFeedbackMap } from "@platform/stateStore";
import { enumerateLocalCameraDevices } from "@domains/camera/localCamera";
import {
  candidateFromPiProfile,
  candidatesFromCanMessages,
  candidatesFromFirmwarePorts,
  candidatesFromGamepads,
  candidatesFromLocalCameras,
  candidatesFromMotorFeedback,
  candidatesFromMotorMessages,
  candidatesFromServoFeedback,
  dedupeDetectedCandidates,
  type DetectedPluginCandidate,
  type GamepadDetectionSummary,
  type PiDetectionProfile
} from "@domains/plugin-auto-detect/pluginAutoDetect";

export type PluginAutoDetectPhaseKey =
  | "ready"
  | "scanning"
  | "scanningLocalCameras"
  | "scanningSerialPorts"
  | "scanningFeetechServoBus"
  | "scanningAboardCan"
  | "scanningAboardMotorChannels"
  | "addingPlugins"
  | "canceling"
  | "canceled"
  | "complete";

export interface PluginAutoDetectionResult {
  candidates: DetectedPluginCandidate[];
  logs: string[];
  nowMs: number;
}

export interface PluginAutoDetectionOptions {
  canceled?: () => boolean;
  enumerateLocalCameraDevices?: typeof enumerateLocalCameraDevices;
  gamepads?: GamepadDetectionSummary[];
  listFirmwarePorts?: typeof listFirmwarePorts;
  motorFeedback?: MotorFeedbackMap;
  nextCommandSeq?: () => number;
  nowMs?: number;
  onPhase?: (phase: PluginAutoDetectPhaseKey) => void;
  piProfile?: PiDetectionProfile | null;
  scanFeetechServoBus?: typeof scanFeetechServoBus;
  sendAboardBridgeCanServoCommand?: (command: PcCommand, options?: { log?: boolean }) => Promise<AboardBridgeCommandResult | null>;
  servoFeedback?: ServoFeedbackMap;
}

export async function runPluginAutoDetection(options: PluginAutoDetectionOptions = {}): Promise<PluginAutoDetectionResult> {
  const logs: string[] = [];
  const nowMs = options.nowMs ?? Date.now();
  const canceled = options.canceled ?? (() => false);
  const onPhase = options.onPhase ?? (() => undefined);
  const candidates = [
    ...candidatesFromGamepads(options.gamepads ?? [], nowMs),
    ...candidatesFromServoFeedback(options.servoFeedback ?? {}, nowMs),
    ...candidatesFromMotorFeedback(options.motorFeedback ?? {}, nowMs)
  ];
  const piCandidate = candidateFromPiProfile(options.piProfile, nowMs);
  if (piCandidate) {
    candidates.push(piCandidate);
  }

  try {
    onPhase("scanningLocalCameras");
    const cameras = await (options.enumerateLocalCameraDevices ?? enumerateLocalCameraDevices)();
    candidates.push(...candidatesFromLocalCameras(cameras, nowMs));
    logs.push(`Camera scan found ${cameras.length} video input(s).`);
  } catch (error) {
    logs.push(`Camera scan failed: ${errorMessage(error)}`);
  }

  try {
    onPhase("scanningSerialPorts");
    const ports = await (options.listFirmwarePorts ?? listFirmwarePorts)();
    candidates.push(...candidatesFromFirmwarePorts(ports, nowMs));
    logs.push(`Serial scan found ${ports.length} port(s).`);
  } catch (error) {
    logs.push(`Serial helper unavailable: ${errorMessage(error)}`);
  }

  try {
    onPhase("scanningFeetechServoBus");
    const servoCandidates = await (options.scanFeetechServoBus ?? scanFeetechServoBus)(nowMs, canceled);
    candidates.push(...servoCandidates);
    logs.push(`Feetech bus scan found ${servoCandidates.length} servo candidate(s).`);
  } catch (error) {
    logs.push(`Feetech bus scan skipped: ${errorMessage(error)}`);
  }

  if (options.sendAboardBridgeCanServoCommand && options.nextCommandSeq && !canceled()) {
    try {
      onPhase("scanningAboardCan");
      const configResult = await options.sendAboardBridgeCanServoCommand(buildAsmgMdCanConfigCommand(options.nextCommandSeq()), { log: false });
      const readResult = await options.sendAboardBridgeCanServoCommand(buildAsmgMdReadIdCommand(options.nextCommandSeq()), { log: false });
      const messages = [...(configResult?.messages ?? []), ...(readResult?.messages ?? [])];
      const canCandidates = candidatesFromCanMessages(messages, nowMs);
      candidates.push(...canCandidates);
      logs.push(`A board CAN scan found ${canCandidates.length} servo candidate(s).`);
    } catch (error) {
      logs.push(`A board CAN scan failed: ${errorMessage(error)}`);
    }

    try {
      onPhase("scanningAboardMotorChannels");
      const messages = [];
      for (let channelIndex = 1; channelIndex <= 8; channelIndex += 1) {
        if (canceled()) {
          break;
        }
        const result = await options.sendAboardBridgeCanServoCommand({ type: "motor.read", seq: options.nextCommandSeq(), channel: `M${channelIndex}` }, { log: false });
        messages.push(...(result?.messages ?? []));
      }
      const motorCandidates = candidatesFromMotorMessages(messages, nowMs);
      candidates.push(...motorCandidates);
      logs.push(`A board motor scan found ${motorCandidates.length} channel candidate(s).`);
    } catch (error) {
      logs.push(`A board motor scan failed: ${errorMessage(error)}`);
    }
  }

  return {
    candidates: dedupeDetectedCandidates(candidates),
    logs,
    nowMs
  };
}

export async function scanFeetechServoBus(nowMs: number, canceled: () => boolean) {
  if (typeof navigator === "undefined" || !navigator.serial) {
    throw new Error("Web Serial is not available");
  }
  const detected: Record<number, { id: number }> = {};
  const client = new WebSerialClient(() => undefined);
  await client.connect(1000000, "binary");
  try {
    for (let id = 0; id <= 253; id += 1) {
      if (canceled()) {
        break;
      }
      await client.sendBytes(buildPingFrame(id));
      const bytes = await client.readBufferedBytes(18);
      const packet = parseFeetechStatusPacket(bytes);
      if (packet && packet.id >= 0 && packet.id <= 253) {
        detected[packet.id] = { id: packet.id };
      }
    }
  } finally {
    await client.disconnect();
  }
  return candidatesFromServoFeedback(detected, nowMs);
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "unknown error";
}
