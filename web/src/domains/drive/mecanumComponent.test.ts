import { describe, expect, it } from "vitest";
import type { ComponentDefinition, PluginInstance } from "@platform/architecture";
import {
  createDefaultMecanumDriveConfig,
  mecanumDriveMotorConfigMappings,
  mecanumDriveTargets,
  validateMecanumDriveComponentConfig
} from "@domains/drive/mecanumComponent";

describe("mecanum drive component config", () => {
  it("defaults RoboMaster Type A mecanum wheels to the current M1-M4 positions", () => {
    const config = createDefaultMecanumDriveConfig(motors);

    expect(config).toMatchObject({
      wheels: {
        frontLeft: "m3",
        frontRight: "m1",
        rearLeft: "m4",
        rearRight: "m2"
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
      { channel: "M3", speedPercent: 50, stopMode: "brake", closedLoop: true },
      { channel: "M1", speedPercent: -50, stopMode: "brake", closedLoop: true },
      { channel: "M4", speedPercent: 50, stopMode: "brake", closedLoop: true },
      { channel: "M2", speedPercent: 50, stopMode: "brake", closedLoop: true }
    ]);
  });

  it("forwards motor mappings with encoder and closed-loop parameters", () => {
    const config = createDefaultMecanumDriveConfig(motors);

    expect(mecanumDriveMotorConfigMappings(config, motors)[0]).toMatchObject({
      channel: "M3",
      pwmPin: "PD15",
      in1Pin: "PI5",
      in2Pin: "PI6",
      enablePin: "PH12",
      encoderAPin: "PI7",
      encoderBPin: "PI2",
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
  motor("m1", "M1", { pwmPin: "PD14", in1Pin: "PB1", in2Pin: "PC0", enablePin: "PI0", encoderAPin: "PC1", encoderBPin: "PA4" }),
  motor("m2", "M2", { pwmPin: "PD13", in1Pin: "PF0", in2Pin: "PE4", enablePin: "PI0", encoderAPin: "PE12", encoderBPin: "PB0" }),
  motor("m3", "M3", { pwmPin: "PD15", in1Pin: "PI5", in2Pin: "PI6", enablePin: "PH12", encoderAPin: "PI7", encoderBPin: "PI2" }),
  motor("m4", "M4", { pwmPin: "PH11", in1Pin: "PC3", in2Pin: "PC4", enablePin: "PH12", encoderAPin: "PC5", encoderBPin: "PA5" })
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
    config: { channel, ...config },
    tags: []
  };
}
