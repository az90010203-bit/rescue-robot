import type { MotorDirection } from "@adapters/hardware/protocol";
import type { ServoSafetyTriggerReason } from "@domains/servo/servoSafety";
import { metricNumberText } from "@shared/formatters";
import type { ServoSafetyDisplayStatus } from "@app/appModel";
import type { wheelSliderDirection } from "@domains/servo/servoWheelSlider";

interface UseDisplayFormattersOptions {
  servoSafetyEnabled: boolean;
  t: (key: string) => string;
}

export function useDisplayFormatters({ servoSafetyEnabled, t }: UseDisplayFormattersOptions) {
  function servoSafetyReasonLabel(reason?: ServoSafetyTriggerReason) {
    return reason ? t(`safety.reasons.${reason}`) : "--";
  }

  function servoSafetyStatusLabel(status?: ServoSafetyDisplayStatus) {
    if (!servoSafetyEnabled) {
      return t("safety.disabled");
    }
    if (status?.state === "monitoring") {
      return t("safety.monitoring");
    }
    if (status?.state === "stopped") {
      return `${t("safety.stopped")} · ${servoSafetyReasonLabel(status.reason)}`;
    }
    return t("safety.ready");
  }

  function servoSafetyStatusTone(status?: ServoSafetyDisplayStatus): "neutral" | "online" | "warning" | "danger" {
    if (!servoSafetyEnabled) {
      return "neutral";
    }
    if (status?.state === "stopped") {
      return "danger";
    }
    if (status?.state === "monitoring") {
      return "warning";
    }
    return "online";
  }

  function metricNumber(value: number | undefined, digits = 1) {
    return metricNumberText(value, digits);
  }

  function formatDirectionLabel(direction: MotorDirection | string) {
    if (direction === "forward") {
      return t("direction.forward");
    }
    if (direction === "reverse") {
      return t("direction.reverse");
    }
    return t("direction.stopped");
  }

  function formatLinkageMemberDirection(reverse: boolean) {
    return reverse ? t("fields.reverseRotation") : t("fields.forwardRotation");
  }

  function formatWheelSliderDirectionLabel(direction: ReturnType<typeof wheelSliderDirection>) {
    if (direction === "counterclockwise") {
      return t("actions.counterclockwise");
    }
    if (direction === "clockwise") {
      return t("actions.clockwise");
    }
    return t("status.stopped");
  }

  return {
    formatDirectionLabel,
    formatLinkageMemberDirection,
    formatWheelSliderDirectionLabel,
    metricNumber,
    servoSafetyStatusLabel,
    servoSafetyStatusTone
  };
}
