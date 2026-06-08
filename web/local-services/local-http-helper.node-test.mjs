import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { isLocalRequest, readJsonBody, sendJson } from "./local-http-helper.mjs";

test("local http helper recognizes loopback requests", () => {
  assert.equal(isLocalRequest({ socket: { remoteAddress: "127.0.0.1" } }), true);
  assert.equal(isLocalRequest({ socket: { remoteAddress: "::1" } }), true);
  assert.equal(isLocalRequest({ socket: { remoteAddress: "::ffff:127.0.0.1" } }), true);
  assert.equal(isLocalRequest({ socket: { remoteAddress: "192.168.1.8" } }), false);
});

test("local http helper reads json with a size limit", async () => {
  const body = Readable.from([Buffer.from(JSON.stringify({ ok: true }))]);
  assert.deepEqual(await readJsonBody(body, { maxBytes: 64 }), { ok: true });

  await assert.rejects(
    () => readJsonBody(Readable.from([Buffer.from("x".repeat(65))]), { maxBytes: 64 }),
    /too large/
  );
});

test("local http helper sends json with custom methods", () => {
  const response = {
    body: "",
    headers: null,
    statusCode: 0,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    }
  };

  sendJson(response, 201, { ok: true }, { methods: "GET,POST,PUT,OPTIONS" });

  assert.equal(response.statusCode, 201);
  assert.equal(response.headers["Access-Control-Allow-Methods"], "GET,POST,PUT,OPTIONS");
  assert.deepEqual(JSON.parse(response.body), { ok: true });
});
