#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Client } from "ssh2";
import { isLocalRequest, readJsonBody as readHelperJsonBody, sendErrorJson, sendJson } from "./local-http-helper.mjs";

export const PI_HELPER_HOST = "127.0.0.1";
export const PI_HELPER_PORT = Number(process.env.PI_HELPER_PORT ?? 17352);
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_REQUEST_BYTES = Math.ceil(MAX_UPLOAD_BYTES * 1.4) + 16 * 1024;
export const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
export const MAX_COMMAND_TIMEOUT_MS = 300_000;
const LOG_LIMIT = 120_000;
const OPERATION_CANCELLED_STATUS = 409;

export { isLocalRequest };

async function readJsonBody(request) {
  return readHelperJsonBody(request, { maxBytes: MAX_REQUEST_BYTES });
}

function normalizeConnection(body) {
  const host = typeof body.host === "string" ? body.host.trim() : "";
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const port = Number.isInteger(Number(body.port)) ? Number(body.port) : 22;
  const password = typeof body.password === "string" && body.password.length > 0 ? body.password : undefined;
  const privateKeyPath = typeof body.privateKeyPath === "string" && body.privateKeyPath.trim() ? body.privateKeyPath.trim() : undefined;

  if (!host) {
    throw Object.assign(new Error("host is required"), { statusCode: 400 });
  }
  if (!username) {
    throw Object.assign(new Error("username is required"), { statusCode: 400 });
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw Object.assign(new Error("port must be between 1 and 65535"), { statusCode: 400 });
  }
  if (!password && !privateKeyPath) {
    throw Object.assign(new Error("password or privateKeyPath is required"), { statusCode: 400 });
  }
  return { host, port, username, password, privateKeyPath };
}

function normalizeTimeoutMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_COMMAND_TIMEOUT_MS;
  }
  return Math.min(MAX_COMMAND_TIMEOUT_MS, Math.max(1000, Math.round(parsed)));
}

function normalizeRemotePath(value) {
  const remotePath = typeof value === "string" ? value.trim() : "";
  if (!remotePath || remotePath.includes("\0")) {
    throw Object.assign(new Error("remotePath is required"), { statusCode: 400 });
  }
  return remotePath;
}

function normalizeCommand(value) {
  const command = typeof value === "string" ? value.trim() : "";
  if (!command) {
    throw Object.assign(new Error("command is required"), { statusCode: 400 });
  }
  return command;
}

function decodeUploadContent(body) {
  const contentBase64 = typeof body.contentBase64 === "string" ? body.contentBase64 : "";
  if (!contentBase64) {
    throw Object.assign(new Error("contentBase64 is required"), { statusCode: 400 });
  }
  const buffer = Buffer.from(contentBase64, "base64");
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw Object.assign(new Error("upload is larger than 50MB"), { statusCode: 413 });
  }
  return buffer;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function commandWithCwd(command, cwd) {
  const cleanCwd = typeof cwd === "string" ? cwd.trim() : "";
  return cleanCwd ? `cd ${shellQuote(cleanCwd)} && ${command}` : command;
}

