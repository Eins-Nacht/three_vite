import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";


preventZoom();
/* ======================
   PREVENT ZOOM
====================== */
function preventZoom(){
  // mobile: disable browser zoom
  document.body.style.touchAction = "manipulation";

  // desktop: disable ctrl/cmd + wheel zoom
  window.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false }
  );
  // disable double-tap to zoom
  window.addEventListener(
    "scroll",
    () => window.scrollTo(0, 0),
    { passive: true }
  );
  document.body.style.touchAction = "none";
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
  document.body.style.height = "100vh";
}

/* ======================
   SCENE
====================== */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaec6cf);
scene.add(new THREE.AxesHelper(2));

/* ======================
   CAMERA DEFAULT ROTATION
====================== */
const BASE_ROTATION = new THREE.Euler(
  0, // X (จะถูก set จาก zoom)
  0, // Y
  0, // Z
  "YXZ"
);

/* ======================
   CAMERA
====================== */
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  5000
);

camera.position.set(0, 20, 0);
camera.rotation.copy(BASE_ROTATION);

/* ======================
   CAMERA ZOOM CONFIG
====================== */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;
const ZOOM_STEP = 0.1;

camera.zoom = 1;
camera.updateProjectionMatrix();

/* ======================
   CAMERA PITCH BY ZOOM
====================== */
const PITCH_MIN = 0;                    // zoom 0.5 → 0°
const PITCH_MAX = -Math.PI / 4;         // zoom 3.0 → -45°

function updatePitchByZoom() {
  const t = (camera.zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN);
  BASE_ROTATION.x = THREE.MathUtils.lerp(PITCH_MIN, PITCH_MAX, t);
}

/* sync initial pitch */
updatePitchByZoom();

/* ======================
   RENDERER
====================== */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

/* ======================
   DEBUG OVERLAYS
====================== */
const rotationOverlay = document.createElement("div");
rotationOverlay.style.position = "fixed";
rotationOverlay.style.top = "12px";
rotationOverlay.style.right = "12px";
rotationOverlay.style.background = "rgba(0,0,0,0.6)";
rotationOverlay.style.color = "#fff";
rotationOverlay.style.padding = "8px 10px";
rotationOverlay.style.borderRadius = "6px";
rotationOverlay.style.fontFamily = "monospace";
rotationOverlay.style.fontSize = "13px";
rotationOverlay.style.pointerEvents = "none";
document.body.appendChild(rotationOverlay);

const debugOverlay = document.createElement("div");
debugOverlay.style.position = "fixed";
debugOverlay.style.top = "12px";
debugOverlay.style.left = "12px";
debugOverlay.style.background = "rgba(0,0,0,0.6)";
debugOverlay.style.color = "#0f0";
debugOverlay.style.padding = "8px 10px";
debugOverlay.style.borderRadius = "6px";
debugOverlay.style.fontFamily = "monospace";
debugOverlay.style.fontSize = "12px";
debugOverlay.style.pointerEvents = "none";
document.body.appendChild(debugOverlay);

/* ======================
   LIGHT
====================== */
scene.add(new THREE.AmbientLight(0xfffff0, 1));

/* ======================
   LOAD GLB
====================== */
const loader = new GLTFLoader();
loader.load("/models/city.glb", (gltf) => {
  scene.add(gltf.scene);
  console.log("GLB loaded ✅");
});

/* ======================
   GYRO / DEVICE ORIENTATION
====================== */
const euler = new THREE.Euler(0, 0, 0, "YXZ");
const zee = new THREE.Vector3(0, 0, 1);
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion(
  -Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)
);

function getScreenOrientation() {
  if (
    typeof window.screen !== "undefined" &&
    (window.screen as any).orientation &&
    typeof (window.screen as any).orientation.angle === "number"
  ) {
    return (window.screen as any).orientation.angle;
  }
  // @ts-ignore
  return window.orientation || 0;
}

function setObjectQuaternion(
  quaternion: THREE.Quaternion,
  alpha: number,
  beta: number,
  gamma: number,
  orient: number
) {
  euler.set(beta, alpha, -gamma, "YXZ");
  quaternion.setFromEuler(euler);
  quaternion.multiply(q1);
  quaternion.multiply(q0.setFromAxisAngle(zee, -orient));
}

