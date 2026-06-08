import type { CameraProfileSettings, CameraVideoSource } from "@adapters/persistence/storage";

export const PI_HELPER_BASE_URL = "http://127.0.0.1:17352";
export const PI_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export interface PiConnectionRequest {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKeyPath?: string;
}

export type PiAuthMode = "password" | "privateKey";

export interface PiSetupProfile {
  host: string;
  username: string;
  authMode: PiAuthMode;
  privateKeyPath: string;
  workspaceDir: string;
}

export interface PiHelperHealth {
  ok: boolean;
  maxUploadBytes: number;
  defaultCommandTimeoutMs: number;
  maxCommandTimeoutMs: number;
}

export interface PiConnectTestResult {
  ok: boolean;
  durationMs: number;
}

export interface PiUploadResult {
  ok: boolean;
  remotePath: string;
  sizeBytes: number;
  durationMs: number;
}

export interface PiExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  signal: string | null;
  durationMs: number;
  timedOut: boolean;
}

export interface PiUploadAndExecResult {
  ok: boolean;
  upload: PiUploadResult;
  exec: PiExecResult;
}

export interface PiReadinessResult {
  connection: PiConnectTestResult;
  pythonAvailable: boolean;
  workspaceReady: boolean;
  stdout: string;
  stderr: string;
}

export interface PiWorkspaceSetupResult {
  ok: boolean;
  workspaceDir: string;
  uploadsDir: string;
  exec: PiExecResult;
}

export type PiRunMode = "python" | "shell" | "uploadOnly";

export interface PiRunPlan {
  mode: PiRunMode;
  remotePath: string;
  command: string | null;
  canExecute: boolean;
}

export interface PiRunUploadedFileResult {
  upload: PiUploadResult;
  exec: PiExecResult | null;
  plan: PiRunPlan;
}

export interface PiCameraCheckResult {
  cameraAvailable: boolean;
  device: string | null;
  ustreamerAvailable: boolean;
  webrtcAvailable: boolean;
  streamRunning: boolean;
  streamUrl: string;
  webrtcOfferUrl: string;
  stdout: string;
  stderr: string;
}

export interface PiCameraSetupResult {
  ok: boolean;
  workspaceDir: string;
  exec: PiExecResult;
}

export interface PiCameraStreamResult {
  ok: boolean;
  device: string;
  streamUrl: string;
  webrtcOfferUrl: string;
  exec: PiExecResult;
}

export type PiCameraSourceInput = Pick<CameraVideoSource, "devicePath" | "port"> & Partial<Pick<CameraVideoSource, "id" | "label" | "streamUrl">>;

export interface PiCameraStreamOptions extends PiRemoteRequestOptions, Partial<CameraProfileSettings> {}

export interface PiCameraInstallResult {
  ok: boolean;
  exec: PiExecResult;
}

export interface PiUsbGadgetSetupResult {
  ok: boolean;
  exec: PiExecResult;
}

export type PiRemoteErrorCode = "helperUnavailable" | "requestFailed" | "invalidResponse" | "fileTooLarge" | "fileReadFailed";

export class PiRemoteError extends Error {
  constructor(
    readonly code: PiRemoteErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PiRemoteError";
  }
}

export function isPiRemoteError(error: unknown): error is PiRemoteError {
  return error instanceof PiRemoteError;
}

interface PiRemoteRequestOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
}

export async function requestPiHelperHealth(options: PiRemoteRequestOptions = {}): Promise<PiHelperHealth> {
  const value = await requestJson<unknown>("/health", undefined, options);
  if (!isRecord(value) || value.ok !== true || typeof value.maxUploadBytes !== "number") {
    throw new PiRemoteError("invalidResponse", "Raspberry Pi helper returned an invalid health response");
  }
  return {
    ok: true,
    maxUploadBytes: value.maxUploadBytes,
    defaultCommandTimeoutMs: typeof value.defaultCommandTimeoutMs === "number" ? value.defaultCommandTimeoutMs : 30_000,
    maxCommandTimeoutMs: typeof value.maxCommandTimeoutMs === "number" ? value.maxCommandTimeoutMs : 300_000
  };
}

export async function testPiConnection(connection: PiConnectionRequest, options: PiRemoteRequestOptions = {}): Promise<PiConnectTestResult> {
  const value = await requestJson<unknown>(
    "/connect-test",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(connection)
    },
    options
  );
  if (!isRecord(value) || value.ok !== true || typeof value.durationMs !== "number") {
    throw new PiRemoteError("invalidResponse", "Raspberry Pi helper returned an invalid connection response");
  }
  return { ok: true, durationMs: value.durationMs };
}

export async function uploadPiFile(
  request: PiConnectionRequest & { file: File; remotePath: string },
  options: PiRemoteRequestOptions = {}
): Promise<PiUploadResult> {
  const contentBase64 = await fileToBase64(request.file);
  const value = await requestJson<unknown>(
    "/upload",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...connectionOnly(request), remotePath: request.remotePath, contentBase64 })
    },
    options
  );
  return normalizeUploadResult(value, "Raspberry Pi helper returned an invalid upload response");
}

export async function execPiCommand(
  request: PiConnectionRequest & { command: string; cwd?: string; timeoutMs?: number },
  options: PiRemoteRequestOptions = {}
): Promise<PiExecResult> {
  const value = await requestJson<unknown>(
    "/exec",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...connectionOnly(request), command: request.command, cwd: request.cwd, timeoutMs: request.timeoutMs })
    },
    options
  );
  return normalizeExecResult(value, "Raspberry Pi helper returned an invalid command response");
}

