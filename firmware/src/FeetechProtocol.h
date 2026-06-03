#pragma once

#include <Arduino.h>
#include <vector>

namespace Feetech {

constexpr uint8_t kHeader = 0xff;
constexpr uint8_t kBroadcastId = 0xfe;
constexpr uint8_t kInstPing = 0x01;
constexpr uint8_t kInstRead = 0x02;
constexpr uint8_t kInstWrite = 0x03;
constexpr uint8_t kInstSyncWrite = 0x83;

constexpr uint8_t kModeAddr = 33;
constexpr uint8_t kTorqueEnableAddr = 40;
constexpr uint8_t kAccAddr = 41;
constexpr uint8_t kGoalPositionAddr = 42;
constexpr uint8_t kGoalTimeAddr = 44;
constexpr uint8_t kGoalSpeedAddr = 46;
constexpr uint8_t kPresentPositionAddr = 56;
constexpr uint8_t kFeedbackReadLength = 15;

struct StatusPacket {
  uint8_t id = 0;
  uint8_t status = 0;
  std::vector<uint8_t> params;
};

struct Feedback {
  uint8_t id = 0;
  uint16_t positionRaw = 0;
  uint16_t speedRaw = 0;
  uint16_t loadRaw = 0;
  uint8_t voltageRaw = 0;
  uint8_t temperatureC = 0;
  bool moving = false;
  uint16_t currentRaw = 0;
};

bool isValidServoId(int id);
uint8_t checksum(const uint8_t* data, size_t len);
uint16_t angleDegToRaw(float angleDeg);
std::vector<uint8_t> buildInstruction(uint8_t id, uint8_t instruction, const std::vector<uint8_t>& params);

class Bus {
 public:
  Bus(HardwareSerial& serial, int dirPin);

  void begin(uint32_t baud, int rxPin, int txPin);
  bool ping(uint8_t id, StatusPacket& status);
  bool write(uint8_t id, uint8_t address, const std::vector<uint8_t>& data, StatusPacket* status);
  bool syncWrite(uint8_t address, uint8_t bytesPerServo, const std::vector<uint8_t>& data);
  bool setMode(uint8_t id, uint8_t mode, StatusPacket* status);
  bool setWheelMode(uint8_t id, StatusPacket* status);
  bool setServoMode(uint8_t id, StatusPacket* status);
  bool writePosition(uint8_t id, uint16_t positionRaw, uint16_t speedRaw, int acc, StatusPacket* status);
  bool writeSpeed(uint8_t id, int16_t speedRaw, uint8_t acc, StatusPacket* status);
  bool setTorque(uint8_t id, bool enabled, StatusPacket* status);
  bool read(uint8_t id, uint8_t address, uint8_t length, StatusPacket& status);
  bool readFeedback(uint8_t id, Feedback& feedback, StatusPacket& status);

 private:
  HardwareSerial& serial_;
  int dirPin_;

  void setTransmit(bool enabled);
  void sendPacket(const std::vector<uint8_t>& frame);
  bool readStatus(StatusPacket& packet, uint32_t timeoutMs = 40);
};

}  // namespace Feetech
