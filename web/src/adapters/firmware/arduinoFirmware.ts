import { MotorProfile, normalizeMotorChannel, normalizeMotorPin } from "@adapters/hardware/protocol";

export const TB6618_MOTOR_DEBUGGER_INO_FILENAME = "tb6618_motor_debugger.ino";

interface CompiledMotorMapping {
  channel: string;
  name: string;
  pwmPin: string;
  in1Pin: string;
  in2Pin: string;
  enablePin: string;
  sensorPin: string;
}

export function buildTb6618MotorDebuggerIno(motors: MotorProfile[]): string {
  const mappings = motors.map(toCompiledMotorMapping).filter((mapping): mapping is CompiledMotorMapping => mapping !== null);
  const motorInitializers =
    mappings.length > 0
      ? mappings
          .map(
            (motor) =>
              `  {"${escapeCString(motor.channel)}", ${motor.pwmPin}, ${motor.in1Pin}, ${motor.in2Pin}, ${motor.enablePin}, ${motor.sensorPin}, true, 0.0f, "stopped", "coast"}`
          )
          .join(",\n")
      : `  {"UNMAPPED", -1, -1, -1, -1, -1, false, 0.0f, "stopped", "coast"}`;
  const motorCount = mappings.length;
  const mappingComments =
    mappings.length > 0
      ? mappings
          .map(
            (motor) =>
              `  - ${sanitizeComment(motor.channel)} ${sanitizeComment(motor.name)}: PWM ${motor.pwmPin}, IN1 ${motor.in1Pin}, IN2 ${motor.in2Pin}, EN ${motor.enablePin}, SENSOR ${motor.sensorPin}`
          )
          .join("\n")
      : "  - No complete motor mappings were found in the WebUI. Fill PWM/IN1/IN2 first, then download again.";

  return String.raw`/*
  TB6618 PWM motor debugger firmware

  Generated from the WebUI motor port mapping. No third-party Arduino library is required.

${mappingComments}

  Wiring reminder:
  - TB6618 12V/VM/VIN/+ -> external motor supply positive.
  - TB6618 GND/- -> external motor supply negative.
  - Arduino GND -> TB6618 GND. A shared ground is required.
  - Arduino does not connect to the 12V positive rail.

  WebUI command examples:
  {"type":"debug.set","seq":1,"enabled":true,"module":"motor"}
  {"type":"motor.set","seq":2,"channel":"M1","speedPercent":60,"stopMode":"coast"}
  {"type":"motor.stop","seq":3,"channel":"M1","stopMode":"brake"}
*/

#include <Arduino.h>
#include <ctype.h>
#include <math.h>
#include <string.h>

#ifndef SERIAL_BAUD
#define SERIAL_BAUD 115200
#endif

struct MotorPins {
  const char* channel;
  int pwmPin;
  int in1Pin;
  int in2Pin;
  int enablePin;
  int sensorPin;
  bool configured;
  float commandedSpeedPercent;
  const char* direction;
  const char* stopMode;
};

MotorPins motors[] = {
${motorInitializers}
};

const int motorCount = ${motorCount};
const unsigned long DIRECTION_DEADTIME_MS = 50;
String inputLine;
bool debugMode = false;

void printJsonString(const char* value) {
  Serial.print('"');
  while (value && *value) {
    if (*value == '"' || *value == '\\') {
      Serial.print('\\');
    }
    Serial.print(*value);
    value += 1;
  }
  Serial.print('"');
}

void sendLog(const char* level, const char* message) {
  Serial.print("{\"type\":\"log\",\"seq\":0,\"level\":");
  printJsonString(level);
  Serial.print(",\"message\":");
  printJsonString(message);
  Serial.println("}");
}

void sendAck(int seq, const char* command, const char* message) {
  Serial.print("{\"type\":\"ack\",\"seq\":");
  Serial.print(seq);
  Serial.print(",\"command\":");
  printJsonString(command);
  Serial.print(",\"message\":");
  printJsonString(message);
  Serial.println("}");
}

void sendError(int seq, const char* command, const char* code, const char* message) {
  Serial.print("{\"type\":\"error\",\"seq\":");
  Serial.print(seq);
  Serial.print(",\"command\":");
  printJsonString(command);
  Serial.print(",\"code\":");
  printJsonString(code);
  Serial.print(",\"message\":");
  printJsonString(message);
  Serial.println("}");
}

void sendMotorFeedback(int seq, const MotorPins& motor) {
  Serial.print("{\"type\":\"motor.feedback\",\"seq\":");
  Serial.print(seq);
  Serial.print(",\"channel\":");
  printJsonString(motor.channel);
  Serial.print(",\"commandedSpeedPercent\":");
  Serial.print(motor.commandedSpeedPercent);
  Serial.print(",\"dutyPercent\":");
  Serial.print(fabs(motor.commandedSpeedPercent));
  Serial.print(",\"direction\":");
  printJsonString(motor.direction);
  Serial.print(",\"stopMode\":");
  printJsonString(motor.stopMode);
  Serial.println("}");
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
  char normalized[12];
  uppercaseCopy(channel, normalized, sizeof(normalized));

  for (int index = 0; index < motorCount; index += 1) {
    if (strcmp(motors[index].channel, normalized) == 0) {
      return &motors[index];
    }
  }
  return nullptr;
}

int fieldValueStart(const String& line, const char* field) {
  String pattern = "\"";
  pattern += field;
  pattern += "\"";
  int keyIndex = line.indexOf(pattern);
  if (keyIndex < 0) {
    return -1;
  }
  int colonIndex = line.indexOf(':', keyIndex + pattern.length());
  if (colonIndex < 0) {
    return -1;
  }

  int valueIndex = colonIndex + 1;
  const int lineLength = static_cast<int>(line.length());
  while (valueIndex < lineLength && isspace(static_cast<unsigned char>(line.charAt(valueIndex)))) {
    valueIndex += 1;
  }
  return valueIndex;
}

bool readStringField(const String& line, const char* field, char* output, size_t outputSize) {
  if (outputSize == 0) {
    return false;
  }
  output[0] = '\0';

  int valueIndex = fieldValueStart(line, field);
  if (valueIndex < 0 || line.charAt(valueIndex) != '"') {
    return false;
  }
  valueIndex += 1;

  size_t outputIndex = 0;
  const int lineLength = static_cast<int>(line.length());
  while (valueIndex < lineLength && line.charAt(valueIndex) != '"') {
    char ch = line.charAt(valueIndex);
    if (ch == '\\' && valueIndex + 1 < lineLength) {
      valueIndex += 1;
      ch = line.charAt(valueIndex);
    }
    if (outputIndex + 1 < outputSize) {
      output[outputIndex] = ch;
      outputIndex += 1;
    }
    valueIndex += 1;
  }
  output[outputIndex] = '\0';
  return outputIndex > 0;
}

int readIntField(const String& line, const char* field, int fallback) {
  int valueIndex = fieldValueStart(line, field);
  if (valueIndex < 0) {
    return fallback;
  }
  return line.substring(valueIndex).toInt();
}

float readFloatField(const String& line, const char* field, float fallback) {
  int valueIndex = fieldValueStart(line, field);
  if (valueIndex < 0) {
    return fallback;
  }
  return line.substring(valueIndex).toFloat();
}

bool readBoolField(const String& line, const char* field, bool fallback) {
  int valueIndex = fieldValueStart(line, field);
  if (valueIndex < 0) {
    return fallback;
  }
  if (line.startsWith("true", valueIndex)) {
    return true;
  }
  if (line.startsWith("false", valueIndex)) {
    return false;
  }
  return fallback;
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

void configureMotor(MotorPins& motor) {
  if (!motor.configured) {
    return;
  }
  pinMode(motor.pwmPin, OUTPUT);
  pinMode(motor.in1Pin, OUTPUT);
  pinMode(motor.in2Pin, OUTPUT);
  if (motor.enablePin >= 0) {
    pinMode(motor.enablePin, OUTPUT);
  }
  if (motor.sensorPin >= 0) {
    pinMode(motor.sensorPin, INPUT_PULLUP);
  }
  writeSafeStop(motor);
  if (motor.enablePin >= 0) {
    digitalWrite(motor.enablePin, HIGH);
  }
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

void handleDebugSet(const String& line, int seq) {
  debugMode = readBoolField(line, "enabled", false);
  sendAck(seq, "debug.set", debugMode ? "debug mode enabled" : "debug mode disabled");
}

void handleMotorConfig(const String& line, int seq) {
  constexpr const char* command = "motor.config";
  if (!validateDebugMode(seq, command)) {
    return;
  }

  char channel[12];
  if (!readStringField(line, "channel", channel, sizeof(channel)) || !findMotor(channel)) {
    sendError(seq, command, "invalid_channel", "channel is not compiled into this firmware");
    return;
  }
  sendAck(seq, command, "pins are compiled into firmware");
}

void handleMotorSet(const String& line, int seq) {
  constexpr const char* command = "motor.set";
  if (!validateDebugMode(seq, command)) {
    return;
  }

  char channel[12];
  if (!readStringField(line, "channel", channel, sizeof(channel))) {
    sendError(seq, command, "invalid_channel", "channel is required");
    return;
  }
  MotorPins* motor = findMotor(channel);
  if (!motor) {
    sendError(seq, command, "invalid_channel", "channel is not compiled into this firmware");
    return;
  }

  char stopMode[8] = "coast";
  readStringField(line, "stopMode", stopMode, sizeof(stopMode));
  const float speedPercent = readFloatField(line, "speedPercent", NAN);
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

void handleMotorStop(const String& line, int seq) {
  constexpr const char* command = "motor.stop";
  if (!validateDebugMode(seq, command)) {
    return;
  }

  char stopMode[8] = "coast";
  readStringField(line, "stopMode", stopMode, sizeof(stopMode));
  if (strcmp(stopMode, "coast") != 0 && strcmp(stopMode, "brake") != 0) {
    sendError(seq, command, "invalid_stop_mode", "stopMode must be coast or brake");
    return;
  }

  if (readBoolField(line, "all", false)) {
    for (int index = 0; index < motorCount; index += 1) {
      stopMotorPins(motors[index], stopMode);
    }
    sendAck(seq, command, "all motors stopped");
    return;
  }

  char channel[12];
  if (!readStringField(line, "channel", channel, sizeof(channel))) {
    sendError(seq, command, "invalid_channel", "channel is required");
    return;
  }
  MotorPins* motor = findMotor(channel);
  if (!motor) {
    sendError(seq, command, "invalid_channel", "channel is not compiled into this firmware");
    return;
  }

  stopMotorPins(*motor, stopMode);
  sendAck(seq, command, "motor stopped");
  sendMotorFeedback(seq, *motor);
}

void handleMotorRead(const String& line, int seq) {
  constexpr const char* command = "motor.read";
  if (!validateDebugMode(seq, command)) {
    return;
  }

  char channel[12];
  if (!readStringField(line, "channel", channel, sizeof(channel))) {
    sendError(seq, command, "invalid_channel", "channel is required");
    return;
  }
  MotorPins* motor = findMotor(channel);
  if (!motor) {
    sendError(seq, command, "invalid_channel", "channel is not compiled into this firmware");
    return;
  }

  sendMotorFeedback(seq, *motor);
}

void handleCommand(const String& line) {
  char type[20];
  const int seq = readIntField(line, "seq", 0);
  if (!readStringField(line, "type", type, sizeof(type))) {
    sendError(seq, "unknown", "missing_type", "type is required");
    return;
  }

  if (strcmp(type, "debug.set") == 0) {
    handleDebugSet(line, seq);
  } else if (strcmp(type, "motor.config") == 0) {
    handleMotorConfig(line, seq);
  } else if (strcmp(type, "motor.set") == 0) {
    handleMotorSet(line, seq);
  } else if (strcmp(type, "motor.stop") == 0) {
    handleMotorStop(line, seq);
  } else if (strcmp(type, "motor.read") == 0) {
    handleMotorRead(line, seq);
  } else {
    sendError(seq, type, "unknown_command", "unknown command type");
  }
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  inputLine.reserve(384);
  delay(200);
  for (int index = 0; index < motorCount; index += 1) {
    configureMotor(motors[index]);
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
      if (inputLine.length() > 512) {
        inputLine = "";
        sendError(0, "unknown", "line_too_long", "json line exceeded 512 bytes");
      }
    }
  }
}
`;
}