export async function uploadAndExecPiFile(
  request: PiConnectionRequest & { file: File; remotePath: string; command: string; cwd?: string; timeoutMs?: number },
  options: PiRemoteRequestOptions = {}
): Promise<PiUploadAndExecResult> {
  const contentBase64 = await fileToBase64(request.file);
  const value = await requestJson<unknown>(
    "/upload-and-exec",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...connectionOnly(request),
        remotePath: request.remotePath,
        contentBase64,
        command: request.command,
        cwd: request.cwd,
        timeoutMs: request.timeoutMs
      })
    },
    options
  );
  if (!isRecord(value) || value.ok !== true) {
    throw new PiRemoteError("invalidResponse", "Raspberry Pi helper returned an invalid upload and execute response");
  }
  return {
    ok: true,
    upload: normalizeUploadResult(value.upload, "Raspberry Pi helper returned an invalid upload and execute response"),
    exec: normalizeExecResult(value.exec, "Raspberry Pi helper returned an invalid upload and execute response")
  };
}

export async function checkPiReadiness(
  connection: PiConnectionRequest,
  profile: Pick<PiSetupProfile, "workspaceDir">,
  options: PiRemoteRequestOptions = {}
): Promise<PiReadinessResult> {
  const connectionResult = await testPiConnection(connection, options);
  const workspaceDir = resolvePiWorkspaceDir(profile.workspaceDir, connection.username);
  const command = `python3 --version >/dev/null 2>&1; python_ok=$?; test -d ${shellQuote(workspaceDir)}; workspace_ok=$?; echo "python:$python_ok workspace:$workspace_ok"`;
  const exec = await execPiCommand({ ...connection, command, timeoutMs: 10_000 }, options);
  return {
    connection: connectionResult,
    pythonAvailable: /python:0/.test(exec.stdout),
    workspaceReady: /workspace:0/.test(exec.stdout),
    stdout: exec.stdout,
    stderr: exec.stderr
  };
}

export async function setupPiWorkspace(
  connection: PiConnectionRequest,
  profile: Pick<PiSetupProfile, "workspaceDir">,
  options: PiRemoteRequestOptions = {}
): Promise<PiWorkspaceSetupResult> {
  const workspaceDir = resolvePiWorkspaceDir(profile.workspaceDir, connection.username);
  const uploadsDir = `${workspaceDir}/uploads`;
  const command = [
    `mkdir -p ${shellQuote(uploadsDir)}`,
    `cat > ${shellQuote(`${workspaceDir}/run.sh`)} <<'RESCUE_ROBOT_RUNNER'`,
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'target="${1:-}"',
    'if [ -z "$target" ]; then',
    '  echo "usage: run.sh <file>" >&2',
    "  exit 2",
    "fi",
    'case "$target" in',
    '  *.py) exec python3 "$target" ;;',
    '  *.sh) exec bash "$target" ;;',
    '  *) echo "uploaded only: $target" ;;',
    "esac",
    "RESCUE_ROBOT_RUNNER",
    `chmod +x ${shellQuote(`${workspaceDir}/run.sh`)}`,
    "python3 --version"
  ].join("\n");
  const exec = await execPiCommand({ ...connection, command, timeoutMs: 20_000 }, options);
  return {
    ok: exec.exitCode === 0,
    workspaceDir,
    uploadsDir,
    exec
  };
}

export async function runUploadedFile(
  request: PiConnectionRequest & { file: File; workspaceDir: string; timeoutMs?: number },
  options: PiRemoteRequestOptions = {}
): Promise<PiRunUploadedFileResult> {
  const plan = createPiRunPlan(request.file.name, request.workspaceDir, request.username);
  const upload = await uploadPiFile({ ...request, remotePath: plan.remotePath }, options);
  if (!plan.canExecute || !plan.command) {
    return { upload, exec: null, plan };
  }
  const exec = await execPiCommand({ ...request, command: plan.command, timeoutMs: request.timeoutMs }, options);
  return { upload, exec, plan };
}

export async function checkPiCamera(
  connection: PiConnectionRequest,
  profile: Pick<PiSetupProfile, "workspaceDir">,
  sourceOrOptions: PiCameraSourceInput | PiRemoteRequestOptions = {},
  options: PiRemoteRequestOptions = {}
): Promise<PiCameraCheckResult> {
  const sourceProvided = isPiCameraSourceInput(sourceOrOptions);
  const source = normalizePiCameraSource(sourceProvided ? sourceOrOptions : undefined);
  const requestOptions = sourceProvided ? options : sourceOrOptions;
  const workspaceDir = resolvePiWorkspaceDir(profile.workspaceDir, connection.username);
  const command = createPiCameraCheckCommand(workspaceDir, source);
  const exec = await execPiCommand({ ...connection, command, timeoutMs: 12_000 }, requestOptions);
  const parsed = parsePiCameraCheckOutput(exec.stdout);
  const streamHost = parsePiCameraLanHost(exec.stdout) || connection.host;
  return {
    ...parsed,
    streamUrl: buildPiCameraStreamUrl(streamHost, source.port),
    webrtcOfferUrl: buildPiCameraWebrtcOfferUrl(streamHost, source.port),
    stdout: exec.stdout,
    stderr: exec.stderr
  };
}

export async function setupPiCameraScripts(
  connection: PiConnectionRequest,
  profile: Pick<PiSetupProfile, "workspaceDir">,
  options: PiRemoteRequestOptions = {}
): Promise<PiCameraSetupResult> {
  const workspaceDir = resolvePiWorkspaceDir(profile.workspaceDir, connection.username);
  const exec = await execPiCommand({ ...connection, command: createPiCameraSetupCommand(workspaceDir), timeoutMs: 20_000 }, options);
  return {
    ok: exec.exitCode === 0,
    workspaceDir,
    exec
  };
}