function createOperationScheduler() {
  let nextId = 1;
  const resources = new Map();
  const totals = {
    scheduled: 0,
    completed: 0,
    failed: 0,
    cancelled: 0
  };

  function resourceFor(resourceKey) {
    const key = resourceKey || "global";
    let resource = resources.get(key);
    if (!resource) {
      resource = {
        key,
        inFlight: null,
        queue: []
      };
      resources.set(key, resource);
    }
    return resource;
  }

  function cancelPendingLatest(resource, job) {
    if (job.policy !== "latest" || !job.dedupeKey) {
      return;
    }
    const kept = [];
    for (const pending of resource.queue) {
      if (pending.policy === "latest" && pending.dedupeKey === job.dedupeKey) {
        pending.cancelled = true;
        totals.cancelled += 1;
        pending.reject(Object.assign(new Error("operation superseded by a newer request"), {
          statusCode: OPERATION_CANCELLED_STATUS,
          operationId: pending.id,
          resourceKey: pending.resourceKey
        }));
      } else {
        kept.push(pending);
      }
    }
    resource.queue = kept;
  }

  function runNext(resource) {
    if (resource.inFlight || resource.queue.length === 0) {
      return;
    }
    const job = resource.queue.shift();
    if (!job || job.cancelled) {
      runNext(resource);
      return;
    }
    const startedAt = Date.now();
    const context = {
      operationId: job.id,
      resourceKey: job.resourceKey,
      queuedMs: Math.max(0, startedAt - job.queuedAt)
    };
    resource.inFlight = {
      id: job.id,
      name: job.name,
      policy: job.policy,
      dedupeKey: job.dedupeKey,
      startedAt,
      queuedMs: context.queuedMs
    };
    Promise.resolve()
      .then(job.task)
      .then((result) => {
        totals.completed += 1;
        job.resolve(annotateOperationResult(result, context));
      })
      .catch((error) => {
        totals.failed += 1;
        job.reject(error);
      })
      .finally(() => {
        resource.inFlight = null;
        runNext(resource);
      });
  }

  return {
    schedule(operation, task) {
      const normalized = normalizeOperation(operation);
      const resource = resourceFor(normalized.resourceKey);
      const job = {
        ...normalized,
        id: `piop-${Date.now().toString(36)}-${nextId++}`,
        queuedAt: Date.now(),
        task,
        cancelled: false
      };
      totals.scheduled += 1;
      cancelPendingLatest(resource, job);
      return new Promise((resolve, reject) => {
        job.resolve = resolve;
        job.reject = reject;
        resource.queue.push(job);
        runNext(resource);
      });
    },
    snapshot() {
      return {
        totals: { ...totals },
        resources: Array.from(resources.values()).map((resource) => ({
          resourceKey: resource.key,
          queueDepth: resource.queue.length,
          inFlight: resource.inFlight
            ? {
                ...resource.inFlight,
                runningMs: Math.max(0, Date.now() - resource.inFlight.startedAt)
              }
            : null,
          pending: resource.queue.map((job) => ({
            id: job.id,
            name: job.name,
            policy: job.policy,
            dedupeKey: job.dedupeKey,
            queuedMs: Math.max(0, Date.now() - job.queuedAt)
          }))
        }))
      };
    }
  };
}

function normalizeOperation(operation) {
  const resourceKey = cleanOperationString(operation.resourceKey) || "global";
  const name = cleanOperationString(operation.name) || "pi.operation";
  const policy = operation.policy === "latest" ? "latest" : "fifo";
  const dedupeKey = cleanOperationString(operation.dedupeKey) || (policy === "latest" ? `${resourceKey}:${name}` : "");
  return {
    name,
    resourceKey,
    policy,
    dedupeKey
  };
}

function cleanOperationString(value) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : "";
}

function operationFromBody(body, connection, fallbackName) {
  const input = body && typeof body.operation === "object" && body.operation ? body.operation : {};
  const hostKey = `${connection.username}@${connection.host}:${connection.port}`;
  return {
    name: cleanOperationString(input.name) || fallbackName,
    policy: input.policy === "latest" ? "latest" : "fifo",
    resourceKey: cleanOperationString(input.resourceKey) || `ssh:${hostKey}`,
    dedupeKey: cleanOperationString(input.dedupeKey)
  };
}

function annotateOperationResult(value, context) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const metadata = {
    operationId: context.operationId,
    queuedMs: context.queuedMs,
    resourceKey: context.resourceKey
  };
  const result = { ...value, ...metadata };
  if (result.upload && typeof result.upload === "object" && !Array.isArray(result.upload)) {
    result.upload = { ...result.upload, ...metadata };
  }
  if (result.exec && typeof result.exec === "object" && !Array.isArray(result.exec)) {
    result.exec = { ...result.exec, ...metadata };
  }
  return result;
}

function scheduleConnectorOperation(scheduler, body, connection, fallbackName, task) {
  return scheduler.schedule(operationFromBody(body, connection, fallbackName), task);
}

async function resolveSshConfig(connection) {
  const config = {
    host: connection.host,
    port: connection.port,
    username: connection.username,
    readyTimeout: 12_000
  };
  if (connection.password) {
    config.password = connection.password;
  }
  if (connection.privateKeyPath) {
    config.privateKey = await readFile(connection.privateKeyPath);
  }
  return config;
}

async function withSshConnection(connection, callback) {
  const config = await resolveSshConfig(connection);
  const client = new Client();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) {
        return;
      }
      settled = true;
      client.end();
      fn(value);
    };

    client
      .on("ready", () => {
        Promise.resolve(callback(client))
          .then((result) => finish(resolve, result))
          .catch((error) => finish(reject, error));
      })
      .on("error", (error) => finish(reject, error))
      .connect(config);
  });
}

