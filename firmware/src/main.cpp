#include <Arduino.h>
#include <ArduinoJson.h>

#include "FeetechProtocol.h"

#ifndef SERIAL_BAUD
#define SERIAL_BAUD 115200
#endif

#ifndef SERVO_BUS_BAUD
#define SERVO_BUS_BAUD 1000000
#endif

#ifndef SERVO_UART_RX
#define SERVO_UART_RX 18
#endif

#ifndef SERVO_UART_TX
#define SERVO_UART_TX 19
#endif

#ifndef SERVO_DIR_PIN
#define SERVO_DIR_PIN -1
#endif

#ifndef MAX_SERVO_SPEED
#define MAX_SERVO_SPEED 1000
#endif

#ifndef DEFAULT_SERVO_ACC
#define DEFAULT_SERVO_ACC 50
#endif

Feetech::Bus servoBus(Serial1, SERVO_DIR_PIN);
String inputLine;
bool debugMode = false;

constexpr uint8_t BINARY_PROTOCOL_VERSION = 1;
constexpr uint8_t BINARY_FLAG_LATEST_WINS = 0x01;
constexpr uint8_t BINARY_FLAG_REQUIRES_ACK = 0x02;
constexpr uint8_t BINARY_TARGET_FEETECH_SERVO = 0x05;
constexpr uint8_t BINARY_TARGET_FEETECH_GROUP = 0x06;
constexpr uint8_t BINARY_OPCODE_SERVO_PING = 0x40;
constexpr uint8_t BINARY_OPCODE_SERVO_READ = 0x41;
constexpr uint8_t BINARY_OPCODE_SERVO_TORQUE = 0x42;
constexpr uint8_t BINARY_OPCODE_SERVO_MODE = 0x43;
constexpr uint8_t BINARY_OPCODE_SERVO_MOVE = 0x44;
constexpr uint8_t BINARY_OPCODE_SERVO_SPEED = 0x45;
constexpr uint8_t BINARY_OPCODE_SERVO_SET_ID = 0x46;
constexpr uint8_t BINARY_OPCODE_SERVO_GROUP_MOVE = 0x47;
constexpr size_t RX_BINARY_MAX = 160;
constexpr size_t GROUP_MOVE_MAX_TARGETS = 12;

uint8_t rxBinary[RX_BINARY_MAX];
uint8_t decodedBinary[RX_BINARY_MAX];
size_t rxBinaryLen = 0;
bool rxBinaryActive = false;
uint32_t binaryFramesIn = 0;
uint32_t binaryCrcError = 0;
uint32_t binaryCobsError = 0;
uint32_t binaryDropCount = 0;

void sendLog(const char* level, const char* message) {
  JsonDocument doc;
  doc["type"] = "log";
  doc["seq"] = 0;
  doc["level"] = level;
  doc["message"] = message;
  serializeJson(doc, Serial);
  Serial.println();
}

void sendAck(int seq, const char* command, const char* message = "ok") {
  JsonDocument doc;
  doc["type"] = "ack";
  doc["seq"] = seq;
  doc["command"] = command;
  doc["message"] = message;
  serializeJson(doc, Serial);
  Serial.println();
}

void sendError(int seq, const char* command, const char* code, const char* message) {
  JsonDocument doc;
  doc["type"] = "error";
  doc["seq"] = seq;
  doc["command"] = command;
  doc["code"] = code;
  doc["message"] = message;
  serializeJson(doc, Serial);
  Serial.println();
}

bool validateServoId(int seq, const char* command, int id) {
  if (!Feetech::isValidServoId(id)) {
    sendError(seq, command, "invalid_id", "servo id must be 0-253");
    return false;
  }
  return true;
}

bool validateDebugMode(int seq, const char* command) {
  if (!debugMode) {
    sendError(seq, command, "debug_disabled", "enable debug mode before servo commands");
    return false;
  }
  return true;
}

void sendStatusProblem(int seq, const char* command, const char* code, const Feetech::StatusPacket& status) {
  if (status.status != 0) {
    JsonDocument doc;
    doc["type"] = "error";
    doc["seq"] = seq;
    doc["command"] = command;
    doc["code"] = code;
    doc["message"] = "servo returned non-zero status";
    doc["servoStatus"] = status.status;
    serializeJson(doc, Serial);
    Serial.println();
    return;
  }
  sendError(seq, command, code, "servo did not return a valid status packet");
}

