import piServoSerialBridgeScript from "../../../local-services/pi-servo-serial-bridge.py?raw";
import { FEETECH_READ, parseFeetechStatusPacket, parseFeetechStatusPackets, type FeetechStatusPacket } from "@adapters/hardware/protocol";
import {
  execPiCommand,
  PiConnectionRequest,
  PiExecResult,
  PiRemoteError,
  PiSetupProfile,
  resolvePiWorkspaceDir,
  setupPiWorkspace,
  uploadPiFile
} from "@adapters/pi/piRemote";

export const PI_SERVO_BRIDGE_PORT = 17354;
export const PI_SERVO_BRIDGE_SCRIPT_NAME = "pi_servo_serial_bridge.py";
export const PI_SERVO_BRIDGE_SERVICE_NAME = "pi-servo-serial-bridge.service";
export const PI_SERVO_BRIDGE_SERIAL_PORT = "/dev/serial0";
export const PI_SERVO_BRIDGE_BAUD_RATE = 115_200;
export const PI_SERVO_BRIDGE_HOST = "0.0.0.0";
const PI_SERVO_BRIDGE_FRAME_TIMEOUT_PADDING_MS = 2600;

export interface PiServoBridgeHealth {
  ok: boolean;
  serialPort: string;
  baudRate: number;
  service?: string;
  version?: string;
  queueDepth?: number;
  inFlight?: boolean;
  serialOpen?: boolean;
  droppedRxBytes?: number;
  lastDroppedRxAt?: number | null;
  responseRetries?: number;
  liveSkipped?: number;
  liveRateLimited?: number;
  liveLastSentAtByKey?: Record<string, number>;
  reconnectCount?: number;
  lastReconnectAt?: number | null;
  reconnectIntervalSec?: number;
  deviceExists?: boolean;
  lastSerialEvent?: PiBridgeSerialEvent | null;
  lastCloseReason?: string | null;
  lastException?: PiBridgeExceptionDetail | null;
  consecutiveOpenFailures?: number;
  diagnosticsPath?: string;
}

export interface PiBridgeExceptionDetail {
  type?: string;
  message?: string;
  errno?: number;
  strerror?: string;
  filename?: string;
}

export interface PiBridgeSerialDeviceSnapshot {
  path?: string;
  exists?: boolean;
  realpath?: string;
  modeOct?: string;
  uid?: number;
  gid?: number;
  rdev?: number;
  statError?: PiBridgeExceptionDetail;
}

export interface PiBridgeSerialEvent {
  at?: number;
  kind?: string;
  message?: string;
  serialOpen?: boolean;
  deviceExists?: boolean;
  queueDepth?: number;
  inFlight?: boolean;
  reason?: string;
  requestId?: number;
  waitMs?: number;
  timeoutMs?: number;
  droppedBytes?: number;
  frameHead?: number[];
  device?: PiBridgeSerialDeviceSnapshot;
  exception?: PiBridgeExceptionDetail;
  [key: string]: unknown;
}

export interface PiServoBridgeDiagnostics extends PiServoBridgeHealth {
  device?: PiBridgeSerialDeviceSnapshot;
  inFlightRequestId?: number | null;
  requestCount?: number;
  failureCount?: number;
  lastError?: string | null;
  events: PiBridgeSerialEvent[];
  uptimeSec?: number;
}

export interface PiServoBridgeFrameResult {
  ok: boolean;
  rxBytes: number[];
  packet: FeetechStatusPacket | null;
  reason?: string;
  responseExpected?: boolean;
  serialPort?: string;
  baudRate?: number;
  skipped?: boolean;
}

export interface PiServoBridgeStartResult {
  ok: boolean;
  workspaceDir: string;
  remotePath: string;
  exec: PiExecResult;
  serviceName?: string;
  servicePath?: string;
  serviceStatus?: string;
  persistent?: boolean;
}

interface PiServoBridgeRequestOptions {
  ackDrainMs?: number;
  coalesceKey?: string;
  fetcher?: typeof fetch;
  minIntervalMs?: number;
  policy?: "latest";
  timeoutMs?: number;
  waitMs?: number;
}

export function buildPiServoBridgeBaseUrl(host: string): string {
  const trimmed = host.trim() || "rescue-pi.local";
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }
  return `http://${trimmed}:${PI_SERVO_BRIDGE_PORT}`;
}

