import {
  ARM_TEACH_SAMPLE_INTERVAL_MS,
  armTeachTrackToJson,
  armTeachTrackToJsonl,
  createArmTeachSampleFromFeedback,
  createArmTeachTrack,
  updateArmTeachTrackMetadata,
  type ArmTeachSample,
  type ArmTeachTrack
} from "@domains/arm/armTeach";
import { saveArmTeachTrack, deleteArmTeachTrack } from "@adapters/data-service/dataService";
import { buildReadFeedbackFrame, buildTorqueFrame, clamp, parseServoFeedback, servoLogicalSpan, type ServoProfile } from "@adapters/hardware/protocol";
import type { ArmConfig, ArmJointConfig } from "@adapters/persistence/storage";
import type { ArmTeachRuntime, ArmTeachStatus } from "@app/appModel";

interface UseArmTeachRuntimeOptions {
  addSystemLog: (messageKey: string, level?: any, values?: any) => void;
  armConfig: ArmConfig;
  armServoForJoint: (joint: ArmJointConfig) => ServoProfile | undefined;
  armTeachDraftName: string;
  armTeachDraftNotes: string;
  armTeachPlaybackGenerationRef: { current: number };
  armTeachRuntimeRef: { current: ArmTeachRuntime | null };
  armTeachStatus: ArmTeachStatus;
  armTeachTimerRef: { current: number | undefined };
  armTeachUnsavedTrack: ArmTeachTrack | null;
  cancelArmLiveMove: () => void;
  cancelServoMotionForArm: () => void;
  cancelServoSafetyMonitor: (id?: number) => void;
  currentProjectIdRef: { current: string | null };
  enqueueServoSerialTask: <T>(task: () => Promise<T>) => Promise<T>;
  holdServoAtCurrentPosition: (servo: ServoProfile, speedRaw: number, acc: number | undefined, logFrame?: boolean) => Promise<unknown>;
  livePositionModeServoRef: { current: Set<number> };
  pauseArm: () => Promise<void>;
  rememberServoFeedback: (feedback: any) => void;
  runArmPositionMotion: (config: ArmConfig, live?: boolean) => Promise<unknown>;
  selectedArmTeachTrack: ArmTeachTrack | null;
  sendServoFrame: (frame: number[], waitMs?: number, logFrame?: boolean) => Promise<any>;
  sendServoFrameUnlocked: (frame: number[], waitMs?: number, logFrame?: boolean) => Promise<any>;
  servoBusConnected: () => boolean;
  servos: ServoProfile[];
  setArmConfig: (value: ArmConfig | ((current: ArmConfig) => ArmConfig)) => void;
  setArmTeachDraftName: (value: string) => void;
  setArmTeachDraftNotes: (value: string) => void;
  setArmTeachElapsedMs: (value: number) => void;
  setArmTeachLastSampleStatus: (value: string) => void;
  setArmTeachSampleCount: (value: number) => void;
  setArmTeachStatus: (status: ArmTeachStatus) => void;
  setArmTeachTracks: (updater: (current: ArmTeachTrack[]) => ArmTeachTrack[]) => void;
  setArmTeachUnsavedTrack: (track: ArmTeachTrack | null) => void;
  setDatabaseErrorMessage: (message: string) => void;
  setDatabaseStatus: (status: "loading" | "saving" | "saved" | "error" | "offline") => void;
  setSelectedArmTeachTrackId: (id: string | null) => void;
  sleepMs: (ms: number) => Promise<void>;
  t: (key: string) => string;
}

