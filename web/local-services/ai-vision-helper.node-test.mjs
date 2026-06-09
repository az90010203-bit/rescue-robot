import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const helperPath = resolve("local-services", "ai-vision-helper.py");
const pythonCommand = process.env.PYTHON || "python";
const pythonAvailable = spawnSync(pythonCommand, ["--version"], { encoding: "utf8" }).status === 0;
const jpegFrame = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xd9]);

test("ai vision helper exposes health, analyze, and sample capture endpoints", { skip: !pythonAvailable }, async () => {
  const sampleDir = await mkdtemp(join(tmpdir(), "rescue-ai-vision-"));
  const frameServer = await startFrameServer();
  const helperPort = await freePort();
  const helper = spawn(pythonCommand, [helperPath], {
    cwd: resolve("."),
    env: {
      ...process.env,
      AI_VISION_PORT: String(helperPort),
      AI_VISION_SAMPLE_DIR: sampleDir,
      AI_VISION_MOCK_DETECTION: "1",
      AI_VISION_QUIET: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForHelper(helper, helperPort);
    const baseUrl = `http://127.0.0.1:${helperPort}`;
    const streamUrl = `http://127.0.0.1:${frameServer.port}/stream`;

    const health = await getJson(`${baseUrl}/health`);
    assert.equal(health.ok, true);
    assert.equal(health.service, "ai-vision-helper");
    assert.equal(health.sampleDir, sampleDir);

    const analysis = await postJson(`${baseUrl}/analyze`, { sourceId: "main", streamUrl, state: {} });
    assert.equal(analysis.ok, true);
    assert.equal(analysis.sourceId, "main");
    assert.equal(analysis.detections[0].label, "competition_mannequin");
    assert.equal(analysis.detections[0].bbox.x, 0.32);

    const capture = await postJson(`${baseUrl}/samples/capture`, { sourceId: "main", streamUrl, label: "competition_mannequin" });
    assert.equal(capture.ok, true);
    assert.equal(capture.bytes, jpegFrame.length);
    const metadata = JSON.parse(await readFile(capture.metadataPath, "utf8"));
    assert.equal(metadata.label, "competition_mannequin");
    assert.equal(metadata.sourceId, "main");
  } finally {
    helper.kill();
    frameServer.server.close();
    await rm(sampleDir, { recursive: true, force: true });
  }
});

async function startFrameServer() {
  const server = createServer((request, response) => {
    if (request.url !== "/stream") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": jpegFrame.length });
    response.end(jpegFrame);
  });
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  return { server, port: server.address().port };
}

async function freePort() {
  const server = createServer();
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const port = server.address().port;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  return port;
}

async function waitForHelper(child, port) {
  const baseUrl = `http://127.0.0.1:${port}`;
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`AI vision helper exited early: ${stderr}`);
    }
    try {
      await getJson(`${baseUrl}/health`);
      return;
    } catch {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
  }
  throw new Error(`AI vision helper did not become ready: ${stderr}`);
}

async function getJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  assert.equal(response.ok, true, `${url} returned ${response.status}: ${text}`);
  return JSON.parse(text);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  assert.equal(response.ok, true, `${url} returned ${response.status}: ${text}`);
  return JSON.parse(text);
}
