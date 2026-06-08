import {
  buildMotorSetCommand,
  buildMotorStopCommand,
  clamp,
  normalizeMotorChannel,
  type PcCommand
} from "@adapters/hardware/protocol";
import { calculateMotorLinkageTargets, type MotorLinkageGroup } from "@adapters/persistence/storage";
import { nextMotorLinkageGroupName } from "@app/appModel";

interface UseMotorLinkageRuntimeOptions {
  addSystemLog: (messageKey: string, level?: any, values?: any) => void;
  cancelMotorLinkageMove: (id?: string) => void;
  connected: boolean;
  connectionMode: string | null;
  motorLinkageGenerationRef: { current: Record<string, number> };
  motorLinkageGroups: MotorLinkageGroup[];
  motorLinkageGroupsRef: { current: MotorLinkageGroup[] };
  motorLinkageLiveSendingRef: { current: Record<string, boolean> };
  motorLinkageLiveTimerRef: { current: Record<string, number> };
  motors: Array<{ channel: string; name: string }>;
  nextSeq: () => number;
  pendingMotorLinkageMoveRef: { current: Record<string, MotorLinkageGroup> };
  sendMotorCommandBatch: (commands: PcCommand[], options?: { log?: boolean; shouldRun?: () => boolean }) => Promise<boolean>;
  setExpandedMotorLinkageGroupIds: (updater: (current: Set<string>) => Set<string>) => void;
  setMotorLinkageGroups: (updater: (current: MotorLinkageGroup[]) => MotorLinkageGroup[]) => void;
  stopMode: "coast" | "brake";
}

