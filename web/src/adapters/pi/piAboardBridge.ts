import type { InboundMessage, PcCommand } from "@adapters/hardware/protocol";
import aBoardSerialBridgeScript from "../../../local-services/a-board-serial-bridge.py?raw";
import type { PiBridgeExceptionDetail, PiBridgeSerialDeviceSnapshot, PiBridgeSerialEvent } from "@adapters/pi/piServoBridge";
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

export const A_BOARD_BRIDGE_PORT = 17353;
export const A_BOARD_BRIDGE_SCRIPT_NAME = "a_board_serial_bridge.py";
export const A_BOARD_BRIDGE_SERVICE_NAME = "a-board-serial-bridge.service";
export const A_BOARD_BRIDGE_SERIAL_PORT = "/dev/ttyAMA5";
export const A_BOARD_BRIDGE_BAUD_RATE = 115200;
export const A_BOARD_BRIDGE_HOST = "0.0.0.0";
export const A_BOARD_BRIDGE_UART_OVERLAY = "uart5";

export interface AboardBridgeHealth {
  ok: boolean;
  serialPort: string;
  baudRate: number;
  service?: string;
  version?: string;
  busy?: boolean;
  queueDepth?: number;
  inFlight?: boolean;
  serialOpen?: boolean;
  reconnectCount?: number;
  lastReconnectAt?: number | null;
  reconnectIntervalSec?: number;
  deviceExists?: boolean;
  lastSerialEvent?: PiBridgeSerialEvent | null;
  lastCloseReason?: string | null;
  lastException?: PiBridgeExceptionDetail | null;
  consecutiveOpenFailures?: number;
  diagnosticsPath?: string;
  motionPending?: boolean;
  latestMotionSeq?: number | null;
  droppedMotionCount?: number;
  activeCommand?: string | null;
  canServoReady?: boolean;
  mecanumReady?: boolean;
  serialProtocolMode?: string;
  serialProtocolActive?: string;
  binaryProtocolReady?: boolean;
  bytesIn?: number;
  bytesOut?: number;
  framesIn?: number;
  framesOut?: number;
  crcError?: number;
  cobsError?: number;
  dropCount?: number;
  lastAckMs?: number | null;
  lastFrameMs?: number | null;
  binaryFallbackCount?: number;
}

export interface AboardBridgeDiagnostics extends AboardBridgeHealth {
  device?: PiBridgeSerialDeviceSnapshot;
  inFlightRequestId?: number | null;
  requestCount?: number;
  failureCount?: number;
  lastError?: string | null;
  events: PiBridgeSerialEvent[];
  uptimeSec?: number;
}

export interface AboardBridgeCommandResult {
  ok: boolean;
  messages: InboundMessage[];
  busy?: boolean;
  accepted?: boolean;
  dropped?: boolean;
  queueDepth?: number;
  inFlight?: boolean;
  error?: string;
  serialPort?: string;
  baudRate?: number;
  serialProtocolMode?: string;
  serialProtocolActive?: string;
  binaryProtocolReady?: boolean;
  bytesIn?: number;
  bytesOut?: number;
  framesIn?: number;
  framesOut?: number;
  crcError?: number;
  cobsError?: number;
  dropCount?: number;
  lastAckMs?: number | null;
  lastFrameMs?: number | null;
  binaryFallbackCount?: number;
}

export interface AboardBridgeStartResult {
  ok: boolean;
  workspaceDir: string;
  remotePath: string;
  exec: PiExecResult;
  serviceName?: string;
  servicePath?: string;
  serviceStatus?: string;
  persistent?: boolean;
}

interface AboardBridgeRequestOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

export function buildAboardBridgeBaseUrl(host: string): string {
  const trimmed = host.trim() || "rescue-pi.local";
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }
  return `http://${trimmed}:${A_BOARD_BRIDGE_PORT}`;
}

