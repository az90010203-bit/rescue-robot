#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Client } from "ssh2";

export const PI_HELPER_HOST = "127.0.0.1";
export const PI_HELPER_PORT = Number(process.env.PI_HELPER_PORT ?? 17352);
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_REQUEST_BYTES = Math.ceil(MAX_UPLOAD_BYTES * 1.4) + 16 * 1024;
export const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
export const MAX_COMMAND_TIMEOUT_MS = 300_000;
const LOG_LIMIT = 120_000;

export function isLocalRequest(request) {
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

async function handleRoute(request, response, connector) {
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
      maxCommandTimeoutMs: MAX_COMMAND_TIMEOUT_MS
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/connect-test") {
    const body = await readJsonBody(request);
    const result = await connector.connectTest(normalizeConnection(body));
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/upload") {
    const body = await readJsonBody(request);
    const connection = normalizeConnection(body);
    const remotePath = normalizeRemotePath(body.remotePath);
    const buffer = decodeUploadContent(body);
    const result = await connector.upload(connection, remotePath, buffer);
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/exec") {
    const body = await readJsonBody(request);
    const connection = normalizeConnection(body);
    const command = commandWithCwd(normalizeCommand(body.command), body.cwd);
    const result = await connector.exec(connection, command, normalizeTimeoutMs(body.timeoutMs));
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/upload-and-exec") {
    const body = await readJsonBody(request);
    const connection = normalizeConnection(body);
    const remotePath = normalizeRemotePath(body.remotePath);
    const buffer = decodeUploadContent(body);
    const command = commandWithCwd(normalizeCommand(body.command), body.cwd);
    const upload = await connector.upload(connection, remotePath, buffer);
    const exec = await connector.exec(connection, command, normalizeTimeoutMs(body.timeoutMs));
    sendJson(response, 200, { ok: true, upload, exec });
    return;
  }

  sendJson(response, 404, { error: "not found" });
}

export function createPiHelperServer({ connector = createSshConnector() } = {}) {
  return createServer((request, response) => {
    handleRoute(request, response, connector).catch((error) => {
      sendJson(response, error.statusCode ?? 500, {
        error: error.message || "raspberry pi helper error"
      });
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