void sendProtocolFeedback(int seq) {
  JsonDocument doc;
  doc["type"] = "protocol.feedback";
  doc["seq"] = seq;
  doc["binaryProtocolReady"] = true;
  doc["binaryProtocolVersion"] = BINARY_PROTOCOL_VERSION;
  doc["transport"] = "cobs-crc16";
  doc["servoBusBaud"] = SERVO_BUS_BAUD;
  doc["servoRxPin"] = SERVO_UART_RX;
  doc["servoTxPin"] = SERVO_UART_TX;
  doc["binaryFramesIn"] = binaryFramesIn;
  doc["crcError"] = binaryCrcError;
  doc["cobsError"] = binaryCobsError;
  doc["dropCount"] = binaryDropCount;
  serializeJson(doc, Serial);
  Serial.println();
}

uint16_t crc16_ccitt_false(const uint8_t* data, size_t length) {
  uint16_t crc = 0xffff;
  for (size_t index = 0; index < length; ++index) {
    crc ^= static_cast<uint16_t>(data[index]) << 8;
    for (uint8_t bit = 0; bit < 8; ++bit) {
      if ((crc & 0x8000u) != 0) {
        crc = static_cast<uint16_t>((crc << 1) ^ 0x1021u);
      } else {
        crc = static_cast<uint16_t>(crc << 1);
      }
    }
  }
  return crc;
}

bool cobs_decode(const uint8_t* input, size_t length, uint8_t* output, size_t outputCapacity, size_t& outputLength) {
  outputLength = 0;
  size_t index = 0;
  while (index < length) {
    const uint8_t code = input[index++];
    if (code == 0) {
      return false;
    }
    const uint8_t copyCount = static_cast<uint8_t>(code - 1);
    if (index + copyCount > length || outputLength + copyCount > outputCapacity) {
      return false;
    }
    for (uint8_t copyIndex = 0; copyIndex < copyCount; ++copyIndex) {
      output[outputLength++] = input[index++];
    }
    if (code != 0xff && index < length) {
      if (outputLength >= outputCapacity) {
        return false;
      }
      output[outputLength++] = 0;
    }
  }
  return true;
}

uint16_t readU16Le(const uint8_t* data) {
  return static_cast<uint16_t>(data[0]) | (static_cast<uint16_t>(data[1]) << 8);
}

int16_t readI16Le(const uint8_t* data) {
  return static_cast<int16_t>(readU16Le(data));
}

bool validatePositionRaw(int seq, const char* command, int positionRaw) {
  if (positionRaw < 0 || positionRaw > 4095) {
    sendError(seq, command, "invalid_position", "positionRaw must be 0-4095");
    return false;
  }
  return true;
}

bool validatePositionSpeedAcc(int seq, const char* command, int positionRaw, int speedRaw, int acc) {
  if (!validatePositionRaw(seq, command, positionRaw)) {
    return false;
  }
  if (speedRaw < 0 || speedRaw > 4095) {
    sendError(seq, command, "invalid_speed", "speedRaw must be 0-4095");
    return false;
  }
  if (acc < 0 || acc > 254) {
    sendError(seq, command, "invalid_acc", "acc must be 0-254");
    return false;
  }
  return true;
}

void handleDebugSet(JsonDocument& doc, int seq) {
  debugMode = doc["enabled"] | false;
  sendAck(seq, "debug.set", debugMode ? "debug mode enabled" : "debug mode disabled");
}

void handlePing(JsonDocument& doc, int seq) {
  constexpr const char* command = "servo.ping";
  if (!validateDebugMode(seq, command)) {
    return;
  }

  int id = doc["id"] | -1;
  if (!validateServoId(seq, command, id)) {
    return;
  }

  Feetech::StatusPacket status;
  if (servoBus.ping(static_cast<uint8_t>(id), status) && status.status == 0) {
    sendAck(seq, command, "pong");
    return;
  }
  sendStatusProblem(seq, command, "ping_failed", status);
}

void handleTorque(JsonDocument& doc, int seq) {
  constexpr const char* command = "servo.torque";
  if (!validateDebugMode(seq, command)) {
    return;
  }

  int id = doc["id"] | -1;
  if (!validateServoId(seq, command, id)) {
    return;
  }

  Feetech::StatusPacket status;
  if (servoBus.setTorque(static_cast<uint8_t>(id), doc["enabled"] | false, &status) && status.status == 0) {
    sendAck(seq, command, "torque updated");
    return;
  }
  sendStatusProblem(seq, command, "torque_failed", status);
}

