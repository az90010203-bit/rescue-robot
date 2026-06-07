import { Radar, RotateCw, Square, Usb } from "lucide-react";
import { useRef, useState } from "react";
import { createPluginInstance, updatePluginInstance } from "../../lib/dataService";
import { listFirmwarePorts } from "../../lib/firmwareUpload";
import type { AboardBridgeCommandResult } from "../../lib/piAboardBridge";
import { buildPingFrame, parseFeetechStatusPacket, type PcCommand } from "../../lib/protocol";
import { WebSerialClient } from "../../lib/serial";
import { buildAsmgMdCanConfigCommand, buildAsmgMdReadIdCommand } from "../../lib/asmgMdCanServo";
import { enumerateLocalCameraDevices } from "../platform/localCamera";
import type { PluginInstance } from "../../platform/architecture";
import type { MotorFeedbackMap, ServoFeedbackMap } from "../../platform/stateStore";
import {
  autoAddDetectedPlugins,
  candidateFromPiProfile,
  candidatesFromCanMessages,
  candidatesFromFirmwarePorts,
  candidatesFromGamepads,
  candidatesFromLocalCameras,
  candidatesFromMotorFeedback,
  candidatesFromMotorMessages,
  candidatesFromServoFeedback,
  dedupeDetectedCandidates,
  detectionSummary,
  type DetectionRunResult,
  type GamepadDetectionSummary,
  type PiDetectionProfile
} from "./pluginAutoDetect";

interface PluginAutoDetectPanelProps {
  gamepads?: GamepadDetectionSummary[];
  motorFeedback?: MotorFeedbackMap;
  onFinished: () => Promise<void>;
  piProfile?: PiDetectionProfile | null;
  pluginInstances: PluginInstance[];
  projectId: string;
  sendAboardBridgeCanServoCommand?: (command: PcCommand, options?: { log?: boolean }) => Promise<AboardBridgeCommandResult | null>;
  nextCommandSeq?: () => number;
  servoFeedback?: ServoFeedbackMap;
}