export function useMotorLinkageRuntime({
  addSystemLog,
  cancelMotorLinkageMove,
  connected,
  connectionMode,
  motorLinkageGenerationRef,
  motorLinkageGroups,
  motorLinkageGroupsRef,
  motorLinkageLiveSendingRef,
  motorLinkageLiveTimerRef,
  motors,
  nextSeq,
  pendingMotorLinkageMoveRef,
  sendMotorCommandBatch,
  setExpandedMotorLinkageGroupIds,
  setMotorLinkageGroups,
  stopMode
}: UseMotorLinkageRuntimeOptions) {
  function addMotorLinkageGroup() {
    setMotorLinkageGroups((current) => {
      const name = nextMotorLinkageGroupName(current);
      return [
        ...current,
        {
          id: `motor-linkage-${Date.now().toString(36)}-${current.length + 1}`,
          name,
          enabled: false,
          masterSpeedPercent: 0,
          members: []
        }
      ];
    });
  }

  function removeMotorLinkageGroup(id: string) {
    cancelMotorLinkageMove(id);
    setExpandedMotorLinkageGroupIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setMotorLinkageGroups((current) => current.filter((group) => group.id !== id));
  }

  function updateMotorLinkageGroupName(id: string, name: string) {
    setMotorLinkageGroups((current) => current.map((group) => (group.id === id ? { ...group, name } : group)));
  }

  function toggleMotorLinkageGroupExpanded(id: string) {
    setExpandedMotorLinkageGroupIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function updateMotorLinkageGroupEnabled(id: string, enabled: boolean) {
    const group = motorLinkageGroups.find((item) => item.id === id);
    if (!group) {
      return;
    }

    if (!enabled) {
      cancelMotorLinkageMove(id);
      void stopMotorLinkageGroup(group, true);
    }
    setMotorLinkageGroups((current) => current.map((item) => (item.id === id ? { ...item, enabled } : item)));
  }

  function updateMotorLinkageMaster(id: string, value: string, live = true) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    const group = motorLinkageGroups.find((item) => item.id === id);
    if (!group) {
      return;
    }

    const nextGroup = { ...group, masterSpeedPercent: clamp(numericValue, -100, 100) };
    setMotorLinkageGroups((current) => current.map((item) => (item.id === id ? nextGroup : item)));
    if (live && nextGroup.enabled) {
      scheduleMotorLinkageMove(nextGroup);
    }
  }

  function addMotorToLinkageGroup(groupId: string, value: string) {
    const channel = normalizeMotorChannel(value);
    const group = motorLinkageGroups.find((item) => item.id === groupId);
    if (!group || !motors.some((motor) => motor.channel === channel) || group.members.some((member) => member.channel === channel)) {
      return;
    }

    const nextGroup = {
      ...group,
      members: [...group.members, { channel, weightPercent: 100, reverse: false }]
    };
    setMotorLinkageGroups((current) => current.map((item) => (item.id === groupId ? nextGroup : item)));
    if (nextGroup.enabled) {
      scheduleMotorLinkageMove(nextGroup);
    }
  }

  function removeMotorFromLinkageGroup(groupId: string, channel: string) {
    const normalized = normalizeMotorChannel(channel);
    setMotorLinkageGroups((current) =>
      current.map((group) => (group.id === groupId ? { ...group, members: group.members.filter((member) => member.channel !== normalized) } : group))
    );
  }

  function updateMotorLinkageMemberWeight(groupId: string, channel: string, value: string) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    const normalized = normalizeMotorChannel(channel);
    const group = motorLinkageGroups.find((item) => item.id === groupId);
    if (!group) {
      return;
    }

    const nextGroup = {
      ...group,
      members: group.members.map((member) => (member.channel === normalized ? { ...member, weightPercent: clamp(numericValue, 0, 100) } : member))
    };
    setMotorLinkageGroups((current) => current.map((item) => (item.id === groupId ? nextGroup : item)));
    if (nextGroup.enabled) {
      scheduleMotorLinkageMove(nextGroup);
    }
  }

  function updateMotorLinkageMemberReverse(groupId: string, channel: string, reverse: boolean) {
    const normalized = normalizeMotorChannel(channel);
    const group = motorLinkageGroups.find((item) => item.id === groupId);
    if (!group) {
      return;
    }

    const nextGroup = {
      ...group,
      members: group.members.map((member) => (member.channel === normalized ? { ...member, reverse } : member))
    };
    setMotorLinkageGroups((current) => current.map((item) => (item.id === groupId ? nextGroup : item)));
    if (nextGroup.enabled) {
      scheduleMotorLinkageMove(nextGroup);
    }
  }

  async function sendMotorLinkageGroup(group: MotorLinkageGroup, live = false, generation?: number) {
    const targets = calculateMotorLinkageTargets(group, motors);
    if (targets.length === 0) {
      if (!live) {
        addSystemLog("logs.motorLinkageNoTargets", "warn");
      }
      return false;
    }
    if (!connected || connectionMode === "servo-bus") {
      if (!live) {
        addSystemLog("logs.motorDebugRequired", "warn");
      }
      return false;
    }

    try {
      const sent = await sendMotorCommandBatch(
        targets.map((target) => buildMotorSetCommand(nextSeq(), { channel: target.channel, speedPercent: target.speedPercent, stopMode })),
        {
          log: !live,
          shouldRun: live && generation !== undefined ? () => (motorLinkageGenerationRef.current[group.id] ?? 0) === generation : undefined
        }
      );
      if (sent && !live) {
        addSystemLog("logs.motorLinkageCommandSent");
      }
      return sent;
    } catch {
      if (!live) {
        addSystemLog("logs.motorCommandInvalid", "error");
      }
      return false;
    }
  }

  async function stopMotorLinkageGroup(group: MotorLinkageGroup, quiet = false) {
    cancelMotorLinkageMove(group.id);
    const targets = calculateMotorLinkageTargets(group, motors);
    if (targets.length === 0) {
      if (!quiet) {
        addSystemLog("logs.motorLinkageNoTargets", "warn");
      }
      return false;
    }
    if (!connected || connectionMode === "servo-bus") {
      if (!quiet) {
        addSystemLog("logs.serialDisconnected", "warn");
      }
      setMotorLinkageGroups((current) => current.map((item) => (item.id === group.id ? { ...item, masterSpeedPercent: 0 } : item)));
      return false;
    }

    const sent = await sendMotorCommandBatch(
      targets.map((target) => buildMotorStopCommand(nextSeq(), { channel: target.channel, stopMode })),
      { log: !quiet }
    );
    setMotorLinkageGroups((current) => current.map((item) => (item.id === group.id ? { ...item, masterSpeedPercent: 0 } : item)));
    if (sent && !quiet) {
      addSystemLog("logs.motorLinkageStopped");
    }
    return sent;
  }

  function scheduleMotorLinkageMove(group: MotorLinkageGroup) {
    if (!group.enabled || group.members.length === 0) {
      return;
    }

    pendingMotorLinkageMoveRef.current[group.id] = group;
    if (motorLinkageLiveTimerRef.current[group.id] !== undefined || motorLinkageLiveSendingRef.current[group.id]) {
      return;
    }

    motorLinkageLiveTimerRef.current[group.id] = window.setTimeout(() => {
      delete motorLinkageLiveTimerRef.current[group.id];
      void flushMotorLinkageMove(group.id);
    }, 60);
  }

  async function flushMotorLinkageMove(id: string) {
    if (motorLinkageLiveSendingRef.current[id]) {
      return;
    }

    const pending = pendingMotorLinkageMoveRef.current[id];
    delete pendingMotorLinkageMoveRef.current[id];
    const latestGroup = motorLinkageGroupsRef.current.find((group) => group.id === id);
    const currentGroup = pending ?? latestGroup;
    const generation = motorLinkageGenerationRef.current[id] ?? 0;
    if (!pending || !currentGroup?.enabled || latestGroup?.enabled === false) {
      return;
    }

    motorLinkageLiveSendingRef.current[id] = true;
    try {
      await sendMotorLinkageGroup(currentGroup, true, generation);
    } finally {
      motorLinkageLiveSendingRef.current[id] = false;
      if (pendingMotorLinkageMoveRef.current[id] && motorLinkageLiveTimerRef.current[id] === undefined) {
        motorLinkageLiveTimerRef.current[id] = window.setTimeout(() => {
          delete motorLinkageLiveTimerRef.current[id];
          void flushMotorLinkageMove(id);
        }, 60);
      }
    }
  }

  return {
    addMotorLinkageGroup,
    addMotorToLinkageGroup,
    flushMotorLinkageMove,
    removeMotorFromLinkageGroup,
    removeMotorLinkageGroup,
    scheduleMotorLinkageMove,
    sendMotorLinkageGroup,
    stopMotorLinkageGroup,
    toggleMotorLinkageGroupExpanded,
    updateMotorLinkageGroupEnabled,
    updateMotorLinkageGroupName,
    updateMotorLinkageMaster,
    updateMotorLinkageMemberReverse,
    updateMotorLinkageMemberWeight
  };
}
