import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createPiHelperServer, isLocalRequest, MAX_REQUEST_BYTES } from "./pi-helper.mjs";

test("recognizes only loopback requests as local", () => {
  assert.equal(isLocalRequest({ socket: { remoteAddress: "127.0.0.1" } }), true);
  assert.equal(isLocalRequest({ socket: { remoteAddress: "::1" } }), true);
  assert.equal(isLocalRequest({ socket: { remoteAddress: "::ffff:127.0.0.1" } }), true);
  assert.equal(isLocalRequest({ socket: { remoteAddress: "10.0.0.8" } }), false);
});

test("rejects oversized request bodies", async () => {
  const { baseUrl, close } = await listen(createPiHelperServer({ connector: createConnector() }));
  try {
    const response = await fetch(`${baseUrl}/exec`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "x".repeat(MAX_REQUEST_BYTES + 1)
    });
    assert.equal(response.status, 413);
    assert.match((await response.json()).error, /too large/);
  } finally {
    await close();
  }
});

test("upload-and-exec uploads before running the command", async () => {
  const calls = [];
  const connector = createConnector({
    upload: async (_connection, remotePath, buffer) => {
      calls.push(["upload", remotePath, buffer.toString("utf8")]);
      return { ok: true, remotePath, sizeBytes: buffer.length, durationMs: 1 };
    },
    exec: async (_connection, command, timeoutMs) => {
      calls.push(["exec", command, timeoutMs]);
      return { stdout: "done", stderr: "", exitCode: 0, signal: null, durationMs: 2, timedOut: false };
    }
  });
  const { baseUrl, close } = await listen(createPiHelperServer({ connector }));
  try {
    const response = await fetch(`${baseUrl}/upload-and-exec`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: "raspberrypi.local",
        port: 22,
        username: "pi",
        password: "secret",
        remotePath: "/home/pi/run.py",
        contentBase64: Buffer.from("print('ok')").toString("base64"),
        command: "python3 /home/pi/run.py",
        cwd: "/home/pi",
        timeoutMs: 10_000
      })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [
      ["upload", "/home/pi/run.py", "print('ok')"],
      ["exec", "cd '/home/pi' && python3 /home/pi/run.py", 10_000]
    ]);
  } finally {
    await close();
  }
});

test("exec clamps timeout to five minutes", async () => {
  let seenTimeout = 0;
  const connector = createConnector({
    exec: async (_connection, _command, timeoutMs) => {
      seenTimeout = timeoutMs;
      return { stdout: "", stderr: "", exitCode: 0, signal: null, durationMs: 1, timedOut: false };
    }
  });
  const { baseUrl, close } = await listen(createPiHelperServer({ connector }));
  try {
    const response = await fetch(`${baseUrl}/exec`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: "192.168.1.20",
        port: 22,
        username: "pi",
        password: "secret",
        command: "uptime",
        timeoutMs: 999_000
      })
    });
    assert.equal(response.status, 200);
    assert.equal(seenTimeout, 300_000);
  } finally {
    await close();
  }
});

function createConnector(overrides = {}) {
  return {
    connectTest: async () => ({ ok: true, durationMs: 1 }),
    upload: async (_connection, remotePath, buffer) => ({ ok: true, remotePath, sizeBytes: buffer.length, durationMs: 1 }),
    exec: async () => ({ stdout: "", stderr: "", exitCode: 0, signal: null, durationMs: 1, timedOut: false }),
    ...overrides
  };
}

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}