export async function checkAboardBridge(host: string, options: AboardBridgeRequestOptions = {}): Promise<AboardBridgeHealth> {
  const value = await requestAboardBridgeJson<unknown>(host, "/health", undefined, options);
  if (!isRecord(value)) {
    throw new PiRemoteError("invalidResponse", "A board serial bridge returned an invalid health response");
  }
  const serialPort = typeof value.serialPort === "string" ? value.serialPort : A_BOARD_BRIDGE_SERIAL_PORT;
  if (serialPort !== A_BOARD_BRIDGE_SERIAL_PORT) {
    throw new PiRemoteError(
      "invalidResponse",
      `A board bridge is using ${serialPort}; expected ${A_BOARD_BRIDGE_SERIAL_PORT} for Raspberry Pi pins 30/32/33. Install/start the persistent A board bridge after enabling UART5.`
    );
  }
  const health: AboardBridgeHealth = {
    ok: value.ok === true,
    serialPort,
    baudRate: typeof value.baudRate === "number" ? value.baudRate : A_BOARD_BRIDGE_BAUD_RATE
  };
  if (typeof value.service === "string") health.service = value.service;
  if (typeof value.version === "string") health.version = value.version;
  if (typeof value.queueDepth === "number") health.queueDepth = value.queueDepth;
  if (typeof value.inFlight === "boolean") health.inFlight = value.inFlight;
  health.busy = typeof value.busy === "boolean" ? value.busy : Boolean((health.queueDepth ?? 0) > 0 || health.inFlight);
  if (typeof value.serialOpen === "boolean") health.serialOpen = value.serialOpen;
  if (typeof value.reconnectCount === "number") health.reconnectCount = value.reconnectCount;
  if (typeof value.lastReconnectAt === "number" || value.lastReconnectAt === null) health.lastReconnectAt = value.lastReconnectAt;
  if (typeof value.reconnectIntervalSec === "number") health.reconnectIntervalSec = value.reconnectIntervalSec;
  if (typeof value.deviceExists === "boolean") health.deviceExists = value.deviceExists;
  if (isPiBridgeSerialEvent(value.lastSerialEvent) || value.lastSerialEvent === null) health.lastSerialEvent = value.lastSerialEvent;
  if (typeof value.lastCloseReason === "string" || value.lastCloseReason === null) health.lastCloseReason = value.lastCloseReason;
  if (isPiBridgeExceptionDetail(value.lastException) || value.lastException === null) health.lastException = value.lastException;
  if (typeof value.consecutiveOpenFailures === "number") health.consecutiveOpenFailures = value.consecutiveOpenFailures;
  if (typeof value.diagnosticsPath === "string") health.diagnosticsPath = value.diagnosticsPath;
  if (typeof value.motionPending === "boolean") health.motionPending = value.motionPending;
  if (typeof value.latestMotionSeq === "number" || value.latestMotionSeq === null) health.latestMotionSeq = value.latestMotionSeq;
  if (typeof value.droppedMotionCount === "number") health.droppedMotionCount = value.droppedMotionCount;
  if (typeof value.activeCommand === "string" || value.activeCommand === null) health.activeCommand = value.activeCommand;
  if (typeof value.canServoReady === "boolean") health.canServoReady = value.canServoReady;
  if (typeof value.mecanumReady === "boolean") health.mecanumReady = value.mecanumReady;
  applyAboardBridgeProtocolStats(health, value);
  return health;
}

export async function requestAboardBridgeDiagnostics(host: string, options: AboardBridgeRequestOptions = {}): Promise<AboardBridgeDiagnostics> {
  const value = await requestAboardBridgeJson<unknown>(host, "/diagnostics", undefined, options);
  if (!isRecord(value) || !Array.isArray(value.events)) {
    throw new PiRemoteError("invalidResponse", "A board serial bridge returned an invalid diagnostics response");
  }
  return {
    ...normalizeAboardBridgeHealth(value),
    device: isPiBridgeSerialDeviceSnapshot(value.device) ? value.device : undefined,
    inFlightRequestId: typeof value.inFlightRequestId === "number" || value.inFlightRequestId === null ? value.inFlightRequestId : undefined,
    requestCount: typeof value.requestCount === "number" ? value.requestCount : undefined,
    failureCount: typeof value.failureCount === "number" ? value.failureCount : undefined,
    lastError: typeof value.lastError === "string" || value.lastError === null ? value.lastError : undefined,
    events: value.events.filter(isPiBridgeSerialEvent),
    uptimeSec: typeof value.uptimeSec === "number" ? value.uptimeSec : undefined
  };
}

