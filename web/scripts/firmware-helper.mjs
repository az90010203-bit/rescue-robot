#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const HOST = "127.0.0.1";
const PORT = Number(process.env.FIRMWARE_HELPER_PORT ?? 17350);
const MAX_SOURCE_BYTES = 200 * 1024;
const MAX_REQUEST_BYTES = MAX_SOURCE_BYTES + 16 * 1024;
const COMPILE_TIMEOUT_MS = 120_000;
const UPLOAD_TIMEOUT_MS = 60_000;
const PORT_SCAN_TIMEOUT_MS = 20_000;
const JOB_TTL_MS = 30 * 60_000;
const LOG_LIMIT = 40_000;

const BOARD_PROFILES = {
  "arduino-uno": {
    id: "arduino-uno",
    label: "Arduino Uno",
    env: "remote_arduino_uno",
    platform: "atmelavr",
    board: "uno"
  },
  "arduino-nano-atmega328": {
    id: "arduino-nano-atmega328",
    label: "Arduino Nano ATmega328",
    env: "remote_arduino_nano_atmega328",
    platform: "atmelavr",
    board: "nanoatmega328"
  }
};

const jobs = new Map();
let resolvedPioPromise;

function boardList() {
  return Object.values(BOARD_PROFILES).map(({ id, label, board }) => ({ id, label, board }));
}

function pioCandidates() {
  const candidates = [];
  if (process.env.PLATFORMIO_EXE) {
    candidates.push(process.env.PLATFORMIO_EXE);
  }
  if (process.platform === "win32") {
    candidates.push(path.join(homedir(), ".platformio", "penv", "Scripts", "pio.exe"));
  } else {
    candidates.push(path.join(homedir(), ".platformio", "penv", "bin", "pio"));
  }
  candidates.push("pio");
  return [...new Set(candidates)];
}

async function resolvePio() {
  if (!resolvedPioPromise) {
    resolvedPioPromise = (async () => {
      for (const candidate of pioCandidates()) {
        const result = await runProcess(candidate, ["--version"], { timeoutMs: 10_000 });
        if (result.code === 0) {
          return candidate;
        }
      }
      return null;
    })();
  }
  return resolvedPioPromise;
}

async function runPio(args, options = {}) {
  const pio = await resolvePio();
  if (!pio) {
    return { code: 127, logs: "PlatformIO was not found. Set PLATFORMIO_EXE or install PlatformIO.", timedOut: false };
  }
  return runProcess(pio, ["--no-ansi", ...args], options);
}

function runProcess(command, args, { cwd, timeoutMs = 30_000 } = {}) {
  return new Promise((resolve) => {
    let logs = "";
    let settled = false;
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true
    });

    const append = (chunk) => {
      logs += chunk.toString();
      if (logs.length > LOG_LIMIT) {
        logs = logs.slice(logs.length - LOG_LIMIT);
      }
    };

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGTERM");
      resolve({ code: 124, logs: `${logs}\nTimed out after ${timeoutMs} ms.`, timedOut: true });
    }, timeoutMs);

    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ code: 127, logs: error.message, timedOut: false });
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? 0, logs, timedOut: false });
    });
  });
}

