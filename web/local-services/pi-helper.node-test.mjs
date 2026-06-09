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

test("serializes default SSH operations by host", async () => {
  let active = 0;
  let maxActive = 0;
  const calls = [];
  const connector = createConnector({
    exec: async (_connection, command) => {
      calls.push(command);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sleep(20);
      active -= 1;
      return { stdout: command, stderr: "", exitCode: 0, signal: null, durationMs: 1, timedOut: false };
    }
  });
  const { baseUrl, close } = await listen(createPiHelperServer({ connector }));
  try {
    const [first, second] = await Promise.all([
      postExec(baseUrl, { command: "first" }),
      postExec(baseUrl, { command: "second" })
    ]);

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(maxActive, 1);
    assert.deepEqual(calls, ["first", "second"]);
    assert.equal(typeof first.payload.operationId, "string");
    assert.equal(first.payload.resourceKey, "ssh:pi@192.168.1.20:22");
  } finally {
    await close();
  }
});

test("allows explicitly separate resources to run concurrently", async () => {
  let active = 0;
  let maxActive = 0;
  const connector = createConnector({
    exec: async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sleep(30);
      active -= 1;
      return { stdout: "ok", stderr: "", exitCode: 0, signal: null, durationMs: 1, timedOut: false };
    }
  });
  const { baseUrl, close } = await listen(createPiHelperServer({ connector }));
  try {
    const [main, secondary] = await Promise.all([
      postExec(baseUrl, { command: "main", operation: { name: "pi.camera.start", resourceKey: "camera:pi:8080" } }),
      postExec(baseUrl, { command: "secondary", operation: { name: "pi.camera.start", resourceKey: "camera:pi:8081" } })
    ]);

    assert.equal(main.status, 200);
    assert.equal(secondary.status, 200);
    assert.equal(maxActive, 2);
  } finally {
    await close();
  }
});

test("keeps upload-and-exec atomic inside the host queue", async () => {
  const calls = [];
  let releaseUpload;
  let uploadStarted;
  const uploadStartedPromise = new Promise((resolve) => {
    uploadStarted = resolve;
  });
  const releaseUploadPromise = new Promise((resolve) => {
    releaseUpload = resolve;
  });
  const connector = createConnector({
    upload: async (_connection, remotePath, buffer) => {
      calls.push(["upload:start", remotePath, buffer.toString("utf8")]);
      uploadStarted();
      await releaseUploadPromise;
      calls.push(["upload:end", remotePath]);
      return { ok: true, remotePath, sizeBytes: buffer.length, durationMs: 1 };
    },
    exec: async (_connection, command) => {
      calls.push(["exec", command]);
      return { stdout: command, stderr: "", exitCode: 0, signal: null, durationMs: 1, timedOut: false };
    }
  });
  const { baseUrl, close } = await listen(createPiHelperServer({ connector }));
  try {
    const first = fetch(`${baseUrl}/upload-and-exec`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: "192.168.1.20",
        port: 22,
        username: "pi",
        password: "secret",
        remotePath: "/home/pi/run.py",
        contentBase64: Buffer.from("print('ok')").toString("base64"),
        command: "python3 /home/pi/run.py"
      })
    });
    await uploadStartedPromise;
    const second = postExec(baseUrl, { command: "uptime" });
    releaseUpload();
    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 200);
    assert.deepEqual(calls, [
      ["upload:start", "/home/pi/run.py", "print('ok')"],
      ["upload:end", "/home/pi/run.py"],
      ["exec", "python3 /home/pi/run.py"],
      ["exec", "uptime"]
    ]);
  } finally {
    await close();
  }
});

test("latest policy drops older pending operations with the same dedupe key", async () => {
  const calls = [];
  let releaseFirst;
  let firstStarted;
  const firstStartedPromise = new Promise((resolve) => {
    firstStarted = resolve;
  });
  const releaseFirstPromise = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const connector = createConnector({
    exec: async (_connection, command) => {
      calls.push(command);
      if (command === "first") {
        firstStarted();
        await releaseFirstPromise;
      }
      return { stdout: command, stderr: "", exitCode: 0, signal: null, durationMs: 1, timedOut: false };
    }
  });
  const { baseUrl, close } = await listen(createPiHelperServer({ connector }));
  try {
    const operation = { name: "pi.camera.check", resourceKey: "camera:pi:8080", policy: "latest", dedupeKey: "camera:pi:8080:check" };
    const first = postExec(baseUrl, { command: "first", operation });
    await firstStartedPromise;
    const second = postExec(baseUrl, { command: "second", operation });
    await waitFor(async () => {
      const health = await getHealth(baseUrl);
      return health.scheduler.resources.some((resource) => resource.resourceKey === "camera:pi:8080" && resource.queueDepth === 1);
    });
    const third = postExec(baseUrl, { command: "third", operation });
    const cancelledSecond = await second;
    assert.equal(cancelledSecond.status, 409);
    assert.match(cancelledSecond.payload.error, /superseded/);
    releaseFirst();
    const [firstResponse, thirdResponse] = await Promise.all([first, third]);
    assert.equal(firstResponse.status, 200);
    assert.equal(thirdResponse.status, 200);
    assert.deepEqual(calls, ["first", "third"]);
  } finally {
    await close();
  }
});

test("health includes scheduler state", async () => {
  let release;
  const releasePromise = new Promise((resolve) => {
    release = resolve;
  });
  const connector = createConnector({
    exec: async () => {
      await releasePromise;
      return { stdout: "ok", stderr: "", exitCode: 0, signal: null, durationMs: 1, timedOut: false };
    }
  });
  const { baseUrl, close } = await listen(createPiHelperServer({ connector }));
  try {
    const request = postExec(baseUrl, { command: "hold" });
    const health = await waitFor(async () => {
      const value = await getHealth(baseUrl);
      return value.scheduler.resources.some((resource) => resource.inFlight?.name === "pi.exec") ? value : null;
    });
    assert.equal(health.ok, true);
    assert.equal(health.scheduler.totals.scheduled, 1);
    assert.equal(health.scheduler.resources[0].inFlight.name, "pi.exec");
    release();
    assert.equal((await request).status, 200);
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

async function postExec(baseUrl, body) {
  const response = await fetch(`${baseUrl}/exec`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      host: "192.168.1.20",
      port: 22,
      username: "pi",
      password: "secret",
      ...body
    })
  });
  return { status: response.status, payload: await response.json() };
}

async function getHealth(baseUrl) {
  const response = await fetch(`${baseUrl}/health`);
  return response.json();
}

async function waitFor(check, timeoutMs = 1000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await check();
    if (value) {
      return value;
    }
    await sleep(10);
  }
  throw new Error("timed out waiting for condition");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
