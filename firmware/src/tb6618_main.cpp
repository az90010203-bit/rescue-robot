#include <Arduino.h>
#include <ArduinoJson.h>
#include <ctype.h>
#include <math.h>
#include <string.h>

#ifndef SERIAL_BAUD
#define SERIAL_BAUD 115200
#endif

struct MotorPins {
  explicit MotorPins(const char* channelName) : channel(channelName) {}

  const char* channel;
  int pwmPin = -1;
  int in1Pin = -1;
  int in2Pin = -1;
  int enablePin = -1;
  int sensorPin = -1;
  bool configured = false;
  float commandedSpeedPercent = 0.0f;
  const char* direction = "stopped";
  const char* stopMode = "coast";
};

MotorPins motors[] = {
  MotorPins("M1"),
  MotorPins("M2"),
  MotorPins("M3"),
  MotorPins("M4"),
  MotorPins("M5"),
  MotorPins("M6"),
};

String inputLine;
bool debugMode = false;
constexpr unsigned long DIRECTION_DEADTIME_MS = 50;

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

void uppercaseCopy(const char* input, char* output, size_t outputSize) {
  if (outputSize == 0) {
    return;
  }

  size_t index = 0;
  while (input && input[index] && index + 1 < outputSize) {
    output[index] = static_cast<char>(toupper(static_cast<unsigned char>(input[index])));
    index += 1;
  }
  output[index] = '\0';
}

MotorPins* findMotor(const char* channel) {
  char normalized[8];
  uppercaseCopy(channel, normalized, sizeof(normalized));

  for (MotorPins& motor : motors) {
    if (strcmp(motor.channel, normalized) == 0) {
      return &motor;
    }
  }
  return nullptr;
}

int parsePinName(const char* pinName) {
  if (!pinName || !pinName[0]) {
    return -1;
  }

  char normalized[12];
  uppercaseCopy(pinName, normalized, sizeof(normalized));
  if (normalized[0] == 'D' && isdigit(normalized[1])) {
    return atoi(normalized + 1);
  }
  if (normalized[0] == 'A' && isdigit(normalized[1])) {
    return A0 + atoi(normalized + 1);
  }
  if (isdigit(normalized[0])) {
    return atoi(normalized);
  }

  return -1;
}

bool isKnownPwmPin(int pin) {
#if defined(ARDUINO_AVR_UNO) || defined(ARDUINO_AVR_NANO)
  return pin == 3 || pin == 5 || pin == 6 || pin == 9 || pin == 10 || pin == 11;
#else
  return pin >= 0;
#endif
}

bool validateDebugMode(int seq, const char* command) {
  if (!debugMode) {
    sendError(seq, command, "debug_disabled", "enable debug mode before motor commands");
    return false;
  }
  return true;
}

void writeSafeStop(MotorPins& motor) {
  if (motor.enablePin >= 0) {
    digitalWrite(motor.enablePin, LOW);
  }
  if (motor.pwmPin >= 0) {
    analogWrite(motor.pwmPin, 0);
  }
  if (motor.in1Pin >= 0) {
    digitalWrite(motor.in1Pin, LOW);
  }
  if (motor.in2Pin >= 0) {
    digitalWrite(motor.in2Pin, LOW);
  }
  motor.commandedSpeedPercent = 0.0f;
  motor.direction = "stopped";
  motor.stopMode = "coast";
}

void configureOutputs(MotorPins& motor) {
  pinMode(motor.pwmPin, OUTPUT);
  pinMode(motor.in1Pin, OUTPUT);
  pinMode(motor.in2Pin, OUTPUT);
  if (motor.enablePin >= 0) {
    pinMode(motor.enablePin, OUTPUT);
    digitalWrite(motor.enablePin, LOW);
  }
  if (motor.sensorPin >= 0) {
    pinMode(motor.sensorPin, INPUT_PULLUP);
  }
  analogWrite(motor.pwmPin, 0);
  digitalWrite(motor.in1Pin, LOW);
  digitalWrite(motor.in2Pin, LOW);
  if (motor.enablePin >= 0) {
    digitalWrite(motor.enablePin, HIGH);
  }
}