function toCompiledMotorMapping(motor: MotorProfile): CompiledMotorMapping | null {
  const channel = normalizeMotorChannel(motor.channel);
  const pwmPin = arduinoPinExpression(motor.pwmPin);
  const in1Pin = arduinoPinExpression(motor.in1Pin);
  const in2Pin = arduinoPinExpression(motor.in2Pin);
  if (!channel || !pwmPin || !in1Pin || !in2Pin) {
    return null;
  }

  return {
    channel,
    name: motor.name.trim(),
    pwmPin,
    in1Pin,
    in2Pin,
    enablePin: arduinoPinExpression(motor.enablePin) ?? "-1",
    sensorPin: arduinoPinExpression(motor.sensorPin) ?? "-1"
  };
}

function arduinoPinExpression(pin: string | undefined): string | null {
  const normalized = normalizeMotorPin(pin);
  if (!normalized) {
    return null;
  }

  const analogMatch = /^A(\d+)$/i.exec(normalized);
  if (analogMatch) {
    return `A${Number(analogMatch[1])}`;
  }

  const digitalMatch = /^D(\d+)$/i.exec(normalized);
  if (digitalMatch) {
    return String(Number(digitalMatch[1]));
  }

  if (/^\d+$/.test(normalized)) {
    return String(Number(normalized));
  }

  return null;
}

function escapeCString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function sanitizeComment(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, "?").replace(/[\r\n]/g, " ").trim();
}
