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
  } else {
    sendError(seq, type, "unknown_command", "unknown command type");
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
    char ch = static_cast<char>(Serial.read());
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
