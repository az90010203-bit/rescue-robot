import type { InboundMessage, PcCommand } from "@adapters/hardware/protocol";
import { A_BOARD_BRIDGE_PORT, PI_SERVO_BRIDGE_PORT } from "../robotProfile";
import { type PrioritySettings, withCommandScheduling } from "./priority";

export interface BridgeHealth {
  ok: boolean;
  service?: string;
  version?: string;
  serialPort?: string;
  baudRate?: number;
  busy?: boolean;
  queueDepth?: number;
  inFlight?: boolean;
  serialOpen?: boolean;
  requestCount?: number;
  failureCount?: number;
  activeCommand?: string | null;
  lastError?: string | null;
  lastSerialEvent?: unknown;
  lastCloseReason?: string | null;
  uptimeSec?: number;
  motionPending?: boolean;
  latestMotionSeq?: number | null;
  droppedMotionCount?: number;
  deviceExists?: boolean;
  canServoReady?: boolean;
  mecanumReady?: boolean;
  binaryProtocolReady?: boolean;
  serialProtocolActive?: string;
}

export interface AboardCommandResult {
  ok: boolean;
  busy?: boolean;
  accepted?: boolean;
  dropped?: boolean;
  messages: InboundMessage[];
  queueDepth?: number;
  inFlight?: boolean;
  error?: string;
  serialPort?: string;
  baudRate?: number;
}

export interface PiServoCommandResult {
  ok: boolean;
  messages: InboundMessage[];
  response?: InboundMessage | null;
  rawLines?: string[];
  serialPort?: string;
  baudRate?: number;
  protocol?: string;
  responseExpected?: boolean;
  error?: string;
}

export interface CommandEnvelope {
  command: PcCommand;
  timeoutMs: number;
}

export interface CommandRequestOptions {
  timeoutMs?: number;
}

export function bridgeBaseUrl(host: string, port: number): string {
  const trimmed = host.trim() || "rescue-pi.local";
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }
  return `http://${trimmed}:${port}`;
}

export function buildCommandEnvelope(command: PcCommand, priorities: PrioritySettings, options: CommandRequestOptions = {}): CommandEnvelope {
  return {
    command: withCommandScheduling(command, priorities),
    timeoutMs: options.timeoutMs ?? 1200
  };
}

export async function checkAboardBridgeHealth(host: string, options: { fetcher?: typeof fetch; timeoutMs?: number } = {}): Promise<BridgeHealth> {
  return requestJson<BridgeHealth>(`${bridgeBaseUrl(host, A_BOARD_BRIDGE_PORT)}/health`, undefined, options);
}

export async function checkPiServoBridgeHealth(host: string, options: { fetcher?: typeof fetch; timeoutMs?: number } = {}): Promise<BridgeHealth> {
  return requestJson<BridgeHealth>(`${bridgeBaseUrl(host, PI_SERVO_BRIDGE_PORT)}/health`, undefined, options);
}

export async function sendAboardCommand(
  host: string,
  command: PcCommand,
  priorities: PrioritySettings,
  options: CommandRequestOptions & { fetcher?: typeof fetch } = {}
): Promise<AboardCommandResult> {
  const envelope = buildCommandEnvelope(command, priorities, options);
  const result = await requestJson<AboardCommandResult>(
    `${bridgeBaseUrl(host, A_BOARD_BRIDGE_PORT)}/command`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope)
    },
    { fetcher: options.fetcher, timeoutMs: envelope.timeoutMs + 400 }
  );
  return {
    ...result,
    messages: Array.isArray(result.messages) ? result.messages : []
  };
}

export async function sendPiServoBridgeCommand(
  host: string,
  command: PcCommand,
  options: { fetcher?: typeof fetch; waitMs?: number; timeoutMs?: number } = {}
): Promise<PiServoCommandResult> {
  const waitMs = options.waitMs ?? 500;
  const result = await requestJson<PiServoCommandResult>(
    `${bridgeBaseUrl(host, PI_SERVO_BRIDGE_PORT)}/command`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, waitMs })
    },
    { fetcher: options.fetcher, timeoutMs: options.timeoutMs ?? waitMs + 500 }
  );
  return {
    ...result,
    messages: Array.isArray(result.messages) ? result.messages : [],
    rawLines: Array.isArray(result.rawLines) ? result.rawLines : []
  };
}

async function requestJson<T>(url: string, init: RequestInit | undefined, options: { fetcher?: typeof fetch; timeoutMs?: number }): Promise<T> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 1200);
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal, cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}
