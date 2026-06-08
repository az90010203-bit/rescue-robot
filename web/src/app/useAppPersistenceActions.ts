import {
  AppConfigSnapshot,
  AppStateSnapshotV2,
  PersistedActiveModule,
  PersistedLogEntry,
  PersistedServoCommandMap,
  createAppConfigSnapshot,
  createAppStateSnapshotV2,
  normalizeAppStateSnapshotV2
} from "@adapters/persistence/appDatabase";
import { CurrentProjectState, DataTelemetryEntry, createProject, endSession, listArmTeachTracks, listProjects, saveProjectState, selectProject, startSession } from "@adapters/data-service/dataService";
import { normalizeArmTeachTracks } from "@domains/arm/armTeach";
import { FIRMWARE_BOARD_OPTIONS, FirmwareBoardId } from "@adapters/firmware/firmwareUpload";
import { cloneMapping } from "@domains/drive/inputMapping";
import type {
  MotorErrorDisplay,
  MotorFeedbackMap,
  ServoCommandStateMap,
  ServoFeedbackMap,
  WheelTurnProgress
} from "@app/appModel";

interface UseAppPersistenceActionsOptions {
  [key: string]: any;
}

export function useAppPersistenceActions(options: UseAppPersistenceActionsOptions) {
  const {
    activeDriveBase,
    activeModule,
    armConfig,
    armTeachTracks,
    cameraConfig,
    currentLanguage,
    currentProject,
    currentProjectIdRef,
    currentSessionIdRef,
    databaseLoadedRef,
    databaseStatus,
    driveSpeedLimit,
    expandedMotorLinkageGroupIds,
    expandedServoLinkageGroupIds,
    firmwareBoard,
    flushEventQueue,
    flushTelemetryQueue,
    i18n,
    inputMapping,
    linkageWheelDirectionByGroup,
    logs,
    motorDraft,
    motorFeedback,
    motorLinkageGroups,
    motorSpeed,
    motors,
    newProjectName,
    persistLogEntry,
    selectedChannel,
    selectedFirmwarePort,
    selectedGamepadIndex,
    selectedId,
    servoCommandById,
    servoDraft,
    servoFeedback,
    servoLinkageGroups,
    servoSafetyEnabled,
    servoSafetyPreset,
    servoSmoothPreset,
    servoSmoothingEnabled,
    servos,
    setActiveDriveBase,
    setActiveModule,
    setArmConfig,
    setArmTeachTracks,
    setCameraConfig,
    setDatabaseErrorMessage,
    setDatabaseStatus,
    setDriveSpeedLimit,
    setExpandedMotorLinkageGroupIds,
    setExpandedServoLinkageGroupIds,
    setFirmwareBoard,
    setInputMapping,
    setLastDatabaseSavedAt,
    setLastMotorError,
    setLinkageWheelDirectionByGroup,
    setLogs,
    setMappingDraft,
    setMotorDraft,
    setMotorFeedback,
    setMotorLinkageGroups,
    setMotorSpeed,
    setMotors,
    setNewProjectName,
    setProjects,
    setSelectedChannel,
    setSelectedFirmwarePort,
    setSelectedGamepadIndex,
    setSelectedId,
    setServoCommandById,
    setServoDraft,
    setServoFeedback,
    setServoLinkageGroups,
    setServoSafetyEnabled,
    setServoSafetyPreset,
    setServoSmoothPreset,
    setServoSmoothingEnabled,
    setServos,
    setStopMode,
    setCurrentProject,
    setWheelTurnProgress,
    stopMode,
    t,
    wheelTurnProgress
  } = options;

  async function applyAppConfigSnapshot(snapshot: AppConfigSnapshot) {
    setServos(snapshot.servos);
    setServoLinkageGroups(snapshot.servoLinkageGroups);
    setServoCommandById(snapshot.servoCommands as ServoCommandStateMap);
    setServoSmoothingEnabled(snapshot.servoSmoothing.enabled);
    setServoSmoothPreset(snapshot.servoSmoothing.preset);
    setServoSafetyEnabled(snapshot.servoSafety.enabled);
    setServoSafetyPreset(snapshot.servoSafety.preset);
    setMotors(snapshot.motors);
    setMotorLinkageGroups(snapshot.motorLinkageGroups);
    setArmConfig(snapshot.armConfig);
    setArmTeachTracks(normalizeArmTeachTracks(snapshot.armTeachTracks, snapshot.armConfig));
    setCameraConfig(snapshot.cameraConfig);
    setInputMapping(snapshot.inputMapping);
    setMappingDraft(cloneMapping(snapshot.inputMapping));
    setActiveModule(snapshot.lastActiveModule);
    setSelectedId(snapshot.servos[0]?.id ?? "");
    setSelectedChannel(snapshot.motors[0]?.channel ?? "");
    if (snapshot.language !== currentLanguage) {
      await i18n.changeLanguage(snapshot.language);
    }
  }

  async function applyAppStateSnapshot(snapshot: AppStateSnapshotV2) {
    const state = normalizeAppStateSnapshotV2(snapshot);
    await applyAppConfigSnapshot(state.config);

    setActiveModule(state.ui.activeModule);
    setSelectedId(state.ui.selectedServoId);
    setSelectedChannel(state.ui.selectedMotorChannel);
    setExpandedServoLinkageGroupIds(new Set(state.ui.expandedServoLinkageGroupIds));
    setExpandedMotorLinkageGroupIds(new Set(state.ui.expandedMotorLinkageGroupIds));
    setLinkageWheelDirectionByGroup(state.ui.linkageWheelDirectionByGroup);
    setServoDraft(state.ui.servoDraft);
    setMotorDraft(state.ui.motorDraft);
    setMotorSpeed(state.ui.motorSpeed);
    setStopMode(state.ui.stopMode);
    setActiveDriveBase(state.ui.activeDriveBase);
    setDriveSpeedLimit(state.ui.driveSpeedLimit);
    setSelectedGamepadIndex(state.ui.selectedGamepadIndex);
    setFirmwareBoard(FIRMWARE_BOARD_OPTIONS.some((board) => board.id === state.ui.firmwareBoard) ? (state.ui.firmwareBoard as FirmwareBoardId) : "arduino-uno");
    setSelectedFirmwarePort(state.ui.selectedFirmwarePort);
    setLogs(options.restoreLogEntries(state.runtime.logs));
    setServoFeedback(state.runtime.servoFeedback as ServoFeedbackMap);
    setMotorFeedback(state.runtime.motorFeedback as MotorFeedbackMap);
    setWheelTurnProgress(state.runtime.wheelTurnProgress as unknown as Record<string, WheelTurnProgress>);
    setLastMotorError(state.runtime.lastMotorError as MotorErrorDisplay | null);
  }

  function buildCurrentAppConfigSnapshot() {
    return createAppConfigSnapshot({
      servos,
      servoCommands: servoCommandById as PersistedServoCommandMap,
      servoLinkageGroups,
      servoSmoothing: {
        enabled: servoSmoothingEnabled,
        preset: servoSmoothPreset
      },
      servoSafety: {
        enabled: servoSafetyEnabled,
        preset: servoSafetyPreset
      },
      motors,
      motorLinkageGroups,
      armConfig,
      armTeachTracks,
      cameraConfig,
      inputMapping,
      language: currentLanguage,
      lastActiveModule: activeModule as PersistedActiveModule
    });
  }

  function buildCurrentAppStateSnapshot() {
    return createAppStateSnapshotV2({
      config: buildCurrentAppConfigSnapshot(),
      ui: {
        activeModule: activeModule as PersistedActiveModule,
        selectedServoId: selectedId,
        selectedMotorChannel: selectedChannel,
        expandedServoLinkageGroupIds: Array.from(expandedServoLinkageGroupIds),
        expandedMotorLinkageGroupIds: Array.from(expandedMotorLinkageGroupIds),
        linkageWheelDirectionByGroup,
        servoDraft,
        motorDraft,
        motorSpeed,
        stopMode,
        activeDriveBase,
        driveSpeedLimit,
        selectedGamepadIndex,
        firmwareBoard,
        selectedFirmwarePort
      },
      runtime: {
        stale: false,
        logs: logs.map(persistLogEntry),
        servoFeedback: servoFeedback as unknown as Record<string, Record<string, unknown>>,
        motorFeedback: motorFeedback as unknown as Record<string, Record<string, unknown>>,
        wheelTurnProgress: wheelTurnProgress as unknown as Record<string, Record<string, unknown>>,
        lastMotorError: options.lastMotorError as unknown as Record<string, unknown> | null
      }
    });
  }

  function mergeDataServiceRuntime(state: AppStateSnapshotV2, events: PersistedLogEntry[], telemetry: DataTelemetryEntry[]): AppStateSnapshotV2 {
    const runtime = {
      ...state.runtime,
      stale: true,
      logs: events.length > 0 ? events : state.runtime.logs,
      servoFeedback: { ...state.runtime.servoFeedback },
      motorFeedback: { ...state.runtime.motorFeedback }
    };

    for (const item of telemetry) {
      if (item.category === "servo") {
        runtime.servoFeedback[item.targetId] = item.payload;
      }
      if (item.category === "motor") {
        runtime.motorFeedback[item.targetId] = item.payload;
      }
    }

    return { ...state, runtime };
  }

  async function activateProjectPayload(payload: CurrentProjectState, fallbackState?: AppStateSnapshotV2) {
    const previousSessionId = currentSessionIdRef.current;
    if (previousSessionId) {
      flushEventQueue();
      flushTelemetryQueue();
      void endSession(previousSessionId).catch(() => undefined);
      currentSessionIdRef.current = null;
    }

    currentProjectIdRef.current = payload.project.id;
    setCurrentProject(payload.project);
    setProjects(await listProjects());
    setLastDatabaseSavedAt(payload.stateUpdatedAt);
    setDatabaseErrorMessage("");

    const persistedTracks = normalizeArmTeachTracks(await listArmTeachTracks(payload.project.id), payload.state?.config.armConfig);
    const state = payload.state
      ? mergeDataServiceRuntime(normalizeAppStateSnapshotV2(payload.state), payload.events, payload.telemetry)
      : fallbackState ?? createAppStateSnapshotV2({ config: buildCurrentAppConfigSnapshot() });
    state.config.armTeachTracks = normalizeArmTeachTracks([...persistedTracks, ...state.config.armTeachTracks], state.config.armConfig);
    if (!payload.state) {
      const result = await saveProjectState(payload.project.id, state);
      setLastDatabaseSavedAt(result.updatedAt);
    }
    await applyAppStateSnapshot(state);

    const session = await startSession(payload.project.id);
    currentSessionIdRef.current = session.id;
    databaseLoadedRef.current = true;
    setDatabaseStatus("saved");
  }

  async function changeCurrentProject(projectId: string) {
    if (!projectId || projectId === currentProject?.id || databaseStatus === "offline") {
      return;
    }
    setDatabaseStatus("loading");
    try {
      await activateProjectPayload(await selectProject(projectId));
    } catch (error) {
      setDatabaseErrorMessage(error instanceof Error && error.message ? error.message : t("database.error"));
      setDatabaseStatus("error");
    }
  }

  async function createNewProject() {
    const name = newProjectName.trim();
    if (!name || databaseStatus === "offline") {
      return;
    }
    setDatabaseStatus("saving");
    try {
      const payload = await createProject(name);
      const state = buildCurrentAppStateSnapshot();
      const result = await saveProjectState(payload.project.id, state);
      setNewProjectName("");
      await activateProjectPayload({ ...payload, state, stateUpdatedAt: result.updatedAt }, state);
    } catch (error) {
      setDatabaseErrorMessage(error instanceof Error && error.message ? error.message : t("database.error"));
      setDatabaseStatus("error");
    }
  }

  return {
    activateProjectPayload,
    applyAppConfigSnapshot,
    applyAppStateSnapshot,
    buildCurrentAppConfigSnapshot,
    buildCurrentAppStateSnapshot,
    changeCurrentProject,
    createNewProject,
    mergeDataServiceRuntime
  };
}
