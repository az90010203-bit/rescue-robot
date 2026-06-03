import { flattenPlatformPlugins, flattenUiPanels, validatePluginPackages } from "../../platform/packages";
import { cameraGimbalPackage } from "./cameraGimbal";
import { coreCapabilitiesPackage } from "./coreCapabilities";
import { coreTransportsPackage } from "./coreTransports";
import { feetechServoPackage } from "./feetechServo";
import { tb6618MotorPackage } from "./tb6618Motor";

export const BUILTIN_PLUGIN_PACKAGES = [
  coreCapabilitiesPackage,
  coreTransportsPackage,
  feetechServoPackage,
  tb6618MotorPackage,
  cameraGimbalPackage
];

validatePluginPackages(BUILTIN_PLUGIN_PACKAGES);

export const BUILTIN_PLATFORM_PLUGINS = flattenPlatformPlugins(BUILTIN_PLUGIN_PACKAGES);
export const BUILTIN_UI_PANELS = flattenUiPanels(BUILTIN_PLUGIN_PACKAGES);

export {
  cameraGimbalPackage,
  coreCapabilitiesPackage,
  coreTransportsPackage,
  feetechServoPackage,
  tb6618MotorPackage
};
