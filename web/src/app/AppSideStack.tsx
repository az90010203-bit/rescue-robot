import { LogPanel } from "../shared/ui/AppChrome";
import { FeedbackPanel } from "./FeedbackPanel";
import type { AppWorkspaceContext } from "./useAppWorkspaceContext";

interface AppSideStackProps {
  ctx: AppWorkspaceContext;
}

export function AppSideStack({ ctx }: AppSideStackProps) {
  const {
    activeGamepad,
    activeModule,
    cameraCanCommand,
    cameraConfig,
    cameraStreamFailed,
    cameraStreamLoaded,
    cameraStreamUrl,
    cameraValidationError,
    connected,
    driveCanCommand,
    driveInput,
    formatDirectionLabel,
    logs,
    metricNumber,
    motorFeedback,
    renderPlatformPanel,
    selectedArmFeedback,
    selectedArmJoint,
    selectedMotor,
    selectedServo,
    servoFeedback,
    t
  } = ctx;

  return (
            <aside className="side-stack">
              {renderPlatformPanel("state")}
    
              {renderPlatformPanel("control")}
    
              <FeedbackPanel
                activeGamepad={activeGamepad}
                activeModule={activeModule}
                cameraCanCommand={cameraCanCommand}
                cameraConfig={cameraConfig}
                cameraStreamFailed={cameraStreamFailed}
                cameraStreamLoaded={cameraStreamLoaded}
                cameraStreamUrl={cameraStreamUrl}
                cameraValidationError={cameraValidationError}
                connected={connected}
                driveCanCommand={driveCanCommand}
                driveInput={driveInput}
                formatDirectionLabel={formatDirectionLabel}
                metricNumber={metricNumber}
                motorFeedback={motorFeedback}
                selectedArmFeedback={selectedArmFeedback}
                selectedArmJoint={selectedArmJoint}
                selectedMotor={selectedMotor}
                selectedServo={selectedServo}
                servoFeedback={servoFeedback}
                t={t}
              />
    
              {renderPlatformPanel("events")}
    
              <LogPanel logs={logs} />
            </aside>
  );
}
