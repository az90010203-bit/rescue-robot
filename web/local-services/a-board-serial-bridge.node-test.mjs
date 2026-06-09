import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const script = await readFile(new URL("./a-board-serial-bridge.py", import.meta.url), "utf8");

test("A board serial bridge keeps only the newest semantic motion target", () => {
  assert.match(script, /LATEST_WINS_TYPES = \("motor\.target", "mecanum\.target", "can_servo\.move"\)/);
  assert.match(script, /def translate_command\(command\):/);
  assert.match(script, /translated\["type"\] = "motor\.target"/);
  assert.match(script, /"type": "mecanum\.target"/);
  assert.match(script, /self\.pending_motion_job = None/);
  assert.match(script, /self\.dropped_motion_count = 0/);
  assert.match(script, /def _drop_pending_motion_locked\(self, reason\):/);
  assert.match(script, /def _enqueue_job\(self, job\):/);
  assert.match(script, /self\.pending_motion_job = job/);
  assert.match(script, /"busy": True/);
  assert.match(script, /"accepted": False/);
  assert.match(script, /"dropped": True/);
});

test("A board serial bridge treats IMU reads as lower priority telemetry", () => {
  assert.match(script, /LOW_PRIORITY_TYPES = \("imu\.read",\)/);
  assert.match(script, /def _is_low_priority_command\(self, command\):/);
  assert.match(script, /def _low_priority_busy_response_locked\(self, job, reason\):/);
  assert.match(script, /"telemetrySkipped": True/);
  assert.match(script, /def _drop_queued_low_priority_locked\(self, reason\):/);
  assert.match(script, /self\._drop_queued_low_priority_locked\("preempted by motion command"\)/);
  assert.match(script, /self\._drop_queued_low_priority_locked\("preempted by control command"\)/);
  assert.match(script, /return self\.in_flight or self\._queue_depth_locked\(\) > 0/);
});

test("A board serial bridge waits for real motion feedback after scheduler feedback", () => {
  assert.match(script, /TERMINAL_TYPES = \("error", "motor\.feedback", "mecanum\.feedback", "can\.feedback", "can\.frame", "can_servo\.feedback", "imu\.feedback"\)/);
  assert.doesNotMatch(script, /TERMINAL_TYPES = .*scheduler\.feedback/);
});

test("A board serial bridge health exposes busy, queue depth, and scheduler state", () => {
  assert.match(script, /"queueDepth": queue_depth/);
  assert.match(script, /"inFlight": self\.in_flight/);
  assert.match(script, /"busy": self\.in_flight or queue_depth > 0/);
  assert.match(script, /"motionPending": self\.pending_motion_job is not None/);
  assert.match(script, /"latestMotionSeq": self\.latest_motion_seq/);
  assert.match(script, /"droppedMotionCount": self\.dropped_motion_count/);
  assert.match(script, /"activeCommand": self\.active_command/);
});

test("A board serial bridge exposes serial disconnect diagnostics", () => {
  assert.match(script, /SERIAL_EVENT_LIMIT/);
  assert.match(script, /self\.serial_events = deque/);
  assert.match(script, /def diagnostics\(self\):/);
  assert.match(script, /if self\.path == "\/diagnostics":/);
  assert.match(script, /"lastSerialEvent": self\.last_serial_event/);
  assert.match(script, /"lastCloseReason": self\.last_close_reason/);
  assert.match(script, /"lastException": self\.last_exception/);
  assert.match(script, /"consecutiveOpenFailures": self\.consecutive_open_failures/);
  assert.match(script, /"deviceExists": os\.path\.exists\(SERIAL_PORT\)/);
  assert.match(script, /"no_matching_response"/);
  assert.match(script, /"request_failed"/);
  assert.match(script, /"device_missing"/);
});