void handleMode(JsonDocument& doc, int seq) {
  constexpr const char* command = "servo.mode";
  if (!validateDebugMode(seq, command)) {
    return;
  }

  int id = doc["id"] | -1;
  if (!validateServoId(seq, command, id)) {
    return;
  }

  const char* mode = doc["mode"] | "";
  const bool wheelMode = strcmp(mode, "wheel") == 0;
  const bool servoMode = strcmp(mode, "servo") == 0 || strcmp(mode, "position") == 0;
  if (!wheelMode && !servoMode) {
    sendError(seq, command, "invalid_mode", "mode must be wheel or servo");
    return;
  }

  const uint8_t servoId = static_cast<uint8_t>(id);
  Feetech::StatusPacket status;
  bool ok = servoBus.setTorque(servoId, false, &status) && status.status == 0;
  delay(20);
  ok = ok && (wheelMode ? servoBus.setWheelMode(servoId, &status) : servoBus.setServoMode(servoId, &status)) && status.status == 0;
  delay(20);
  ok = ok && servoBus.setTorque(servoId, true, &status) && status.status == 0;
  delay(50);

  if (ok) {
    sendAck(seq, command, wheelMode ? "wheel mode set" : "servo mode set");
    return;
  }
  sendStatusProblem(seq, command, "mode_failed", status);
}

void sendFeedback(int seq, const Feetech::Feedback& feedback) {
  JsonDocument doc;
  doc["type"] = "servo.feedback";
  doc["seq"] = seq;
  doc["id"] = feedback.id;
  doc["positionRaw"] = feedback.positionRaw;
  doc["speedRaw"] = feedback.speedRaw;
  doc["loadRaw"] = feedback.loadRaw;
  doc["voltageRaw"] = feedback.voltageRaw;
  doc["temperatureC"] = feedback.temperatureC;
  doc["moving"] = feedback.moving;
  doc["currentRaw"] = feedback.currentRaw;
  serializeJson(doc, Serial);
  Serial.println();
}

void handleRead(JsonDocument& doc, int seq) {
  constexpr const char* command = "servo.read";
  if (!validateDebugMode(seq, command)) {
    return;
  }

  int id = doc["id"] | -1;
  if (!validateServoId(seq, command, id)) {
    return;
  }

  Feetech::StatusPacket status;
  Feetech::Feedback feedback;
  if (servoBus.readFeedback(static_cast<uint8_t>(id), feedback, status) && status.status == 0) {
    sendFeedback(seq, feedback);
    return;
  }
  sendStatusProblem(seq, command, "read_failed", status);
}

bool parseTarget(JsonObject target, int seq, int& id, float& angleDeg, int& speedRaw, int& acc) {
  constexpr const char* command = "servo.move";
  id = target["id"] | -1;
  angleDeg = target["angleDeg"] | NAN;
  speedRaw = target["speedRaw"] | -1;
  acc = target["acc"].is<int>() ? target["acc"].as<int>() : -1;

  if (!validateServoId(seq, command, id)) {
    return false;
  }
  if (!isfinite(angleDeg) || angleDeg < 0.0f || angleDeg > 360.0f) {
    sendError(seq, command, "invalid_angle", "angleDeg must be 0-360");
    return false;
  }
  if (speedRaw < 0 || speedRaw > 4095) {
    sendError(seq, command, "invalid_speed", "speedRaw must be 0-4095");
    return false;
  }
  if (acc > 254) {
    sendError(seq, command, "invalid_acc", "acc must be 0-254");
    return false;
  }
  return true;
}

bool parseSpeedTarget(JsonObject target, int seq, int& id, int& speedRaw, int& acc) {
  constexpr const char* command = "servo.speed";
  id = target["id"] | -1;
  speedRaw = target["speedRaw"] | 0;
  acc = target["acc"].is<int>() ? target["acc"].as<int>() : DEFAULT_SERVO_ACC;

  if (!validateServoId(seq, command, id)) {
    return false;
  }
  if (speedRaw < -MAX_SERVO_SPEED || speedRaw > MAX_SERVO_SPEED) {
    sendError(seq, command, "invalid_speed", "speedRaw must be within configured wheel speed limit");
    return false;
  }
  if (acc < 0 || acc > 254) {
    sendError(seq, command, "invalid_acc", "acc must be 0-254");
    return false;
  }
  return true;
}

