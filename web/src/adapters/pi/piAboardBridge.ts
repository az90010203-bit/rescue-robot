import type { InboundMessage, PcCommand } from "@adapters/hardware/protocol";
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
}

export interface AboardBridgeCommandResult {
  ok: boolean;
  messages: InboundMessage[];
  serialPort?: string;
  baudRate?: number;
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
  if (!isRecord(value) || value.ok !== true) {
    throw new PiRemoteError("invalidResponse", "A board serial bridge returned an invalid health response");
  }
  const serialPort = typeof value.serialPort === "string" ? value.serialPort : A_BOARD_BRIDGE_SERIAL_PORT;
  if (serialPort !== A_BOARD_BRIDGE_SERIAL_PORT) {
    throw new PiRemoteError(
      "invalidResponse",
      `A board bridge is using ${serialPort}; expected ${A_BOARD_BRIDGE_SERIAL_PORT} for Raspberry Pi pins 30/32/33. Install/start the persistent A board bridge after enabling UART5.`
    );
  }
  return {
    ok: true,
    serialPort,
    baudRate: typeof value.baudRate === "number" ? value.baudRate : A_BOARD_BRIDGE_BAUD_RATE
  };
}

export async function sendAboardBridgeCommand(host: string, command: PcCommand, options: AboardBridgeRequestOptions = {}): Promise<AboardBridgeCommandResult> {
  const value = await requestAboardBridgeJson<unknown>(
    host,
    "/command",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command })
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
  return {
    ok: value.ok !== false,
    messages: value.messages.filter(isInboundMessage),
    serialPort,
    baudRate: typeof value.baudRate === "number" ? value.baudRate : undefined
  };
}

export async function startAboardBridge(
  connection: PiConnectionRequest,
  profile: Pick<PiSetupProfile, "workspaceDir">,
  options: AboardBridgeRequestOptions = {}
): Promise<AboardBridgeStartResult> {
  const workspace = await setupPiWorkspace(connection, profile, options);
  const workspaceDir = resolvePiWorkspaceDir(profile.workspaceDir, connection.username);
  const remotePath = `${workspaceDir}/${A_BOARD_BRIDGE_SCRIPT_NAME}`;
  const file = new File([A_BOARD_SERIAL_BRIDGE_SCRIPT], A_BOARD_BRIDGE_SCRIPT_NAME, { type: "text/x-python" });
  await uploadPiFile({ ...connection, file, remotePath }, options);
  const command = buildAboardBridgeServiceCommand({
    password: connection.password,
    remotePath,
    username: connection.username,
    workspaceDir
  });
  const exec = await execPiCommand({ ...connection, command, timeoutMs: 20_000 }, options);
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

function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export const A_BOARD_SERIAL_BRIDGE_SCRIPT = String.raw`#!/usr/bin/env python3
import json
import os
import select
import sys
import termios
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SERIAL_PORT = os.environ.get("A_BOARD_SERIAL_PORT", "/dev/ttyAMA5")
BAUD_RATE = int(os.environ.get("A_BOARD_BAUD", "115200"))
HOST = os.environ.get("A_BOARD_BRIDGE_HOST", "0.0.0.0")
PORT = int(os.environ.get("A_BOARD_BRIDGE_PORT", "17353"))
DEFAULT_TIMEOUT_MS = int(os.environ.get("A_BOARD_TIMEOUT_MS", "1200"))

BAUD_FLAGS = {
    9600: termios.B9600,
    19200: termios.B19200,
    38400: termios.B38400,
    57600: termios.B57600,
    115200: termios.B115200,
}


def configure_serial(fd):
    attrs = termios.tcgetattr(fd)
    baud = BAUD_FLAGS.get(BAUD_RATE, termios.B115200)
    attrs[0] = 0
    attrs[1] = 0
    attrs[2] = termios.CLOCAL | termios.CREAD | termios.CS8
    attrs[3] = 0
    attrs[4] = baud
    attrs[5] = baud
    attrs[6][termios.VMIN] = 0
    attrs[6][termios.VTIME] = 0
    termios.tcsetattr(fd, termios.TCSANOW, attrs)
    termios.tcflush(fd, termios.TCIOFLUSH)


def open_serial():
    fd = os.open(SERIAL_PORT, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    configure_serial(fd)
    return fd


def read_lines_until(fd, seq, timeout_ms, command_type):
    deadline = time.monotonic() + timeout_ms / 1000.0
    settle_deadline = None
    buffer = b""
    messages = []
    while True:
        active_deadline = settle_deadline if settle_deadline is not None else deadline
        if time.monotonic() >= active_deadline:
            return messages
        remaining = max(0.0, active_deadline - time.monotonic())
        readable, _, _ = select.select([fd], [], [], min(0.05, remaining))
        if not readable:
            continue
        try:
            chunk = os.read(fd, 4096)
        except BlockingIOError:
            continue
        if not chunk:
            continue
        buffer += chunk
        while b"\n" in buffer:
            line, buffer = buffer.split(b"\n", 1)
            text = line.decode("utf-8", errors="replace").strip()
            if not text:
                continue
            try:
                message = json.loads(text)
            except json.JSONDecodeError:
                message = {"type": "log", "message": text}
            messages.append(message)
            message_type = message.get("type")
            if message.get("seq") != seq:
                continue
            if message_type in ("error", "motor.feedback"):
                return messages
            if command_type == "can.send" and message_type == "can.feedback":
                settle_deadline = min(deadline, time.monotonic() + 0.12)
                continue
            if message_type in ("can.feedback", "can.frame", "imu.feedback"):
                return messages
    return messages


def send_command(command, timeout_ms):
    seq = command.get("seq")
    if not isinstance(seq, int):
        raise ValueError("command.seq must be an integer")
    fd = open_serial()
    try:
        os.write(fd, (json.dumps(command, separators=(",", ":")) + "\n").encode("utf-8"))
        messages = read_lines_until(fd, seq, timeout_ms, command.get("type"))
        return messages
    finally:
        os.close(fd)


def send_json(handler, status, body):
    payload = json.dumps(body).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "content-type")
    handler.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_json(self, 200, {"ok": True})

    def do_GET(self):
        if self.path != "/health":
            send_json(self, 404, {"ok": False, "error": "not found"})
            return
        exists = os.path.exists(SERIAL_PORT)
        send_json(self, 200, {"ok": exists, "serialPort": SERIAL_PORT, "baudRate": BAUD_RATE})

    def do_POST(self):
        if self.path != "/command":
            send_json(self, 404, {"ok": False, "error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            command = body.get("command", body)
            timeout_ms = int(body.get("timeoutMs", DEFAULT_TIMEOUT_MS))
            messages = send_command(command, timeout_ms)
            matched = any(message.get("seq") == command.get("seq") and message.get("type") in ("error", "motor.feedback", "can.feedback", "can.frame", "imu.feedback") for message in messages if isinstance(message, dict))
            send_json(self, 200, {"ok": matched, "messages": messages, "serialPort": SERIAL_PORT, "baudRate": BAUD_RATE})
        except Exception as exc:
            send_json(self, 500, {"ok": False, "error": str(exc), "messages": []})

    def log_message(self, fmt, *args):
        sys.stderr.write("%s\n" % (fmt % args))


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print("A board serial bridge listening on %s:%s -> %s @ %s" % (HOST, PORT, SERIAL_PORT, BAUD_RATE), flush=True)
    server.serve_forever()
`;
