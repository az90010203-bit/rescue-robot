#include "FeetechProtocol.h"

namespace Feetech {

namespace {

uint16_t readWord(const std::vector<uint8_t>& bytes, size_t offset) {
  if (offset + 1 >= bytes.size()) {
    return 0;
  }
  return static_cast<uint16_t>(bytes[offset]) | (static_cast<uint16_t>(bytes[offset + 1]) << 8);
}

void pushWord(std::vector<uint8_t>& bytes, uint16_t value) {
  bytes.push_back(value & 0xff);
  bytes.push_back((value >> 8) & 0xff);
}

uint16_t encodeSigned15Bit(int16_t value) {
  if (value < 0) {
    return static_cast<uint16_t>(-value) | (1 << 15);
  }
  return static_cast<uint16_t>(value);
}

}  // namespace

bool isValidServoId(int id) {
  return id >= 0 && id <= 253;
}

uint8_t checksum(const uint8_t* data, size_t len) {
  uint16_t sum = 0;
  for (size_t index = 0; index < len; ++index) {
    sum += data[index];
  }
  return static_cast<uint8_t>(~sum);
}

uint16_t angleDegToRaw(float angleDeg) {
  long raw = lroundf((angleDeg / 360.0f) * 4095.0f);
  if (raw < 0) {
    return 0;
  }
  if (raw > 4095) {
    return 4095;
  }
  return static_cast<uint16_t>(raw);
}

std::vector<uint8_t> buildInstruction(uint8_t id, uint8_t instruction, const std::vector<uint8_t>& params) {
  std::vector<uint8_t> frame;
  frame.reserve(params.size() + 6);
  frame.push_back(kHeader);
  frame.push_back(kHeader);
  frame.push_back(id);
  frame.push_back(static_cast<uint8_t>(params.size() + 2));
  frame.push_back(instruction);
  for (uint8_t param : params) {
    frame.push_back(param);
  }
  frame.push_back(checksum(frame.data() + 2, frame.size() - 2));
  return frame;
}

Bus::Bus(HardwareSerial& serial, int dirPin) : serial_(serial), dirPin_(dirPin) {}

void Bus::begin(uint32_t baud, int rxPin, int txPin) {
  if (dirPin_ >= 0) {
    pinMode(dirPin_, OUTPUT);
    setTransmit(false);
  }
  serial_.begin(baud, SERIAL_8N1, rxPin, txPin);
}

bool Bus::ping(uint8_t id, StatusPacket& status) {
  sendPacket(buildInstruction(id, kInstPing, {}));
  return readStatus(status);
}

bool Bus::write(uint8_t id, uint8_t address, const std::vector<uint8_t>& data, StatusPacket* status) {
  std::vector<uint8_t> params;
  params.reserve(data.size() + 1);
  params.push_back(address);
  for (uint8_t value : data) {
    params.push_back(value);
  }

  sendPacket(buildInstruction(id, kInstWrite, params));
  if (id == kBroadcastId || status == nullptr) {
    return true;
  }
  return readStatus(*status);
}

bool Bus::syncWrite(uint8_t address, uint8_t bytesPerServo, const std::vector<uint8_t>& data) {
  std::vector<uint8_t> params;
  params.reserve(data.size() + 2);
  params.push_back(address);
  params.push_back(bytesPerServo);
  for (uint8_t value : data) {
    params.push_back(value);
  }

  sendPacket(buildInstruction(kBroadcastId, kInstSyncWrite, params));
  return true;
}

bool Bus::setMode(uint8_t id, uint8_t mode, StatusPacket* status) {
  return write(id, kModeAddr, {mode}, status);
}

bool Bus::setWheelMode(uint8_t id, StatusPacket* status) {
  return setMode(id, 1, status);
}

bool Bus::setServoMode(uint8_t id, StatusPacket* status) {
  return setMode(id, 0, status);
}

bool Bus::writePosition(uint8_t id, uint16_t positionRaw, uint16_t speedRaw, int acc, StatusPacket* status) {
  std::vector<uint8_t> data;
  if (acc >= 0) {
    data.push_back(static_cast<uint8_t>(acc));
  }
  pushWord(data, positionRaw);
  pushWord(data, 0);
  pushWord(data, speedRaw);
  return write(id, acc >= 0 ? kAccAddr : kGoalPositionAddr, data, status);
}

bool Bus::writeSpeed(uint8_t id, int16_t speedRaw, uint8_t acc, StatusPacket* status) {
  if (!write(id, kAccAddr, {acc}, nullptr)) {
    return false;
  }
  std::vector<uint8_t> speedData;
  pushWord(speedData, encodeSigned15Bit(speedRaw));
  return write(id, kGoalSpeedAddr, speedData, status);
}

bool Bus::setTorque(uint8_t id, bool enabled, StatusPacket* status) {
  return write(id, kTorqueEnableAddr, {static_cast<uint8_t>(enabled ? 1 : 0)}, status);
}

bool Bus::read(uint8_t id, uint8_t address, uint8_t length, StatusPacket& status) {
  sendPacket(buildInstruction(id, kInstRead, {address, length}));
  return readStatus(status);
}

bool Bus::readFeedback(uint8_t id, Feedback& feedback, StatusPacket& status) {
  if (!read(id, kPresentPositionAddr, kFeedbackReadLength, status)) {
    return false;
  }
  if (status.params.size() < kFeedbackReadLength) {
    return false;
  }

  feedback.id = id;
  feedback.positionRaw = readWord(status.params, 0);
  feedback.speedRaw = readWord(status.params, 2);
  feedback.loadRaw = readWord(status.params, 4);
  feedback.voltageRaw = status.params[6];
  feedback.temperatureC = status.params[7];
  feedback.moving = status.params[10] != 0;
  feedback.currentRaw = readWord(status.params, 13);
  return true;
}

void Bus::setTransmit(bool enabled) {
  if (dirPin_ >= 0) {
    digitalWrite(dirPin_, enabled ? HIGH : LOW);
    delayMicroseconds(8);
  }
}

void Bus::sendPacket(const std::vector<uint8_t>& frame) {
  while (serial_.available()) {
    serial_.read();
  }
  setTransmit(true);
  serial_.write(frame.data(), frame.size());
  serial_.flush();
  setTransmit(false);
}

bool Bus::readStatus(StatusPacket& packet, uint32_t timeoutMs) {
  enum class State {
    Header1,
    Header2,
    Id,
    Length,
    Payload
  };

  State state = State::Header1;
  uint8_t id = 0;
  uint8_t length = 0;
  std::vector<uint8_t> payload;
  uint32_t start = millis();

  while (millis() - start < timeoutMs) {
    if (!serial_.available()) {
      delay(1);
      continue;
    }

    const uint8_t byte = serial_.read();
    switch (state) {
      case State::Header1:
        state = byte == kHeader ? State::Header2 : State::Header1;
        break;
      case State::Header2:
        state = byte == kHeader ? State::Id : State::Header1;
        break;
      case State::Id:
        id = byte;
        state = State::Length;
        break;
      case State::Length:
        length = byte;
        payload.clear();
        payload.reserve(length);
        state = State::Payload;
        break;
      case State::Payload:
        payload.push_back(byte);
        if (payload.size() == length) {
          std::vector<uint8_t> body;
          body.reserve(length + 2);
          body.push_back(id);
          body.push_back(length);
          for (uint8_t value : payload) {
            body.push_back(value);
          }
          if (checksum(body.data(), body.size() - 1) != payload.back()) {
            return false;
          }
          packet.id = id;
          packet.status = payload.empty() ? 0 : payload[0];
          packet.params.assign(payload.begin() + 1, payload.end() - 1);
          return true;
        }
        break;
    }
  }

  return false;
}

}  // namespace Feetech
