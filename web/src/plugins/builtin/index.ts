import { flattenPlatformPlugins, flattenUiPanels, validatePluginPackages } from "../../platform/packages";
import { asmeCanServoPackage } from "./asmeCanServo";
import { browserCameraPackage } from "./browserCamera";
import { browserGamepadPackage } from "./browserGamepad";
import { cameraGimbalPackage } from "./cameraGimbal";
import { coreCapabilitiesPackage } from "./coreCapabilities";
import { coreTransportsPackage } from "./coreTransports";
import { feetechServoPackage } from "./feetechServo";
import { firmwareUploadPackage } from "./firmwareUpload";
import { raspberryPiPackage } from "./raspberryPi";
import { robotArmPackage } from "./robotArm";
import { secondaryCameraPackage } from "./secondaryCamera";
import { tb6618MotorPackage } from "./tb6618Motor";

export const BUILTIN_PLUGIN_PACKAGES = [
  coreCapabilitiesPackage,
  coreTransportsPackage,
  asmeCanServoPackage,
  feetechServoPackage,
  tb6618MotorPackage,
  cameraGimbalPackage,
  secondaryCameraPackage,
  browserCameraPackage,
  browserGamepadPackage,
  robotArmPackage,
  raspberryPiPackage,
  firmwareUploadPackage
];

validatePluginPackages(BUILTIN_PLUGIN_PACKAGES);

export const BUILTIN_PLATFORM_PLUGINS = flattenPlatformPlugins(BUILTIN_PLUGIN_PACKAGES);
export const BUILTIN_UI_PANELS = flattenUiPanels(BUILTIN_PLUGIN_PACKAGES);

export {
  asmeCanServoPackage,
  browserCameraPackage,
  browserGamepadPackage,
  cameraGimbalPackage,
  coreCapabilitiesPackage,
  coreTransportsPackage,
  feetechServoPackage,
  firmwareUploadPackage,
  raspberryPiPackage,
  robotArmPackage,
  secondaryCameraPackage,
  tb6618MotorPackage
};
