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
  streamRunning: boolean;
  streamUrl: string;
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
  exec: PiExecResult;
}

export interface PiCameraInstallResult {
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
  options: PiRemoteRequestOptions = {}
): Promise<PiCameraCheckResult> {
  const workspaceDir = resolvePiWorkspaceDir(profile.workspaceDir, connection.username);
  const streamUrl = buildPiCameraStreamUrl(connection.host);
  const command = createPiCameraCheckCommand(workspaceDir);
  const exec = await execPiCommand({ ...connection, command, timeoutMs: 12_000 }, options);
  const parsed = parsePiCameraCheckOutput(exec.stdout);
  return {
    ...parsed,
    streamUrl,
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
  options: PiRemoteRequestOptions = {}
): Promise<PiCameraStreamResult> {
  const workspaceDir = resolvePiWorkspaceDir(profile.workspaceDir, connection.username);
  const setup = await setupPiCameraScripts(connection, profile, options);
  if (!setup.ok) {
    return {
      ok: false,
      device: "/dev/video0",
      streamUrl: buildPiCameraStreamUrl(connection.host),
      exec: setup.exec
    };
  }
  const device = "/dev/video0";
  const exec = await execPiCommand(
    {
      ...connection,
      command: `${shellQuote(`${workspaceDir}/camera-start.sh`)} ${shellQuote(device)} 8080`,
      timeoutMs: 15_000
    },
    options
  );
  return {
    ok: exec.exitCode === 0,
    device,
    streamUrl: buildPiCameraStreamUrl(connection.host),
    exec
  };
}

export async function stopPiCameraStream(
  connection: PiConnectionRequest,
  profile: Pick<PiSetupProfile, "workspaceDir">,
  options: PiRemoteRequestOptions = {}
): Promise<PiExecResult> {
  const workspaceDir = resolvePiWorkspaceDir(profile.workspaceDir, connection.username);
  const command = `if [ -x ${shellQuote(`${workspaceDir}/camera-stop.sh`)} ]; then ${shellQuote(`${workspaceDir}/camera-stop.sh`)}; else pid_file=${shellQuote(`${workspaceDir}/camera.pid`)}; if [ -f "$pid_file" ]; then kill "$(cat "$pid_file")" 2>/dev/null || true; rm -f "$pid_file"; fi; echo "stopped:1"; fi`;
  return execPiCommand({ ...connection, command, timeoutMs: 10_000 }, options);
}

export async function installPiCameraTools(
  connection: PiConnectionRequest,
  options: PiRemoteRequestOptions = {}
): Promise<PiCameraInstallResult> {
  const command = "sudo -n apt-get update && sudo -n apt-get install -y ustreamer v4l-utils";
  const exec = await execPiCommand({ ...connection, command, timeoutMs: 300_000 }, options);
  return { ok: exec.exitCode === 0, exec };
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

export function buildPiCameraStreamUrl(host: string): string {
  return `http://${host.trim() || "raspberrypi.local"}:8080/stream`;
}

export function parsePiCameraCheckOutput(stdout: string): Omit<PiCameraCheckResult, "streamUrl" | "stdout" | "stderr"> {
  const device = lineValue(stdout, "device");
  return {
    cameraAvailable: lineValue(stdout, "camera") === "0",
    device: device || null,
    ustreamerAvailable: lineValue(stdout, "ustreamer") === "0",
    streamRunning: lineValue(stdout, "running") === "0"
  };
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

function createPiCameraCheckCommand(workspaceDir: string): string {
  const pidFile = `${workspaceDir}/camera.pid`;
  return [
    "devices=\"\"",
    "if command -v v4l2-ctl >/dev/null 2>&1; then devices=\"$(v4l2-ctl --list-devices 2>/dev/null || true)\"; fi",
    "device=\"$(printf '%s\\n' \"$devices\" | grep -o '/dev/video[0-9]\\+' | head -n 1 || true)\"",
    "if [ -z \"$device\" ]; then device=\"$(ls /dev/video* 2>/dev/null | head -n 1 || true)\"; fi",
    "if [ -n \"$device\" ]; then camera=0; else camera=1; fi",
    "if command -v ustreamer >/dev/null 2>&1; then ustreamer=0; else ustreamer=1; fi",
    `pid_file=${shellQuote(pidFile)}`,
    "if [ -f \"$pid_file\" ] && kill -0 \"$(cat \"$pid_file\")\" 2>/dev/null; then running=0; else running=1; fi",
    "echo \"device:$device\"",
    "echo \"camera:$camera\"",
    "echo \"ustreamer:$ustreamer\"",
    "echo \"running:$running\""
  ].join("\n");
}

function createPiCameraSetupCommand(workspaceDir: string): string {
  const startScript = `${workspaceDir}/camera-start.sh`;
  const stopScript = `${workspaceDir}/camera-stop.sh`;
  const pidFile = `${workspaceDir}/camera.pid`;
  const logFile = `${workspaceDir}/camera.log`;
  return [
    `mkdir -p ${shellQuote(workspaceDir)}`,
    `cat > ${shellQuote(startScript)} <<'RESCUE_ROBOT_CAMERA_START'`,
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `pid_file=${shellQuote(pidFile)}`,
    `log_file=${shellQuote(logFile)}`,
    'device="${1:-/dev/video0}"',
    'port="${2:-8080}"',
    "if ! command -v ustreamer >/dev/null 2>&1; then",
    '  echo "ustreamer is not installed. Install the camera service first." >&2',
    "  exit 10",
    "fi",
    'if [ ! -e "$device" ]; then',
    '  echo "USB camera device was not found: $device" >&2',
    "  exit 11",
    "fi",
    'if [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then',
    '  echo "already-running:$(cat "$pid_file")"',
    "  exit 0",
    "fi",
    'nohup ustreamer --device "$device" --host 0.0.0.0 --port "$port" > "$log_file" 2>&1 &',
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
    'echo "pid:$(cat "$pid_file")"',
    "RESCUE_ROBOT_CAMERA_START",
    `cat > ${shellQuote(stopScript)} <<'RESCUE_ROBOT_CAMERA_STOP'`,
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `pid_file=${shellQuote(pidFile)}`,
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
    `chmod +x ${shellQuote(startScript)} ${shellQuote(stopScript)}`,
    "echo camera-scripts:0"
  ].join("\n");
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