function isLocalRequest(request) {
  const address = request.socket.remoteAddress;
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_REQUEST_BYTES) {
      throw Object.assign(new Error("request body is too large"), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function listPorts() {
  const result = await runPio(["device", "list", "--json-output"], { timeoutMs: PORT_SCAN_TIMEOUT_MS });
  if (result.code !== 0) {
    throw Object.assign(new Error("failed to list serial ports"), { logs: result.logs, statusCode: 500 });
  }

  let parsed;
  try {
    parsed = JSON.parse(result.logs || "[]");
  } catch (error) {
    throw Object.assign(new Error("PlatformIO returned an invalid port list"), {
      logs: result.logs || String(error),
      statusCode: 500
    });
  }

  const items = Array.isArray(parsed) ? parsed : [];
  return items
    .map((item) => {
      const port = typeof item.port === "string" ? item.port : typeof item.path === "string" ? item.path : "";
      return {
        path: port,
        description: typeof item.description === "string" ? item.description : "",
        hwid: typeof item.hwid === "string" ? item.hwid : ""
      };
    })
    .filter((item) => item.path);
}

async function writeProject(profile, source) {
  const projectDir = await mkdtemp(path.join(tmpdir(), "rescue-robot-fw-"));
  const srcDir = path.join(projectDir, "src");
  await mkdir(srcDir, { recursive: true });
  await writeFile(path.join(projectDir, "platformio.ini"), platformioIni(profile), "utf8");
  await writeFile(path.join(srcDir, "main.cpp"), source, "utf8");
  return projectDir;
}

function platformioIni(profile) {
  return `[env:${profile.env}]
platform = ${profile.platform}
board = ${profile.board}
framework = arduino
monitor_speed = 115200
build_flags =
  -D SERIAL_BAUD=115200
`;
}

async function cleanupStaleJobs() {
  const now = Date.now();
  for (const [jobId, job] of jobs.entries()) {
    if (now - job.createdAt > JOB_TTL_MS) {
      jobs.delete(jobId);
      await rm(job.projectDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

async function handleHealth(response) {
  const pioPath = await resolvePio();
  sendJson(response, 200, {
    ok: true,
    pioAvailable: Boolean(pioPath),
    pioPath,
    boards: boardList()
  });
}

async function handlePorts(response) {
  const ports = await listPorts();
  sendJson(response, 200, { ports });
}

async function handleCompile(request, response) {
  const body = await readJsonBody(request);
  const profile = BOARD_PROFILES[body.board];
  if (!profile) {
    sendJson(response, 400, { error: "unsupported board" });
    return;
  }
  if (typeof body.source !== "string" || Buffer.byteLength(body.source, "utf8") > MAX_SOURCE_BYTES) {
    sendJson(response, 400, { error: "source must be a string no larger than 200KB" });
    return;
  }

  const projectDir = await writeProject(profile, body.source);
  const result = await runPio(["run", "-e", profile.env], { cwd: projectDir, timeoutMs: COMPILE_TIMEOUT_MS });
  if (result.code !== 0) {
    await rm(projectDir, { recursive: true, force: true }).catch(() => undefined);
    sendJson(response, 500, { error: "compile failed", logs: result.logs });
    return;
  }

  const hexPath = path.join(projectDir, ".pio", "build", profile.env, "firmware.hex");
  const hexStat = await stat(hexPath).catch(() => null);
  if (!hexStat) {
    await rm(projectDir, { recursive: true, force: true }).catch(() => undefined);
    sendJson(response, 500, { error: "compiled HEX was not found", logs: result.logs });
    return;
  }

  const jobId = randomUUID();
  jobs.set(jobId, {
    board: profile.id,
    createdAt: Date.now(),
    env: profile.env,
    projectDir
  });
  sendJson(response, 200, { jobId, hexSizeBytes: hexStat.size, logs: result.logs });
}

async function handleUpload(request, response) {
  const body = await readJsonBody(request);
  const job = typeof body.jobId === "string" ? jobs.get(body.jobId) : null;
  if (!job) {
    sendJson(response, 400, { error: "unknown or expired firmware job" });
    return;
  }
  if (typeof body.port !== "string" || body.port.length > 100) {
    sendJson(response, 400, { error: "port is required" });
    return;
  }

  const ports = await listPorts();
  if (!ports.some((port) => port.path === body.port)) {
    sendJson(response, 400, { error: "port is not available" });
    return;
  }

  const result = await runPio(["run", "-e", job.env, "-t", "upload", "--upload-port", body.port], {
    cwd: job.projectDir,
    timeoutMs: UPLOAD_TIMEOUT_MS
  });
  if (result.code !== 0) {
    sendJson(response, 500, { error: "upload failed", logs: result.logs });
    return;
  }

  jobs.delete(body.jobId);
  await rm(job.projectDir, { recursive: true, force: true }).catch(() => undefined);
  sendJson(response, 200, { ok: true, logs: result.logs });
}

async function route(request, response) {
  if (!isLocalRequest(request)) {
    sendJson(response, 403, { error: "local requests only" });
    return;
  }
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  await cleanupStaleJobs();
  const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);
  if (request.method === "GET" && url.pathname === "/health") {
    await handleHealth(response);
  } else if (request.method === "GET" && url.pathname === "/ports") {
    await handlePorts(response);
  } else if (request.method === "POST" && url.pathname === "/compile") {
    await handleCompile(request, response);
  } else if (request.method === "POST" && url.pathname === "/upload") {
    await handleUpload(request, response);
  } else {
    sendJson(response, 404, { error: "not found" });
  }
}

const server = createServer((request, response) => {
  route(request, response).catch((error) => {
    sendJson(response, error.statusCode ?? 500, {
      error: error.message || "firmware helper error",
      logs: error.logs
    });
  });
});

server.listen(PORT, HOST, async () => {
  const pioPath = await resolvePio();
  console.log(`Firmware helper listening on http://${HOST}:${PORT}`);
  console.log(pioPath ? `PlatformIO: ${pioPath}` : "PlatformIO: not found");
});