function onDeviceOrientation(event: DeviceOrientationEvent) {
  if (event.alpha === null || event.beta === null || event.gamma === null) return;

  const alpha = THREE.MathUtils.degToRad(event.alpha);
  const beta  = THREE.MathUtils.degToRad(event.beta);
  const gamma = THREE.MathUtils.degToRad(event.gamma);
  const orient = THREE.MathUtils.degToRad(getScreenOrientation());

  setObjectQuaternion(camera.quaternion, alpha, beta, gamma, orient);

  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
  e.x = BASE_ROTATION.x;   // pitch จาก zoom
  e.z = BASE_ROTATION.z;   // roll ล็อค
  camera.quaternion.setFromEuler(e);
}

/* ======================
   GYRO PERMISSION
====================== */
function requestGyroPermission() {
  if (
    typeof DeviceOrientationEvent !== "undefined" &&
    // @ts-ignore
    typeof DeviceOrientationEvent.requestPermission === "function"
  ) {
    // @ts-ignore
    DeviceOrientationEvent.requestPermission().then((state: string) => {
      if (state === "granted") {
        window.addEventListener("deviceorientation", onDeviceOrientation);
      }
    });
  } else {
    window.addEventListener("deviceorientation", onDeviceOrientation);
  }
}

window.addEventListener("click", requestGyroPermission, { once: true });

/* ======================
   ZOOM – MOUSE WHEEL
====================== */
window.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();

    if (e.deltaY < 0) {
      camera.zoom = Math.min(ZOOM_MAX, camera.zoom + ZOOM_STEP);
    } else {
      camera.zoom = Math.max(ZOOM_MIN, camera.zoom - ZOOM_STEP);
    }

    updatePitchByZoom();
    camera.updateProjectionMatrix();
  },
  { passive: false }
);

/* ======================
   ZOOM – PINCH (TOUCH)
====================== */
let lastTouchDistance: number | null = null;

function getTouchDistance(t1: Touch, t2: Touch) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

window.addEventListener("touchstart", (e) => {
  if (e.touches.length === 2) {
    lastTouchDistance = getTouchDistance(e.touches[0], e.touches[1]);
  }
});

window.addEventListener("touchmove", (e) => {
  if (e.touches.length === 2 && lastTouchDistance !== null) {
    const dist = getTouchDistance(e.touches[0], e.touches[1]);
    const delta = dist - lastTouchDistance;

    camera.zoom += delta * 0.002;
    camera.zoom = THREE.MathUtils.clamp(camera.zoom, ZOOM_MIN, ZOOM_MAX);

    updatePitchByZoom();
    camera.updateProjectionMatrix();

    lastTouchDistance = dist;
  }
});

window.addEventListener("touchend", () => {
  lastTouchDistance = null;
});

/* ======================
   RESIZE
====================== */
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ======================
   RENDER LOOP
====================== */
function animate() {
  requestAnimationFrame(animate);

  const deg = THREE.MathUtils.radToDeg;

  rotationOverlay.innerText =
    `ROTATION\n` +
    `X: ${deg(camera.rotation.x).toFixed(1)}°\n` +
    `Y: ${deg(camera.rotation.y).toFixed(1)}°\n` +
    `Z: ${deg(camera.rotation.z).toFixed(1)}°\n\n` +
    `ZOOM: ${camera.zoom.toFixed(2)}x`;

  const p = camera.position;
  const q = camera.quaternion;

  debugOverlay.innerText =
    `POSITION\n` +
    `x: ${p.x.toFixed(2)}\n` +
    `y: ${p.y.toFixed(2)}\n` +
    `z: ${p.z.toFixed(2)}\n\n` +
    `QUATERNION\n` +
    `x: ${q.x.toFixed(3)}\n` +
    `y: ${q.y.toFixed(3)}\n` +
    `z: ${q.z.toFixed(3)}\n` +
    `w: ${q.w.toFixed(3)}`;

  renderer.render(scene, camera);
}

animate();
