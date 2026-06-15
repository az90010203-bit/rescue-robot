import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("../../firmware/src/main.cpp", import.meta.url), "utf8");
const protocolHeader = await readFile(new URL("../../firmware/src/FeetechProtocol.h", import.meta.url), "utf8");
const protocolSource = await readFile(new URL("../../firmware/src/FeetechProtocol.cpp", import.meta.url), "utf8");

test("ESP32 Feetech firmware supports COBS CRC16 binary serial protocol", () => {
  assert.match(main, /constexpr uint8_t BINARY_PROTOCOL_VERSION = 1/);
  assert.match(main, /constexpr uint8_t BINARY_TARGET_FEETECH_SERVO = 0x05/);
  assert.match(main, /constexpr uint8_t BINARY_TARGET_FEETECH_GROUP = 0x06/);
  assert.match(main, /constexpr uint8_t BINARY_OPCODE_SERVO_PING = 0x40/);
  assert.match(main, /constexpr uint8_t BINARY_OPCODE_SERVO_READ = 0x41/);
  assert.match(main, /constexpr uint8_t BINARY_OPCODE_SERVO_TORQUE = 0x42/);
  assert.match(main, /constexpr uint8_t BINARY_OPCODE_SERVO_MODE = 0x43/);
  assert.match(main, /constexpr uint8_t BINARY_OPCODE_SERVO_MOVE = 0x44/);
  assert.match(main, /constexpr uint8_t BINARY_OPCODE_SERVO_SPEED = 0x45/);
  assert.match(main, /constexpr uint8_t BINARY_OPCODE_SERVO_SET_ID = 0x46/);
  assert.match(main, /constexpr uint8_t BINARY_OPCODE_SERVO_GROUP_MOVE = 0x47/);
  assert.match(main, /uint16_t crc16_ccitt_false\(const uint8_t\* data, size_t length\)/);
  assert.match(main, /0x1021u/);
  assert.match(main, /bool cobs_decode\(/);
  assert.match(main, /void handle_binary_frame\(const uint8_t\* encoded, size_t encodedLength\)/);
  assert.match(main, /receivedCrc != actualCrc/);
  assert.match(main, /handle_binary_frame\(rxBinary, rxBinaryLen\)/);
});

test("ESP32 Feetech firmware reports protocol health counters", () => {
  assert.match(main, /uint32_t binaryFramesIn = 0/);
  assert.match(main, /uint32_t binaryCrcError = 0/);
  assert.match(main, /uint32_t binaryCobsError = 0/);
  assert.match(main, /uint32_t binaryDropCount = 0/);
  assert.match(main, /doc\["type"\] = "protocol\.feedback"/);
  assert.match(main, /doc\["binaryProtocolReady"\] = true/);
  assert.match(main, /doc\["binaryFramesIn"\] = binaryFramesIn/);
  assert.match(main, /doc\["crcError"\] = binaryCrcError/);
  assert.match(main, /doc\["cobsError"\] = binaryCobsError/);
  assert.match(main, /doc\["dropCount"\] = binaryDropCount/);
  assert.match(main, /strcmp\(type, "system\.protocol"\) == 0/);
});

test("ESP32 Feetech firmware dispatches binary servo opcodes", () => {
  assert.match(main, /case BINARY_OPCODE_SERVO_PING:/);
  assert.match(main, /case BINARY_OPCODE_SERVO_READ:/);
  assert.match(main, /case BINARY_OPCODE_SERVO_TORQUE:/);
  assert.match(main, /case BINARY_OPCODE_SERVO_MODE:/);
  assert.match(main, /case BINARY_OPCODE_SERVO_MOVE:/);
  assert.match(main, /case BINARY_OPCODE_SERVO_SPEED:/);
  assert.match(main, /case BINARY_OPCODE_SERVO_SET_ID:/);
  assert.match(main, /targetId == BINARY_TARGET_FEETECH_GROUP && opcode == BINARY_OPCODE_SERVO_GROUP_MOVE/);
  assert.match(main, /handleMoveRaw\(seq, payload\[0\], readU16Le\(payload \+ 1\), readU16Le\(payload \+ 3\), payload\[5\]\)/);
  assert.match(main, /handleSpeedRaw\(seq, payload\[0\], readI16Le\(payload \+ 1\), payload\[3\], payload\[4\] != 0\)/);
  assert.match(main, /handleGroupMoveRaw\(seq, payload, payloadLength\)/);
});

test("ESP32 Feetech speed writes consume acceleration status before goal speed", () => {
  assert.match(protocolSource, /StatusPacket accStatus/);
  assert.match(protocolSource, /write\(id, kAccAddr, \{acc\}, &accStatus\)/);
  assert.doesNotMatch(protocolSource, /write\(id, kAccAddr, \{acc\}, nullptr\)/);
});

test("ESP32 Feetech firmware supports safe physical ID writes", () => {
  assert.match(protocolHeader, /constexpr uint8_t kServoIdAddr = 5/);
  assert.match(protocolHeader, /constexpr uint8_t kEepromLockAddr = 55/);
  assert.match(protocolHeader, /bool setEepromLock\(uint8_t id, bool locked, StatusPacket\* status\)/);
  assert.match(protocolHeader, /bool writeServoId\(uint8_t oldId, uint8_t newId, StatusPacket\* status\)/);
  assert.match(protocolSource, /return write\(id, kEepromLockAddr, \{static_cast<uint8_t>\(locked \? 1 : 0\)\}, status\)/);
  assert.match(protocolSource, /return write\(oldId, kServoIdAddr, \{newId\}, status\)/);
  assert.match(main, /void handleSetIdRaw\(int seq, uint8_t oldId, uint8_t newId\)/);
  assert.match(main, /servoBus\.ping\(oldId, status\)/);
  assert.match(main, /servoBus\.setEepromLock\(oldId, false, &status\)/);
  assert.match(main, /servoBus\.writeServoId\(oldId, newId, &status\)/);
  assert.match(main, /servoBus\.setEepromLock\(newId, true, &status\)/);
  assert.match(main, /servoBus\.ping\(newId, status\)/);
});
