import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import CONFIG_JSON from "./config/config.json";
import LOCATION from "./config/location.json";

import { initUI, type CameraMode } from "./ui/ui";
import { bindGyro } from "./controls/gyroController";
import { bindGesture } from "./controls/gestureController";

/* =====================================================
   CONFIG PARSE
===================================================== */

const CONFIG = {
  ...CONFIG_JSON,
  PITCH: {
    ...CONFIG_JSON.PITCH,
    MAX: THREE.MathUtils.degToRad(CONFIG_JSON.PITCH.MAX_DEG),
  },
};

/* =====================================================
   PREVENT DEFAULT
===================================================== */

document.body.style.touchAction = "none";

/* =====================================================
   WORLD CONSTANTS (Frontend Owned)
===================================================== */

const MAP_WIDTH = 50;
const MAP_HEIGHT = 50;

const WORLD_WIDTH = 20;
const WORLD_DEPTH = 20;

const FLOOR_HEIGHT = 0;

/* =====================================================
   CORE 3D SETUP
===================================================== */

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaec6cf);
scene.add(new THREE.AxesHelper(2));
scene.add(new THREE.AmbientLight(0xfffff0, 1));

const camera = new THREE.PerspectiveCamera(
  CONFIG.FOV.MIN,
  window.innerWidth / window.innerHeight,
  0.1,
  5000
);

camera.position.set(0, CONFIG.HEIGHT.MIN, 0);

const BASE_ROTATION = new THREE.Euler(0, 0, 0, "YXZ");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(50, 100, 50);
scene.add(dirLight);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));

/* =====================================================
   STATE
===================================================== */

let targetZoom = 1;
let targetYaw = 0;
let currentYaw = 0;

let targetPitch = 0;
let targetHeight = CONFIG.HEIGHT.MIN;
let targetFov = CONFIG.FOV.MIN;

let debugGyroAlpha: number | null = null;
let cameraMode: CameraMode = "GYRO";

/* =====================================================
   UTILS
===================================================== */

const TWO_PI = Math.PI * 2;

function normalizeAngle(rad: number) {
  return ((rad + Math.PI) % TWO_PI) - Math.PI;
}

function wrapDeg360(deg: number) {
  return ((deg % 360) + 360) % 360;
}

function damp(current: number, target: number, lambda: number, dt: number) {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

function shortestAngleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function dampAngle(current: number, target: number, lambda: number, dt: number) {
  const delta = shortestAngleDelta(current, target);
  return current + delta * (1 - Math.exp(-lambda * dt));
}

/* =====================================================
   MAPPING
===================================================== */

function mapToWorld(dbX: number, dbY: number, floor: number) {
  const worldX = (dbX / MAP_WIDTH) * WORLD_WIDTH - WORLD_WIDTH / 2;
  const worldZ = (dbY / MAP_HEIGHT) * WORLD_DEPTH - WORLD_DEPTH / 2;
  const worldY = floor * FLOOR_HEIGHT;

  return new THREE.Vector3(worldX, worldY, worldZ);
}

function loadFloorModel(floor: number) {
  const path = `/models/f${floor}.glb`;

  new GLTFLoader().load(path, (gltf) => {
    gltf.scene.position.y = floor * FLOOR_HEIGHT;
    scene.add(gltf.scene);
  });
}

function placeLocationFromBackend() {
  const { x, y, floor } = LOCATION;

  loadFloorModel(floor);

  const pos = mapToWorld(x, y, floor);

  // ใช้ตำแหน่งจาก DB เป็นตำแหน่งกล้อง
  camera.position.set(
    pos.x,
    CONFIG.HEIGHT.MIN,
    pos.z
  );

  // ถ้าต้องการให้กล้องมองลงพื้นเสมอ
  // camera.lookAt(pos.x, 0, pos.z);
}



/* =====================================================
   CONTROLLERS
===================================================== */

bindGyro({
  isActive: () => cameraMode === "GYRO",
  setTargetYaw: (yaw) => (targetYaw = yaw),
  setDebugAlpha: (alpha) => (debugGyroAlpha = alpha),
});

bindGesture({
  isActive: () => cameraMode === "GESTURE",
  getZoom: () => targetZoom,
  setZoom: (z) => (targetZoom = z),
  addYaw: (delta) => (targetYaw += delta),
  zoomConfig: {
    MIN: CONFIG.ZOOM.MIN,
    MAX: CONFIG.ZOOM.MAX,
  },
  panSens: CONFIG.PAN.SENS,
  deadzone: CONFIG.PAN.DEADZONE,
});

/* =====================================================
   UI
===================================================== */

const ui = initUI({
  getMode: () => cameraMode,

  toggleMode: () =>
    (cameraMode = cameraMode === "GYRO" ? "GESTURE" : "GYRO"),

  getDebugInfo: () => {
    const yawDeg = wrapDeg360(
      THREE.MathUtils.radToDeg(currentYaw)
    );

    return (
      `ZOOM: ${camera.zoom.toFixed(2)}\n` +
      `HEIGHT: ${camera.position.y.toFixed(1)}\n` +
      `YAW: ${yawDeg.toFixed(1)}°\n` +
      `GYRO α: ${
        debugGyroAlpha == null
          ? "N/A"
          : wrapDeg360(
              THREE.MathUtils.radToDeg(debugGyroAlpha)
            ).toFixed(1) + "°"
      }`
    );
  },

  // 👇 เพิ่มอันนี้ให้ UI
  getPosition: () => ({
    x: camera.position.x,
    y: camera.position.y,
    z: camera.position.z,
  }),
});


/* =====================================================
   LOOP
===================================================== */

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  currentYaw = dampAngle(currentYaw, targetYaw, CONFIG.YAW.DAMP, dt);
  camera.zoom = damp(camera.zoom, targetZoom, CONFIG.ZOOM.DAMP, dt);

  const t =
    (camera.zoom - CONFIG.ZOOM.MIN) /
    (CONFIG.ZOOM.MAX - CONFIG.ZOOM.MIN);

  targetHeight = THREE.MathUtils.lerp(
    CONFIG.HEIGHT.MIN,
    CONFIG.HEIGHT.MAX,
    t
  );

  targetPitch = THREE.MathUtils.lerp(
    CONFIG.PITCH.MIN,
    CONFIG.PITCH.MAX,
    t
  );

  targetFov = THREE.MathUtils.lerp(
    CONFIG.FOV.MIN,
    CONFIG.FOV.MAX,
    t
  );

  camera.position.y = damp(
    camera.position.y,
    targetHeight,
    CONFIG.HEIGHT.DAMP,
    dt
  );

  BASE_ROTATION.x = damp(
    BASE_ROTATION.x,
    targetPitch,
    CONFIG.PITCH.DAMP,
    dt
  );

  camera.fov = damp(camera.fov, targetFov, CONFIG.FOV.DAMP, dt);

  camera.rotation.set(
    BASE_ROTATION.x,
    normalizeAngle(currentYaw),
    0,
    "YXZ"
  );

  camera.updateProjectionMatrix();

  ui.update();
  renderer.render(scene, camera);
  
}

/* =====================================================
   INIT
===================================================== */

placeLocationFromBackend();
animate();
