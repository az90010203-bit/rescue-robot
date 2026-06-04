import { useEffect } from "react";
import {
  createAppStateSnapshotV2,
  loadOrMigrateAppConfigSnapshot,
  normalizeAppStateSnapshotV2,
  saveAppDatabaseSnapshot
} from "../lib/appDatabase";
import {
  checkDataService,
  endSession,
  listArmTeachTracks,
  listProjects,
  loadCurrentProjectState,
  saveProjectState,
  startSession
} from "../lib/dataService";
import { normalizeArmTeachTracks } from "../lib/armTeach";

interface UseAppPersistenceEffectsOptions {
  [key: string]: any;
  autoSaveDeps: unknown[];
}

export function useAppPersistenceEffects({
  applyAppStateSnapshot,
  autoSaveDeps,
  buildCurrentAppStateSnapshot,
  cancelArmLiveMove,
  cancelLiveAngleMove,
  cancelLiveWheelMove,
  cancelMotorLinkageMove,
  cancelServoLinkageMove,
  cancelServoMotion,
  cancelServoSafetyMonitor,
  cancelWheelTurnMonitor,
  clearFlushTimers,
  currentProjectIdRef,
  currentSessionIdRef,
  databaseLoadedRef,
  databaseSaveTimerRef,
  flushEventQueue,
  flushTelemetryQueue,
  mergeDataServiceRuntime,
  setCurrentProject,
  setDatabaseErrorMessage,
  setDatabaseStatus,
  setLastDatabaseSavedAt,
  setProjects,
  t
}: UseAppPersistenceEffectsOptions) {
  useEffect(() => {
    let cancelled = false;

    async function loadPersistentState() {
      setDatabaseStatus("loading");
      try {
        await checkDataService();
        const current = await loadCurrentProjectState();
        if (cancelled) {
          return;
        }

        currentProjectIdRef.current = current.project.id;
        setCurrentProject(current.project);
        setProjects(await listProjects());
        setLastDatabaseSavedAt(current.stateUpdatedAt);
        setDatabaseErrorMessage("");

        const persistedTracks = normalizeArmTeachTracks(await listArmTeachTracks(current.project.id), current.state?.config.armConfig);
        if (current.state) {
          const state = mergeDataServiceRuntime(normalizeAppStateSnapshotV2(current.state), current.events, current.telemetry);
          state.config.armTeachTracks = normalizeArmTeachTracks([...persistedTracks, ...state.config.armTeachTracks], state.config.armConfig);
          await applyAppStateSnapshot(state);
        } else {
          const { snapshot } = await loadOrMigrateAppConfigSnapshot();
          const migratedState = createAppStateSnapshotV2({ config: { ...snapshot, armTeachTracks: persistedTracks } });
          await saveProjectState(current.project.id, migratedState);
          await applyAppStateSnapshot(migratedState);
          setLastDatabaseSavedAt(migratedState.updatedAt);
        }

        const session = await startSession(current.project.id);
        currentSessionIdRef.current = session.id;
        databaseLoadedRef.current = true;
        setDatabaseStatus("saved");
      } catch (error) {
        if (!cancelled) {
          currentProjectIdRef.current = null;
          currentSessionIdRef.current = null;
          setCurrentProject(null);
          setProjects([]);
          setLastDatabaseSavedAt(null);
          setDatabaseErrorMessage(error instanceof Error && error.message ? error.message : t("database.localFallback"));
          const { snapshot } = await loadOrMigrateAppConfigSnapshot();
          await applyAppStateSnapshot(createAppStateSnapshotV2({ config: snapshot }));
          databaseLoadedRef.current = true;
          setDatabaseStatus("offline");
        }
      }
    }

    void loadPersistentState();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (databaseSaveTimerRef.current !== undefined) {
        window.clearTimeout(databaseSaveTimerRef.current);
      }
      flushEventQueue();
      flushTelemetryQueue();
      clearFlushTimers();
      if (currentSessionIdRef.current) {
        void endSession(currentSessionIdRef.current);
        currentSessionIdRef.current = null;
      }
      cancelLiveAngleMove();
      cancelLiveWheelMove();
      cancelArmLiveMove();
      cancelServoLinkageMove();
      cancelMotorLinkageMove();
      cancelServoMotion();
      cancelWheelTurnMonitor();
      cancelServoSafetyMonitor();
    };
  }, []);

  useEffect(() => {
    if (!databaseLoadedRef.current) {
      return;
    }

    if (databaseSaveTimerRef.current !== undefined) {
      window.clearTimeout(databaseSaveTimerRef.current);
    }

    setDatabaseStatus("saving");
    databaseSaveTimerRef.current = window.setTimeout(() => {
      const projectId = currentProjectIdRef.current;
      const state = buildCurrentAppStateSnapshot();
      if (!projectId) {
        void saveAppDatabaseSnapshot(state.config)
          .then(() => {
            setLastDatabaseSavedAt(state.updatedAt);
            setDatabaseErrorMessage(t("database.localFallback"));
            setDatabaseStatus("offline");
          })
          .catch((error) => {
            setDatabaseErrorMessage(error instanceof Error && error.message ? error.message : t("database.error"));
            setDatabaseStatus("error");
          });
        return;
      }

      void saveProjectState(projectId, state)
        .then((result) => {
          void saveAppDatabaseSnapshot(state.config).catch(() => undefined);
          setLastDatabaseSavedAt(result.updatedAt);
          setDatabaseErrorMessage("");
          setDatabaseStatus("saved");
        })
        .catch((error) => {
          setDatabaseErrorMessage(error instanceof Error && error.message ? error.message : t("database.error"));
          setDatabaseStatus("error");
        });
    }, 260);
  }, autoSaveDeps);
}