void handleMove(JsonDocument& doc, int seq) {
  constexpr const char* command = "servo.move";
  if (!validateDebugMode(seq, command)) {
    return;
  }

  JsonArray targets = doc["targets"].as<JsonArray>();
  if (targets.isNull() || targets.size() == 0) {
    sendError(seq, command, "missing_targets", "targets must contain at least one servo");
    return;
  }

  const bool sync = doc["sync"] | false;
  if (sync && targets.size() > 1) {
    std::vector<uint8_t> syncData;
    for (JsonObject target : targets) {
      int id;
      float angleDeg;
      int speedRaw;
      int acc;
      if (!parseTarget(target, seq, id, angleDeg, speedRaw, acc)) {
        return;
      }

      uint16_t positionRaw = Feetech::angleDegToRaw(angleDeg);
      syncData.push_back(static_cast<uint8_t>(id));
      syncData.push_back(static_cast<uint8_t>(acc < 0 ? 0 : acc));
      syncData.push_back(positionRaw & 0xff);
      syncData.push_back((positionRaw >> 8) & 0xff);
      syncData.push_back(0);
      syncData.push_back(0);
      syncData.push_back(speedRaw & 0xff);
      syncData.push_back((speedRaw >> 8) & 0xff);
    }
    servoBus.syncWrite(Feetech::kAccAddr, 7, syncData);
    sendAck(seq, command, "sync write sent");
    return;
  }

  for (JsonObject target : targets) {
    int id;
    float angleDeg;
    int speedRaw;
    int acc;
    if (!parseTarget(target, seq, id, angleDeg, speedRaw, acc)) {
      return;
    }

    const uint16_t positionRaw = Feetech::angleDegToRaw(angleDeg);
    Feetech::StatusPacket status;
    if (!servoBus.writePosition(static_cast<uint8_t>(id), positionRaw, static_cast<uint16_t>(speedRaw), acc, &status) || status.status != 0) {
      sendStatusProblem(seq, command, "move_failed", status);
      return;
    }
  }

  sendAck(seq, command, "move sent");
}

void handleSpeed(JsonDocument& doc, int seq) {
  constexpr const char* command = "servo.speed";
  if (!validateDebugMode(seq, command)) {
    return;
  }

  JsonArray targets = doc["targets"].as<JsonArray>();
  if (targets.isNull() || targets.size() == 0) {
    sendError(seq, command, "missing_targets", "targets must contain at least one servo");
    return;
  }

  for (JsonObject target : targets) {
    int id;
    int speedRaw;
    int acc;
    if (!parseSpeedTarget(target, seq, id, speedRaw, acc)) {
      return;
    }

    const uint8_t servoId = static_cast<uint8_t>(id);
    if (doc["setupWheelMode"] | true) {
      Feetech::StatusPacket setupStatus;
      bool setupOk = servoBus.setTorque(servoId, false, &setupStatus) && setupStatus.status == 0;
      delay(20);
      setupOk = setupOk && servoBus.setWheelMode(servoId, &setupStatus) && setupStatus.status == 0;
      delay(20);
      setupOk = setupOk && servoBus.setTorque(servoId, true, &setupStatus) && setupStatus.status == 0;
      delay(50);
      if (!setupOk) {
        sendStatusProblem(seq, command, "speed_setup_failed", setupStatus);
        return;
      }
    }

    Feetech::StatusPacket status;
    if (!servoBus.writeSpeed(servoId, static_cast<int16_t>(speedRaw), static_cast<uint8_t>(acc), &status) || status.status != 0) {
      sendStatusProblem(seq, command, "speed_failed", status);
      return;
    }
  }

  sendAck(seq, command, "speed sent");
}

void handleMoveRaw(int seq, uint8_t id, uint16_t positionRaw, uint16_t speedRaw, uint8_t acc) {
  constexpr const char* command = "servo.move";
  if (!validateDebugMode(seq, command)) {
    return;
  }
  if (!validateServoId(seq, command, id) || !validatePositionSpeedAcc(seq, command, positionRaw, speedRaw, acc)) {
    return;
  }

  Feetech::StatusPacket status;
  if (servoBus.writePosition(id, positionRaw, speedRaw, acc, &status) && status.status == 0) {
    sendAck(seq, command, "move sent");
    return;
  }
  sendStatusProblem(seq, command, "move_failed", status);
}

