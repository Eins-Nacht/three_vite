type GestureOptions = {
  isActive: () => boolean;
  getZoom: () => number;
  setZoom: (z: number) => void;
  addYaw: (delta: number) => void;
  zoomConfig: {
    MIN: number;
    MAX: number;
  };
  panSens: number;
  deadzone: number;
};

export function bindGesture(options: GestureOptions) {
  let isTouchPanning = false;
  let lastPanX = 0;
  let lastPinchDist: number | null = null;

  function pinchDistance(t: TouchList) {
    const dx = t[0].clientX - t[1].clientX;
    const dy = t[0].clientY - t[1].clientY;
    return Math.hypot(dx, dy);
  }

  window.addEventListener("touchstart", (e) => {
    //if (!options.isActive()) return;

    if (e.touches.length === 1) {
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
      //if (!options.isActive()) return;

      e.preventDefault();

      // pinch zoom
      if (e.touches.length === 2 && lastPinchDist !== null) {
        const d = pinchDistance(e.touches);
        const delta = (d - lastPinchDist) * 0.002;

        let newZoom = options.getZoom() + delta;
        newZoom = Math.max(options.zoomConfig.MIN, newZoom);
        newZoom = Math.min(options.zoomConfig.MAX, newZoom);

        options.setZoom(newZoom);

        lastPinchDist = d;
        return;
      }

      // pan yaw
      if (e.touches.length === 1 && isTouchPanning) {
        const dx = e.touches[0].clientX - lastPanX;
        lastPanX = e.touches[0].clientX;

        if (Math.abs(dx) > options.deadzone) {
          options.addYaw(-dx * options.panSens);
        }
      }
    },
    { passive: false }
  );

  window.addEventListener("touchend", () => {
    isTouchPanning = false;
    lastPinchDist = null;
  });

  return {
    dispose() {
      // optional cleanup
    },
  };
}
