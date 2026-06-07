import { parseFeetechStatusPacket, type FeetechStatusPacket } from "./protocol";
import {
  execPiCommand,
  PiConnectionRequest,
  PiExecResult,
  PiRemoteError,
  PiSetupProfile,
  resolvePiWorkspaceDir,
  setupPiWorkspace,
  uploadPiFile
} from "./piRemote";

export const PI_SERVO_BRIDGE_PORT = 17354;
export const PI_SERVO_BRIDGE_SCRIPT_NAME = "pi_servo_serial_bridge.py";
export const PI_SERVO_BRIDGE_SERVICE_NAME = "pi-servo-serial-bridge.service";
export const PI_SERVO_BRIDGE_SERIAL_PORT = "/dev/serial0";
export const PI_SERVO_BRIDGE_BAUD_RATE = 115_200;
export const PI_SERVO_BRIDGE_HOST = "0.0.0.0";

export interface PiServoBridgeHealth {
  ok: boolean;
  serialPort: string;
  baudRate: number;
}

export interface PiServoBridgeFrameResult {
  ok: boolean;
  rxBytes: number[];
  packet: FeetechStatusPacket | null;
  serialPort?: string;
  baudRate?: number;
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
  fetcher?: typeof fetch;
  waitMs?: number;
}

export function buildPiServoBridgeBaseUrl(host: string): string {
  const trimmed = host.trim() || "raspberrypi.local";
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }
  return `http://${trimmed}:${PI_SERVO_BRIDGE_PORT}`;
}

export async function checkPiServoBridge(host: string, options: PiServoBridgeRequestOptions = {}): Promise<PiServoBridgeHealth> {
  const value = await requestPiServoBridgeJson<unknown>(host, "/health", undefined, options);
  if (!isRecord(value) || value.ok !== true) {
    throw new PiRemoteError("invalidResponse", "Pi servo serial bridge returned an invalid health response");
  }
  return {
    ok: true,
    serialPort: typeof value.serialPort === "string" ? value.serialPort : PI_SERVO_BRIDGE_SERIAL_PORT,
    baudRate: typeof value.baudRate === "number" ? value.baudRate : PI_SERVO_BRIDGE_BAUD_RATE
  };
}

export async function sendPiServoBridgeFrame(host: string, frame: number[], options: PiServoBridgeRequestOptions = {}): Promise<PiServoBridgeFrameResult> {
  const value = await requestPiServoBridgeJson<unknown>(
    host,
    "/frame",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame, waitMs: options.waitMs })
    },
    options
  );
  if (!isRecord(value) || !Array.isArray(value.rxBytes)) {
    throw new PiRemoteError("invalidResponse", "Pi servo serial bridge returned an invalid frame response");
  }
  const rxBytes = value.rxBytes.filter(isByte);
  return {
    ok: value.ok !== false,
    rxBytes,
    packet: parseFeetechStatusPacket(rxBytes),
    serialPort: typeof value.serialPort === "string" ? value.serialPort : undefined,
    baudRate: typeof value.baudRate === "number" ? value.baudRate : undefined
  };
}

export async function startPiServoBridge(
  connection: PiConnectionRequest,
  profile: Pick<PiSetupProfile, "workspaceDir">,
  options: PiServoBridgeRequestOptions = {}
): Promise<PiServoBridgeStartResult> {
  const workspace = await setupPiWorkspace(connection, profile, options);
  const workspaceDir = resolvePiWorkspaceDir(profile.workspaceDir, connection.username);
  const remotePath = `${workspaceDir}/${PI_SERVO_BRIDGE_SCRIPT_NAME}`;
  const file = new File([PI_SERVO_SERIAL_BRIDGE_SCRIPT], PI_SERVO_BRIDGE_SCRIPT_NAME, { type: "text/x-python" });
  await uploadPiFile({ ...connection, file, remotePath }, options);
  const command = buildPiServoBridgeServiceCommand({
    password: connection.password,
    remotePath,
    username: connection.username,
    workspaceDir
  });
  const exec = await execPiCommand({ ...connection, command, timeoutMs: 20_000 }, options);
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
  let response: Response;
  try {
    response = await fetcher(`${buildPiServoBridgeBaseUrl(host)}${path}`, init);
  } catch (error) {
    throw new PiRemoteError("helperUnavailable", error instanceof Error ? error.message : "Pi servo serial bridge is unavailable");
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

function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export const PI_SERVO_SERIAL_BRIDGE_SCRIPT = String.raw`#!/usr/bin/env python3
import json
import os
import select
import sys
import termios
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SERIAL_PORT = os.environ.get("PI_SERVO_SERIAL_PORT", "/dev/serial0")
BAUD_RATE = int(os.environ.get("PI_SERVO_BAUD", "115200"))
HOST = os.environ.get("PI_SERVO_BRIDGE_HOST", "0.0.0.0")
PORT = int(os.environ.get("PI_SERVO_BRIDGE_PORT", "17354"))
DEFAULT_WAIT_MS = int(os.environ.get("PI_SERVO_WAIT_MS", "120"))

BAUD_FLAGS = {
    115200: termios.B115200,
    1000000: getattr(termios, "B1000000", termios.B115200),
}


def configure_serial(fd):
    attrs = termios.tcgetattr(fd)
    baud = BAUD_FLAGS.get(BAUD_RATE, getattr(termios, "B1000000", termios.B115200))
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


def read_response(fd, wait_ms):
    deadline = time.monotonic() + max(10, wait_ms) / 1000.0
    rx = b""
    while time.monotonic() < deadline:
        remaining = max(0.0, deadline - time.monotonic())
        readable, _, _ = select.select([fd], [], [], min(0.02, remaining))
        if not readable:
            continue
        try:
            chunk = os.read(fd, 4096)
        except BlockingIOError:
            continue
        if chunk:
            rx += chunk
    return rx


def send_frame(frame, wait_ms):
    if not isinstance(frame, list) or not frame:
        raise ValueError("frame must be a non-empty byte array")
    payload = bytes(int(byte) & 0xFF for byte in frame)
    fd = open_serial()
    try:
        termios.tcflush(fd, termios.TCIOFLUSH)
        os.write(fd, payload)
        return read_response(fd, wait_ms)
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
        if self.path != "/frame":
            send_json(self, 404, {"ok": False, "error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            frame = body.get("frame", [])
            wait_ms = int(body.get("waitMs", DEFAULT_WAIT_MS))
            rx = send_frame(frame, wait_ms)
            send_json(self, 200, {
                "ok": len(rx) > 0,
                "rxBytes": list(rx),
                "serialPort": SERIAL_PORT,
                "baudRate": BAUD_RATE
            })
        except Exception as exc:
            send_json(self, 500, {"ok": False, "error": str(exc), "rxBytes": []})

    def log_message(self, fmt, *args):
        sys.stderr.write("%s\n" % (fmt % args))


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print("Pi servo serial bridge listening on %s:%s -> %s @ %s" % (HOST, PORT, SERIAL_PORT, BAUD_RATE), flush=True)
    server.serve_forever()
`;