void handleSpeedRaw(int seq, uint8_t id, int16_t speedRaw, uint8_t acc, bool setupWheelMode) {
  constexpr const char* command = "servo.speed";
  if (!validateDebugMode(seq, command)) {
    return;
  }
  if (!validateServoId(seq, command, id)) {
    return;
  }
  if (speedRaw < -MAX_SERVO_SPEED || speedRaw > MAX_SERVO_SPEED) {
    sendError(seq, command, "invalid_speed", "speedRaw must be within configured wheel speed limit");
    return;
  }
  if (acc > 254) {
    sendError(seq, command, "invalid_acc", "acc must be 0-254");
    return;
  }

  if (setupWheelMode) {
    Feetech::StatusPacket setupStatus;
    bool setupOk = servoBus.setTorque(id, false, &setupStatus) && setupStatus.status == 0;
    delay(20);
    setupOk = setupOk && servoBus.setWheelMode(id, &setupStatus) && setupStatus.status == 0;
    delay(20);
    setupOk = setupOk && servoBus.setTorque(id, true, &setupStatus) && setupStatus.status == 0;
    delay(50);
    if (!setupOk) {
      sendStatusProblem(seq, command, "speed_setup_failed", setupStatus);
      return;
    }
  }

  Feetech::StatusPacket status;
  if (servoBus.writeSpeed(id, speedRaw, acc, &status) && status.status == 0) {
    sendAck(seq, command, "speed sent");
    return;
  }
  sendStatusProblem(seq, command, "speed_failed", status);
}

void handleGroupMoveRaw(int seq, const uint8_t* payload, size_t payloadLength) {
  constexpr const char* command = "servo.group_move";
  if (!validateDebugMode(seq, command)) {
    return;
  }
  if (payloadLength < 4) {
    sendError(seq, command, "invalid_payload", "group move payload is too short");
    return;
  }

  const uint8_t count = payload[0];
  const size_t expectedLength = 1 + static_cast<size_t>(count) * 3 + 3;
  if (count == 0 || count > GROUP_MOVE_MAX_TARGETS || payloadLength != expectedLength) {
    sendError(seq, command, "invalid_count", "group move target count is invalid");
    return;
  }

  const uint16_t speedRaw = readU16Le(payload + 1 + static_cast<size_t>(count) * 3);
  const uint8_t acc = payload[1 + static_cast<size_t>(count) * 3 + 2];
  if (speedRaw > 4095 || acc > 254) {
    sendError(seq, command, "invalid_motion", "group move speedRaw must be 0-4095 and acc must be 0-254");
    return;
  }

  std::vector<uint8_t> syncData;
  syncData.reserve(static_cast<size_t>(count) * 8);
  size_t offset = 1;
  for (uint8_t index = 0; index < count; ++index) {
    const uint8_t id = payload[offset++];
    const uint16_t positionRaw = readU16Le(payload + offset);
    offset += 2;
    if (!validateServoId(seq, command, id) || !validatePositionRaw(seq, command, positionRaw)) {
      return;
    }
    syncData.push_back(id);
    syncData.push_back(acc);
    syncData.push_back(positionRaw & 0xff);
    syncData.push_back((positionRaw >> 8) & 0xff);
    syncData.push_back(0);
    syncData.push_back(0);
    syncData.push_back(speedRaw & 0xff);
    syncData.push_back((speedRaw >> 8) & 0xff);
  }

  servoBus.syncWrite(Feetech::kAccAddr, 7, syncData);
  sendAck(seq, command, "sync write sent");
}