export async function sendAboardBridgeCommand(host: string, command: PcCommand, options: AboardBridgeRequestOptions = {}): Promise<AboardBridgeCommandResult> {
  const value = await requestAboardBridgeJson<unknown>(
    host,
    "/command",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(typeof options.timeoutMs === "number" ? { command, timeoutMs: options.timeoutMs } : { command })
    },
    options
  );
  if (!isRecord(value) || !Array.isArray(value.messages)) {
    throw new PiRemoteError("invalidResponse", "A board serial bridge returned an invalid command response");
  }
  const serialPort = typeof value.serialPort === "string" ? value.serialPort : undefined;
  if (serialPort && serialPort !== A_BOARD_BRIDGE_SERIAL_PORT) {
    throw new PiRemoteError(
      "invalidResponse",
      `A board bridge is using ${serialPort}; expected ${A_BOARD_BRIDGE_SERIAL_PORT} for Raspberry Pi pins 30/32/33.`
    );
  }
  const result: AboardBridgeCommandResult = {
    ok: value.ok !== false,
    messages: value.messages.filter(isInboundMessage),
    serialPort,
    baudRate: typeof value.baudRate === "number" ? value.baudRate : undefined
  };
  if (typeof value.busy === "boolean") result.busy = value.busy;
  if (typeof value.accepted === "boolean") result.accepted = value.accepted;
  if (typeof value.dropped === "boolean") result.dropped = value.dropped;
  if (typeof value.queueDepth === "number") result.queueDepth = value.queueDepth;
  if (typeof value.inFlight === "boolean") result.inFlight = value.inFlight;
  if (typeof value.error === "string") result.error = value.error;
  applyAboardBridgeProtocolStats(result, value);
  return result;
}

export async function startAboardBridge(
  connection: PiConnectionRequest,
  profile: Pick<PiSetupProfile, "workspaceDir">,
  options: AboardBridgeRequestOptions = {}
): Promise<AboardBridgeStartResult> {
  const requestOptions = { ...options, operation: { name: "pi.a-board-bridge.start" } };
  const workspace = await setupPiWorkspace(connection, profile, requestOptions);
  const workspaceDir = resolvePiWorkspaceDir(profile.workspaceDir, connection.username);
  const remotePath = `${workspaceDir}/${A_BOARD_BRIDGE_SCRIPT_NAME}`;
  const file = new File([A_BOARD_SERIAL_BRIDGE_SCRIPT], A_BOARD_BRIDGE_SCRIPT_NAME, { type: "text/x-python" });
  await uploadPiFile({ ...connection, file, remotePath }, requestOptions);
  const command = buildAboardBridgeServiceCommand({
    password: connection.password,
    remotePath,
    username: connection.username,
    workspaceDir
  });
  const exec = await execPiCommand({ ...connection, command, timeoutMs: 20_000 }, requestOptions);
  return {
    ok: workspace.ok && exec.exitCode === 0 && /a_board_bridge_service:active/.test(exec.stdout),
    workspaceDir,
    remotePath,
    exec,
    serviceName: A_BOARD_BRIDGE_SERVICE_NAME,
    servicePath: `/etc/systemd/system/${A_BOARD_BRIDGE_SERVICE_NAME}`,
    serviceStatus: exec.stdout,
    persistent: true
  };
}

interface AboardBridgeServiceCommandOptions {
  password?: string;
  remotePath: string;
  username: string;
  workspaceDir: string;
}

