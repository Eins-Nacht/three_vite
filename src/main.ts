import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import CONFIG_JSON from "./config/config.json";

import { initUI, type CameraMode } from "./ui/ui";
import { bindGyro } from "./controls/gyroController";
import { bindGesture } from "./controls/gestureController";

/* =====================================================
   LOAD LOCATION (runtime)
===================================================== */

async function loadLocation() {
  const res = await fetch("/config/location.json");
  return await res.json();
}

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
   WORLD CONSTANTS
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

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.DirectionalLight(0xffffff, 1.5));
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

let targetCamX = 0;
let targetCamZ = 0;

let currentFloor: number | null = null;

let debugGyroAlpha: number | null = null;
let cameraMode: CameraMode = "GYRO";

let currentFloorObject: THREE.Object3D | null = null; //for reset floor if the new floor is different

/* =====================================================
   UTILS
===================================================== */

const clock = new THREE.Clock();

function damp(current: number, target: number, lambda: number, dt: number) {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

function normalizeAngle(rad: number) {
  return ((rad + Math.PI) % (Math.PI * 2)) - Math.PI;
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

  const loader = new GLTFLoader();

  loader.load(path, (gltf) => {
    // ลบ floor เก่าก่อน
    if (currentFloorObject) {
      scene.remove(currentFloorObject);

      // cleanup memory
      currentFloorObject.traverse((obj: any) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    }

    currentFloorObject = gltf.scene;
    currentFloorObject.position.y = floor * FLOOR_HEIGHT;

    scene.add(currentFloorObject);
  });
}


function placeLocationFromBackend(location: any) {
  const { x, y, floor } = location;

  if (floor !== currentFloor) {
    loadFloorModel(floor);
    currentFloor = floor;
  }

  const pos = mapToWorld(x, y, floor);

  targetCamX = pos.x;
  targetCamZ = pos.z;
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
  zoomConfig: CONFIG.ZOOM,
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
  getDebugInfo: () =>
    `ZOOM: ${camera.zoom.toFixed(2)}
HEIGHT: ${camera.position.y.toFixed(1)}
YAW: ${THREE.MathUtils.radToDeg(currentYaw).toFixed(1)}°
GYRO α: ${
      debugGyroAlpha == null
        ? "N/A"
        : THREE.MathUtils.radToDeg(debugGyroAlpha).toFixed(1) + "°"
    }`,
  getPosition: () => ({
    x: camera.position.x,
    y: camera.position.y,
    z: camera.position.z,
  }),
});

/* =====================================================
   LOOP
===================================================== */

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

  camera.position.x = damp(
    camera.position.x,
    targetCamX,
    CONFIG.CAMERA.DAMP,
    dt
  );

  camera.position.z = damp(
    camera.position.z,
    targetCamZ,
    CONFIG.CAMERA.DAMP,
    dt
  );

  camera.fov = damp(camera.fov, targetFov, CONFIG.FOV.DAMP, dt);

  camera.rotation.set(
    targetPitch,
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

async function init() {
  const location = await loadLocation();
  placeLocationFromBackend(location);

  animate();

  setInterval(async () => {
    const newLocation = await loadLocation();
    placeLocationFromBackend(newLocation);
  }, 3000);
}

init();
