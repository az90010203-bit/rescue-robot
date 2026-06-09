import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const script = await readFile(new URL("./pi-servo-serial-bridge.py", import.meta.url), "utf8");

test("Pi servo serial bridge exposes serial disconnect diagnostics", () => {
  assert.match(script, /SERIAL_EVENT_LIMIT/);
  assert.match(script, /self\.serial_events = deque/);
  assert.match(script, /def diagnostics\(self\):/);
  assert.match(script, /if self\.path == "\/diagnostics":/);
  assert.match(script, /"lastSerialEvent": self\.last_serial_event/);
  assert.match(script, /"lastCloseReason": self\.last_close_reason/);
  assert.match(script, /"lastException": self\.last_exception/);
  assert.match(script, /"consecutiveOpenFailures": self\.consecutive_open_failures/);
  assert.match(script, /"deviceExists": os\.path\.exists\(SERIAL_PORT\)/);
  assert.match(script, /"no_response"/);
  assert.match(script, /"request_failed"/);
  assert.match(script, /"device_missing"/);
  assert.match(script, /"stale_rx_dropped"/);
});

test("Pi servo serial bridge coalesces live drag writes without changing FIFO defaults", () => {
  assert.match(script, /LIVE_POLICY_LATEST = "latest"/);
  assert.match(script, /DEFAULT_LIVE_MIN_INTERVAL_MS/);
  assert.match(script, /DEFAULT_LIVE_ACK_DRAIN_MS/);
  assert.match(script, /def clamp_int\(value, default, minimum, maximum\):/);
  assert.match(script, /self\.live_latest_request_by_key = \{\}/);
  assert.match(script, /"liveSkipped": self\.live_skipped/);
  assert.match(script, /"liveRateLimited": self\.live_rate_limited/);
  assert.match(script, /"liveLastSentAtByKey": \{key: round\(value, 3\)/);
  assert.match(script, /def _live_skip_response\(self, job\):/);
  assert.match(script, /"live_stale_skipped"/);
  assert.match(script, /def _live_rate_limit_delay\(self, job\):/);
  assert.match(script, /"live_rate_limited"/);
  assert.match(script, /body\.get\("policy"\)/);
  assert.match(script, /body\.get\("coalesceKey"\)/);
  assert.match(script, /body\.get\("minIntervalMs"\)/);
  assert.match(script, /body\.get\("ackDrainMs"\)/);
});