export async function checkPiServoBridge(host: string, options: PiServoBridgeRequestOptions = {}): Promise<PiServoBridgeHealth> {
  const value = await requestPiServoBridgeJson<unknown>(host, "/health", undefined, options);
  if (!isRecord(value)) {
    throw new PiRemoteError("invalidResponse", "Pi servo serial bridge returned an invalid health response");
  }
  const health: PiServoBridgeHealth = {
    ok: value.ok === true,
    serialPort: typeof value.serialPort === "string" ? value.serialPort : PI_SERVO_BRIDGE_SERIAL_PORT,
    baudRate: typeof value.baudRate === "number" ? value.baudRate : PI_SERVO_BRIDGE_BAUD_RATE
  };
  if (typeof value.service === "string") health.service = value.service;
  if (typeof value.version === "string") health.version = value.version;
  if (typeof value.queueDepth === "number") health.queueDepth = value.queueDepth;
  if (typeof value.inFlight === "boolean") health.inFlight = value.inFlight;
  if (typeof value.serialOpen === "boolean") health.serialOpen = value.serialOpen;
  if (typeof value.droppedRxBytes === "number") health.droppedRxBytes = value.droppedRxBytes;
  if (typeof value.lastDroppedRxAt === "number" || value.lastDroppedRxAt === null) health.lastDroppedRxAt = value.lastDroppedRxAt;
  if (typeof value.responseRetries === "number") health.responseRetries = value.responseRetries;
  if (typeof value.liveSkipped === "number") health.liveSkipped = value.liveSkipped;
  if (typeof value.liveRateLimited === "number") health.liveRateLimited = value.liveRateLimited;
  if (isNumberRecord(value.liveLastSentAtByKey)) health.liveLastSentAtByKey = value.liveLastSentAtByKey;
  if (typeof value.reconnectCount === "number") health.reconnectCount = value.reconnectCount;
  if (typeof value.lastReconnectAt === "number" || value.lastReconnectAt === null) health.lastReconnectAt = value.lastReconnectAt;
  if (typeof value.reconnectIntervalSec === "number") health.reconnectIntervalSec = value.reconnectIntervalSec;
  if (typeof value.deviceExists === "boolean") health.deviceExists = value.deviceExists;
  if (isPiBridgeSerialEvent(value.lastSerialEvent) || value.lastSerialEvent === null) health.lastSerialEvent = value.lastSerialEvent;
  if (typeof value.lastCloseReason === "string" || value.lastCloseReason === null) health.lastCloseReason = value.lastCloseReason;
  if (isPiBridgeExceptionDetail(value.lastException) || value.lastException === null) health.lastException = value.lastException;
  if (typeof value.consecutiveOpenFailures === "number") health.consecutiveOpenFailures = value.consecutiveOpenFailures;
  if (typeof value.diagnosticsPath === "string") health.diagnosticsPath = value.diagnosticsPath;
  return health;
}

export async function requestPiServoBridgeDiagnostics(host: string, options: PiServoBridgeRequestOptions = {}): Promise<PiServoBridgeDiagnostics> {
  const value = await requestPiServoBridgeJson<unknown>(host, "/diagnostics", undefined, options);
  if (!isRecord(value) || !Array.isArray(value.events)) {
    throw new PiRemoteError("invalidResponse", "Pi servo serial bridge returned an invalid diagnostics response");
  }
  return {
    ...normalizePiServoBridgeHealth(value),
    device: isPiBridgeSerialDeviceSnapshot(value.device) ? value.device : undefined,
    inFlightRequestId: typeof value.inFlightRequestId === "number" || value.inFlightRequestId === null ? value.inFlightRequestId : undefined,
    requestCount: typeof value.requestCount === "number" ? value.requestCount : undefined,
    failureCount: typeof value.failureCount === "number" ? value.failureCount : undefined,
    lastError: typeof value.lastError === "string" || value.lastError === null ? value.lastError : undefined,
    events: value.events.filter(isPiBridgeSerialEvent),
    uptimeSec: typeof value.uptimeSec === "number" ? value.uptimeSec : undefined
  };
}

