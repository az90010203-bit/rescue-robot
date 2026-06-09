import {
  DEFAULT_LINKAGE_MEMBER_ACC,
  DEFAULT_LINKAGE_MEMBER_SPEED_RAW,
  DEFAULT_LINKAGE_WHEEL_TURNS_TARGET,
  calculateServoLinkageTargets,
  calculateServoLinkageWheelTargets,
  type ServoLinkageGroup,
  type ServoLinkageWheelDirection
} from "@adapters/persistence/storage";
import {
  DEFAULT_WHEEL_SPEED_LIMIT,
  clamp,
  type ServoProfile
} from "@adapters/hardware/protocol";
import {
  commandSpeedRawToWheelSliderDeg,
  normalizeWheelMaxSpeedRaw
} from "@domains/servo/servoWheelSlider";
import {
  formatServoAngle,
  getServoCommandState,
  linkageWheelTurnProgressKey,
  nextServoLinkageGroupName,
  type ServoCommandStateMap
} from "@app/appModel";

const SERVO_LINKAGE_LIVE_COMMAND_DELAY_MS = 120;

interface UseServoLinkageRuntimeOptions {
  armConfig: { joints: Array<{ servoId: number }> };
  cancelArmLiveMove: () => void;
  cancelLiveAngleMove: (id?: number) => void;
  cancelLiveWheelMove: (id?: number) => void;
  cancelServoLinkageMove: (id?: string) => void;
  cancelServoLinkageWheelTurnMonitors: (groupId: string) => void;
  cancelServoSafetyMonitor: (id?: number) => void;
  cancelWheelTurnMonitor: (key?: string) => void;
  linkageLiveSendingRef: { current: Record<string, boolean> };
  linkageLiveTimerRef: { current: Record<string, number> };
  pendingLinkageMoveRef: { current: Record<string, ServoLinkageGroup> };
  pauseServoLinkageGroup: (group: ServoLinkageGroup) => Promise<void>;
  sendServoLinkageGroup: (group: ServoLinkageGroup, live?: boolean) => Promise<void>;
  servoLinkageGroups: ServoLinkageGroup[];
  servoLinkageGroupsRef: { current: ServoLinkageGroup[] };
  servoSerialQueueBusy: () => boolean;
  servos: ServoProfile[];
  setExpandedServoLinkageGroupIds: (updater: (current: Set<string>) => Set<string>) => void;
  setLinkageWheelDirectionByGroup: (updater: (current: Record<string, ServoLinkageWheelDirection | "paused">) => Record<string, ServoLinkageWheelDirection | "paused">) => void;
  setServoCommandById: (updater: (current: ServoCommandStateMap) => ServoCommandStateMap) => void;
  setServoLinkageGroups: (updater: (current: ServoLinkageGroup[]) => ServoLinkageGroup[]) => void;
}

