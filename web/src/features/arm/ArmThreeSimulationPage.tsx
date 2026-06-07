import { Box, Orbit, Send, Square } from "lucide-react";
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
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
  type Material
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { formatServoAngle } from "../../app/appModel";
import { Metric, PanelTitle } from "../../shared/ui/AppChrome";
import { servoLogicalSpan, type ServoProfile } from "../../lib/protocol";
import type { ArmConfig, ArmJointConfig, ArmSegmentPose } from "../../lib/storage";
import { buildArmThreeModel, type ArmThreeLink, type ArmThreeModel, type ArmThreePoint } from "./armThreeModel";

interface ArmThreeSimulationPageProps {
  armConfig: ArmConfig;
  armSegmentPoses: ArmSegmentPose[];
  armServoForJoint: (joint: ArmJointConfig) => ServoProfile | undefined;
  pauseArm: () => void;
  sendArmPose: () => void;
  servoBusConnected: () => boolean;
  setArmLiveDragEnabled: (enabled: boolean) => void;
  t: TFunction;
  updateArmJoint: (id: string, updater: (joint: ArmJointConfig) => ArmJointConfig, live?: boolean) => void;
  updateArmJointNumber: (id: string, field: "lengthPx" | "angleDeg" | "neutralDeg" | "speedRaw" | "acc", value: string, live?: boolean) => void;
}

interface ArmThreeCanvasProps {
  ariaLabel: string;
  model: ArmThreeModel;
}

interface ThreeSceneHandles {
  camera: PerspectiveCamera;
  controls: OrbitControls;
  dynamicGroup: Group;
  renderer: WebGLRenderer;
  scene: Scene;
}

const linkRadius = 0.065;
const selectedLinkRadius = 0.08;
const armMaterialColors = {
  base: 0x344054,
  disabled: 0x98a2b3,
  endEffector: 0x20a46b,
  link: 0x263238,
  selected: 0x1456f0,
  joint: 0xffffff
};

export function ArmThreeSimulationPage({
  armConfig,
  armSegmentPoses,
  armServoForJoint,
  pauseArm,
  sendArmPose,
  servoBusConnected,
  setArmLiveDragEnabled,
  t,
  updateArmJoint,
  updateArmJointNumber
}: ArmThreeSimulationPageProps) {
  const model = useMemo(() => buildArmThreeModel(armConfig, armSegmentPoses), [armConfig, armSegmentPoses]);
  const enabledJointCount = armConfig.joints.filter((joint) => joint.enabled).length;

  return (
    <section className="panel arm-three-page" aria-labelledby="arm-three-title">
      <PanelTitle icon={<Box size={18} />} id="arm-three-title" meta={t("arm3d.meta")} title={t("panels.arm3dSimulation")} />
      <div className="arm-three-layout">
        <div className="arm-three-viewer">
          <ArmThreeCanvas ariaLabel={t("aria.arm3dSimulator")} model={model} />
          <div className="arm-three-hint">
            <Orbit size={16} />
            <span>{t("arm3d.orbitHint")}</span>
          </div>
        </div>
        <div className="arm-three-control-stack">
          <div className="arm-status-strip arm-three-metrics">
            <Metric label={t("metrics.members")} value={enabledJointCount} />
            <Metric label={t("metrics.activeMode")} value={armConfig.liveDragEnabled ? t("arm.live") : t("arm.preview")} tone={armConfig.liveDragEnabled ? "warning" : "neutral"} />
            <Metric label={t("metrics.serial")} value={servoBusConnected() ? t("status.online") : t("status.offline")} tone={servoBusConnected() ? "online" : "danger"} />
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
                return (
                  <div className={selected ? "arm-three-joint-row selected" : "arm-three-joint-row"} key={joint.id}>
                    <div className="arm-three-joint-head">
                      <strong>{joint.name}</strong>
                      <span>ID {joint.servoId}</span>
                    </div>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={joint.enabled}
                        onChange={(event) => updateArmJoint(joint.id, (current) => ({ ...current, enabled: event.target.checked }), true)}
                      />
                      <span>{t("fields.enabled")}</span>
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

function ArmThreeCanvas({ ariaLabel, model }: ArmThreeCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handlesRef = useRef<ThreeSceneHandles | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let resizeObserver: ResizeObserver | null = null;

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

      handlesRef.current = { camera, controls, dynamicGroup, renderer, scene };
      setRenderError(null);
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : "WebGL renderer unavailable");
    }

    return () => {
      resizeObserver?.disconnect();
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
    renderArmThreeModel(handles.dynamicGroup, model);
  }, [model]);

  return (
    <div className="arm-three-canvas-frame" ref={containerRef} role="img" aria-label={ariaLabel} data-arm-three-canvas>
      {renderError ? <div className="empty-state compact">{renderError}</div> : null}
    </div>
  );
}

function renderArmThreeModel(group: Group, model: ArmThreeModel) {
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

  const endMaterial = new MeshStandardMaterial({ color: armMaterialColors.endEffector, metalness: 0.18, roughness: 0.32 });
  const endEffector = new Mesh(new SphereGeometry(0.12, 24, 16), endMaterial);
  endEffector.position.copy(toVector(model.endEffector));
  endEffector.castShadow = true;
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
