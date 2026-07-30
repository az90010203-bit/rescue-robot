import { createServer } from "node:http";

const health = {
  ok: true,
  service: "rescue-v2-control-agent-mock",
  version: "0.1.0",
  armed: false,
  qtHeartbeatAgeMs: 12,
  qtHeartbeatFresh: true,
  lastStopReason: null,
  stopCount: 0,
  speedLimits: { mecanum: 50, tracked: 60 },
  lastError: null,
  controller: {
    port: "MOCK",
    connected: false,
    frameAgeMs: null,
    fresh: false,
    lastFrame: null,
    lastError: "E2E mock: no physical controller"
  },
  pi: {
    ok: true,
    service: "rescue-v2-pi-coordinator-mock",
    version: "0.1.0",
    serialOpen: false,
    armed: false,
    timedOut: false,
    lastStopReason: null,
    acceptedCommands: 0,
    rejectedCommands: 0,
    lastTelemetry: null,
    feetech: {
      serialOpen: false,
      feedback: {},
      lastError: "E2E mock: no physical servos"
    }
  }
};

const requests = [];

const server = createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    const requestBody = Buffer.concat(chunks).toString("utf8");
    if (request.method === "POST") {
      requests.push({
        method: request.method,
        url: request.url,
        body: requestBody === "" ? null : JSON.parse(requestBody)
      });
    }
    const payload =
      request.method === "GET" && request.url === "/v2/health"
        ? health
        : request.method === "GET" && request.url === "/__mock/requests"
          ? { ok: true, requests }
          : { ok: true };
    const body = Buffer.from(JSON.stringify(payload));
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": String(body.length),
      Connection: "close"
    });
    response.end(body);
  });
});

server.listen(18400, "127.0.0.1", () => {
  process.stdout.write("Mock Control Agent listening on 127.0.0.1:18400\n");
});
