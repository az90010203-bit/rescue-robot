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
  assert.match(script, /"binary_fallback"/);
  assert.match(script, /"request_failed"/);
  assert.match(script, /"device_missing"/);
  assert.match(script, /"stale_rx_dropped"/);
});

test("Pi servo serial bridge builds ESP32 COBS binary command frames", () => {
  assert.match(script, /SERIAL_PROTOCOL_MODE = os\.environ\.get\("PI_SERVO_SERIAL_PROTOCOL", "auto"\)/);
  assert.match(script, /PROTOCOL_VERSION = 1/);
  assert.match(script, /BINARY_FLAG_LATEST_WINS = 0x01/);
  assert.match(script, /BINARY_FLAG_REQUIRES_ACK = 0x02/);
  assert.match(script, /BINARY_TARGET_FEETECH_SERVO = 0x05/);
  assert.match(script, /BINARY_TARGET_FEETECH_GROUP = 0x06/);
  assert.match(script, /"servo\.ping": 0x40/);
  assert.match(script, /"servo\.read": 0x41/);
  assert.match(script, /"servo\.torque": 0x42/);
  assert.match(script, /"servo\.mode": 0x43/);
  assert.match(script, /"servo\.move": 0x44/);
  assert.match(script, /"servo\.speed": 0x45/);
  assert.match(script, /"servo\.set_id": 0x46/);
  assert.match(script, /"servo\.group_move": 0x47/);
  assert.match(script, /def crc16_ccitt_false\(data\):/);
  assert.match(script, /crc = 0xFFFF/);
  assert.match(script, /0x1021/);
  assert.match(script, /def cobs_encode\(data\):/);
  assert.match(script, /def target_position_raw\(target\):/);
  assert.match(script, /"positionRaw" in target/);
  assert.match(script, /target_position_raw\(target\)/);
  assert.match(script, /def build_binary_command_frame\(command, latest=False\):/);
  assert.match(script, /body\.extend\(crc16_ccitt_false\(body\)\.to_bytes\(2, "little", signed=False\)\)/);
  assert.match(script, /return b"\\x00" \+ cobs_encode\(bytes\(body\)\) \+ b"\\x00"/);
});

test("Pi servo serial bridge probes binary support and reports protocol health", () => {
  assert.match(script, /"type": "system\.protocol"/);
  assert.match(script, /"protocol\.feedback"/);
  assert.match(script, /message\.get\("binaryProtocolReady"\) is True/);
  assert.match(script, /"transportMode": "esp32-cobs"/);
  assert.match(script, /"serialProtocolMode": self\.serial_protocol_mode/);
  assert.match(script, /"serialProtocolActive": self\.serial_protocol_active/);
  assert.match(script, /"binaryProtocolReady": self\.binary_protocol_ready/);
  assert.match(script, /"controllerReady": self\.controller_ready/);
  assert.match(script, /"binaryFramesOut": self\.binary_frames_out/);
  assert.match(script, /"jsonFramesOut": self\.json_frames_out/);
  assert.match(script, /"binaryFallbackCount": self\.binary_fallback_count/);
  assert.match(script, /"crcError": self\.crc_error/);
  assert.match(script, /"cobsError": self\.cobs_error/);
  assert.match(script, /"dropCount": self\.drop_count/);
});

test("Pi servo serial bridge exposes semantic command endpoint and guards legacy frames", () => {
  assert.match(script, /if self\.path == "\/frame":/);
  assert.match(script, /raw Feetech frame forwarding has moved to ESP32 semantic commands/);
  assert.match(script, /if self\.path != "\/command":/);
  assert.match(script, /body\.get\("command"\)/);
  assert.match(script, /worker\.submit\(/);
  assert.match(script, /normalize_command\(command\)/);
  assert.match(script, /"servo\.read_feedback"/);
  assert.match(script, /"servo\.set_position"/);
  assert.match(script, /"servo\.set_speed"/);
});

test("Pi servo serial bridge coalesces live drag commands without changing FIFO defaults", () => {
  assert.match(script, /LIVE_POLICY_LATEST = "latest"/);
  assert.match(script, /DEFAULT_LIVE_MIN_INTERVAL_MS/);
  assert.match(script, /def clamp_int\(value, default, minimum, maximum\):/);
  assert.match(script, /self\.live_latest_request_by_key = \{\}/);
  assert.match(script, /"liveSkipped": self\.live_skipped/);
  assert.match(script, /"liveRateLimited": self\.live_rate_limited/);
  assert.match(script, /"liveLastSentAtByKey": \{key: round\(value, 3\)/);
  assert.match(script, /self\.queue = deque\(\)/);
  assert.match(script, /self\.condition = threading\.Condition\(self\.lock\)/);
  assert.match(script, /def _drop_queued_live_jobs_locked\(self, live_key, replacement_id\):/);
  assert.match(script, /def _complete_stale_live_job\(self, job, reason="stale"\):/);
  assert.match(script, /def _live_skip_response\(self, job\):/);
  assert.match(script, /"live_stale_skipped"/);
  assert.match(script, /def _live_rate_limit_delay\(self, job\):/);
  assert.match(script, /"live_rate_limited"/);
  assert.match(script, /body\.get\("policy"\)/);
  assert.match(script, /body\.get\("coalesceKey"\)/);
  assert.match(script, /body\.get\("minIntervalMs"\)/);
});
