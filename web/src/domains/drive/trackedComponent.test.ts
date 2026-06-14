import { describe, expect, it } from "vitest";
import type { ComponentDefinition, PluginInstance } from "@platform/architecture";
import {
  createDefaultTrackedDriveConfig,
  trackedDriveMotorConfigMappings,
  trackedDriveTargets,
  validateTrackedDriveComponentConfig
} from "@domains/drive/trackedComponent";

describe("tracked drive component config", () => {
  it("defaults the tracked base to the current M5 and M6 channels", () => {
    const config = createDefaultTrackedDriveConfig(motors);

    expect(config).toMatchObject({
      tracks: {
        leftTrack: "m5",
        rightTrack: "m6"
      },
      closedLoop: true,
      maxRpm: 6000,
      encoderTicksPerRev: 52
    });
    expect(validateTrackedDriveComponentConfig(component(config), motors)).toBeNull();
  });

  it("mixes two-track targets with per-track reverse and closed-loop enabled", () => {
    const config = {
      ...createDefaultTrackedDriveConfig(motors),
      directions: {
        leftTrack: 1 as const,
        rightTrack: -1 as const
      }
    };

    expect(trackedDriveTargets(config, motors, { forward: 1, turn: 0 }, 50, "brake")).toEqual([
      { channel: "M5", speedPercent: 50, stopMode: "brake", closedLoop: true },
      { channel: "M6", speedPercent: -50, stopMode: "brake", closedLoop: true }
    ]);
  });

  it("forwards motor mappings with encoder and closed-loop parameters", () => {
    const config = createDefaultTrackedDriveConfig(motors);

    expect(trackedDriveMotorConfigMappings(config, motors)[0]).toMatchObject({
      channel: "M5",
      pwmPin: "PH10",
      in1Pin: "PA0",
      in2Pin: "PA1",
      enablePin: "PH12",
      encoderAPin: "PA2",
      encoderBPin: "PA3",
      closedLoop: true,
      maxRpm: 6000,
      encoderTicksPerRev: 52
    });
  });

  it("rejects duplicate track plugins", () => {
    const config = {
      ...createDefaultTrackedDriveConfig(motors),
      tracks: {
        leftTrack: "m5",
        rightTrack: "m5"
      }
    };

    expect(validateTrackedDriveComponentConfig(component(config), motors)).toContain("unique");
  });
});

function component(config: Record<string, unknown>): ComponentDefinition {
  return {
    id: "tracked",
    name: "Tracked",
    kind: "tracked-drive",
    pluginInstanceIds: motors.map((motor) => motor.id),
    config,
    tags: []
  };
}

const motors: PluginInstance[] = [
  motor("m1", "M1", { pwmPin: "PD14", in1Pin: "PB1", in2Pin: "PC0", enablePin: "PI0", encoderAPin: "PC1", encoderBPin: "PA4" }),
  motor("m5", "M5", { pwmPin: "PH10", in1Pin: "PA0", in2Pin: "PA1", enablePin: "PH12", encoderAPin: "PA2", encoderBPin: "PA3" }),
  motor("m6", "M6", { pwmPin: "PD12", in1Pin: "PF1", in2Pin: "PE5", enablePin: "PI0", encoderAPin: "PE6", encoderBPin: "PC2" })
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