export async function startPiCameraStream(
  connection: PiConnectionRequest,
  profile: Pick<PiSetupProfile, "workspaceDir">,
  sourceOrOptions: PiCameraSourceInput | PiCameraStreamOptions = {},
  options: PiCameraStreamOptions = {}
): Promise<PiCameraStreamResult> {
  const sourceProvided = isPiCameraSourceInput(sourceOrOptions);
  const source = normalizePiCameraSource(sourceProvided ? sourceOrOptions : undefined);
  const requestOptions = sourceProvided ? options : sourceOrOptions;
  const workspaceDir = resolvePiWorkspaceDir(profile.workspaceDir, connection.username);
  const settings = normalizePiCameraStreamSettings(requestOptions);
  const setup = await setupPiCameraScripts(connection, profile, requestOptions);
  const fallbackStreamHost = connection.host;
  if (!setup.ok) {
    return {
      ok: false,
      device: source.devicePath,
      streamUrl: buildPiCameraStreamUrl(fallbackStreamHost, source.port),
      webrtcOfferUrl: buildPiCameraWebrtcOfferUrl(fallbackStreamHost, source.port),
      exec: setup.exec
    };
  }
  const exec = await execPiCommand(
    {
      ...connection,
      command: `CAMERA_WIDTH=${settings.width} CAMERA_HEIGHT=${settings.height} CAMERA_FPS=${settings.fps} ${shellQuote(`${workspaceDir}/camera-start.sh`)} ${shellQuote(source.devicePath)} ${source.port}`,
      timeoutMs: 180_000
    },
    requestOptions
  );
  const streamHost = parsePiCameraLanHost(exec.stdout) || fallbackStreamHost;
  return {
    ok: exec.exitCode === 0,
    device: source.devicePath,
    streamUrl: buildPiCameraStreamUrl(streamHost, source.port),
    webrtcOfferUrl: buildPiCameraWebrtcOfferUrl(streamHost, source.port),
    exec
  };
}

export async function stopPiCameraStream(
  connection: PiConnectionRequest,
  profile: Pick<PiSetupProfile, "workspaceDir">,
  sourceOrOptions: PiCameraSourceInput | PiRemoteRequestOptions = {},
  options: PiRemoteRequestOptions = {}
): Promise<PiExecResult> {
  const sourceProvided = isPiCameraSourceInput(sourceOrOptions);
  const source = normalizePiCameraSource(sourceProvided ? sourceOrOptions : undefined);
  const requestOptions = sourceProvided ? options : sourceOrOptions;
  const workspaceDir = resolvePiWorkspaceDir(profile.workspaceDir, connection.username);
  const pidFile = piCameraPidFile(workspaceDir, source.port);
  const legacyPidFile = `${workspaceDir}/camera.pid`;
  const legacyStop = source.port === 8080 ? ` legacy_pid_file=${shellQuote(legacyPidFile)}; if [ -f "$legacy_pid_file" ]; then kill "$(cat "$legacy_pid_file")" 2>/dev/null || true; rm -f "$legacy_pid_file"; fi;` : "";
  const command = `if [ -x ${shellQuote(`${workspaceDir}/camera-stop.sh`)} ]; then ${shellQuote(`${workspaceDir}/camera-stop.sh`)} ${source.port}; else pid_file=${shellQuote(pidFile)}; if [ -f "$pid_file" ]; then kill "$(cat "$pid_file")" 2>/dev/null || true; rm -f "$pid_file"; fi;${legacyStop} echo "stopped:1"; fi`;
  return execPiCommand({ ...connection, command, timeoutMs: 10_000 }, requestOptions);
}

export async function installPiCameraTools(
  connection: PiConnectionRequest,
  options: PiRemoteRequestOptions = {}
): Promise<PiCameraInstallResult> {
  const command = "sudo -n apt-get update && sudo -n apt-get install -y ffmpeg v4l-utils python3-venv python3-pip";
  const exec = await execPiCommand({ ...connection, command, timeoutMs: 300_000 }, options);
  return { ok: exec.exitCode === 0, exec };
}

export async function setupPiUsbGadget(connection: PiConnectionRequest, options: PiRemoteRequestOptions = {}): Promise<PiUsbGadgetSetupResult> {
  const exec = await execPiCommand({ ...connection, command: buildPiUsbGadgetSetupCommand(), timeoutMs: 120_000 }, options);
  return { ok: exec.exitCode === 0, exec };
}