export async function sendPiServoBridgeFrame(host: string, frame: number[], options: PiServoBridgeRequestOptions = {}): Promise<PiServoBridgeFrameResult> {
  const timeoutMs = options.timeoutMs ?? Math.max(3000, (options.waitMs ?? 80) + PI_SERVO_BRIDGE_FRAME_TIMEOUT_PADDING_MS);
  const body: Record<string, unknown> = { frame, waitMs: options.waitMs };
  if (options.policy) body.policy = options.policy;
  if (options.coalesceKey) body.coalesceKey = options.coalesceKey;
  if (typeof options.minIntervalMs === "number") body.minIntervalMs = options.minIntervalMs;
  if (typeof options.ackDrainMs === "number") body.ackDrainMs = options.ackDrainMs;
  const value = await requestPiServoBridgeJson<unknown>(
    host,
    "/frame",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    },
    { ...options, timeoutMs }
  );
  if (!isRecord(value) || !Array.isArray(value.rxBytes)) {
    throw new PiRemoteError("invalidResponse", "Pi servo serial bridge returned an invalid frame response");
  }
  const rxBytes = value.rxBytes.filter(isByte);
  const result: PiServoBridgeFrameResult = {
    ok: value.ok !== false,
    rxBytes,
    packet: selectPiServoBridgePacket(frame, rxBytes)
  };
  if (typeof value.reason === "string") result.reason = value.reason;
  if (typeof value.responseExpected === "boolean") result.responseExpected = value.responseExpected;
  if (typeof value.serialPort === "string") result.serialPort = value.serialPort;
  if (typeof value.baudRate === "number") result.baudRate = value.baudRate;
  if (value.skipped === true) result.skipped = true;
  return result;
}

function normalizePiServoBridgeHealth(value: Record<string, unknown>): PiServoBridgeHealth {
  const health: PiServoBridgeHealth = {
    ok: value.ok === true,
    serialPort: typeof value.serialPort === "string" ? value.serialPort : PI_SERVO_BRIDGE_SERIAL_PORT,
    baudRate: typeof value.baudRate === "number" ? value.baudRate : PI_SERVO_BRIDGE_BAUD_RATE
  };
  if (typeof value.service === "string") health.service = value.service;
  if (typeof value.version === "string") health.version = value.version;
  if (typeof value.queueDepth === "number") health.queueDepth = value.queueDepth;
  if (typeof value.inFlight === "boolean") health.inFlight = value.inFlight;
  if (typeof value.serialOpen === "boolean") health.serialOpen = value.serialOpen;
  if (typeof value.droppedRxBytes === "number") health.droppedRxBytes = value.droppedRxBytes;
  if (typeof value.lastDroppedRxAt === "number" || value.lastDroppedRxAt === null) health.lastDroppedRxAt = value.lastDroppedRxAt;
  if (typeof value.responseRetries === "number") health.responseRetries = value.responseRetries;
  if (typeof value.liveSkipped === "number") health.liveSkipped = value.liveSkipped;
  if (typeof value.liveRateLimited === "number") health.liveRateLimited = value.liveRateLimited;
  if (isNumberRecord(value.liveLastSentAtByKey)) health.liveLastSentAtByKey = value.liveLastSentAtByKey;
  if (typeof value.reconnectCount === "number") health.reconnectCount = value.reconnectCount;
  if (typeof value.lastReconnectAt === "number" || value.lastReconnectAt === null) health.lastReconnectAt = value.lastReconnectAt;
  if (typeof value.reconnectIntervalSec === "number") health.reconnectIntervalSec = value.reconnectIntervalSec;
  if (typeof value.deviceExists === "boolean") health.deviceExists = value.deviceExists;
  if (isPiBridgeSerialEvent(value.lastSerialEvent) || value.lastSerialEvent === null) health.lastSerialEvent = value.lastSerialEvent;
  if (typeof value.lastCloseReason === "string" || value.lastCloseReason === null) health.lastCloseReason = value.lastCloseReason;
  if (isPiBridgeExceptionDetail(value.lastException) || value.lastException === null) health.lastException = value.lastException;
  if (typeof value.consecutiveOpenFailures === "number") health.consecutiveOpenFailures = value.consecutiveOpenFailures;
  if (typeof value.diagnosticsPath === "string") health.diagnosticsPath = value.diagnosticsPath;
  return health;
}

