import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/* =====================================================
   1. CONFIG / CONSTANTS
===================================================== */
const CONFIG = {
  ZOOM: {
    MIN: 0.5,
    MAX: 3.0,
    STEP: 0.12,
    DAMP: 10,
  },
  HEIGHT: {
    MIN: 10,
    MAX: 150,
    DAMP: 8,
  },
  PITCH: {
    MIN: 0,
    MAX: -Math.PI / 2,
    DAMP: 10,
  },
  FOV: {
    MIN: 60,
    MAX: 100,
    DAMP: 10,
  },
  YAW: {
    DAMP: 8,
    SNAP_RAD: THREE.MathUtils.degToRad(15),
  },
  PAN: {
    SENS: 0.005,
    DEADZONE: 2,
  },
};

/* =====================================================
   2. CORE 3D SETUP
===================================================== */
preventBrowserGesture();

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

/* =====================================================
   3. STATE
===================================================== */
let targetZoom = 1;
let targetYaw = 0;
let currentYaw = 0;

let targetPitch = 0;
let targetHeight = CONFIG.HEIGHT.MIN;
let targetFov = CONFIG.FOV.MIN;

let debugGyroAlpha: number | null = null;

/* =====================================================
   4. MATH / UTILS
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

/* =====================================================
   5. CAMERA MODES
===================================================== */
type CameraMode = "GYRO" | "GESTURE";
let cameraMode: CameraMode = "GYRO";

/* ---------- GYRO MODE ---------- */
function updateGyroYaw(alphaDeg: number) {
  const alpha = THREE.MathUtils.degToRad(alphaDeg);
  debugGyroAlpha = alpha;
  targetYaw = alpha;
}

function bindGyro() {
  function onDeviceOrientation(e: DeviceOrientationEvent) {
    if (cameraMode !== "GYRO") return;
    if (e.alpha == null) return;
    updateGyroYaw(e.alpha);
  }

  window.addEventListener(
    "click",
    () => {
      // @ts-ignore
      DeviceOrientationEvent?.requestPermission?.().then((res: string) => {
        if (res === "granted") {
          window.addEventListener("deviceorientation", onDeviceOrientation);
        }
      }) ?? window.addEventListener("deviceorientation", onDeviceOrientation);
    },
    { once: true }
  );
}

/* ---------- GESTURE MODE ---------- */
let isTouchPanning = false;
let lastPanX = 0;
let lastPinchDist: number | null = null;

function pinchDistance(t: TouchList) {
  const dx = t[0].clientX - t[1].clientX;
  const dy = t[0].clientY - t[1].clientY;
  return Math.hypot(dx, dy);
}

function bindGesture() {
  window.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1 && cameraMode === "GESTURE") {
      isTouchPanning = true;
      lastPanX = e.touches[0].clientX;
    }

    if (e.touches.length === 2) {
      isTouchPanning = false;
      lastPinchDist = pinchDistance(e.touches);
    }
  });

  window.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();

      // pinch zoom (all modes)
      if (e.touches.length === 2 && lastPinchDist !== null) {
        const d = pinchDistance(e.touches);
        targetZoom += (d - lastPinchDist) * 0.002;
        targetZoom = THREE.MathUtils.clamp(
          targetZoom,
          CONFIG.ZOOM.MIN,
          CONFIG.ZOOM.MAX
        );
        lastPinchDist = d;
        return;
      }

      if (cameraMode !== "GESTURE") return;

      if (e.touches.length === 1 && isTouchPanning) {
        const dx = e.touches[0].clientX - lastPanX;
        lastPanX = e.touches[0].clientX;

        if (Math.abs(dx) > CONFIG.PAN.DEADZONE) {
          targetYaw -= dx * CONFIG.PAN.SENS;
        }
      }
    },
    { passive: false }
  );

  window.addEventListener("touchend", () => {
    isTouchPanning = false;
    lastPinchDist = null;
  });

  window.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      targetZoom += e.deltaY < 0 ? CONFIG.ZOOM.STEP : -CONFIG.ZOOM.STEP;
      targetZoom = THREE.MathUtils.clamp(
        targetZoom,
        CONFIG.ZOOM.MIN,
        CONFIG.ZOOM.MAX
      );
    },
    { passive: false }
  );
}

/* =====================================================
   6. DEBUG UI
===================================================== */
const overlay = document.createElement("div");
Object.assign(overlay.style, {
  position: "fixed",
  top: "12px",
  left: "12px",
  background: "rgba(0,0,0,0.6)",
  color: "#fff",
  padding: "8px 10px",
  borderRadius: "6px",
  fontFamily: "monospace",
  fontSize: "12px",
  pointerEvents: "none",
  zIndex: "9999",
});
document.body.appendChild(overlay);

/* =====================================================
   7. MAIN LOOP
===================================================== */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  const yawWrapped =
    ((currentYaw % TWO_PI) + TWO_PI) % TWO_PI;

  if (
    yawWrapped < CONFIG.YAW.SNAP_RAD ||
    yawWrapped > TWO_PI - CONFIG.YAW.SNAP_RAD
  ) {
    currentYaw = targetYaw;
  } else {
    currentYaw = damp(currentYaw, targetYaw, CONFIG.YAW.DAMP, dt);
  }

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

  const yawDeg = wrapDeg360(
    THREE.MathUtils.radToDeg(currentYaw)
  );

  overlay.innerText =
    `MODE: ${cameraMode}\n` +
    `ZOOM: ${camera.zoom.toFixed(2)}\n` +
    `HEIGHT: ${camera.position.y.toFixed(1)}\n` +
    `YAW: ${yawDeg.toFixed(1)}°\n` +
    `GYRO α: ${
      debugGyroAlpha == null
        ? "N/A"
        : wrapDeg360(
            THREE.MathUtils.radToDeg(debugGyroAlpha)
          ).toFixed(1) + "°"
    }`;

  renderer.render(scene, camera);
}

/* =====================================================
   MODE TOGGLE BUTTON
===================================================== */
const modeBtn = document.createElement("button");
modeBtn.innerText = "MODE: GYRO";

Object.assign(modeBtn.style, {
  position: "fixed",
  bottom: "16px",
  left: "50%",
  transform: "translateX(-50%)",
  padding: "10px 16px",
  borderRadius: "8px",
  border: "none",
  background: "#222",
  color: "#fff",
  fontSize: "14px",
  zIndex: "9999",
});

document.body.appendChild(modeBtn);

modeBtn.onclick = () => {
  cameraMode = cameraMode === "GYRO" ? "GESTURE" : "GYRO";
  modeBtn.innerText = `MODE: ${cameraMode}`;
};

animate();

/* =====================================================
   INIT
===================================================== */
bindGyro();
bindGesture();

new GLTFLoader().load("/models/city.glb", (gltf) => {
  scene.add(gltf.scene);
});

/* =====================================================
   PREVENT DEFAULT
===================================================== */
function preventBrowserGesture() {
  document.body.style.touchAction = "none";
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
  document.body.style.height = "100vh";
}