export function buildPiUsbGadgetSetupCommand(): string {
  return String.raw`set -eu
echo "usb_gadget_setup:start"
sudo -n hostnamectl set-hostname rescue-pi || true
codename="$(. /etc/os-release 2>/dev/null; echo "\${VERSION_CODENAME:-}")"
if [ "$codename" = "trixie" ]; then
  if ! command -v rpi-usb-gadget >/dev/null 2>&1; then
    sudo -n apt-get update
    sudo -n apt-get install -y rpi-usb-gadget
  fi
  sudo -n rpi-usb-gadget on
  echo "mode:rpi-usb-gadget"
else
  boot_dir="/boot/firmware"
  if [ ! -d "$boot_dir" ]; then boot_dir="/boot"; fi
  config_file="$boot_dir/config.txt"
  cmdline_file="$boot_dir/cmdline.txt"
  sudo -n touch "$config_file"
  if ! grep -q '^dtoverlay=dwc2$' "$config_file"; then
    printf '\ndtoverlay=dwc2\n' | sudo -n tee -a "$config_file" >/dev/null
  fi
  sudo -n cp "$cmdline_file" "$cmdline_file.rescue-robot.$(date +%s).bak"
  if ! grep -qw 'modules-load=dwc2,g_ether' "$cmdline_file"; then
    sudo -n sed -i 's/$/ modules-load=dwc2,g_ether/' "$cmdline_file"
  fi
  if command -v nmcli >/dev/null 2>&1; then
    if sudo -n nmcli connection show rescue-usb-gadget >/dev/null 2>&1; then
      sudo -n nmcli connection modify rescue-usb-gadget ifname usb0 ipv4.method manual ipv4.addresses 10.43.0.1/24 ipv6.method ignore
    else
      sudo -n nmcli connection add type ethernet ifname usb0 con-name rescue-usb-gadget ipv4.method manual ipv4.addresses 10.43.0.1/24 ipv6.method ignore
    fi
    sudo -n nmcli connection up rescue-usb-gadget || true
  else
    sudo -n mkdir -p /etc/systemd/network
    cat <<'RESCUE_USB0_NETWORK' | sudo -n tee /etc/systemd/network/80-rescue-usb0.network >/dev/null
[Match]
Name=usb0

[Network]
Address=10.43.0.1/24
LinkLocalAddressing=yes
RESCUE_USB0_NETWORK
    sudo -n systemctl enable systemd-networkd || true
  fi
  echo "mode:manual-g_ether"
fi
sudo -n systemctl enable ssh || true
sudo -n systemctl enable avahi-daemon || true
echo "hostname:rescue-pi"
echo "usb_fallback:10.12.194.1"
echo "manual_usb_fallback:10.43.0.1"
echo "reboot_required:1"`;
}

export function createPiRunPlan(fileName: string, workspaceDir: string, username: string): PiRunPlan {
  const safeFileName = sanitizeRemoteFileName(fileName);
  const remoteWorkspaceDir = resolvePiWorkspaceDir(workspaceDir, username);
  const remotePath = `${remoteWorkspaceDir}/uploads/${safeFileName}`;
  const extension = safeFileName.toLowerCase().split(".").pop() ?? "";
  if (extension === "py") {
    return {
      mode: "python",
      remotePath,
      command: `python3 ${shellQuote(remotePath)}`,
      canExecute: true
    };
  }
  if (extension === "sh") {
    return {
      mode: "shell",
      remotePath,
      command: `bash ${shellQuote(remotePath)}`,
      canExecute: true
    };
  }
  return {
    mode: "uploadOnly",
    remotePath,
    command: null,
    canExecute: false
  };
}

export function resolvePiWorkspaceDir(workspaceDir: string, username: string): string {
  const trimmed = workspaceDir.trim() || "~/rescue-robot";
  if (trimmed === "~") {
    return `/home/${sanitizeRemoteFileName(username)}`;
  }
  if (trimmed.startsWith("~/")) {
    return `/home/${sanitizeRemoteFileName(username)}/${trimmed.slice(2).replace(/^\/+/, "")}`;
  }
  return trimmed.replace(/\/+$/, "");
}

export function sanitizeRemoteFileName(fileName: string): string {
  const fallback = "upload";
  const baseName = fileName.split(/[/\\]/).pop()?.trim() || fallback;
  return baseName.replace(/[^A-Za-z0-9._-]/g, "_") || fallback;
}

export function buildPiCameraStreamUrl(host: string, port = 8080): string {
  return `http://${host.trim() || "rescue-pi.local"}:${normalizePiCameraPort(port)}/stream`;
}

export function buildPiCameraWebrtcOfferUrl(host: string, port = 8080): string {
  return `http://${host.trim() || "rescue-pi.local"}:${normalizePiCameraPort(port)}/offer`;
}

export function parsePiCameraCheckOutput(stdout: string): Omit<PiCameraCheckResult, "streamUrl" | "webrtcOfferUrl" | "stdout" | "stderr"> {
  const device = lineValue(stdout, "device");
  return {
    cameraAvailable: lineValue(stdout, "camera") === "0",
    device: device || null,
    ustreamerAvailable: lineValue(stdout, "ustreamer") === "0",
    webrtcAvailable: lineValue(stdout, "webrtc") === "0",
    streamRunning: lineValue(stdout, "running") === "0"
  };
}

export function parsePiCameraLanHost(stdout: string): string {
  const lanIp = lineValue(stdout, "lan_ip");
  return isLikelyLanIp(lanIp) ? lanIp : "";
}

function normalizePiCameraStreamSettings(options: PiCameraStreamOptions): Required<Pick<PiCameraStreamOptions, "width" | "height" | "fps">> {
  return {
    width: normalizePositiveInteger(options.width, 320),
    height: normalizePositiveInteger(options.height, 240),
    fps: normalizePositiveInteger(options.fps, 30)
  };
}

function normalizePiCameraSource(source: Partial<PiCameraSourceInput> | undefined): PiCameraSourceInput {
  return {
    devicePath: typeof source?.devicePath === "string" && source.devicePath.trim() ? source.devicePath.trim() : "/dev/video0",
    port: normalizePiCameraPort(source?.port)
  };
}

function normalizePiCameraPort(value: unknown): number {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 8080;
}

function isPiCameraSourceInput(value: unknown): value is PiCameraSourceInput {
  return isRecord(value) && (typeof value.devicePath === "string" || typeof value.port === "number");
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 4096 ? parsed : fallback;
}