function selectPiServoBridgePacket(frame: number[], rxBytes: number[]): FeetechStatusPacket | null {
  const packets = parseFeetechStatusPackets(rxBytes);
  if (packets.length === 0) {
    return null;
  }
  const targetId = isByte(frame[2]) ? frame[2] : undefined;
  const instruction = isByte(frame[4]) ? frame[4] : undefined;
  const expectedReadLength = instruction === FEETECH_READ && isByte(frame[6]) ? frame[6] : 0;
  if (targetId !== undefined) {
    const matching = packets.filter((packet) => packet.id === targetId);
    if (expectedReadLength > 0) {
      const readPacket = matching.find((packet) => packet.params.length >= expectedReadLength);
      if (readPacket) {
        return readPacket;
      }
    }
    if (matching[0]) {
      return matching[0];
    }
  }
  return parseFeetechStatusPacket(rxBytes);
}

export async function startPiServoBridge(
  connection: PiConnectionRequest,
  profile: Pick<PiSetupProfile, "workspaceDir">,
  options: PiServoBridgeRequestOptions = {}
): Promise<PiServoBridgeStartResult> {
  const requestOptions = { ...options, operation: { name: "pi.servo-bridge.start" } };
  const workspace = await setupPiWorkspace(connection, profile, requestOptions);
  const workspaceDir = resolvePiWorkspaceDir(profile.workspaceDir, connection.username);
  const remotePath = `${workspaceDir}/${PI_SERVO_BRIDGE_SCRIPT_NAME}`;
  const file = new File([PI_SERVO_SERIAL_BRIDGE_SCRIPT], PI_SERVO_BRIDGE_SCRIPT_NAME, { type: "text/x-python" });
  await uploadPiFile({ ...connection, file, remotePath }, requestOptions);
  const command = buildPiServoBridgeServiceCommand({
    password: connection.password,
    remotePath,
    username: connection.username,
    workspaceDir
  });
  const exec = await execPiCommand({ ...connection, command, timeoutMs: 20_000 }, requestOptions);
  return {
    ok: workspace.ok && exec.exitCode === 0 && /pi_servo_bridge_service:active/.test(exec.stdout),
    workspaceDir,
    remotePath,
    exec,
    serviceName: PI_SERVO_BRIDGE_SERVICE_NAME,
    servicePath: `/etc/systemd/system/${PI_SERVO_BRIDGE_SERVICE_NAME}`,
    serviceStatus: exec.stdout,
    persistent: true
  };
}

interface PiServoBridgeServiceCommandOptions {
  password?: string;
  remotePath: string;
  username: string;
  workspaceDir: string;
}

