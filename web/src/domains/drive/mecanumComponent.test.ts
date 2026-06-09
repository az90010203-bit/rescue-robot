import { describe, expect, it } from "vitest";
import type { ComponentDefinition, PluginInstance } from "@platform/architecture";
import {
  createDefaultMecanumDriveConfig,
  mecanumDriveMotorConfigMappings,
  mecanumDriveTargets,
  validateMecanumDriveComponentConfig
} from "@domains/drive/mecanumComponent";

describe("mecanum drive component config", () => {
  it("defaults WHEELTEC G513XL wheels to M1/M2/M3/M4 positions", () => {
    const config = createDefaultMecanumDriveConfig(motors);

    expect(config).toMatchObject({
      wheels: {
        frontLeft: "m1",
        frontRight: "m4",
        rearLeft: "m2",
        rearRight: "m3"
      },
      closedLoop: true,
      maxRpm: 6000,
      encoderTicksPerRev: 52
    });
    expect(validateMecanumDriveComponentConfig(component(config), motors)).toBeNull();
  });

  it("mixes component wheel targets with per-wheel reverse and closed-loop enabled", () => {
    const config = {
      ...createDefaultMecanumDriveConfig(motors),
      directions: {
        frontLeft: 1 as const,
        frontRight: -1 as const,
        rearLeft: 1 as const,
        rearRight: 1 as const
      }
    };

    expect(mecanumDriveTargets(config, motors, { forward: 1, strafe: 0, turn: 0 }, 50, "brake")).toEqual([
      { channel: "M1", speedPercent: 50, stopMode: "brake", closedLoop: true },
      { channel: "M4", speedPercent: -50, stopMode: "brake", closedLoop: true },
      { channel: "M2", speedPercent: 50, stopMode: "brake", closedLoop: true },
      { channel: "M3", speedPercent: 50, stopMode: "brake", closedLoop: true }
    ]);
  });

  it("forwards motor mappings with encoder and closed-loop parameters", () => {
    const config = createDefaultMecanumDriveConfig(motors);

    expect(mecanumDriveMotorConfigMappings(config, motors)[0]).toMatchObject({
      channel: "M1",
      pwmPin: "PA0",
      in1Pin: "PB0",
      in2Pin: "PE12",
      enablePin: "PD12",
      encoderAPin: "PE4",
      encoderBPin: "PF0",
      closedLoop: true,
      maxRpm: 6000,
      encoderTicksPerRev: 52
    });
  });
});

function component(config: Record<string, unknown>): ComponentDefinition {
  return {
    id: "mecanum",
    name: "Mecanum",
    kind: "mecanum-drive",
    pluginInstanceIds: motors.map((motor) => motor.id),
    config,
    tags: []
  };
}

const motors: PluginInstance[] = [
  motor("m1", "M1", { pwmPin: "PA0", in1Pin: "PB0", in2Pin: "PE12", encoderAPin: "PE4", encoderBPin: "PF0" }),
  motor("m2", "M2", { pwmPin: "PA1", in1Pin: "PC2", in2Pin: "PE6", encoderAPin: "PE5", encoderBPin: "PF1" }),
  motor("m3", "M3", { pwmPin: "PA2", in1Pin: "PA4", in2Pin: "PC1", encoderAPin: "PC0", encoderBPin: "PB1" }),
  motor("m4", "M4", { pwmPin: "PA3", in1Pin: "PA5", in2Pin: "PC5", encoderAPin: "PC4", encoderBPin: "PC3" })
];

function motor(id: string, channel: string, config: Record<string, string>): PluginInstance {
  return {
    id,
    name: channel,
    type: "motor",
    catalogItemId: null,
    brand: "WHEELTEC",
    model: "G513XL",
    driverId: "driver.tb6618-motor",
    transportId: "transport.controller-json",
    capabilities: [{ id: "motor", features: ["pwm_control", "encoder_feedback"] }],
    config: { channel, enablePin: "PD12", ...config },
    tags: []
  };
}
