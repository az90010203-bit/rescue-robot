declare module "three" {
  export type ColorRepresentation = number | string;
  export type ShadowMapType = number;

  export const PCFShadowMap: ShadowMapType;
  export const PCFSoftShadowMap: ShadowMapType;

  export class Vector3 {
    constructor(x?: number, y?: number, z?: number);
    x: number;
    y: number;
    z: number;
    clone(): Vector3;
    copy(vector: Vector3): this;
    normalize(): this;
    set(x: number, y: number, z: number): this;
    sub(vector: Vector3): this;
  }

  export class Quaternion {
    setFromUnitVectors(from: Vector3, to: Vector3): this;
  }

  export class Object3D {
    castShadow: boolean;
    children: Object3D[];
    position: Vector3;
    quaternion: Quaternion;
    receiveShadow: boolean;
    add(...objects: Object3D[]): this;
    remove(...objects: Object3D[]): this;
    traverse(callback: (object: Object3D) => void): void;
  }

  export class Scene extends Object3D {
    fog: Fog | null;
    clear(): void;
  }

  export class Group extends Object3D {}

  export class Camera extends Object3D {}

  export class PerspectiveCamera extends Camera {
    constructor(fov: number, aspect: number, near: number, far: number);
    aspect: number;
    updateProjectionMatrix(): void;
  }

  export class Fog {
    constructor(color: ColorRepresentation, near?: number, far?: number);
  }

  export class WebGLRenderer {
    constructor(parameters?: { alpha?: boolean; antialias?: boolean; canvas?: HTMLCanvasElement });
    domElement: HTMLCanvasElement;
    shadowMap: { enabled: boolean; type: ShadowMapType };
    dispose(): void;
    render(scene: Scene, camera: Camera): void;
    setAnimationLoop(callback: ((time: number) => void) | null): void;
    setPixelRatio(value: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
  }

  export class Light extends Object3D {}

  export class AmbientLight extends Light {
    constructor(color?: ColorRepresentation, intensity?: number);
  }

  export class DirectionalLight extends Light {
    constructor(color?: ColorRepresentation, intensity?: number);
  }

  export class GridHelper extends Object3D {
    constructor(size?: number, divisions?: number, colorCenterLine?: ColorRepresentation, colorGrid?: ColorRepresentation);
  }

  export class BufferGeometry {
    dispose(): void;
  }

  export class CylinderGeometry extends BufferGeometry {
    constructor(radiusTop?: number, radiusBottom?: number, height?: number, radialSegments?: number);
  }

  export class SphereGeometry extends BufferGeometry {
    constructor(radius?: number, widthSegments?: number, heightSegments?: number);
  }

  export class Material {
    dispose(): void;
  }

  export class MeshStandardMaterial extends Material {
    constructor(parameters?: {
      color?: ColorRepresentation;
      emissive?: ColorRepresentation;
      emissiveIntensity?: number;
      metalness?: number;
      roughness?: number;
    });
  }

  export class Mesh<
    TGeometry extends BufferGeometry = BufferGeometry,
    TMaterial extends Material | Material[] = Material | Material[]
  > extends Object3D {
    constructor(geometry?: TGeometry, material?: TMaterial);
    geometry: TGeometry;
    material: TMaterial;
  }
}

declare module "three/examples/jsm/controls/OrbitControls.js" {
  import { Camera, Vector3, WebGLRenderer } from "three";

  export class OrbitControls {
    constructor(camera: Camera, domElement: WebGLRenderer["domElement"]);
    enableDamping: boolean;
    maxDistance: number;
    minDistance: number;
    target: Vector3;
    dispose(): void;
    update(): void;
  }
}