function isLikelyLanIp(value: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value.trim());
}

export function validatePiUploadFile(file: File): void {
  if (file.size > PI_MAX_UPLOAD_BYTES) {
    throw new PiRemoteError("fileTooLarge", "File is larger than 50MB");
  }
}

async function fileToBase64(file: File): Promise<string> {
  validatePiUploadFile(file);
  try {
    const buffer = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  } catch (error) {
    if (error instanceof PiRemoteError) {
      throw error;
    }
    throw new PiRemoteError("fileReadFailed", error instanceof Error && error.message ? error.message : "Could not read the selected file");
  }
}

function connectionOnly(request: PiConnectionRequest): PiConnectionRequest {
  return {
    host: request.host,
    port: request.port,
    username: request.username,
    password: request.password,
    privateKeyPath: request.privateKeyPath
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function createPiCameraCheckCommand(workspaceDir: string, source: PiCameraSourceInput): string {
  const pidFile = piCameraPidFile(workspaceDir, source.port);
  const legacyPidFile = `${workspaceDir}/camera.pid`;
  const venvDir = `${workspaceDir}/camera-venv`;
  return [
    `requested_device=${shellQuote(source.devicePath)}`,
    'if [ -e "$requested_device" ]; then device="$requested_device"; else device=""; fi',
    "if [ -n \"$device\" ]; then camera=0; else camera=1; fi",
    "if command -v ustreamer >/dev/null 2>&1 || command -v ffmpeg >/dev/null 2>&1; then ustreamer=0; else ustreamer=1; fi",
    `venv_python=${shellQuote(`${venvDir}/bin/python`)}`,
    "if [ -x \"$venv_python\" ] && \"$venv_python\" - <<'PY' >/dev/null 2>&1",
    "import aiohttp, aiortc, av",
    "PY",
    "then webrtc=0; else webrtc=1; fi",
    `pid_file=${shellQuote(pidFile)}`,
    `legacy_pid_file=${shellQuote(legacyPidFile)}`,
    "lan_ip=\"$(hostname -I 2>/dev/null | awk '{print $1}' || true)\"",
    "running=1",
    "if [ -f \"$pid_file\" ] && kill -0 \"$(cat \"$pid_file\")\" 2>/dev/null; then running=0; fi",
    source.port === 8080 ? "if [ \"$running\" != \"0\" ] && [ -f \"$legacy_pid_file\" ] && kill -0 \"$(cat \"$legacy_pid_file\")\" 2>/dev/null; then running=0; fi" : ":",
    "echo \"device:$device\"",
    "echo \"camera:$camera\"",
    "echo \"ustreamer:$ustreamer\"",
    "echo \"webrtc:$webrtc\"",
    "echo \"running:$running\"",
    "echo \"lan_ip:$lan_ip\""
  ].join("\n");
}

function createPiCameraSetupCommand(workspaceDir: string): string {
  const startScript = `${workspaceDir}/camera-start.sh`;
  const stopScript = `${workspaceDir}/camera-stop.sh`;
  const streamScript = `${workspaceDir}/camera-stream.py`;
  const venvDir = `${workspaceDir}/camera-venv`;
  return [
    `mkdir -p ${shellQuote(workspaceDir)}`,
    `cat > ${shellQuote(streamScript)} <<'RESCUE_ROBOT_CAMERA_STREAM'`,
    "#!/usr/bin/env python3",
    "import asyncio",
    "from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer",
    "from threading import Condition, Thread",
    "import atexit",
    "import io",
    "import json",
    "import signal",
    "import subprocess",
    "import sys",
    "import time",
    "",
    "try:",
    "    import aiohttp  # noqa: F401 - used as the WebRTC dependency readiness marker",
    "    import av",
    "    from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack",
    "    WEBRTC_IMPORT_ERROR = None",
    "except Exception as exc:",
    "    aiohttp = None",
    "    av = None",
    "    RTCPeerConnection = None",
    "    RTCSessionDescription = None",
    "    VideoStreamTrack = object",
    "    WEBRTC_IMPORT_ERROR = exc",
    "",
    "BOUNDARY = 'rescue_robot'",
    "latest_frame = None",
    "latest_frame_time_ms = None",
    "frame_condition = Condition()",
    "process = None",
    "webrtc_loop = None",
    "peer_connections = set()",
    "",
    "def publish_frame(frame):",
    "    global latest_frame, latest_frame_time_ms",
    "    with frame_condition:",
    "        latest_frame = frame",
    "        latest_frame_time_ms = int(time.time() * 1000)",
    "        frame_condition.notify_all()",
    "",
    "def capture_loop(device, width, height, fps):",
    "    global process",
    "    size = f'{width}x{height}'",
    "    command = [",
    "        'ffmpeg', '-hide_banner', '-loglevel', 'error',",
    "        '-fflags', 'nobuffer', '-flags', 'low_delay', '-probesize', '32', '-analyzeduration', '0',",
    "        '-thread_queue_size', '1', '-rtbufsize', '1M',",
    "        '-f', 'v4l2', '-input_format', 'mjpeg', '-video_size', size, '-framerate', str(fps),",
    "        '-i', device, '-an', '-c:v', 'copy', '-f', 'mjpeg', '-'",
    "    ]",
    "    process = subprocess.Popen(command, stdout=subprocess.PIPE, bufsize=0)",
    "    buffer = b''",
    "    while True:",
    "        chunk = process.stdout.read(4096) if process.stdout else b''",
    "        if not chunk:",
    "            break",
    "        buffer += chunk",
    "        while True:",
    "            start = buffer.find(b'\\xff\\xd8')",
    "            end = buffer.find(b'\\xff\\xd9', start + 2) if start != -1 else -1",
    "            if start == -1:",
    "                buffer = buffer[-1:]",
    "                break",
    "            if end == -1:",
    "                buffer = buffer[start:]",
    "                break",
    "            publish_frame(buffer[start:end + 2])",
    "            buffer = buffer[end + 2:]",
    "",
    "def webrtc_available():",
    "    return WEBRTC_IMPORT_ERROR is None",
    "",
    "def wait_for_next_frame(previous_time_ms):",
    "    with frame_condition:",
    "        frame_condition.wait_for(lambda: latest_frame is not None and latest_frame_time_ms != previous_time_ms, timeout=1.0)",
    "        return latest_frame, latest_frame_time_ms",
    "",
    "class JpegVideoTrack(VideoStreamTrack):",
    "    kind = 'video'",
    "",
    "    def __init__(self):",
    "        super().__init__()",
    "        self.last_frame_time_ms = None",
    "",
    "    async def recv(self):",
    "        frame_bytes, frame_time_ms = await asyncio.to_thread(wait_for_next_frame, self.last_frame_time_ms)",
    "        if not frame_bytes:",
    "            await asyncio.sleep(0.03)",
    "            return await self.recv()",
    "        self.last_frame_time_ms = frame_time_ms",
    "        with av.open(io.BytesIO(frame_bytes), format='mjpeg') as container:",
    "            frame = next(container.decode(video=0))",
    "        frame = frame.reformat(format='yuv420p')",
    "        frame.pts, frame.time_base = await self.next_timestamp()",
    "        return frame",
    "",
    "async def create_webrtc_answer(payload):",
    "    if not webrtc_available():",
    "        raise RuntimeError(f'WebRTC dependencies unavailable: {WEBRTC_IMPORT_ERROR}')",
    "    offer_sdp = payload.get('sdp')",
    "    offer_type = payload.get('type')",
    "    if not isinstance(offer_sdp, str) or not isinstance(offer_type, str):",
    "        raise ValueError('WebRTC offer must include sdp and type')",
    "    pc = RTCPeerConnection()",
    "    peer_connections.add(pc)",
    "",
    "    @pc.on('connectionstatechange')",
    "    async def on_connectionstatechange():",
    "        if pc.connectionState in ('failed', 'closed'):",
    "            await pc.close()",
    "            peer_connections.discard(pc)",
    "",
    "    pc.addTrack(JpegVideoTrack())",
    "    await pc.setRemoteDescription(RTCSessionDescription(sdp=offer_sdp, type=offer_type))",
    "    answer = await pc.createAnswer()",
    "    await pc.setLocalDescription(answer)",
    "    return {'ok': True, 'webrtcAvailable': True, 'sdp': pc.localDescription.sdp, 'type': pc.localDescription.type}",
    "",
    "def start_webrtc_loop():",
    "    global webrtc_loop",
    "    if not webrtc_available():",
    "        return",
    "    webrtc_loop = asyncio.new_event_loop()",
    "",
    "    def run_loop():",
    "        asyncio.set_event_loop(webrtc_loop)",
    "        webrtc_loop.run_forever()",
    "",
    "    Thread(target=run_loop, daemon=True).start()",
    "",
    "def run_webrtc_coro(coro):",
    "    if webrtc_loop is None:",
    "        raise RuntimeError('WebRTC loop is not running')",
    "    return asyncio.run_coroutine_threadsafe(coro, webrtc_loop).result(timeout=12)",
    "",
    "class Handler(BaseHTTPRequestHandler):",
    "    def log_message(self, _format, *_args):",
    "        return",
    "",
    "    def send_json(self, status, payload):",
    "        body = json.dumps(payload).encode('utf-8')",
    "        self.send_response(status)",
    "        self.send_header('Access-Control-Allow-Origin', '*')",
    "        self.send_header('Cache-Control', 'no-store')",
    "        self.send_header('Content-Type', 'application/json; charset=utf-8')",
    "        self.send_header('Content-Length', str(len(body)))",
    "        self.end_headers()",
    "        self.wfile.write(body)",
    "",
    "    def do_OPTIONS(self):",
    "        self.send_response(204)",
    "        self.send_header('Access-Control-Allow-Origin', '*')",
    "        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')",
    "        self.send_header('Access-Control-Allow-Headers', 'content-type')",
    "        self.end_headers()",
    "",
    "    def do_POST(self):",
    "        if not self.path.startswith('/offer'):",
    "            self.send_error(404)",
    "            return",
    "        if not webrtc_available():",
    "            self.send_json(503, {'ok': False, 'webrtcAvailable': False, 'error': f'WebRTC dependencies unavailable: {WEBRTC_IMPORT_ERROR}'})",
    "            return",
    "        try:",
    "            length = int(self.headers.get('Content-Length', '0'))",
    "            if length <= 0 or length > 2_000_000:",
    "                raise ValueError('invalid WebRTC offer size')",
    "            payload = json.loads(self.rfile.read(length).decode('utf-8'))",
    "            answer = run_webrtc_coro(create_webrtc_answer(payload))",
    "            self.send_json(200, answer)",
    "        except Exception as exc:",
    "            self.send_json(500, {'ok': False, 'webrtcAvailable': webrtc_available(), 'error': str(exc)})",
    "",
    "    def do_GET(self):",
    "        if self.path.startswith('/latency'):",
    "            now_ms = int(time.time() * 1000)",
    "            with frame_condition:",
    "                frame_time_ms = latest_frame_time_ms",
    "            payload = {",
    "                'ok': True,",
    "                'webrtcAvailable': webrtc_available(),",
    "                'serverNowMs': now_ms,",
    "                'frameTimestampMs': frame_time_ms,",
    "                'frameAgeMs': None if frame_time_ms is None else max(0, now_ms - frame_time_ms)",
    "            }",
    "            body = json.dumps(payload).encode('utf-8')",
    "            self.send_response(200)",
    "            self.send_header('Access-Control-Allow-Origin', '*')",
    "            self.send_header('Cache-Control', 'no-store')",
    "            self.send_header('Content-Type', 'application/json; charset=utf-8')",
    "            self.send_header('Content-Length', str(len(body)))",
    "            self.end_headers()",
    "            self.wfile.write(body)",
    "            return",
    "        if self.path not in ('/', '/stream'):",
    "            self.send_error(404)",
    "            return",
    "        self.send_response(200)",
    "        self.send_header('Access-Control-Allow-Origin', '*')",
    "        self.send_header('Cache-Control', 'no-store')",
    "        self.send_header('Content-Type', f'multipart/x-mixed-replace; boundary={BOUNDARY}')",
    "        self.end_headers()",
    "        while True:",
    "            with frame_condition:",
    "                frame_condition.wait(timeout=2)",
    "                frame = latest_frame",
    "            if not frame:",
    "                continue",
    "            try:",
    "                self.wfile.write(f'--{BOUNDARY}\\r\\n'.encode('ascii'))",
    "                self.wfile.write(b'Content-Type: image/jpeg\\r\\n')",
    "                self.wfile.write(f'Content-Length: {len(frame)}\\r\\n\\r\\n'.encode('ascii'))",
    "                self.wfile.write(frame)",
    "                self.wfile.write(b'\\r\\n')",
    "            except (BrokenPipeError, ConnectionResetError):",
    "                break",
    "",
    "def cleanup(*_args):",
    "    if process and process.poll() is None:",
    "        process.terminate()",
    "    if webrtc_loop is not None:",
    "        for pc in list(peer_connections):",
    "            try:",
    "                run_webrtc_coro(pc.close())",
    "            except Exception:",
    "                pass",
    "        webrtc_loop.call_soon_threadsafe(webrtc_loop.stop)",
    "",
    "def main():",
    "    device = sys.argv[1] if len(sys.argv) > 1 else '/dev/video0'",
    "    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8080",
    "    width = int(sys.argv[3]) if len(sys.argv) > 3 else 640",
    "    height = int(sys.argv[4]) if len(sys.argv) > 4 else 480",
    "    fps = int(sys.argv[5]) if len(sys.argv) > 5 else 30",
    "    Thread(target=capture_loop, args=(device, width, height, fps), daemon=True).start()",
    "    start_webrtc_loop()",
    "    server = ThreadingHTTPServer(('0.0.0.0', port), Handler)",
    "    atexit.register(cleanup)",
    "    signal.signal(signal.SIGTERM, cleanup)",
    "    signal.signal(signal.SIGINT, cleanup)",
    "    server.serve_forever()",
    "",
    "if __name__ == '__main__':",
    "    main()",
    "RESCUE_ROBOT_CAMERA_STREAM",
    `cat > ${shellQuote(startScript)} <<'RESCUE_ROBOT_CAMERA_START'`,
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `camera_dir=${shellQuote(workspaceDir)}`,
    `stream_script=${shellQuote(streamScript)}`,
    `venv_dir=${shellQuote(venvDir)}`,
    'device="${1:-/dev/video0}"',
    'port="${2:-8080}"',
    'width="${CAMERA_WIDTH:-640}"',
    'height="${CAMERA_HEIGHT:-480}"',
    'fps="${CAMERA_FPS:-30}"',
    'pid_file="${camera_dir}/camera-${port}.pid"',
    'log_file="${camera_dir}/camera-${port}.log"',
    'legacy_pid_file="${camera_dir}/camera.pid"',
    "if command -v ffmpeg >/dev/null 2>&1; then stream_tool=ffmpeg; elif command -v ustreamer >/dev/null 2>&1; then stream_tool=ustreamer; else",
    '  echo "No camera stream tool was found. Install ffmpeg or ustreamer first." >&2',
    "  exit 10",
    "fi",
    'if [ ! -e "$device" ]; then',
    '  echo "USB camera device was not found: $device" >&2',
    "  exit 11",
    "fi",
    'if [ "$port" = "8080" ] && [ -f "$legacy_pid_file" ] && kill -0 "$(cat "$legacy_pid_file")" 2>/dev/null; then',
    '  old_pid="$(cat "$legacy_pid_file")"',
    '  kill "$old_pid" 2>/dev/null || true',
    "  sleep 1",
    '  kill -9 "$old_pid" 2>/dev/null || true',
    '  rm -f "$legacy_pid_file"',
    "fi",
    'if [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then',
    '  old_pid="$(cat "$pid_file")"',
    '  kill "$old_pid" 2>/dev/null || true',
    "  sleep 1",
    '  kill -9 "$old_pid" 2>/dev/null || true',
    '  rm -f "$pid_file"',
    "fi",
    ': > "$log_file"',
    "python_bin=python3",
    "webrtc=1",
    'if [ "$stream_tool" = "ffmpeg" ] && command -v python3 >/dev/null 2>&1; then',
    '  if [ ! -x "$venv_dir/bin/python" ]; then',
    '    python3 -m venv --system-site-packages "$venv_dir" >> "$log_file" 2>&1 || true',
    "  fi",
    '  if [ -x "$venv_dir/bin/python" ]; then',
    '    if ! "$venv_dir/bin/python" - <<\'PY\' >/dev/null 2>&1',
    "import aiohttp, aiortc, av",
    "PY",
    "    then",
    '      "$venv_dir/bin/python" -m pip install --disable-pip-version-check --quiet aiohttp aiortc >> "$log_file" 2>&1 || true',
    "    fi",
    '    if "$venv_dir/bin/python" - <<\'PY\' >/dev/null 2>&1',
    "import aiohttp, aiortc, av",
    "PY",
    "    then",
    "      python_bin=\"$venv_dir/bin/python\"",
    "      webrtc=0",
    "    fi",
    "  fi",
    "fi",
    'if [ "$stream_tool" = "ustreamer" ]; then',
    '  nohup ustreamer --device "$device" --host 0.0.0.0 --port "$port" > "$log_file" 2>&1 &',
    "else",
    '  nohup "$python_bin" "$stream_script" "$device" "$port" "$width" "$height" "$fps" >> "$log_file" 2>&1 &',
    "fi",
    'echo "$!" > "$pid_file"',
    "sleep 1",
    'if ! kill -0 "$(cat "$pid_file")" 2>/dev/null; then',
    '  cat "$log_file" >&2 || true',
    "  rm -f \"$pid_file\"",
    "  exit 12",
    "fi",
    'echo "stream:0"',
    'echo "device:$device"',
    'echo "port:$port"',
    'echo "size:${width}x${height}"',
    'echo "fps:$fps"',
    'echo "tool:$stream_tool"',
    'echo "webrtc:$webrtc"',
    'echo "lan_ip:$(hostname -I 2>/dev/null | awk \'{print $1}\' || true)"',
    'echo "pid:$(cat "$pid_file")"',
    "RESCUE_ROBOT_CAMERA_START",
    `cat > ${shellQuote(stopScript)} <<'RESCUE_ROBOT_CAMERA_STOP'`,
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `camera_dir=${shellQuote(workspaceDir)}`,
    'port="${1:-8080}"',
    'pid_file="${camera_dir}/camera-${port}.pid"',
    'legacy_pid_file="${camera_dir}/camera.pid"',
    'if [ "$port" = "8080" ] && [ -f "$legacy_pid_file" ]; then',
    '  legacy_pid="$(cat "$legacy_pid_file")"',
    '  if kill -0 "$legacy_pid" 2>/dev/null; then',
    '    kill "$legacy_pid" 2>/dev/null || true',
    "    sleep 1",
    '    kill -9 "$legacy_pid" 2>/dev/null || true',
    "  fi",
    '  rm -f "$legacy_pid_file"',
    "fi",
    'if [ -f "$pid_file" ]; then',
    '  pid="$(cat "$pid_file")"',
    '  if kill -0 "$pid" 2>/dev/null; then',
    '    kill "$pid" 2>/dev/null || true',
    '    sleep 1',
    '    kill -9 "$pid" 2>/dev/null || true',
    "  fi",
    '  rm -f "$pid_file"',
    '  echo "stopped:1"',
    "else",
    '  echo "stopped:0"',
    "fi",
    "RESCUE_ROBOT_CAMERA_STOP",
    `chmod +x ${shellQuote(startScript)} ${shellQuote(stopScript)} ${shellQuote(streamScript)}`,
    "echo camera-scripts:0"
  ].join("\n");
}

function piCameraPidFile(workspaceDir: string, port: number): string {
  return `${workspaceDir}/camera-${normalizePiCameraPort(port)}.pid`;
}

function lineValue(stdout: string, key: string): string {
  const line = stdout
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${key}:`));
  return line ? line.slice(key.length + 1).trim() : "";
}

async function requestJson<T>(path: string, init: RequestInit | undefined, options: PiRemoteRequestOptions): Promise<T> {
  const fetcher = options.fetcher ?? fetch;
  const baseUrl = options.baseUrl ?? PI_HELPER_BASE_URL;
  let response: Response;
  try {
    response = await fetcher(`${baseUrl}${path}`, init);
  } catch (error) {
    throw new PiRemoteError("helperUnavailable", error instanceof Error ? error.message : "Raspberry Pi helper is unavailable");
  }

  const payload = await readResponseJson(response);
  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.error === "string" ? payload.error : `Raspberry Pi helper request failed with ${response.status}`;
    throw new PiRemoteError("requestFailed", message);
  }
  return payload as T;
}

async function readResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new PiRemoteError("invalidResponse", error instanceof Error ? error.message : "Raspberry Pi helper returned invalid JSON");
  }
}

function normalizeUploadResult(value: unknown, message: string): PiUploadResult {
  if (!isRecord(value) || value.ok !== true || typeof value.remotePath !== "string" || typeof value.sizeBytes !== "number" || typeof value.durationMs !== "number") {
    throw new PiRemoteError("invalidResponse", message);
  }
  return {
    ok: true,
    remotePath: value.remotePath,
    sizeBytes: value.sizeBytes,
    durationMs: value.durationMs
  };
}

function normalizeExecResult(value: unknown, message: string): PiExecResult {
  if (!isRecord(value) || typeof value.exitCode !== "number" || typeof value.durationMs !== "number") {
    throw new PiRemoteError("invalidResponse", message);
  }
  return {
    stdout: typeof value.stdout === "string" ? value.stdout : "",
    stderr: typeof value.stderr === "string" ? value.stderr : "",
    exitCode: value.exitCode,
    signal: typeof value.signal === "string" ? value.signal : null,
    durationMs: value.durationMs,
    timedOut: value.timedOut === true
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