void sendMotorFeedback(int seq, const MotorPins& motor) {
  JsonDocument doc;
  doc["type"] = "motor.feedback";
  doc["seq"] = seq;
  doc["channel"] = motor.channel;
  doc["commandedSpeedPercent"] = motor.commandedSpeedPercent;
  doc["dutyPercent"] = fabs(motor.commandedSpeedPercent);
  doc["direction"] = motor.direction;
  doc["stopMode"] = motor.stopMode;
  serializeJson(doc, Serial);
  Serial.println();
}

void stopMotorPins(MotorPins& motor, const char* stopMode) {
  const bool brake = strcmp(stopMode, "brake") == 0;
  if (motor.enablePin >= 0) {
    digitalWrite(motor.enablePin, HIGH);
  }
  if (brake) {
    digitalWrite(motor.in1Pin, HIGH);
    digitalWrite(motor.in2Pin, HIGH);
    analogWrite(motor.pwmPin, 255);
  } else {
    analogWrite(motor.pwmPin, 0);
    digitalWrite(motor.in1Pin, LOW);
    digitalWrite(motor.in2Pin, LOW);
  }
  motor.commandedSpeedPercent = 0.0f;
  motor.direction = "stopped";
  motor.stopMode = brake ? "brake" : "coast";
}

bool applyMotor(MotorPins& motor, float speedPercent, const char* stopMode) {
  if (!motor.configured) {
    return false;
  }

  const float speed = constrain(speedPercent, -100.0f, 100.0f);
  const int duty = static_cast<int>(roundf(fabs(speed) * 255.0f / 100.0f));
  if (motor.enablePin >= 0) {
    digitalWrite(motor.enablePin, HIGH);
  }

  const int previousSign = motor.commandedSpeedPercent > 0.0f ? 1 : (motor.commandedSpeedPercent < 0.0f ? -1 : 0);
  const int nextSign = speed > 0.0f ? 1 : (speed < 0.0f ? -1 : 0);
  if (previousSign != 0 && nextSign != 0 && previousSign != nextSign) {
    analogWrite(motor.pwmPin, 0);
    digitalWrite(motor.in1Pin, LOW);
    digitalWrite(motor.in2Pin, LOW);
    delay(DIRECTION_DEADTIME_MS);
  }

  if (speed > 0.0f) {
    digitalWrite(motor.in1Pin, HIGH);
    digitalWrite(motor.in2Pin, LOW);
    analogWrite(motor.pwmPin, duty);
    motor.direction = "forward";
  } else if (speed < 0.0f) {
    digitalWrite(motor.in1Pin, LOW);
    digitalWrite(motor.in2Pin, HIGH);
    analogWrite(motor.pwmPin, duty);
    motor.direction = "reverse";
  } else {
    stopMotorPins(motor, stopMode);
    return true;
  }

  motor.commandedSpeedPercent = speed;
  motor.stopMode = stopMode;
  return true;
}

void handleDebugSet(JsonDocument& doc, int seq) {
  debugMode = doc["enabled"] | false;
  sendAck(seq, "debug.set", debugMode ? "debug mode enabled" : "debug mode disabled");
}

void handleMotorConfig(JsonDocument& doc, int seq) {
  constexpr const char* command = "motor.config";
  if (!validateDebugMode(seq, command)) {
    return;
  }

  const char* channel = doc["channel"] | "";
  MotorPins* motor = findMotor(channel);
  if (!motor) {
    sendError(seq, command, "invalid_channel", "channel must be M1-M6");
    return;
  }

  JsonObject pins = doc["pins"].as<JsonObject>();
  const int pwmPin = parsePinName(pins["pwm"] | "");
  const int in1Pin = parsePinName(pins["in1"] | "");
  const int in2Pin = parsePinName(pins["in2"] | "");
  const int enablePin = parsePinName(pins["enable"] | "");
  const int sensorPin = parsePinName(pins["sensor"] | "");

  if (pwmPin < 0 || in1Pin < 0 || in2Pin < 0) {
    sendError(seq, command, "invalid_pins", "pwm, in1 and in2 pins are required");
    return;
  }
  if (!isKnownPwmPin(pwmPin)) {
    sendError(seq, command, "invalid_pwm_pin", "pwm pin must support analogWrite PWM");
    return;
  }

  motor->pwmPin = pwmPin;
  motor->in1Pin = in1Pin;
  motor->in2Pin = in2Pin;
  motor->enablePin = enablePin;
  motor->sensorPin = sensorPin;
  motor->configured = true;
  configureOutputs(*motor);
  sendAck(seq, command, "motor pins configured");
  sendMotorFeedback(seq, *motor);
}