export function useArmTeachRuntime({
  addSystemLog,
  armConfig,
  armServoForJoint,
  armTeachDraftName,
  armTeachDraftNotes,
  armTeachPlaybackGenerationRef,
  armTeachRuntimeRef,
  armTeachStatus,
  armTeachTimerRef,
  armTeachUnsavedTrack,
  cancelArmLiveMove,
  cancelServoMotionForArm,
  cancelServoSafetyMonitor,
  currentProjectIdRef,
  enqueueServoSerialTask,
  holdServoAtCurrentPosition,
  livePositionModeServoRef,
  pauseArm,
  rememberServoFeedback,
  runArmPositionMotion,
  selectedArmTeachTrack,
  sendServoFrame,
  sendServoFrameUnlocked,
  servoBusConnected,
  servos,
  setArmConfig,
  setArmTeachDraftName,
  setArmTeachDraftNotes,
  setArmTeachElapsedMs,
  setArmTeachLastSampleStatus,
  setArmTeachSampleCount,
  setArmTeachStatus,
  setArmTeachTracks,
  setArmTeachUnsavedTrack,
  setDatabaseErrorMessage,
  setDatabaseStatus,
  setSelectedArmTeachTrackId,
  sleepMs,
  t
}: UseArmTeachRuntimeOptions) {
  function getEnabledArmTeachJoints(config = armConfig) {
    return config.joints.filter((joint) => joint.enabled && servos.some((servo) => servo.id === joint.servoId));
  }

  function clearArmTeachTimer() {
    if (armTeachTimerRef.current !== undefined) {
      window.clearInterval(armTeachTimerRef.current);
      armTeachTimerRef.current = undefined;
    }
  }

  async function startArmTeachRecording() {
    if (armTeachStatus === "recording" || armTeachStatus === "playing") {
      return;
    }
    const joints = getEnabledArmTeachJoints();
    if (joints.length === 0) {
      addSystemLog("logs.armNoTargets", "warn");
      setArmTeachStatus("error");
      setArmTeachLastSampleStatus("no enabled joints");
      return;
    }
    if (!servoBusConnected()) {
      addSystemLog("logs.servoBusRequired", "warn");
      setArmTeachStatus("error");
      setArmTeachLastSampleStatus("servo bus offline");
      return;
    }

    cancelArmLiveMove();
    cancelServoMotionForArm();
    armTeachPlaybackGenerationRef.current += 1;
    setArmTeachStatus("preparing");
    setArmTeachUnsavedTrack(null);
    setArmTeachElapsedMs(0);
    setArmTeachSampleCount(0);
    setArmTeachLastSampleStatus("releasing torque");

    try {
      await enqueueServoSerialTask(async () => {
        for (const joint of joints) {
          await sendServoFrameUnlocked(buildTorqueFrame(joint.servoId, false), 80, true);
          livePositionModeServoRef.current.delete(joint.servoId);
          cancelServoSafetyMonitor(joint.servoId);
        }
      });
    } catch {
      setArmTeachStatus("error");
      setArmTeachLastSampleStatus("torque release failed");
      addSystemLog("logs.commandInvalid", "error");
      return;
    }

    const now = Date.now();
    armTeachRuntimeRef.current = {
      joints,
      startedAt: now,
      samples: [],
      sampling: false
    };
    setArmTeachStatus("recording");
    setArmTeachLastSampleStatus("recording");
    await sampleArmTeachFrame();
    armTeachTimerRef.current = window.setInterval(() => {
      void sampleArmTeachFrame();
    }, ARM_TEACH_SAMPLE_INTERVAL_MS);
  }

  async function sampleArmTeachFrame() {
    const runtime = armTeachRuntimeRef.current;
    if (!runtime || runtime.sampling || !servoBusConnected()) {
      return;
    }

    runtime.sampling = true;
    const tMs = Date.now() - runtime.startedAt;
    const feedbackByServoId: Record<number, { positionRaw?: number; speedRaw?: number; loadRaw?: number; voltageRaw?: number; temperatureC?: number; currentRaw?: number }> = {};
    try {
      for (const joint of runtime.joints) {
        const packet = await sendServoFrame(buildReadFeedbackFrame(joint.servoId), 120, false);
        if (!packet || packet.status !== 0) {
          throw new Error(`ID${joint.servoId} feedback failed`);
        }
        const feedback = parseServoFeedback(packet);
        rememberServoFeedback(feedback);
        if (feedback.positionRaw === undefined) {
          throw new Error(`ID${joint.servoId} position missing`);
        }
        feedbackByServoId[joint.servoId] = {
          positionRaw: feedback.positionRaw,
          speedRaw: feedback.speedRaw,
          loadRaw: feedback.loadRaw,
          voltageRaw: feedback.voltageRaw,
          temperatureC: feedback.temperatureC,
          currentRaw: feedback.currentRaw
        };
      }
      const sample = createArmTeachSampleFromFeedback({ tMs, joints: runtime.joints, servos, feedbackByServoId });
      if (!sample) {
        throw new Error("incomplete sample");
      }
      runtime.samples.push(sample);
      setArmTeachElapsedMs(sample.tMs);
      setArmTeachSampleCount(runtime.samples.length);
      setArmTeachLastSampleStatus(`ok ${new Date().toLocaleTimeString()}`);
      setArmTeachStatus("recording");
    } catch (error) {
      clearArmTeachTimer();
      setArmTeachStatus("error");
      setArmTeachLastSampleStatus(error instanceof Error && error.message ? error.message : "sample failed");
      addSystemLog("logs.commandInvalid", "error");
    } finally {
      runtime.sampling = false;
    }
  }

  async function stopArmTeachRecording() {
    const runtime = armTeachRuntimeRef.current;
    clearArmTeachTimer();
    if (!runtime) {
      return;
    }
    armTeachRuntimeRef.current = null;
    setArmTeachStatus("stopped");
    setArmTeachLastSampleStatus("holding current pose");

    for (const joint of runtime.joints) {
      const servo = armServoForJoint(joint);
      if (servo) {
        await holdServoAtCurrentPosition(servo, joint.speedRaw, joint.acc, false);
      }
    }

    if (runtime.samples.length === 0) {
      setArmTeachStatus("error");
      setArmTeachLastSampleStatus("no valid samples");
      return;
    }

    const lastSample = runtime.samples[runtime.samples.length - 1];
    applyArmTeachSampleToConfig(lastSample, true);
    const track = createArmTeachTrack({
      name: armTeachDraftName,
      joints: runtime.joints,
      samples: runtime.samples,
      sampleIntervalMs: ARM_TEACH_SAMPLE_INTERVAL_MS,
      notes: armTeachDraftNotes
    });
    setArmTeachUnsavedTrack(track);
    setSelectedArmTeachTrackId(track.id);
    setArmTeachDraftName(track.name);
    setArmTeachDraftNotes(track.metadata.notes ?? "");
    setArmTeachElapsedMs(track.durationMs);
    setArmTeachSampleCount(track.samples.length);
    setArmTeachLastSampleStatus("stopped");
  }

  function applyArmTeachSampleToConfig(sample: ArmTeachSample, selectFirst = false) {
    setArmConfig((current) => {
      const byJointId = new Map(sample.joints.map((joint) => [joint.jointId, joint]));
      return {
        ...current,
        selectedJointId: selectFirst ? sample.joints[0]?.jointId ?? current.selectedJointId : current.selectedJointId,
        joints: current.joints.map((joint) => {
          const recorded = byJointId.get(joint.id);
          return recorded ? { ...joint, angleDeg: clamp(recorded.logicalAngleDeg, 0, servoLogicalSpan(armServoForJoint(joint) ?? { id: joint.servoId, name: joint.name })) } : joint;
        })
      };
    });
  }

  function armConfigForTeachSample(track: ArmTeachTrack, sample: ArmTeachSample): ArmConfig | null {
    const byJointId = new Map(sample.joints.map((joint) => [joint.jointId, joint]));
    const required = new Set(track.jointIds);
    const missing = armConfig.joints.some((joint) => required.has(joint.id) && !byJointId.has(joint.id));
    if (missing) {
      return null;
    }
    return {
      ...armConfig,
      joints: armConfig.joints.map((joint) => {
        const recorded = byJointId.get(joint.id);
        return recorded ? { ...joint, angleDeg: recorded.logicalAngleDeg } : joint;
      })
    };
  }

  function validateArmTeachTrackForPlayback(track: ArmTeachTrack) {
    if (track.samples.length === 0) {
      return "track has no samples";
    }
    const jointById = new Map(armConfig.joints.map((joint) => [joint.id, joint]));
    for (let index = 0; index < track.jointIds.length; index += 1) {
      const joint = jointById.get(track.jointIds[index]);
      if (!joint || joint.servoId !== track.servoIds[index]) {
        return "track joints do not match current arm";
      }
    }
    return "";
  }

  async function playArmTeachTrack(track = selectedArmTeachTrack) {
    if (!track || armTeachStatus === "recording") {
      return;
    }
    if (!servoBusConnected()) {
      addSystemLog("logs.servoBusRequired", "warn");
      setArmTeachLastSampleStatus("servo bus offline");
      return;
    }
    const validation = validateArmTeachTrackForPlayback(track);
    if (validation) {
      setArmTeachStatus("error");
      setArmTeachLastSampleStatus(validation);
      return;
    }

    const generation = armTeachPlaybackGenerationRef.current + 1;
    armTeachPlaybackGenerationRef.current = generation;
    setArmTeachStatus("playing");
    setArmTeachLastSampleStatus("playing");
    for (let index = 0; index < track.samples.length; index += 1) {
      if (armTeachPlaybackGenerationRef.current !== generation || !servoBusConnected()) {
        return;
      }
      const sample = track.samples[index];
      const previous = track.samples[index - 1];
      if (previous) {
        await sleepMs(Math.max(0, sample.tMs - previous.tMs));
      }
      const config = armConfigForTeachSample(track, sample);
      if (!config) {
        setArmTeachStatus("error");
        setArmTeachLastSampleStatus("track sample mismatch");
        return;
      }
      setArmConfig(config);
      await runArmPositionMotion(config, true);
      setArmTeachElapsedMs(sample.tMs);
      setArmTeachSampleCount(index + 1);
    }
    if (armTeachPlaybackGenerationRef.current === generation) {
      setArmTeachStatus("stopped");
      setArmTeachLastSampleStatus("playback complete");
    }
  }

  async function pauseArmTeachPlayback() {
    armTeachPlaybackGenerationRef.current += 1;
    if (armTeachStatus === "playing") {
      await pauseArm();
    }
    setArmTeachStatus("stopped");
    setArmTeachLastSampleStatus("playback paused");
  }

  async function saveCurrentArmTeachTrack() {
    const source = armTeachUnsavedTrack ?? selectedArmTeachTrack;
    if (!source) {
      return;
    }
    const track = updateArmTeachTrackMetadata(source, { name: armTeachDraftName, notes: armTeachDraftNotes });
    setArmTeachTracks((current) => upsertArmTeachTrack(current, track));
    setArmTeachUnsavedTrack(null);
    setSelectedArmTeachTrackId(track.id);
    setArmTeachLastSampleStatus("saved locally");
    const projectId = currentProjectIdRef.current;
    if (projectId) {
      try {
        const saved = await saveArmTeachTrack(projectId, track);
        setArmTeachTracks((current) => upsertArmTeachTrack(current, saved));
        setArmTeachLastSampleStatus("saved");
      } catch (error) {
        setDatabaseErrorMessage(error instanceof Error && error.message ? error.message : t("database.error"));
        setDatabaseStatus("error");
      }
    }
  }

  async function removeSelectedArmTeachTrack() {
    const track = selectedArmTeachTrack;
    if (!track) {
      return;
    }
    armTeachPlaybackGenerationRef.current += 1;
    setArmTeachTracks((current) => current.filter((item) => item.id !== track.id));
    if (armTeachUnsavedTrack?.id === track.id) {
      setArmTeachUnsavedTrack(null);
    }
    setSelectedArmTeachTrackId(null);
    if (currentProjectIdRef.current) {
      await deleteArmTeachTrack(track.id).catch((error) => {
        setDatabaseErrorMessage(error instanceof Error && error.message ? error.message : t("database.error"));
        setDatabaseStatus("error");
      });
    }
  }

  function exportArmTeachTrack(track: ArmTeachTrack | null, format: "json" | "jsonl") {
    if (!track) {
      return;
    }
    const body = format === "json" ? armTeachTrackToJson(track) : armTeachTrackToJsonl(track);
    const blob = new Blob([body], { type: format === "json" ? "application/json" : "application/x-ndjson" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${track.name.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "arm-teach"}.${format === "json" ? "json" : "jsonl"}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return {
    exportArmTeachTrack,
    getEnabledArmTeachJoints,
    pauseArmTeachPlayback,
    playArmTeachTrack,
    removeSelectedArmTeachTrack,
    saveCurrentArmTeachTrack,
    startArmTeachRecording,
    stopArmTeachRecording
  };
}

function upsertArmTeachTrack(current: ArmTeachTrack[], track: ArmTeachTrack) {
  return [track, ...current.filter((item) => item.id !== track.id)].sort((a, b) => b.updatedAt - a.updatedAt);
}