function runExecStream(client, command, timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let streamRef;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      streamRef?.close?.();
      resolve({
        stdout,
        stderr: appendLimited(stderr, `\nTimed out after ${timeoutMs} ms.`),
        exitCode: 124,
        signal: "timeout",
        durationMs: Date.now() - startedAt,
        timedOut: true
      });
    }, timeoutMs);

    client.exec(command, (error, stream) => {
      if (error) {
        clearTimeout(timer);
        reject(error);
        return;
      }
      streamRef = stream;
      stream
        .on("close", (code, signal) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          resolve({
            stdout,
            stderr,
            exitCode: typeof code === "number" ? code : 0,
            signal: typeof signal === "string" ? signal : null,
            durationMs: Date.now() - startedAt,
            timedOut: false
          });
        })
        .on("data", (data) => {
          stdout = appendLimited(stdout, data.toString());
        });
      stream.stderr.on("data", (data) => {
        stderr = appendLimited(stderr, data.toString());
      });
    });
  });
}

function appendLimited(current, chunk) {
  const next = current + chunk;
  return next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next;
}

function uploadBuffer(client, remotePath, buffer, mode = 0o644) {
  return new Promise((resolve, reject) => {
    client.sftp((sftpError, sftp) => {
      if (sftpError) {
        reject(sftpError);
        return;
      }
      const stream = sftp.createWriteStream(remotePath, { flags: "w", mode });
      stream.on("error", reject);
      stream.on("close", resolve);
      stream.end(buffer);
    });
  });
}

export function createSshConnector() {
  return {
    async connectTest(connection) {
      const startedAt = Date.now();
      await withSshConnection(connection, async () => undefined);
      return { ok: true, durationMs: Date.now() - startedAt };
    },
    async upload(connection, remotePath, buffer) {
      const startedAt = Date.now();
      await withSshConnection(connection, (client) => uploadBuffer(client, remotePath, buffer));
      return { ok: true, remotePath, sizeBytes: buffer.length, durationMs: Date.now() - startedAt };
    },
    async exec(connection, command, timeoutMs) {
      return withSshConnection(connection, (client) => runExecStream(client, command, timeoutMs));
    }
  };
}

async function handleRoute(request, response, connector, scheduler) {
  if (!isLocalRequest(request)) {
    sendJson(response, 403, { error: "local requests only" });
    return;
  }
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  const url = new URL(request.url ?? "/", `http://${PI_HELPER_HOST}:${PI_HELPER_PORT}`);
  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      maxUploadBytes: MAX_UPLOAD_BYTES,
      defaultCommandTimeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
      maxCommandTimeoutMs: MAX_COMMAND_TIMEOUT_MS,
      scheduler: scheduler.snapshot()
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/connect-test") {
    const body = await readJsonBody(request);
    const connection = normalizeConnection(body);
    const result = await scheduleConnectorOperation(scheduler, body, connection, "pi.connect-test", () => connector.connectTest(connection));
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/upload") {
    const body = await readJsonBody(request);
    const connection = normalizeConnection(body);
    const remotePath = normalizeRemotePath(body.remotePath);
    const buffer = decodeUploadContent(body);
    const result = await scheduleConnectorOperation(scheduler, body, connection, "pi.upload", () => connector.upload(connection, remotePath, buffer));
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/exec") {
    const body = await readJsonBody(request);
    const connection = normalizeConnection(body);
    const command = commandWithCwd(normalizeCommand(body.command), body.cwd);
    const timeoutMs = normalizeTimeoutMs(body.timeoutMs);
    const result = await scheduleConnectorOperation(scheduler, body, connection, "pi.exec", () => connector.exec(connection, command, timeoutMs));
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/upload-and-exec") {
    const body = await readJsonBody(request);
    const connection = normalizeConnection(body);
    const remotePath = normalizeRemotePath(body.remotePath);
    const buffer = decodeUploadContent(body);
    const command = commandWithCwd(normalizeCommand(body.command), body.cwd);
    const timeoutMs = normalizeTimeoutMs(body.timeoutMs);
    const result = await scheduleConnectorOperation(scheduler, body, connection, "pi.upload-and-exec", async () => {
      const upload = await connector.upload(connection, remotePath, buffer);
      const exec = await connector.exec(connection, command, timeoutMs);
      return { ok: true, upload, exec };
    });
    sendJson(response, 200, result);
    return;
  }

  sendJson(response, 404, { error: "not found" });
}

export function createPiHelperServer({ connector = createSshConnector(), scheduler = createOperationScheduler() } = {}) {
  return createServer((request, response) => {
    handleRoute(request, response, connector, scheduler).catch((error) => {
      sendErrorJson(response, error, { fallbackMessage: "raspberry pi helper error" });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createPiHelperServer();
  server.listen(PI_HELPER_PORT, PI_HELPER_HOST, () => {
    console.log(`Raspberry Pi helper listening on http://${PI_HELPER_HOST}:${PI_HELPER_PORT}`);
    console.log("Use SSH/SFTP over the same WiFi or LAN to reach the Pi.");
  });
}
