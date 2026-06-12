import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const testDir = dirname(fileURLToPath(import.meta.url));
const script = readFileSync(join(testDir, "install-rescue-pi.sh"), "utf8");

test("Pi image installer embeds both persistent bridge services", () => {
  assert.match(script, /a-board-serial-bridge\.service/);
  assert.match(script, /pi-servo-serial-bridge\.service/);
  assert.match(script, /Restart=always/);
  assert.match(script, /systemctl enable --now a-board-serial-bridge\.service/);
  assert.match(script, /systemctl enable --now pi-servo-serial-bridge\.service/);
});

test("Pi image installer preserves bridge ports and UART assignments", () => {
  assert.match(script, /A_BOARD_SERIAL_PORT=\/dev\/ttyAMA5/);
  assert.match(script, /A_BOARD_BAUD=115200/);
  assert.match(script, /A_BOARD_BRIDGE_PORT=17353/);
  assert.match(script, /PI_SERVO_SERIAL_PORT=\/dev\/serial0/);
  assert.match(script, /PI_SERVO_BAUD=115200/);
  assert.match(script, /PI_SERVO_SERIAL_PROTOCOL=auto/);
  assert.match(script, /PI_SERVO_BRIDGE_PORT=17354/);
});

test("Pi image installer configures Pi UARTs and camera tool dependencies", () => {
  assert.match(script, /enable_uart=1/);
  assert.match(script, /dtoverlay=uart5/);
  assert.match(script, /serial-getty@serial0\.service/);
  assert.match(script, /ffmpeg v4l-utils python3-venv python3-pip/);
});
