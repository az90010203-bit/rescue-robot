import { Box, ListPlus, Orbit, Send, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import {
  AmbientLight,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  GridHelper,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { formatServoAngle } from "@app/appModel";
import { Metric, PanelTitle } from "@shared/ui/AppChrome";
import { servoLogicalSpan, type ServoProfile } from "@adapters/hardware/protocol";
import {
  ARM_MAX_JOINT_LENGTH_PX,
  ARM_MIN_JOINT_LENGTH_PX,
  armJointShapeSegments,
  type ArmConfig,
  type ArmJointConfig,
  type ArmPoint,
  type ArmSegmentPose
} from "@adapters/persistence/storage";
import { solvePlanarIk, type ArmIkSolution } from "@domains/arm/armKinematics";
import { buildArmThreeModel, threePointToArmPoint, type ArmThreeLink, type ArmThreeModel, type ArmThreePoint } from "@domains/arm/armThreeModel";

interface ArmThreeSimulationPageProps {
  addArmJoint: () => void;
  applyArmConfig: (config: ArmConfig, live?: boolean) => void;
  armConfig: ArmConfig;
  armSegmentPoses: ArmSegmentPose[];
  armServoForJoint: (joint: ArmJointConfig) => ServoProfile | undefined;
  pauseArm: () => void | Promise<void>;
  primeArmForMotion: () => Promise<boolean>;
  sendArmPose: () => void;
  servos: ServoProfile[];
  servoBusConnected: () => boolean;
  setArmLiveDragEnabled: (enabled: boolean) => void;
  t: TFunction;
  updateArmJoint: (id: string, updater: (joint: ArmJointConfig) => ArmJointConfig, live?: boolean) => void;
  updateArmJointNumber: (id: string, field: "lengthPx" | "angleDeg" | "neutralDeg" | "speedRaw" | "acc", value: string, live?: boolean) => void;
  updateArmJointServo: (id: string, servoId: number) => void;
}

interface ArmThreeCanvasProps {
  ariaLabel: string;
  endEffectorDraggable: boolean;
  model: ArmThreeModel;
  onEndEffectorDragEnd: () => void;
  onEndEffectorDragMove: (target: ArmPoint) => void;
  onEndEffectorDragStart: (target: ArmPoint) => void;
}

interface ThreeSceneHandles {
  camera: PerspectiveCamera;
  controls: OrbitControls;
  dynamicGroup: Group;
  renderer: WebGLRenderer;
  scene: Scene;
}

interface ArmThreeCanvasCallbacks {
  endEffectorDraggable: boolean;
  model: ArmThreeModel;
  onEndEffectorDragEnd: () => void;
  onEndEffectorDragMove: (target: ArmPoint) => void;
  onEndEffectorDragStart: (target: ArmPoint) => void;
}

interface ArmThreeTrajectoryJointSample {
  jointId: string;
  logicalAngleDeg: number;
  servoId: number;
}

interface ArmThreeTrajectorySample {
  joints: ArmThreeTrajectoryJointSample[];
  tMs: number;
}

const linkRadius = 0.065;
const selectedLinkRadius = 0.08;
const endEffectorRadius = 0.12;
const selectedEndEffectorRadius = 0.15;
const armThreeTrajectorySampleIntervalMs = 100;
const maxArmThreeTrajectorySamples = 1200;
const armMaterialColors = {
  base: 0x344054,
  disabled: 0x98a2b3,
  endEffector: 0x20a46b,
  endEffectorActive: 0x12b76a,
  link: 0x263238,
  selected: 0x1456f0,
  joint: 0xffffff
};

export function ArmThreeSimulationPage({
  addArmJoint,
  applyArmConfig,
  armConfig,
  armSegmentPoses,
  armServoForJoint,
  pauseArm,
  primeArmForMotion,
  sendArmPose,
  servos,
  servoBusConnected,
  setArmLiveDragEnabled,
  t,
  updateArmJoint,
  updateArmJointNumber,
  updateArmJointServo
}: ArmThreeSimulationPageProps) {
  const model = useMemo(() => buildArmThreeModel(armConfig, armSegmentPoses), [armConfig, armSegmentPoses]);
  const armConfigRef = useRef(armConfig);
  const dragConfigRef = useRef<ArmConfig | null>(null);
  const dragPrimingRef = useRef<Promise<boolean> | null>(null);
  const pendingDragTargetRef = useRef<{ forceSample?: boolean; target: ArmPoint } | null>(null);
  const dragStartedAtRef = useRef(0);
  const lastTrajectorySampleAtRef = useRef(0);
  const [ikSolution, setIkSolution] = useState<ArmIkSolution | null>(null);
  const [trajectorySamples, setTrajectorySamples] = useState<ArmThreeTrajectorySample[]>([]);
  const enabledJointCount = armConfig.joints.filter((joint) => joint.enabled).length;
  const canAddJoint = servos.length > armConfig.joints.length;
  const baseDirectionDeg = normalizeArmThreeSignedDirection(armConfig.baseDirectionDeg ?? 0);
  const trajectoryDurationMs = trajectorySamples[trajectorySamples.length - 1]?.tMs ?? 0;
  const ikTone = !ikSolution ? "neutral" : ikSolution.converged ? "online" : "warning";

  useEffect(() => {
    armConfigRef.current = armConfig;
  }, [armConfig]);

  function recordTrajectorySample(config: ArmConfig, force = false) {
    const now = Date.now();
    if (!force && now - lastTrajectorySampleAtRef.current < armThreeTrajectorySampleIntervalMs) {
      return;
    }
    lastTrajectorySampleAtRef.current = now;
    const sample = createArmThreeTrajectorySample(config, Math.max(0, now - dragStartedAtRef.current), servos);
    setTrajectorySamples((current) => [...current, sample].slice(-maxArmThreeTrajectorySamples));
  }

  function solveEndEffectorTarget(target: ArmPoint, options: { forceSample?: boolean } = {}) {
    if (dragPrimingRef.current) {
      pendingDragTargetRef.current = { forceSample: options.forceSample, target };
      return;
    }
    const baseConfig = dragConfigRef.current ?? armConfigRef.current;
    if (baseConfig.joints.length === 0) {
      return;
    }
    const solution = solvePlanarIk(baseConfig, target, { servos });
    const nextConfig = { ...solution.config, liveDragEnabled: armConfigRef.current.liveDragEnabled };
    dragConfigRef.current = nextConfig;
    armConfigRef.current = nextConfig;
    setIkSolution({ ...solution, config: nextConfig });
    applyArmConfig(nextConfig, true);
    recordTrajectorySample(nextConfig, options.forceSample);
  }

  function handleEndEffectorDragStart(target: ArmPoint) {
    dragStartedAtRef.current = Date.now();
    lastTrajectorySampleAtRef.current = 0;
    dragConfigRef.current = armConfigRef.current;
    setTrajectorySamples([]);
    const prime = primeLiveDragFromHardware();
    if (prime) {
      dragPrimingRef.current = prime;
      pendingDragTargetRef.current = { forceSample: true, target };
      void prime.then((canContinue) => {
        if (dragPrimingRef.current !== prime) {
          return;
        }
        dragPrimingRef.current = null;
        const pending = pendingDragTargetRef.current;
        pendingDragTargetRef.current = null;
        if (canContinue && pending) {
          solveEndEffectorTarget(pending.target, { forceSample: pending.forceSample });
        }
      });
      return;
    }
    solveEndEffectorTarget(target, { forceSample: true });
  }

  function primeLiveDragFromHardware() {
    if (!armConfigRef.current.liveDragEnabled || !servoBusConnected()) {
      return null;
    }
    try {
      return primeArmForMotion().catch(() => false);
    } catch {
      return Promise.resolve(false);
    }
  }

  function handleEndEffectorDragEnd() {
    dragPrimingRef.current = null;
    pendingDragTargetRef.current = null;
    dragConfigRef.current = null;
    dragStartedAtRef.current = 0;
    lastTrajectorySampleAtRef.current = 0;
  }

  function clearArmThreeIkState() {
    dragPrimingRef.current = null;
    pendingDragTargetRef.current = null;
    dragConfigRef.current = null;
    dragStartedAtRef.current = 0;
    lastTrajectorySampleAtRef.current = 0;
    setIkSolution(null);
    setTrajectorySamples([]);
  }

  function updateArmBaseDirectionNumber(value: string) {
    if (value.trim() === "") {
      return;
    }
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }
    const nextConfig = {
      ...armConfigRef.current,
      baseDirectionDeg: normalizeArmThreeSignedDirection(numericValue)
    };
    armConfigRef.current = nextConfig;
    clearArmThreeIkState();
    applyArmConfig(nextConfig, false);
  }

  function updateArmJointStartDirectionNumber(jointId: string, value: string) {
    if (value.trim() === "") {
      return;
    }
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }
    const nextConfig = {
      ...armConfigRef.current,
      selectedJointId: jointId,
      joints: armConfigRef.current.joints.map((joint) => {
        if (joint.id !== jointId) {
          return joint;
        }
        const shapeSegments = armJointShapeSegments(joint).map((segment, index) =>
          index === 0 ? { ...segment, directionDeg: normalizeArmThreeSignedDirection(numericValue) } : segment
        );
        return { ...joint, lengthPx: shapeSegments[0]?.lengthPx ?? joint.lengthPx, shapeSegments };
      })
    };
    armConfigRef.current = nextConfig;
    clearArmThreeIkState();
    applyArmConfig(nextConfig, false);
  }

  function updateArmJointLengthNumber(jointId: string, value: string) {
    if (value.trim() === "") {
      return;
    }
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }
    clearArmThreeIkState();
    updateArmJointNumber(jointId, "lengthPx", value);
  }

  return (
    <section className="panel arm-three-page" aria-labelledby="arm-three-title">
      <PanelTitle icon={<Box size={18} />} id="arm-three-title" meta={t("arm3d.meta")} title={t("panels.arm3dSimulation")} />
      <div className="arm-three-layout">
        <div className="arm-three-viewer">
          <ArmThreeCanvas
            ariaLabel={t("aria.arm3dSimulator")}
            endEffectorDraggable={!model.isEmpty}
            model={model}
            onEndEffectorDragEnd={handleEndEffectorDragEnd}
            onEndEffectorDragMove={solveEndEffectorTarget}
            onEndEffectorDragStart={handleEndEffectorDragStart}
          />
          <div className="arm-three-hint">
            <Orbit size={16} />
            <span>{t("arm3d.orbitHint")}</span>
          </div>
        </div>
        <div className="arm-three-control-stack">
          <div className="arm-status-strip arm-three-metrics">
            <Metric label={t("metrics.members")} value={enabledJointCount} />
            <Metric label={t("module.servo")} value={servos.length} />
            <Metric label={t("metrics.activeMode")} value={armConfig.liveDragEnabled ? t("arm.live") : t("arm.preview")} tone={armConfig.liveDragEnabled ? "warning" : "neutral"} />
            <Metric label={t("metrics.serial")} value={servoBusConnected() ? t("status.online") : t("status.offline")} tone={servoBusConnected() ? "online" : "danger"} />
          </div>
          <label className="arm-three-angle-field arm-three-base-direction">
            <span>{t("fields.baseDirection")}</span>
            <div className="range-number-control">
              <input
                type="range"
                min={-180}
                max={180}
                step={1}
                value={formatArmThreeNumber(baseDirectionDeg)}
                onChange={(event) => updateArmBaseDirectionNumber(event.target.value)}
              />
              <input
                type="number"
                min={-180}
                max={180}
                step={1}
                value={formatArmThreeNumber(baseDirectionDeg)}
                onChange={(event) => updateArmBaseDirectionNumber(event.target.value)}
              />
            </div>
          </label>
          <div className="arm-status-strip arm-three-ik-metrics">
            <Metric label={t("metrics.ikError")} value={ikSolution ? formatArmThreeNumber(ikSolution.errorPx) : "--"} suffix={ikSolution ? " px" : ""} tone={ikTone} />
            <Metric label={t("metrics.reachable")} value={ikSolution ? t(ikSolution.reachable ? "common.yes" : "common.no") : "--"} tone={ikTone} />
            <Metric label={t("architecture.armComponent.ik.movedJoints")} value={ikSolution?.movedJointIds.length ?? "--"} tone={ikTone} />
            <Metric label={t("armTeach.metrics.samples")} value={trajectorySamples.length} />
            <Metric label={t("armTeach.metrics.duration")} value={formatTrajectoryDuration(trajectoryDurationMs)} />
          </div>
          <div className="action-grid arm-three-add-actions">
            <button className="icon-button primary" disabled={!canAddJoint} onClick={addArmJoint} type="button">
              <ListPlus size={18} />
              <span>{t("actions.addArmJoint")}</span>
            </button>
          </div>
          <label className="checkbox-field arm-live-toggle">
            <input type="checkbox" checked={armConfig.liveDragEnabled} onChange={(event) => setArmLiveDragEnabled(event.target.checked)} />
            <span>{t("fields.liveDrag")}</span>
          </label>
          <div className="arm-three-joint-list" aria-label={t("arm3d.jointControls")}>
            {armConfig.joints.length === 0 ? (
              <div className="empty-state compact">{t("empty.noArmJoints")}</div>
            ) : (
              armConfig.joints.map((joint) => {
                const servo = armServoForJoint(joint);
                const logicalSpan = servo ? servoLogicalSpan(servo) : 360;
                const selected = armConfig.selectedJointId === joint.id;
                const usedServoIds = new Set(armConfig.joints.filter((item) => item.id !== joint.id).map((item) => item.servoId));
                const startDirectionDeg = normalizeArmThreeSignedDirection(armJointShapeSegments(joint)[0]?.directionDeg ?? 0);
                return (
                  <div className={selected ? "arm-three-joint-row selected" : "arm-three-joint-row"} key={joint.id}>
                    <div className="arm-three-joint-head">
                      <strong>{joint.name}</strong>
                      <span>{servo ? `${servo.name} / ID ${servo.id}` : `ID ${joint.servoId}`}</span>
                    </div>
                    <label className="arm-three-servo-field">
                      <span>{t("fields.targetServo")}</span>
                      <select value={joint.servoId} onChange={(event) => updateArmJointServo(joint.id, Number(event.target.value))}>
                        {servos.map((item) => (
                          <option key={item.id} value={item.id} disabled={usedServoIds.has(item.id)}>
                            ID {item.id} / {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={joint.enabled}
                        onChange={(event) => updateArmJoint(joint.id, (current) => ({ ...current, enabled: event.target.checked }), true)}
                      />
                      <span>{t("fields.enabled")}</span>
                    </label>
                    <label className="arm-three-angle-field arm-three-joint-start-direction">
                      <span>{t("fields.jointStartDirection")}</span>
                      <div className="range-number-control">
                        <input
                          type="range"
                          min={-180}
                          max={180}
                          step={1}
                          value={formatArmThreeNumber(startDirectionDeg)}
                          onChange={(event) => updateArmJointStartDirectionNumber(joint.id, event.target.value)}
                        />
                        <input
                          type="number"
                          min={-180}
                          max={180}
                          step={1}
                          value={formatArmThreeNumber(startDirectionDeg)}
                          onChange={(event) => updateArmJointStartDirectionNumber(joint.id, event.target.value)}
                        />
                      </div>
                    </label>
                    <label className="arm-three-angle-field arm-three-joint-length">
                      <span>{t("fields.segmentLength")}</span>
                      <div className="range-number-control">
                        <input
                          type="range"
                          min={ARM_MIN_JOINT_LENGTH_PX}
                          max={ARM_MAX_JOINT_LENGTH_PX}
                          step={1}
                          value={joint.lengthPx}
                          onChange={(event) => updateArmJointLengthNumber(joint.id, event.target.value)}
                        />
                        <input
                          type="number"
                          min={ARM_MIN_JOINT_LENGTH_PX}
                          max={ARM_MAX_JOINT_LENGTH_PX}
                          step={1}
                          value={joint.lengthPx}
                          onChange={(event) => updateArmJointLengthNumber(joint.id, event.target.value)}
                        />
                      </div>
                    </label>
                    <label className="arm-three-angle-field">
                      <span>{t("fields.angleDeg")}</span>
                      <div className="range-number-control">
                        <input
                          type="range"
                          min={0}
                          max={logicalSpan}
                          step={1}
                          value={joint.angleDeg}
                          onChange={(event) => updateArmJointNumber(joint.id, "angleDeg", event.target.value, true)}
                        />
                        <input
                          type="number"
                          min={0}
                          max={logicalSpan}
                          step={1}
                          value={formatServoAngle(joint.angleDeg)}
                          onChange={(event) => updateArmJointNumber(joint.id, "angleDeg", event.target.value, true)}
                        />
                      </div>
                    </label>
                  </div>
                );
              })
            )}
          </div>
          <div className="action-grid arm-three-actions">
            <button className="icon-button primary" disabled={model.isEmpty} onClick={sendArmPose} type="button">
              <Send size={18} />
              <span>{t("actions.sendArmPose")}</span>
            </button>
            <button className="icon-button danger" onClick={pauseArm} type="button">
              <Square size={18} />
              <span>{t("actions.pauseArm")}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ArmThreeCanvas({
  ariaLabel,
  endEffectorDraggable,
  model,
  onEndEffectorDragEnd,
  onEndEffectorDragMove,
  onEndEffectorDragStart
}: ArmThreeCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handlesRef = useRef<ThreeSceneHandles | null>(null);
  const callbacksRef = useRef<ArmThreeCanvasCallbacks>({
    endEffectorDraggable,
    model,
    onEndEffectorDragEnd,
    onEndEffectorDragMove,
    onEndEffectorDragStart
  });
  const draggingRef = useRef(false);
  const [isDraggingEndEffector, setIsDraggingEndEffector] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    callbacksRef.current = {
      endEffectorDraggable,
      model,
      onEndEffectorDragEnd,
      onEndEffectorDragMove,
      onEndEffectorDragStart
    };
  }, [endEffectorDraggable, model, onEndEffectorDragEnd, onEndEffectorDragMove, onEndEffectorDragStart]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let resizeObserver: ResizeObserver | null = null;
    let removePointerListeners: (() => void) | null = null;

    try {
      const scene = new Scene();
      scene.fog = new Fog(0xf7f9fc, 8, 16);

      const camera = new PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.set(0, 2.7, 6.8);

      const renderer = new WebGLRenderer({ alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = PCFShadowMap;
      renderer.domElement.className = "arm-three-canvas";
      container.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.maxDistance = 11;
      controls.minDistance = 2.4;
      controls.target.set(0, 0.65, 0);
      controls.update();

      const ambientLight = new AmbientLight(0xffffff, 1.6);
      scene.add(ambientLight);

      const keyLight = new DirectionalLight(0xffffff, 2.3);
      keyLight.position.set(4, 6, 5);
      keyLight.castShadow = true;
      scene.add(keyLight);

      const fillLight = new DirectionalLight(0x9db7ff, 0.9);
      fillLight.position.set(-5, 3, -4);
      scene.add(fillLight);

      const grid = new GridHelper(8, 16, 0x98a2b3, 0xd0d5dd);
      grid.position.y = -0.46;
      scene.add(grid);

      const dynamicGroup = new Group();
      scene.add(dynamicGroup);
      const raycaster = new Raycaster();
      const pointer = new Vector2();
      const dragPlane = new Plane(new Vector3(0, 0, 1), 0);
      const planeTarget = new Vector3();

      const resize = () => {
        const { clientHeight, clientWidth } = container;
        const width = Math.max(1, clientWidth);
        const height = Math.max(1, clientHeight);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      };

      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
      resize();

      renderer.setAnimationLoop(() => {
        controls.update();
        renderer.render(scene, camera);
      });

      const updatePointer = (event: PointerEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
        pointer.y = -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
        raycaster.setFromCamera(pointer, camera);
      };

      const pointerTarget = (event: PointerEvent): ArmPoint | null => {
        updatePointer(event);
        const point = raycaster.ray.intersectPlane(dragPlane, planeTarget);
        return point ? threePointToArmPoint(point) : null;
      };

      const isEndEffectorPointerHit = (event: PointerEvent) => {
        updatePointer(event);
        return raycaster
          .intersectObjects(dynamicGroup.children, true)
          .some((hit) => hit.object.userData.armThreeRole === "endEffector");
      };

      const finishDrag = () => {
        if (!draggingRef.current) {
          return;
        }
        draggingRef.current = false;
        controls.enabled = true;
        setIsDraggingEndEffector(false);
        callbacksRef.current.onEndEffectorDragEnd();
      };

      const handlePointerDown = (event: PointerEvent) => {
        if (!callbacksRef.current.endEffectorDraggable || callbacksRef.current.model.isEmpty || !isEndEffectorPointerHit(event)) {
          return;
        }
        const target = pointerTarget(event);
        if (!target) {
          return;
        }
        event.preventDefault();
        draggingRef.current = true;
        controls.enabled = false;
        setIsDraggingEndEffector(true);
        renderer.domElement.setPointerCapture?.(event.pointerId);
        callbacksRef.current.onEndEffectorDragStart(target);
      };

      const handlePointerMove = (event: PointerEvent) => {
        if (!draggingRef.current) {
          return;
        }
        const target = pointerTarget(event);
        if (target) {
          event.preventDefault();
          callbacksRef.current.onEndEffectorDragMove(target);
        }
      };

      const handlePointerEnd = (event: PointerEvent) => {
        if (draggingRef.current) {
          renderer.domElement.releasePointerCapture?.(event.pointerId);
        }
        finishDrag();
      };

      const handlePointerLeave = (event: PointerEvent) => {
        if (event.buttons === 0) {
          finishDrag();
        }
      };

      renderer.domElement.addEventListener("pointerdown", handlePointerDown);
      renderer.domElement.addEventListener("pointermove", handlePointerMove);
      renderer.domElement.addEventListener("pointerup", handlePointerEnd);
      renderer.domElement.addEventListener("pointercancel", handlePointerEnd);
      renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
      removePointerListeners = () => {
        renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
        renderer.domElement.removeEventListener("pointermove", handlePointerMove);
        renderer.domElement.removeEventListener("pointerup", handlePointerEnd);
        renderer.domElement.removeEventListener("pointercancel", handlePointerEnd);
        renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
      };

      handlesRef.current = { camera, controls, dynamicGroup, renderer, scene };
      setRenderError(null);
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : "WebGL renderer unavailable");
    }

    return () => {
      resizeObserver?.disconnect();
      removePointerListeners?.();
      const handles = handlesRef.current;
      if (!handles) {
        return;
      }
      handles.renderer.setAnimationLoop(null);
      handles.controls.dispose();
      disposeObject(handles.dynamicGroup);
      handles.scene.clear();
      if (handles.renderer.domElement.parentElement === container) {
        container.removeChild(handles.renderer.domElement);
      }
      handles.renderer.dispose();
      handlesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handles = handlesRef.current;
    if (!handles) {
      return;
    }
    renderArmThreeModel(handles.dynamicGroup, model, { endEffectorDragging: isDraggingEndEffector });
  }, [isDraggingEndEffector, model]);

  return (
    <div
      className={isDraggingEndEffector ? "arm-three-canvas-frame dragging" : "arm-three-canvas-frame"}
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      data-arm-three-canvas
      data-arm-three-dragging={isDraggingEndEffector ? "true" : "false"}
    >
      {renderError ? <div className="empty-state compact">{renderError}</div> : null}
    </div>
  );
}

function renderArmThreeModel(group: Group, model: ArmThreeModel, options: { endEffectorDragging?: boolean } = {}) {
  clearGroup(group);

  const baseMaterial = new MeshStandardMaterial({ color: armMaterialColors.base, metalness: 0.32, roughness: 0.45 });
  const base = new Mesh(new CylinderGeometry(0.34, 0.44, 0.28, 28), baseMaterial);
  base.position.set(model.base.x, -0.28, model.base.z);
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  for (const link of model.links) {
    group.add(createLinkMesh(link));
  }

  for (const marker of model.jointMarkers) {
    const material = new MeshStandardMaterial({
      color: marker.selected ? armMaterialColors.selected : armMaterialColors.joint,
      emissive: marker.selected ? 0x0a2f96 : 0x000000,
      emissiveIntensity: marker.selected ? 0.18 : 0,
      metalness: 0.14,
      roughness: 0.34
    });
    const mesh = new Mesh(new SphereGeometry(marker.selected ? 0.13 : 0.1, 24, 16), material);
    mesh.position.copy(toVector(marker.point));
    mesh.castShadow = true;
    group.add(mesh);
  }

  const endMaterial = new MeshStandardMaterial({
    color: options.endEffectorDragging ? armMaterialColors.endEffectorActive : armMaterialColors.endEffector,
    emissive: options.endEffectorDragging ? 0x0f7a4b : 0x000000,
    emissiveIntensity: options.endEffectorDragging ? 0.18 : 0,
    metalness: 0.18,
    roughness: 0.32
  });
  const endEffector = new Mesh(new SphereGeometry(options.endEffectorDragging ? selectedEndEffectorRadius : endEffectorRadius, 24, 16), endMaterial);
  endEffector.position.copy(toVector(model.endEffector));
  endEffector.castShadow = true;
  endEffector.userData.armThreeRole = "endEffector";
  group.add(endEffector);
}

function createLinkMesh(link: ArmThreeLink) {
  const color = link.enabled ? (link.selected ? armMaterialColors.selected : armMaterialColors.link) : armMaterialColors.disabled;
  const material = new MeshStandardMaterial({
    color,
    metalness: link.selected ? 0.28 : 0.18,
    roughness: 0.36
  });
  const mesh = new Mesh(new CylinderGeometry(link.selected ? selectedLinkRadius : linkRadius, link.selected ? selectedLinkRadius : linkRadius, Math.max(link.length, 0.001), 24), material);
  const start = toVector(link.start);
  const end = toVector(link.end);
  const direction = end.clone().sub(start);
  mesh.position.copy(toVector(link.midpoint));
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), link.length > 0.001 ? direction.normalize() : new Vector3(1, 0, 0));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function clearGroup(group: Group) {
  for (const child of [...group.children]) {
    group.remove(child);
    disposeObject(child);
  }
}

function disposeObject(object: Object3D) {
  object.traverse((child) => {
    if (child instanceof Mesh) {
      child.geometry.dispose();
      const materials: Material[] = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        material.dispose();
      }
    }
  });
}

function toVector(point: ArmThreePoint) {
  return new Vector3(point.x, point.y, point.z);
}

function createArmThreeTrajectorySample(config: ArmConfig, tMs: number, servos: ServoProfile[]): ArmThreeTrajectorySample {
  return {
    tMs: Math.max(0, Math.round(tMs)),
    joints: config.joints.map((joint) => ({
      jointId: joint.id,
      logicalAngleDeg: clampArmThreeNumber(joint.angleDeg, 0, armThreeJointSpan(joint, servos)),
      servoId: joint.servoId
    }))
  };
}

function armThreeJointSpan(joint: ArmJointConfig, servos: ServoProfile[]) {
  const servo = servos.find((item) => item.id === joint.servoId);
  return servo ? servoLogicalSpan(servo) : 360;
}

function clampArmThreeNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function normalizeArmThreeSignedDirection(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const normalized = ((value % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

function formatArmThreeNumber(value: number) {
  return Number.isFinite(value) ? String(Math.round(value * 10) / 10) : "--";
}

function formatTrajectoryDuration(valueMs: number) {
  if (!Number.isFinite(valueMs) || valueMs <= 0) {
    return "0.0s";
  }
  return `${(valueMs / 1000).toFixed(1)}s`;
}