export function buildPiServoBridgeServiceCommand(options: PiServoBridgeServiceCommandOptions): string {
  const workspaceDir = options.workspaceDir;
  const remotePath = options.remotePath;
  const servicePath = `/etc/systemd/system/${PI_SERVO_BRIDGE_SERVICE_NAME}`;
  const serviceTempPath = `${workspaceDir}/${PI_SERVO_BRIDGE_SERVICE_NAME}`;
  const sudoRefresh = options.password
    ? `printf %s ${shellQuote(`${options.password}\n`)} | sudo -S -p '' -v`
    : "sudo -n -v";
  const service = [
    "[Unit]",
    "Description=Rescue Robot Pi Feetech servo serial HTTP bridge",
    "Wants=network-online.target",
    "After=network-online.target",
    "",
    "[Service]",
    "Type=simple",
    `User=${options.username.trim() || "pi"}`,
    `WorkingDirectory=${workspaceDir}`,
    `Environment=PI_SERVO_SERIAL_PORT=${PI_SERVO_BRIDGE_SERIAL_PORT}`,
    `Environment=PI_SERVO_BAUD=${PI_SERVO_BRIDGE_BAUD_RATE}`,
    `Environment=PI_SERVO_BRIDGE_HOST=${PI_SERVO_BRIDGE_HOST}`,
    `Environment=PI_SERVO_BRIDGE_PORT=${PI_SERVO_BRIDGE_PORT}`,
    `ExecStart=/usr/bin/python3 ${remotePath}`,
    "Restart=always",
    "RestartSec=2",
    "",
    "[Install]",
    "WantedBy=multi-user.target"
  ].join("\n");
  return [
    "set -eu",
    `mkdir -p ${shellQuote(workspaceDir)}`,
    `chmod 755 ${shellQuote(remotePath)}`,
    `cat > ${shellQuote(serviceTempPath)} <<'RESCUE_ROBOT_PI_SERVO_SERVICE'`,
    service,
    "RESCUE_ROBOT_PI_SERVO_SERVICE",
    sudoRefresh,
    "boot_config='/boot/firmware/config.txt'",
    "if [ ! -f \"$boot_config\" ]; then boot_config='/boot/config.txt'; fi",
    "if [ ! -f \"$boot_config\" ]; then echo 'pi_servo_uart_config:missing' >&2; exit 13; fi",
    "if ! grep -Eq '^[[:space:]]*enable_uart=1([[:space:]]|$)' \"$boot_config\"; then printf '\\n# Rescue Robot Pi servo HAT UART\\nenable_uart=1\\n' | sudo -n tee -a \"$boot_config\" >/dev/null; echo 'pi_servo_uart:enabled'; else echo 'pi_servo_uart:present'; fi",
    `if sudo -n systemctl cat a-board-serial-bridge.service 2>/dev/null | grep -q 'A_BOARD_SERIAL_PORT=${PI_SERVO_BRIDGE_SERIAL_PORT}'; then sudo -n systemctl disable --now a-board-serial-bridge.service 2>/dev/null || true; echo 'legacy_a_board_serial0:disabled'; fi`,
    "sudo -n systemctl stop serial-getty@serial0.service serial-getty@ttyS0.service 2>/dev/null || true",
    `if [ ! -e ${shellQuote(PI_SERVO_BRIDGE_SERIAL_PORT)} ]; then echo 'pi_servo_serial0_device:missing; reboot Raspberry Pi after enable_uart=1' >&2; fi`,
    `sudo -n systemctl stop ${shellQuote(PI_SERVO_BRIDGE_SERVICE_NAME)} 2>/dev/null || true`,
    `sudo -n install -m 0644 ${shellQuote(serviceTempPath)} ${shellQuote(servicePath)}`,
    "sudo -n systemctl daemon-reload",
    `sudo -n systemctl enable --now ${shellQuote(PI_SERVO_BRIDGE_SERVICE_NAME)}`,
    "sleep 1",
    `if sudo -n systemctl is-active --quiet ${shellQuote(PI_SERVO_BRIDGE_SERVICE_NAME)}; then echo "pi_servo_bridge_service:active"; else sudo -n systemctl --no-pager --full status ${shellQuote(PI_SERVO_BRIDGE_SERVICE_NAME)} >&2 || true; sudo -n journalctl -u ${shellQuote(PI_SERVO_BRIDGE_SERVICE_NAME)} --no-pager -n 30 >&2 || true; exit 12; fi`,
    `sudo -n systemctl --no-pager --full status ${shellQuote(PI_SERVO_BRIDGE_SERVICE_NAME)} | sed -n '1,12p'`
  ].join("\n");
}

async function requestPiServoBridgeJson<T>(host: string, path: string, init: RequestInit | undefined, options: PiServoBridgeRequestOptions): Promise<T> {
  const fetcher = options.fetcher ?? fetch;
  const controller = options.timeoutMs && options.timeoutMs > 0 && typeof AbortController !== "undefined" ? new AbortController() : null;
  const requestInit = controller ? { ...init, signal: controller.signal } : init;
  const timer =
    controller && options.timeoutMs
      ? globalThis.setTimeout(() => {
          controller.abort();
        }, options.timeoutMs)
      : undefined;
  let response: Response;
  try {
    response = await fetcher(`${buildPiServoBridgeBaseUrl(host)}${path}`, requestInit);
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError" && options.timeoutMs
        ? `Pi servo serial bridge timed out after ${options.timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : "Pi servo serial bridge is unavailable";
    throw new PiRemoteError("helperUnavailable", message);
  } finally {
    if (timer !== undefined) {
      globalThis.clearTimeout(timer);
    }
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new PiRemoteError("invalidResponse", error instanceof Error ? error.message : "Pi servo serial bridge returned invalid JSON");
  }
  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.error === "string" ? payload.error : `Pi servo serial bridge request failed with ${response.status}`;
    throw new PiRemoteError("requestFailed", message);
  }
  return payload as T;
}

function isByte(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "number");
}

function isPiBridgeExceptionDetail(value: unknown): value is PiBridgeExceptionDetail {
  return isRecord(value);
}

function isPiBridgeSerialDeviceSnapshot(value: unknown): value is PiBridgeSerialDeviceSnapshot {
  return isRecord(value);
}

function isPiBridgeSerialEvent(value: unknown): value is PiBridgeSerialEvent {
  return isRecord(value);
}

function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export const PI_SERVO_SERIAL_BRIDGE_SCRIPT = piServoSerialBridgeScript;
