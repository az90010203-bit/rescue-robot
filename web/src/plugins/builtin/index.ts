import { flattenPlatformPlugins, flattenUiPanels, validatePluginPackages } from "@platform/packages";
import { asmeCanServoPackage } from "@plugins/builtin/asmeCanServo";
import { browserCameraPackage } from "@plugins/builtin/browserCamera";
import { browserGamepadPackage } from "@plugins/builtin/browserGamepad";
import { cameraGimbalPackage } from "@plugins/builtin/cameraGimbal";
import { coreCapabilitiesPackage } from "@plugins/builtin/coreCapabilities";
import { coreTransportsPackage } from "@plugins/builtin/coreTransports";
import { feetechServoPackage } from "@plugins/builtin/feetechServo";
import { firmwareUploadPackage } from "@plugins/builtin/firmwareUpload";
import { raspberryPiPackage } from "@plugins/builtin/raspberryPi";
import { robotArmPackage } from "@plugins/builtin/robotArm";
import { secondaryCameraPackage } from "@plugins/builtin/secondaryCamera";
import { tb6618MotorPackage } from "@plugins/builtin/tb6618Motor";

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