void handleSetIdRaw(int seq, uint8_t oldId, uint8_t newId) {
  constexpr const char* command = "servo.set_id";
  if (!validateDebugMode(seq, command)) {
    return;
  }
  if (!validateServoId(seq, command, oldId) || !validateServoId(seq, command, newId)) {
    return;
  }
  if (oldId == newId) {
    sendError(seq, command, "same_id", "newId must be different from oldId");
    return;
  }

  Feetech::StatusPacket status;
  if (!servoBus.ping(oldId, status) || status.status != 0) {
    sendStatusProblem(seq, command, "old_id_ping_failed", status);
    return;
  }
  delay(20);
  if (!servoBus.setEepromLock(oldId, false, &status) || status.status != 0) {
    sendStatusProblem(seq, command, "unlock_failed", status);
    return;
  }
  delay(20);
  if (!servoBus.writeServoId(oldId, newId, &status) || status.status != 0) {
    sendStatusProblem(seq, command, "write_id_failed", status);
    return;
  }
  delay(80);
  if (!servoBus.setEepromLock(newId, true, &status) || status.status != 0) {
    sendStatusProblem(seq, command, "lock_failed", status);
    return;
  }
  delay(20);
  if (!servoBus.ping(newId, status) || status.status != 0) {
    sendStatusProblem(seq, command, "new_id_ping_failed", status);
    return;
  }

  sendAck(seq, command, "id updated");
}

void handleSetId(JsonDocument& doc, int seq) {
  const int oldId = doc["oldId"].is<int>() ? doc["oldId"].as<int>() : (doc["id"] | -1);
  const int newId = doc["newId"] | -1;
  if (!validateServoId(seq, "servo.set_id", oldId) || !validateServoId(seq, "servo.set_id", newId)) {
    return;
  }
  handleSetIdRaw(seq, static_cast<uint8_t>(oldId), static_cast<uint8_t>(newId));
}

void handleCommand(const String& line) {
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, line);
  if (error) {
    sendError(0, "unknown", "json_parse_failed", error.c_str());
    return;
  }

  const char* type = doc["type"] | "";
  const int seq = doc["seq"] | 0;

  if (strcmp(type, "debug.set") == 0) {
    handleDebugSet(doc, seq);
  } else if (strcmp(type, "system.protocol") == 0) {
    sendProtocolFeedback(seq);
  } else if (strcmp(type, "servo.move") == 0) {
    handleMove(doc, seq);
  } else if (strcmp(type, "servo.speed") == 0) {
    handleSpeed(doc, seq);
  } else if (strcmp(type, "servo.mode") == 0) {
    handleMode(doc, seq);
  } else if (strcmp(type, "servo.ping") == 0) {
    handlePing(doc, seq);
  } else if (strcmp(type, "servo.read") == 0) {
    handleRead(doc, seq);
  } else if (strcmp(type, "servo.torque") == 0) {
    handleTorque(doc, seq);
  } else if (strcmp(type, "servo.set_id") == 0) {
    handleSetId(doc, seq);
  } else {
    sendError(seq, type, "unknown_command", "unknown command type");
  }
}

bool requirePayloadLength(int seq, const char* command, size_t actual, size_t expected) {
  if (actual == expected) {
    return true;
  }
  sendError(seq, command, "invalid_payload", "binary payload length mismatch");
  return false;
}

