import { describe, expect, it } from "vitest";
import { TB6618_MOTOR_DEBUGGER_INO_FILENAME, buildTb6618MotorDebuggerIno } from "@adapters/firmware/arduinoFirmware";

describe("Arduino TB6618 firmware download", () => {
  it("uses an Arduino IDE friendly ino filename", () => {
    expect(TB6618_MOTOR_DEBUGGER_INO_FILENAME).toBe("tb6618_motor_debugger.ino");
  });

  it("generates dependency-free firmware with WebUI motor pins compiled in", () => {
    const firmware = buildTb6618MotorDebuggerIno([
      { channel: "m1", name: "Left motor", pwmPin: "D5", in1Pin: "D4", in2Pin: "D7", enablePin: "D10" },
      { channel: "M2", name: "Right motor", pwmPin: "6", in1Pin: "8", in2Pin: "9", sensorPin: "A0" },
      { channel: "M3", name: "Incomplete", pwmPin: "D3" }
    ]);

    expect(firmware).not.toContain("ArduinoJson");
    expect(firmware).toContain('#include <Arduino.h>');
    expect(firmware).toContain('{"M1", 5, 4, 7, 10, -1, true');
    expect(firmware).toContain('{"M2", 6, 8, 9, -1, A0, true');
    expect(firmware).not.toContain('"M3"');
    expect(firmware).toContain('"motor.config"');
    expect(firmware).toContain('"motor.set"');
    expect(firmware).toContain('"motor.stop"');
    expect(firmware).toContain('"motor.read"');
    expect(firmware).toContain("Debug mode is disabled; send debug.set before motor commands");
    expect(firmware).toContain("DIRECTION_DEADTIME_MS = 50");
    expect(firmware).toContain("previousSign != 0 && nextSign != 0 && previousSign != nextSign");
    expect(firmware).toContain("analogWrite(motor.pwmPin, 0)");
    expect(firmware).toContain("delay(DIRECTION_DEADTIME_MS)");
    expect(firmware).toContain("digitalWrite(motor.in1Pin, HIGH)");
    expect(firmware).toContain("digitalWrite(motor.in2Pin, LOW)");
    expect(firmware).toContain("analogWrite(motor.pwmPin, duty)");
  });
});