export function buildAboardBridgeServiceCommand(options: AboardBridgeServiceCommandOptions): string {
  const workspaceDir = options.workspaceDir;
  const remotePath = options.remotePath;
  const pidFile = `${workspaceDir}/a-board-serial-bridge.pid`;
  const servicePath = `/etc/systemd/system/${A_BOARD_BRIDGE_SERVICE_NAME}`;
  const serviceTempPath = `${workspaceDir}/${A_BOARD_BRIDGE_SERVICE_NAME}`;
  const sudoRefresh = options.password
    ? `printf %s ${shellQuote(`${options.password}\n`)} | sudo -S -p '' -v`
    : "sudo -n -v";
  const service = [
    "[Unit]",
    "Description=RoboMaster A board serial HTTP bridge",
    "Wants=network-online.target",
    "After=network-online.target",
    "",
    "[Service]",
    "Type=simple",
    `User=${options.username.trim() || "pi"}`,
    `WorkingDirectory=${workspaceDir}`,
    `Environment=A_BOARD_SERIAL_PORT=${A_BOARD_BRIDGE_SERIAL_PORT}`,
    `Environment=A_BOARD_BAUD=${A_BOARD_BRIDGE_BAUD_RATE}`,
    "Environment=A_BOARD_SERIAL_PROTOCOL=auto",
    `Environment=A_BOARD_BRIDGE_HOST=${A_BOARD_BRIDGE_HOST}`,
    `Environment=A_BOARD_BRIDGE_PORT=${A_BOARD_BRIDGE_PORT}`,
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
    `cat > ${shellQuote(serviceTempPath)} <<'RESCUE_ROBOT_A_BOARD_SERVICE'`,
    service,
    "RESCUE_ROBOT_A_BOARD_SERVICE",
    `if [ -f ${shellQuote(pidFile)} ]; then old_pid="$(cat ${shellQuote(pidFile)} 2>/dev/null || true)"; if [ -n "$old_pid" ]; then kill "$old_pid" 2>/dev/null || true; fi; rm -f ${shellQuote(pidFile)}; fi`,
    sudoRefresh,
    "boot_config='/boot/firmware/config.txt'",
    "if [ ! -f \"$boot_config\" ]; then boot_config='/boot/config.txt'; fi",
    "if [ ! -f \"$boot_config\" ]; then echo 'a_board_uart5_config:missing' >&2; exit 13; fi",
    `if ! grep -Eq '^[[:space:]]*dtoverlay=${A_BOARD_BRIDGE_UART_OVERLAY}([[:space:],]|$)' "$boot_config"; then printf '\\n# Rescue Robot A board UART5 bridge\\ndtoverlay=${A_BOARD_BRIDGE_UART_OVERLAY}\\n' | sudo -n tee -a "$boot_config" >/dev/null; echo 'a_board_uart5_overlay:added'; else echo 'a_board_uart5_overlay:present'; fi`,
    `if [ ! -e ${shellQuote(A_BOARD_BRIDGE_SERIAL_PORT)} ] && command -v dtoverlay >/dev/null 2>&1; then sudo -n dtoverlay ${A_BOARD_BRIDGE_UART_OVERLAY} 2>/dev/null || true; sleep 1; fi`,
    `if [ ! -e ${shellQuote(A_BOARD_BRIDGE_SERIAL_PORT)} ]; then echo 'a_board_uart5_device:missing; reboot Raspberry Pi after dtoverlay=uart5' >&2; fi`,
    `sudo -n systemctl stop ${shellQuote(A_BOARD_BRIDGE_SERVICE_NAME)} 2>/dev/null || true`,
    `sudo -n install -m 0644 ${shellQuote(serviceTempPath)} ${shellQuote(servicePath)}`,
    "sudo -n systemctl daemon-reload",
    `sudo -n systemctl enable --now ${shellQuote(A_BOARD_BRIDGE_SERVICE_NAME)}`,
    "sleep 1",
    `if sudo -n systemctl is-active --quiet ${shellQuote(A_BOARD_BRIDGE_SERVICE_NAME)}; then echo "a_board_bridge_service:active"; else sudo -n systemctl --no-pager --full status ${shellQuote(A_BOARD_BRIDGE_SERVICE_NAME)} >&2 || true; sudo -n journalctl -u ${shellQuote(A_BOARD_BRIDGE_SERVICE_NAME)} --no-pager -n 30 >&2 || true; exit 12; fi`,
    `sudo -n systemctl --no-pager --full status ${shellQuote(A_BOARD_BRIDGE_SERVICE_NAME)} | sed -n '1,12p'`
  ].join("\n");
}

async function requestAboardBridgeJson<T>(host: string, path: string, init: RequestInit | undefined, options: AboardBridgeRequestOptions): Promise<T> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(`${buildAboardBridgeBaseUrl(host)}${path}`, init);
  } catch (error) {
    throw new PiRemoteError("helperUnavailable", error instanceof Error ? error.message : "A board serial bridge is unavailable");
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new PiRemoteError("invalidResponse", error instanceof Error ? error.message : "A board serial bridge returned invalid JSON");
  }
  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.error === "string" ? payload.error : `A board serial bridge request failed with ${response.status}`;
    throw new PiRemoteError("requestFailed", message);
  }
  return payload as T;
}