void handle_binary_frame(const uint8_t* encoded, size_t encodedLength) {
  size_t bodyLength = 0;
  if (!cobs_decode(encoded, encodedLength, decodedBinary, sizeof(decodedBinary), bodyLength)) {
    ++binaryCobsError;
    sendProtocolFeedback(0);
    return;
  }

  if (bodyLength < 8) {
    ++binaryDropCount;
    sendError(0, "binary", "frame_too_short", "binary frame body is too short");
    return;
  }

  const uint16_t receivedCrc = readU16Le(decodedBinary + bodyLength - 2);
  const uint16_t actualCrc = crc16_ccitt_false(decodedBinary, bodyLength - 2);
  const int seq = readU16Le(decodedBinary + 1);
  if (receivedCrc != actualCrc) {
    ++binaryCrcError;
    sendError(seq, "binary", "crc_mismatch", "binary frame CRC16 check failed");
    return;
  }

  ++binaryFramesIn;
  const uint8_t version = decodedBinary[0];
  const uint8_t targetId = decodedBinary[3];
  const uint8_t opcode = decodedBinary[4];
  const uint8_t flags = decodedBinary[5];
  const uint8_t* payload = decodedBinary + 6;
  const size_t payloadLength = bodyLength - 8;
  (void)flags;

  if (version != BINARY_PROTOCOL_VERSION) {
    sendError(seq, "binary", "unsupported_version", "unsupported binary protocol version");
    return;
  }

  if (targetId == BINARY_TARGET_FEETECH_GROUP && opcode == BINARY_OPCODE_SERVO_GROUP_MOVE) {
    handleGroupMoveRaw(seq, payload, payloadLength);
    return;
  }

  if (targetId != BINARY_TARGET_FEETECH_SERVO) {
    sendError(seq, "binary", "unsupported_target", "unsupported binary target id");
    return;
  }

  switch (opcode) {
    case BINARY_OPCODE_SERVO_PING: {
      constexpr const char* command = "servo.ping";
      if (!requirePayloadLength(seq, command, payloadLength, 1)) {
        return;
      }
      JsonDocument doc;
      doc["id"] = payload[0];
      handlePing(doc, seq);
      break;
    }
    case BINARY_OPCODE_SERVO_READ: {
      constexpr const char* command = "servo.read";
      if (!requirePayloadLength(seq, command, payloadLength, 1)) {
        return;
      }
      JsonDocument doc;
      doc["id"] = payload[0];
      handleRead(doc, seq);
      break;
    }
    case BINARY_OPCODE_SERVO_TORQUE: {
      constexpr const char* command = "servo.torque";
      if (!requirePayloadLength(seq, command, payloadLength, 2)) {
        return;
      }
      JsonDocument doc;
      doc["id"] = payload[0];
      doc["enabled"] = payload[1] != 0;
      handleTorque(doc, seq);
      break;
    }
    case BINARY_OPCODE_SERVO_MODE: {
      constexpr const char* command = "servo.mode";
      if (!requirePayloadLength(seq, command, payloadLength, 2)) {
        return;
      }
      JsonDocument doc;
      doc["id"] = payload[0];
      doc["mode"] = payload[1] == 1 ? "wheel" : "position";
      handleMode(doc, seq);
      break;
    }
    case BINARY_OPCODE_SERVO_MOVE: {
      constexpr const char* command = "servo.move";
      if (!requirePayloadLength(seq, command, payloadLength, 6)) {
        return;
      }
      handleMoveRaw(seq, payload[0], readU16Le(payload + 1), readU16Le(payload + 3), payload[5]);
      break;
    }
    case BINARY_OPCODE_SERVO_SPEED: {
      constexpr const char* command = "servo.speed";
      if (!requirePayloadLength(seq, command, payloadLength, 5)) {
        return;
      }
      handleSpeedRaw(seq, payload[0], readI16Le(payload + 1), payload[3], payload[4] != 0);
      break;
    }
    case BINARY_OPCODE_SERVO_SET_ID: {
      constexpr const char* command = "servo.set_id";
      if (!requirePayloadLength(seq, command, payloadLength, 2)) {
        return;
      }
      handleSetIdRaw(seq, payload[0], payload[1]);
      break;
    }
    default:
      sendError(seq, "binary", "unsupported_opcode", "unsupported binary opcode");
      break;
  }
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  servoBus.begin(SERVO_BUS_BAUD, SERVO_UART_RX, SERVO_UART_TX);
  inputLine.reserve(512);
  delay(200);
  sendLog("info", "servo debug firmware ready");
}

void loop() {
  while (Serial.available()) {
    const uint8_t byte = static_cast<uint8_t>(Serial.read());
    if (byte == 0) {
      if (rxBinaryActive) {
        if (rxBinaryLen > 0) {
          handle_binary_frame(rxBinary, rxBinaryLen);
        }
        rxBinaryLen = 0;
        rxBinaryActive = false;
      } else {
        rxBinaryActive = true;
        rxBinaryLen = 0;
        inputLine = "";
      }
      continue;
    }

    if (rxBinaryActive) {
      if (rxBinaryLen >= sizeof(rxBinary)) {
        ++binaryDropCount;
        rxBinaryLen = 0;
        rxBinaryActive = false;
        sendError(0, "binary", "frame_too_long", "binary frame exceeded receive buffer");
        continue;
      }
      rxBinary[rxBinaryLen++] = byte;
      continue;
    }

    char ch = static_cast<char>(byte);
    if (ch == '\n') {
      String line = inputLine;
      inputLine = "";
      line.trim();
      if (line.length() > 0) {
        handleCommand(line);
      }
    } else if (ch != '\r') {
      inputLine += ch;
      if (inputLine.length() > 1024) {
        inputLine = "";
        sendError(0, "unknown", "line_too_long", "json line exceeded 1024 bytes");
      }
    }
  }
}
