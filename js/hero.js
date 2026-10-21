// Hero viewport: a real ThriftSplat point cloud that rebuilds itself from a ring of cameras.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { loadCloud } from "./cloud.js";

const SLOTS = 24;          // camera positions on the orbit ring (matches the converter)
const BUILD_SPAN = 4.2;    // seconds for the ring of cameras to fire
const FLIGHT = 1.1;        // seconds for one point to travel from its camera
const ZOOM_MIN = 1, ZOOM_MAX = 4;

const host = document.querySelector("[data-hero]");
const canvas = host?.querySelector("canvas");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = matchMedia("(pointer: coarse)").matches;

if (host && canvas) init().catch((err) => {
  console.warn("hero viewport disabled:", err);
  host.classList.add("is-fallback");
});

async function init() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 4000);

  const cloud = await loadCloud(host.dataset.cloud);
  const { positions, colors, count, radius, ground, top } = cloud;
  const slots = Float32Array.from(cloud.slots);
  const jitter = new Float32Array(count);
  for (let i = 0; i < count; i++) jitter[i] = Math.random();
  const ringR = radius * 1.05;
  const ringH = top + radius * 0.3;

  const uniforms = {
    uTime: { value: reduceMotion ? 99 : 0 },
    uSize: { value: 2.1 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uModeMix: { value: 0 },
    uNear: { value: 40 },
    uFar: { value: 220 },
    uRing: { value: new THREE.Vector2(ringR, ringH) },
    uSlots: { value: SLOTS },
    uSpan: { value: BUILD_SPAN },
    uFlight: { value: FLIGHT },
    uCamOpacity: { value: 1 },
    uRadius: { value: radius },
    uPoints: { value: 1 },
  };

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3, true));
  geo.setAttribute("slot", new THREE.BufferAttribute(slots, 1));
  geo.setAttribute("jitter", new THREE.BufferAttribute(jitter, 1));

  const shared = /* glsl */ `
    uniform float uTime, uSlots, uSpan, uFlight;
    uniform vec2 uRing;
    float slotStart(float s) { return s / uSlots * uSpan; }
    vec3 slotCamera(float s) {
      float th = (s + 0.5) / uSlots * 6.2831853 - 3.1415927;
      return vec3(cos(th) * uRing.x, uRing.y, sin(th) * uRing.x);
    }
  `;

  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms,
    vertexColors: true,
    transparent: true,
    depthWrite: true,
    vertexShader: /* glsl */ `
      ${shared}
      uniform float uSize, uPixelRatio, uNear, uFar, uRadius, uPoints;
      attribute float slot;
      attribute float jitter;
      varying vec3 vColor;
      varying float vDepth;
      varying float vAlpha;
      void main() {
        float start = slotStart(slot) + jitter * 0.55;
        float p = clamp((uTime - start) / uFlight, 0.0, 1.0);
        p = 1.0 - pow(1.0 - p, 3.0);
        vec3 pos = mix(slotCamera(slot), position, p);
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = uSize * uPixelRatio * clamp(240.0 / -mv.z, 0.6, 3.2);
        gl_PointSize = p > 0.0 && uPoints > 0.01 ? size : 0.0;
        vColor = color;
        vDepth = clamp((-mv.z - uNear) / (uFar - uNear), 0.0, 1.0);
        float edge = 1.0 - smoothstep(0.72, 1.0, length(position.xz) / uRadius);
        vAlpha = smoothstep(0.0, 0.25, p) * mix(0.15, 1.0, edge) * uPoints;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uModeMix;
      varying vec3 vColor;
      varying float vDepth;
      varying float vAlpha;
      // Turbo colormap, polynomial fit (Mikhailov, 2019).
      vec3 turbo(float x) {
        const vec4 kR = vec4(0.13572138, 4.61539260, -42.66032258, 132.13108234);
        const vec4 kG = vec4(0.09140261, 2.19418839, 4.84296658, -14.18503333);
        const vec4 kB = vec4(0.10667330, 12.64194608, -60.58204836, 110.36276771);
        const vec2 kR2 = vec2(-152.94239396, 59.28637943);
        const vec2 kG2 = vec2(4.27729857, 2.82956604);
        const vec2 kB2 = vec2(-89.90310912, 27.34824973);
        vec4 v4 = vec4(1.0, x, x * x, x * x * x);
        vec2 v2 = v4.zw * v4.z;
        return vec3(dot(v4, kR) + dot(v2, kR2), dot(v4, kG) + dot(v2, kG2), dot(v4, kB) + dot(v2, kB2));
      }
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        if (dot(c, c) > 0.25) discard;
        vec3 rgb = pow(vColor, vec3(0.86)) * 1.12;
        vec3 col = mix(rgb, turbo(1.0 - vDepth), uModeMix);
        gl_FragColor = vec4(col, vAlpha);
      }
    `,
  }));
  scene.add(points);

  // Camera frustums on the orbit ring, each one appears when its slot fires.
  const frustums = new THREE.LineSegments(buildFrustums(ringR, ringH, radius), new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      ${shared}
      attribute float slot;
      varying float vGlow;
      varying float vOn;
      void main() {
        float t = uTime - slotStart(slot);
        vOn = step(0.0, t);
        vGlow = 1.0 - smoothstep(0.0, uFlight * 1.2, t);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uCamOpacity;
      varying float vGlow;
      varying float vOn;
      void main() {
        vec3 base = vec3(0.92, 0.91, 0.88);
        vec3 hot = vec3(1.0, 0.36, 0.13);
        float a = vOn * mix(0.22, 1.0, vGlow) * uCamOpacity;
        gl_FragColor = vec4(mix(base, hot, vGlow), a);
      }
    `,
  }));
  scene.add(frustums);

  // The real thing: ThriftSplat's Gaussian splat. Once the points have landed, splats grow out of them.
  let splat = null, splatState = "idle", splatGrow = 0;
  const small = innerWidth < 760 || coarse;
  const splatUrl = navigator.connection?.saveData ? null : (small ? host.dataset.splatLite : host.dataset.splat);
  async function loadSplat() {
    splatState = "loading";
    host.classList.add("is-splat-loading");
    try {
      const GS = await import("https://cdn.jsdelivr.net/npm/@mkkellogg/gaussian-splats-3d@0.4.7/build/gaussian-splats-3d.module.js");
      const viewer = new GS.DropInViewer({
        sharedMemoryForWorkers: false, gpuAcceleratedSort: false, dynamicScene: false, antialiased: true,
        sceneRevealMode: GS.SceneRevealMode.Instant, logLevel: GS.LogLevel.None, sphericalHarmonicsDegree: 0,
      });
      await viewer.addSplatScene(splatUrl, { showLoadingUI: false, progressiveLoad: false, splatAlphaRemovalThreshold: 5 });
      viewer.visible = false;
      scene.add(viewer);
      splat = viewer;
      splatState = "ready";
      host.classList.add("has-splat");
    } catch (err) {
      console.warn("splat skipped:", err);
      splatState = "failed";
    }
    host.classList.remove("is-splat-loading");
  }

  const ringPts = [];
  for (let i = 0; i <= 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(Math.cos(a) * ringR, ringH, Math.sin(a) * ringR));
  }
  const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts),
    new THREE.LineDashedMaterial({ color: 0xeae7df, transparent: true, opacity: 0.18, dashSize: 2, gapSize: 2.5 }));
  ring.computeLineDistances();
  scene.add(ring);

  const target = new THREE.Vector3(0, ground + (top - ground) * 0.3, 0);
  const startAz = THREE.MathUtils.degToRad(-35);
  const startEl = THREE.MathUtils.degToRad(36);
  const baseDist = radius * 3.55;
  camera.position.set(
    target.x + baseDist * Math.cos(startEl) * Math.cos(startAz),
    target.y + baseDist * Math.sin(startEl),
    target.z + baseDist * Math.cos(startEl) * Math.sin(startAz));
  camera.lookAt(target);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enableZoom = false;   // zoom is ours, so a plain scroll still scrolls the page
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.55;
  controls.minPolarAngle = THREE.MathUtils.degToRad(18);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(80);
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.35;
  controls.enabled = !coarse;   // phones scroll past the hero; they turn it with two fingers instead
  controls.update();
  canvas.addEventListener("pointerdown", () => host.classList.add("is-grabbing"));
  addEventListener("pointerup", () => host.classList.remove("is-grabbing"));

  /* ---- zoom: buttons, pinch / ctrl+wheel, double-click, two-finger touch ---- */
  let zoom = 1, zoomTarget = 1;
  const zoomLabel = host.querySelector("[data-zoom-level]");
  const setZoom = (z) => { zoomTarget = THREE.MathUtils.clamp(z, ZOOM_MIN, ZOOM_MAX); };
  host.querySelector("[data-zoom-in]")?.addEventListener("click", () => setZoom(zoomTarget * 1.45));
  host.querySelector("[data-zoom-out]")?.addEventListener("click", () => setZoom(zoomTarget / 1.45));
  canvas.addEventListener("dblclick", () => setZoom(zoomTarget >= ZOOM_MAX * 0.9 ? 1 : zoomTarget * 1.8));
  canvas.addEventListener("wheel", (e) => {
    if (!e.ctrlKey && !e.metaKey) return;   // trackpad pinch arrives as ctrl+wheel
    e.preventDefault();
    setZoom(zoomTarget * Math.exp(-e.deltaY * 0.01));
  }, { passive: false });

  const off = new THREE.Vector3();
  const azimuth = () => { off.copy(camera.position).sub(controls.target); return Math.atan2(off.z, off.x); };
  function rotateTo(a) {
    off.copy(camera.position).sub(controls.target);
    const r = Math.hypot(off.x, off.z);
    camera.position.set(controls.target.x + r * Math.cos(a), camera.position.y, controls.target.z + r * Math.sin(a));
  }
  let pinch = null;
  canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) pinch = { d: touchDist(e), z: zoomTarget, x: touchMidX(e), az: azimuth() };
  }, { passive: true });
  canvas.addEventListener("touchmove", (e) => {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    setZoom(pinch.z * touchDist(e) / pinch.d);
    // Two fingers also turn the scene on phones, where one finger scrolls the page.
    if (coarse) rotateTo(pinch.az - (touchMidX(e) - pinch.x) * 0.012);
  }, { passive: false });
  canvas.addEventListener("touchend", () => { pinch = null; });

  /* ---- display toggles ---- */
  let mode = splatUrl ? "splat" : "rgb";
  const modeBtns = host.querySelectorAll("[data-mode]");
  const setMode = (m) => { mode = m; modeBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === m))); };
  modeBtns.forEach((btn) => btn.addEventListener("click", () => setMode(btn.dataset.mode)));
  if (!splatUrl) host.querySelector("[data-mode=splat]")?.remove();
  setMode(mode);
  let camsOn = true;
  host.querySelector("[data-cams]")?.addEventListener("click", (e) => {
    camsOn = !camsOn;
    e.currentTarget.setAttribute("aria-pressed", String(camsOn));
  });
  host.querySelector("[data-replay]")?.addEventListener("click", () => {
    uniforms.uTime.value = 0; splatGrow = 0;
    if (splat) splat.visible = false;
    setZoom(1);
  });

  const readout = host.querySelector("[data-readout]");
  const gizmo = host.querySelector("[data-gizmo]");
  let counter = host.querySelector("[data-count]");
  const stage = host.querySelector("[data-stage]");

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep roughly the same horizontal coverage on portrait screens.
    const halfH = Math.tan(THREE.MathUtils.degToRad(15));
    camera.fov = camera.aspect < 1.2 ? THREE.MathUtils.radToDeg(2 * Math.atan(halfH * 1.05 / camera.aspect)) : 30;
    // Push the scene to the right on wide screens so the headline has room.
    const shift = w > 900 ? -w * 0.19 : 0;
    const lift = w > 900 ? h * 0.03 : h * 0.16;
    camera.setViewOffset(w, h, shift, lift, w, h);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) loop(); }, { threshold: 0 }).observe(host);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loop(); });

  const clock = new THREE.Clock();
  let running = false;
  function loop() {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }
  function frame() {
    if (!visible || document.hidden) { running = false; return; }
    // Real elapsed time keeps the build speed honest on slow frames; a long gap means we were paused.
    let dt = clock.getDelta();
    if (dt > 0.5) dt = 1 / 60;
    tick(dt);
    requestAnimationFrame(frame);
  }

  function tick(dt) {
    if (!reduceMotion) uniforms.uTime.value += dt;
    uniforms.uModeMix.value += ((mode === "depth" ? 1 : 0) - uniforms.uModeMix.value) * Math.min(1, dt * 6);
    uniforms.uCamOpacity.value += ((camsOn ? 1 : 0) - uniforms.uCamOpacity.value) * Math.min(1, dt * 6);
    ring.material.opacity = 0.18 * uniforms.uCamOpacity.value;
    const built = uniforms.uTime.value > BUILD_SPAN + FLIGHT + 0.6;
    if (built && splatUrl && splatState === "idle") loadSplat();
    // Splats grow out of the points; points fade as the surface fills in.
    const growTarget = built && splat && mode === "splat" ? 1 : 0;
    splatGrow += Math.sign(growTarget - splatGrow) * Math.min(Math.abs(growTarget - splatGrow), dt / 2.2);
    if (splat) {
      splat.visible = splatGrow > 0.001;
      const e = splatGrow * splatGrow * (3 - 2 * splatGrow);
      splat.splatMesh?.setSplatScale(Math.max(0.001, e));
    }
    const pointsTarget = mode === "splat" && splat ? Math.max(0, 1 - splatGrow * 1.8) : 1;
    uniforms.uPoints.value += (pointsTarget - uniforms.uPoints.value) * Math.min(1, dt * 5);
    host.classList.toggle("is-splat", splatGrow > 0.5);
    controls.autoRotateSpeed = 0.35 / zoom;
    controls.update(dt);

    zoom += (zoomTarget - zoom) * Math.min(1, dt * 7);
    const dist = baseDist / zoom;
    off.copy(camera.position).sub(controls.target).setLength(dist);
    camera.position.copy(controls.target).add(off);
    uniforms.uNear.value = dist * 0.55;
    uniforms.uFar.value = dist * 1.45;

    renderer.render(scene, camera);
    hud();
  }

  const v = new THREE.Vector3();
  function hud() {
    const t = uniforms.uTime.value;
    const built = Math.min(1, Math.max(0, (t - FLIGHT * 0.3) / (BUILD_SPAN + FLIGHT + 0.55)));
    if (stage && splat && splatGrow > 0.5) {
      if (!stage.dataset.splat) { stage.dataset.splat = "1"; stage.textContent = `${(splat.splatMesh?.getSplatCount?.() ?? 0).toLocaleString("en-US")} Gaussian splats · trained by ThriftSplat`; }
    } else {
      if (stage?.dataset.splat) { delete stage.dataset.splat; stage.innerHTML = `<span data-count></span> / ${count.toLocaleString("en-US")} points`; counter = stage.querySelector("[data-count]"); }
      if (counter) counter.textContent = Math.round(built * count).toLocaleString("en-US");
    }
    if (zoomLabel) zoomLabel.textContent = `${zoom.toFixed(1)}×`;
    if (readout) {
      v.copy(camera.position).sub(controls.target);
      const az = (THREE.MathUtils.radToDeg(Math.atan2(v.z, v.x)) + 360) % 360;
      const el = THREE.MathUtils.radToDeg(Math.asin(v.y / v.length()));
      readout.textContent = `az ${az.toFixed(0).padStart(3, "0")}°  el ${el.toFixed(0).padStart(2, "0")}°`;
    }
    if (gizmo) {
      // World axes in camera space, drawn as a 2D triad.
      const m = camera.matrixWorldInverse;
      [...gizmo.children].forEach((el, i) => {
        v.set(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0).transformDirection(m);
        el.setAttribute("x2", (20 + v.x * 15).toFixed(2));
        el.setAttribute("y2", (20 - v.y * 15).toFixed(2));
      });
    }
  }

  host.classList.add("is-ready");
  loop();
}

const touchDist = (e) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
const touchMidX = (e) => (e.touches[0].clientX + e.touches[1].clientX) / 2;

function buildFrustums(ringR, ringH, radius) {
  const verts = [], slot = [];
  const len = radius * 0.11, half = len * 0.62, halfV = len * 0.4;
  const up = new THREE.Vector3(0, 1, 0);
  for (let s = 0; s < SLOTS; s++) {
    const th = ((s + 0.5) / SLOTS) * Math.PI * 2 - Math.PI;
    const c = new THREE.Vector3(Math.cos(th) * ringR, ringH, Math.sin(th) * ringR);
    const fwd = new THREE.Vector3(0, 0, 0).sub(c).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    const camUp = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const base = c.clone().addScaledVector(fwd, len);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) =>
      base.clone().addScaledVector(right, a * half).addScaledVector(camUp, b * halfV));
    const push = (p) => { verts.push(p.x, p.y, p.z); slot.push(s); };
    for (let i = 0; i < 4; i++) { push(c); push(corners[i]); push(corners[i]); push(corners[(i + 1) % 4]); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute("slot", new THREE.Float32BufferAttribute(slot, 1));
  return g;
}