function isInboundMessage(value: unknown): value is InboundMessage {
  return isRecord(value) && typeof value.type === "string" && typeof value.seq === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function normalizeAboardBridgeHealth(value: Record<string, unknown>): AboardBridgeHealth {
  const serialPort = typeof value.serialPort === "string" ? value.serialPort : A_BOARD_BRIDGE_SERIAL_PORT;
  const health: AboardBridgeHealth = {
    ok: value.ok === true,
    serialPort,
    baudRate: typeof value.baudRate === "number" ? value.baudRate : A_BOARD_BRIDGE_BAUD_RATE
  };
  if (typeof value.service === "string") health.service = value.service;
  if (typeof value.version === "string") health.version = value.version;
  if (typeof value.queueDepth === "number") health.queueDepth = value.queueDepth;
  if (typeof value.inFlight === "boolean") health.inFlight = value.inFlight;
  health.busy = typeof value.busy === "boolean" ? value.busy : Boolean((health.queueDepth ?? 0) > 0 || health.inFlight);
  if (typeof value.serialOpen === "boolean") health.serialOpen = value.serialOpen;
  if (typeof value.reconnectCount === "number") health.reconnectCount = value.reconnectCount;
  if (typeof value.lastReconnectAt === "number" || value.lastReconnectAt === null) health.lastReconnectAt = value.lastReconnectAt;
  if (typeof value.reconnectIntervalSec === "number") health.reconnectIntervalSec = value.reconnectIntervalSec;
  if (typeof value.deviceExists === "boolean") health.deviceExists = value.deviceExists;
  if (isPiBridgeSerialEvent(value.lastSerialEvent) || value.lastSerialEvent === null) health.lastSerialEvent = value.lastSerialEvent;
  if (typeof value.lastCloseReason === "string" || value.lastCloseReason === null) health.lastCloseReason = value.lastCloseReason;
  if (isPiBridgeExceptionDetail(value.lastException) || value.lastException === null) health.lastException = value.lastException;
  if (typeof value.consecutiveOpenFailures === "number") health.consecutiveOpenFailures = value.consecutiveOpenFailures;
  if (typeof value.diagnosticsPath === "string") health.diagnosticsPath = value.diagnosticsPath;
  if (typeof value.motionPending === "boolean") health.motionPending = value.motionPending;
  if (typeof value.latestMotionSeq === "number" || value.latestMotionSeq === null) health.latestMotionSeq = value.latestMotionSeq;
  if (typeof value.droppedMotionCount === "number") health.droppedMotionCount = value.droppedMotionCount;
  if (typeof value.activeCommand === "string" || value.activeCommand === null) health.activeCommand = value.activeCommand;
  if (typeof value.canServoReady === "boolean") health.canServoReady = value.canServoReady;
  if (typeof value.mecanumReady === "boolean") health.mecanumReady = value.mecanumReady;
  applyAboardBridgeProtocolStats(health, value);
  return health;
}

function applyAboardBridgeProtocolStats<T extends Partial<AboardBridgeHealth | AboardBridgeCommandResult>>(target: T, value: Record<string, unknown>): void {
  if (typeof value.serialProtocolMode === "string") target.serialProtocolMode = value.serialProtocolMode;
  if (typeof value.serialProtocolActive === "string") target.serialProtocolActive = value.serialProtocolActive;
  if (typeof value.binaryProtocolReady === "boolean") target.binaryProtocolReady = value.binaryProtocolReady;
  if (typeof value.bytesIn === "number") target.bytesIn = value.bytesIn;
  if (typeof value.bytesOut === "number") target.bytesOut = value.bytesOut;
  if (typeof value.framesIn === "number") target.framesIn = value.framesIn;
  if (typeof value.framesOut === "number") target.framesOut = value.framesOut;
  if (typeof value.crcError === "number") target.crcError = value.crcError;
  if (typeof value.cobsError === "number") target.cobsError = value.cobsError;
  if (typeof value.dropCount === "number") target.dropCount = value.dropCount;
  if (typeof value.lastAckMs === "number" || value.lastAckMs === null) target.lastAckMs = value.lastAckMs;
  if (typeof value.lastFrameMs === "number" || value.lastFrameMs === null) target.lastFrameMs = value.lastFrameMs;
  if (typeof value.binaryFallbackCount === "number") target.binaryFallbackCount = value.binaryFallbackCount;
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

export const A_BOARD_SERIAL_BRIDGE_SCRIPT = aBoardSerialBridgeScript;