void handleMotorSet(JsonDocument& doc, int seq) {
  constexpr const char* command = "motor.set";
  if (!validateDebugMode(seq, command)) {
    return;
  }

  MotorPins* motor = findMotor(doc["channel"] | "");
  if (!motor) {
    sendError(seq, command, "invalid_channel", "channel must be M1-M6");
    return;
  }
  if (!motor->configured) {
    sendError(seq, command, "unconfigured_channel", "send motor.config before motor.set");
    return;
  }

  const float speedPercent = doc["speedPercent"] | NAN;
  const char* stopMode = doc["stopMode"] | "coast";
  if (!isfinite(speedPercent) || speedPercent < -100.0f || speedPercent > 100.0f) {
    sendError(seq, command, "invalid_speed", "speedPercent must be -100..100");
    return;
  }
  if (strcmp(stopMode, "coast") != 0 && strcmp(stopMode, "brake") != 0) {
    sendError(seq, command, "invalid_stop_mode", "stopMode must be coast or brake");
    return;
  }

  if (!applyMotor(*motor, speedPercent, stopMode)) {
    sendError(seq, command, "set_failed", "motor command failed");
    return;
  }
  sendAck(seq, command, "motor speed set");
  sendMotorFeedback(seq, *motor);
}

void handleMotorStop(JsonDocument& doc, int seq) {
  constexpr const char* command = "motor.stop";
  if (!validateDebugMode(seq, command)) {
    return;
  }

  const char* stopMode = doc["stopMode"] | "coast";
  if (strcmp(stopMode, "coast") != 0 && strcmp(stopMode, "brake") != 0) {
    sendError(seq, command, "invalid_stop_mode", "stopMode must be coast or brake");
    return;
  }

  if (doc["all"] | false) {
    for (MotorPins& motor : motors) {
      if (motor.configured) {
        stopMotorPins(motor, stopMode);
      }
    }
    sendAck(seq, command, "all motors stopped");
    return;
  }

  MotorPins* motor = findMotor(doc["channel"] | "");
  if (!motor) {
    sendError(seq, command, "invalid_channel", "channel must be M1-M6");
    return;
  }
  if (!motor->configured) {
    sendError(seq, command, "unconfigured_channel", "send motor.config before motor.stop");
    return;
  }

  stopMotorPins(*motor, stopMode);
  sendAck(seq, command, "motor stopped");
  sendMotorFeedback(seq, *motor);
}

void handleMotorRead(JsonDocument& doc, int seq) {
  constexpr const char* command = "motor.read";
  if (!validateDebugMode(seq, command)) {
    return;
  }

  MotorPins* motor = findMotor(doc["channel"] | "");
  if (!motor) {
    sendError(seq, command, "invalid_channel", "channel must be M1-M6");
    return;
  }
  if (!motor->configured) {
    sendError(seq, command, "unconfigured_channel", "send motor.config before motor.read");
    return;
  }

  sendMotorFeedback(seq, *motor);
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
  } else if (strcmp(type, "motor.config") == 0) {
    handleMotorConfig(doc, seq);
  } else if (strcmp(type, "motor.set") == 0) {
    handleMotorSet(doc, seq);
  } else if (strcmp(type, "motor.stop") == 0) {
    handleMotorStop(doc, seq);
  } else if (strcmp(type, "motor.read") == 0) {
    handleMotorRead(doc, seq);
  } else {
    sendError(seq, type, "unknown_command", "unknown command type");
  }
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  inputLine.reserve(512);
  delay(200);
  for (MotorPins& motor : motors) {
    writeSafeStop(motor);
  }
  sendLog("info", "TB6618 Arduino motor firmware ready");
  sendLog("info", "Debug mode is disabled; send debug.set before motor commands");
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
      if (inputLine.length() > 768) {
        inputLine = "";
        sendError(0, "unknown", "line_too_long", "json line exceeded 768 bytes");
      }
    }
  }
}