export function PluginAutoDetectPanel({
  gamepads = [],
  motorFeedback = {},
  nextCommandSeq,
  onFinished,
  piProfile,
  pluginInstances,
  projectId,
  sendAboardBridgeCanServoCommand,
  servoFeedback = {}
}: PluginAutoDetectPanelProps) {
  const [result, setResult] = useState<DetectionRunResult | null>(null);
  const [phase, setPhase] = useState("Ready");
  const [running, setRunning] = useState(false);
  const cancelRef = useRef(false);

  async function runDetection() {
    if (running) {
      return;
    }
    cancelRef.current = false;
    setRunning(true);
    setPhase("Scanning");
    const logs: string[] = [];
    const nowMs = Date.now();
    let candidates = [
      ...candidatesFromGamepads(gamepads, nowMs),
      ...candidatesFromServoFeedback(servoFeedback, nowMs),
      ...candidatesFromMotorFeedback(motorFeedback, nowMs)
    ];
    const piCandidate = candidateFromPiProfile(piProfile, nowMs);
    if (piCandidate) {
      candidates.push(piCandidate);
    }

    try {
      setPhase("Scanning local cameras");
      const cameras = await enumerateLocalCameraDevices();
      candidates.push(...candidatesFromLocalCameras(cameras, nowMs));
      logs.push(`Camera scan found ${cameras.length} video input(s).`);
    } catch (error) {
      logs.push(`Camera scan failed: ${errorMessage(error)}`);
    }

    try {
      setPhase("Scanning serial ports");
      const ports = await listFirmwarePorts();
      candidates.push(...candidatesFromFirmwarePorts(ports, nowMs));
      logs.push(`Serial scan found ${ports.length} port(s).`);
    } catch (error) {
      logs.push(`Serial helper unavailable: ${errorMessage(error)}`);
    }

    try {
      setPhase("Scanning Feetech servo bus");
      const servoCandidates = await scanFeetechServoBus(nowMs, () => cancelRef.current);
      candidates.push(...servoCandidates);
      logs.push(`Feetech bus scan found ${servoCandidates.length} servo candidate(s).`);
    } catch (error) {
      logs.push(`Feetech bus scan skipped: ${errorMessage(error)}`);
    }

    if (sendAboardBridgeCanServoCommand && nextCommandSeq && !cancelRef.current) {
      try {
        setPhase("Scanning A board CAN");
        const configResult = await sendAboardBridgeCanServoCommand(buildAsmgMdCanConfigCommand(nextCommandSeq()), { log: false });
        const readResult = await sendAboardBridgeCanServoCommand(buildAsmgMdReadIdCommand(nextCommandSeq()), { log: false });
        const messages = [...(configResult?.messages ?? []), ...(readResult?.messages ?? [])];
        const canCandidates = candidatesFromCanMessages(messages, nowMs);
        candidates.push(...canCandidates);
        logs.push(`A board CAN scan found ${canCandidates.length} servo candidate(s).`);
      } catch (error) {
        logs.push(`A board CAN scan failed: ${errorMessage(error)}`);
      }

      try {
        setPhase("Scanning A board motor channels");
        const messages = [];
        for (let channelIndex = 1; channelIndex <= 8; channelIndex += 1) {
          if (cancelRef.current) {
            break;
          }
          const result = await sendAboardBridgeCanServoCommand({ type: "motor.read", seq: nextCommandSeq(), channel: `M${channelIndex}` }, { log: false });
          messages.push(...(result?.messages ?? []));
        }
        const motorCandidates = candidatesFromMotorMessages(messages, nowMs);
        candidates.push(...motorCandidates);
        logs.push(`A board motor scan found ${motorCandidates.length} channel candidate(s).`);
      } catch (error) {
        logs.push(`A board motor scan failed: ${errorMessage(error)}`);
      }
    }

    const uniqueCandidates = dedupeDetectedCandidates(candidates);
    setPhase("Adding plugins");
    const nextResult = await autoAddDetectedPlugins(
      projectId,
      uniqueCandidates,
      pluginInstances,
      { createPluginInstance, updatePluginInstance },
      { nowMs, shouldContinue: () => !cancelRef.current }
    );
    const withLogs = { ...nextResult, logs: [...logs, ...nextResult.logs] };
    setResult(withLogs);
    setPhase(cancelRef.current ? "Canceled" : "Complete");
    setRunning(false);
    if (withLogs.created.length > 0 || withLogs.skipped.length > 0) {
      await onFinished();
    }
  }

  function cancelDetection() {
    cancelRef.current = true;
    setPhase("Canceling");
  }

  const summary = detectionSummary(result);

  return (
    <section className="plugin-auto-detect-panel" aria-label="Plugin auto detection">
      <div className="plugin-auto-detect-head">
        <div>
          <strong>Auto detect</strong>
          <small>{phase}</small>
        </div>
        <div className="plugin-auto-detect-actions">
          {running ? (
            <button className="icon-button danger" onClick={cancelDetection} type="button">
              <Square size={16} />
              <span>Cancel</span>
            </button>
          ) : (
            <button className="icon-button primary" onClick={() => void runDetection()} type="button">
              <Radar size={16} />
              <span>Detect devices</span>
            </button>
          )}
        </div>
      </div>
      <div className="plugin-auto-detect-metrics">
        <span><small>Candidates</small><strong>{result?.candidates.length ?? "--"}</strong></span>
        <span><small>Created</small><strong>{result?.created.length ?? "--"}</strong></span>
        <span><small>Skipped</small><strong>{result?.skipped.length ?? "--"}</strong></span>
        <span><small>Failed</small><strong>{result?.failed.length ?? "--"}</strong></span>
      </div>
      <div className="plugin-auto-detect-summary">
        <Usb size={15} />
        <span>{summary}</span>
        {running && <RotateCw className="plugin-auto-detect-spin" size={15} />}
      </div>
      {result && (
        <div className="plugin-auto-detect-log">
          {result.logs.slice(-10).map((line, index) => (
            <code key={`${line}:${index}`}>{line}</code>
          ))}
        </div>
      )}
    </section>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "unknown error";
}

async function scanFeetechServoBus(nowMs: number, canceled: () => boolean) {
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