export function useServoLinkageRuntime({
  armConfig,
  cancelArmLiveMove,
  cancelLiveAngleMove,
  cancelLiveWheelMove,
  cancelServoLinkageMove,
  cancelServoLinkageWheelTurnMonitors,
  cancelServoSafetyMonitor,
  cancelWheelTurnMonitor,
  linkageLiveSendingRef,
  linkageLiveTimerRef,
  pendingLinkageMoveRef,
  pauseServoLinkageGroup,
  sendServoLinkageGroup,
  servoLinkageGroups,
  servoLinkageGroupsRef,
  servoSerialQueueBusy,
  servos,
  setExpandedServoLinkageGroupIds,
  setLinkageWheelDirectionByGroup,
  setServoCommandById,
  setServoLinkageGroups
}: UseServoLinkageRuntimeOptions) {
  function syncServoLinkageTargetsToCommands(group: ServoLinkageGroup) {
    if (group.mode !== "position") {
      return;
    }

    const targets = calculateServoLinkageTargets(group, servos);
    if (targets.length === 0) {
      return;
    }

    setServoCommandById((current) => {
      const next = { ...current };
      for (const target of targets) {
        const currentState = getServoCommandState(current, target.servoId);
        const speedValue = Number(currentState.speedRaw);
        next[target.servoId] = {
          ...currentState,
          mode: "position",
          speedRaw: Number.isFinite(target.speedRaw) && target.speedRaw >= 0 ? String(target.speedRaw) : Number.isFinite(speedValue) && speedValue >= 0 ? currentState.speedRaw : "300",
          acc: String(target.acc),
          reverse: target.reverse,
          angleDeg: formatServoAngle(target.logicalAngleDeg)
        };
      }
      return next;
    });
  }

  function syncServoLinkageWheelTargetsToCommands(group: ServoLinkageGroup, direction: ServoLinkageWheelDirection) {
    const targets = calculateServoLinkageWheelTargets(group, servos, direction);
    if (targets.length === 0) {
      return;
    }

    setServoCommandById((current) => {
      const next = { ...current };
      for (const target of targets) {
        const currentState = getServoCommandState(current, target.servoId);
        const maxSpeedRaw = normalizeWheelMaxSpeedRaw(target.speedRaw);
        const wheelSliderDeg = commandSpeedRawToWheelSliderDeg(target.commandSpeedRaw, maxSpeedRaw);
        next[target.servoId] = {
          ...currentState,
          mode: "wheel",
          speedRaw: String(maxSpeedRaw),
          acc: String(target.acc),
          reverse: target.reverse,
          wheelSliderDeg: formatServoAngle(wheelSliderDeg)
        };
      }
      return next;
    });
  }

  function addServoLinkageGroup() {
    setServoLinkageGroups((current) => {
      const name = nextServoLinkageGroupName(current);
      return [
        ...current,
        {
          id: `linkage-${Date.now().toString(36)}-${current.length + 1}`,
          name,
          enabled: false,
          mode: "position",
          masterPercent: 100,
          wheelTurnLimitEnabled: false,
          wheelClockwiseTurnsTarget: DEFAULT_LINKAGE_WHEEL_TURNS_TARGET,
          wheelCounterclockwiseTurnsTarget: DEFAULT_LINKAGE_WHEEL_TURNS_TARGET,
          members: []
        }
      ];
    });
  }

  function removeServoLinkageGroup(id: string) {
    const group = servoLinkageGroups.find((item) => item.id === id);
    cancelServoLinkageMove(id);
    cancelServoLinkageWheelTurnMonitors(id);
    for (const member of group?.members ?? []) {
      cancelServoSafetyMonitor(member.servoId);
    }
    setExpandedServoLinkageGroupIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setLinkageWheelDirectionByGroup((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setServoLinkageGroups((current) => current.filter((group) => group.id !== id));
  }

  function updateServoLinkageGroupName(id: string, name: string) {
    setServoLinkageGroups((current) => current.map((group) => (group.id === id ? { ...group, name } : group)));
  }

  function toggleServoLinkageGroupExpanded(id: string) {
    setExpandedServoLinkageGroupIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function updateServoLinkageGroupMode(id: string, mode: "position" | "wheel") {
    const group = servoLinkageGroups.find((item) => item.id === id);
    if (!group || group.mode === mode) {
      return;
    }

    cancelServoLinkageMove(id);
    cancelServoLinkageWheelTurnMonitors(id);
    for (const member of group.members) {
      cancelServoSafetyMonitor(member.servoId);
    }
    if (group.mode === "wheel") {
      void pauseServoLinkageGroup(group);
    }

    const nextGroup = {
      ...group,
      mode,
      members:
        mode === "wheel"
          ? group.members.map((member) => ({ ...member, speedRaw: clamp(member.speedRaw, 0, DEFAULT_WHEEL_SPEED_LIMIT) }))
          : group.members
    };
    setServoLinkageGroups((current) => current.map((item) => (item.id === id ? nextGroup : item)));
    if (mode === "position") {
      syncServoLinkageTargetsToCommands(nextGroup);
    }
  }

  function updateServoLinkageWheelTurnLimit(id: string, enabled: boolean) {
    setServoLinkageGroups((current) => current.map((group) => (group.id === id ? { ...group, wheelTurnLimitEnabled: enabled } : group)));
    if (!enabled) {
      cancelServoLinkageWheelTurnMonitors(id);
    }
  }

  function updateServoLinkageWheelTurnTarget(id: string, field: "wheelClockwiseTurnsTarget" | "wheelCounterclockwiseTurnsTarget", value: string) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    setServoLinkageGroups((current) => current.map((group) => (group.id === id ? { ...group, [field]: Math.max(0.01, numericValue) } : group)));
  }

  function updateServoLinkageGroupEnabled(id: string, enabled: boolean) {
    if (!enabled) {
      cancelServoLinkageMove(id);
      cancelServoLinkageWheelTurnMonitors(id);
      const group = servoLinkageGroups.find((item) => item.id === id);
      for (const member of group?.members ?? []) {
        cancelServoSafetyMonitor(member.servoId);
      }
    }

    const group = servoLinkageGroups.find((item) => item.id === id);
    if (group && enabled && group.mode === "position") {
      syncServoLinkageTargetsToCommands({ ...group, enabled });
    }
    setServoLinkageGroups((current) => current.map((item) => (item.id === id ? { ...item, enabled } : item)));
  }

  function updateServoLinkageMaster(id: string, value: string, live = true) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    const group = servoLinkageGroups.find((item) => item.id === id);
    if (!group) {
      return;
    }

    const nextGroup = { ...group, masterPercent: clamp(numericValue, 0, 100) };
    setServoLinkageGroups((current) => current.map((item) => (item.id === id ? nextGroup : item)));
    syncServoLinkageTargetsToCommands(nextGroup);
    if (live && nextGroup.enabled && nextGroup.mode === "position") {
      scheduleServoLinkageMove(nextGroup);
    }
  }

  function addServoToLinkageGroup(groupId: string, value: string) {
    const servoId = Number(value);
    const group = servoLinkageGroups.find((item) => item.id === groupId);
    if (!group || !servos.some((servo) => servo.id === servoId) || group.members.some((member) => member.servoId === servoId)) {
      return;
    }

    const nextGroup = {
      ...group,
      members: [
        ...group.members,
        { servoId, weightPercent: 100, speedRaw: DEFAULT_LINKAGE_MEMBER_SPEED_RAW, acc: DEFAULT_LINKAGE_MEMBER_ACC, reverse: false }
      ]
    };
    setServoLinkageGroups((current) => current.map((item) => (item.id === groupId ? nextGroup : item)));
    syncServoLinkageTargetsToCommands(nextGroup);
  }

  function removeServoFromLinkageGroup(groupId: string, servoId: number) {
    cancelWheelTurnMonitor(linkageWheelTurnProgressKey(groupId, servoId));
    cancelServoSafetyMonitor(servoId);
    setServoLinkageGroups((current) => current.map((group) => (group.id === groupId ? { ...group, members: group.members.filter((member) => member.servoId !== servoId) } : group)));
  }

  function updateServoLinkageMemberWeight(groupId: string, servoId: number, value: string) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }
    updateMember(groupId, servoId, { weightPercent: clamp(numericValue, 0, 100) });
  }

  function updateServoLinkageMemberNumber(groupId: string, servoId: number, field: "speedRaw" | "acc", value: string) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    const group = servoLinkageGroups.find((item) => item.id === groupId);
    if (!group) {
      return;
    }

    const nextValue = field === "speedRaw" ? clamp(Math.round(numericValue), 0, group.mode === "wheel" ? DEFAULT_WHEEL_SPEED_LIMIT : 4095) : clamp(Math.round(numericValue), 0, 254);
    updateMember(groupId, servoId, { [field]: nextValue });
  }

  function updateServoLinkageMemberReverse(groupId: string, servoId: number, reverse: boolean) {
    updateMember(groupId, servoId, { reverse });
  }

  function updateMember(groupId: string, servoId: number, patch: Record<string, unknown>) {
    const group = servoLinkageGroups.find((item) => item.id === groupId);
    if (!group) {
      return;
    }

    const nextGroup = {
      ...group,
      members: group.members.map((member) => (member.servoId === servoId ? { ...member, ...patch } : member))
    };
    setServoLinkageGroups((current) => current.map((item) => (item.id === groupId ? nextGroup : item)));
    syncServoLinkageTargetsToCommands(nextGroup);
  }

  function scheduleServoLinkageMove(group: ServoLinkageGroup) {
    if (!group.enabled || group.mode !== "position" || group.members.length === 0) {
      return;
    }

    pendingLinkageMoveRef.current[group.id] = group;
    if (linkageLiveTimerRef.current[group.id] !== undefined || linkageLiveSendingRef.current[group.id]) {
      return;
    }

    linkageLiveTimerRef.current[group.id] = window.setTimeout(() => {
      delete linkageLiveTimerRef.current[group.id];
      void flushServoLinkageMove(group.id);
    }, SERVO_LINKAGE_LIVE_COMMAND_DELAY_MS);
  }

  async function flushServoLinkageMove(id: string) {
    if (linkageLiveSendingRef.current[id]) {
      return;
    }

    const pending = pendingLinkageMoveRef.current[id];
    const currentGroup = servoLinkageGroupsRef.current.find((group) => group.id === id);
    if (!pending || !currentGroup?.enabled) {
      delete pendingLinkageMoveRef.current[id];
      return;
    }
    if (servoSerialQueueBusy()) {
      linkageLiveTimerRef.current[id] = window.setTimeout(() => {
        delete linkageLiveTimerRef.current[id];
        void flushServoLinkageMove(id);
      }, SERVO_LINKAGE_LIVE_COMMAND_DELAY_MS);
      return;
    }
    delete pendingLinkageMoveRef.current[id];

    linkageLiveSendingRef.current[id] = true;
    try {
      await sendServoLinkageGroup(currentGroup, true);
    } finally {
      linkageLiveSendingRef.current[id] = false;
      if (pendingLinkageMoveRef.current[id] && linkageLiveTimerRef.current[id] === undefined) {
        linkageLiveTimerRef.current[id] = window.setTimeout(() => {
          delete linkageLiveTimerRef.current[id];
          void flushServoLinkageMove(id);
        }, SERVO_LINKAGE_LIVE_COMMAND_DELAY_MS);
      }
    }
  }

  return {
    addServoLinkageGroup,
    addServoToLinkageGroup,
    flushServoLinkageMove,
    removeServoFromLinkageGroup,
    removeServoLinkageGroup,
    scheduleServoLinkageMove,
    syncServoLinkageTargetsToCommands,
    syncServoLinkageWheelTargetsToCommands,
    toggleServoLinkageGroupExpanded,
    updateServoLinkageGroupEnabled,
    updateServoLinkageGroupMode,
    updateServoLinkageGroupName,
    updateServoLinkageMaster,
    updateServoLinkageMemberNumber,
    updateServoLinkageMemberReverse,
    updateServoLinkageMemberWeight,
    updateServoLinkageWheelTurnLimit,
    updateServoLinkageWheelTurnTarget
  };
}
