// About: a little AUV built for this page. It watches the cursor, bobs like it is floating,
// spins when dragged, fires its thrusters when clicked, and comes apart into its parts on request.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildBot } from "./auv.js";

const host = document.querySelector("[data-pet]");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

if (host) {
  // Start only when the About section is close, so the hero gets the GPU first.
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    init().catch((err) => {
      console.warn("About robot disabled:", err);
      host.querySelector(".pet-loading").textContent = "The robot could not load here.";
    });
  }, { rootMargin: "700px 0px" });
  io.observe(host);
}

/* ======================================================================== */
async function init() {
  const canvas = host.querySelector("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xfff1e0, 1.8);
  key.position.set(-2, 3, 2.5);
  const rim = new THREE.DirectionalLight(0xffd2b8, 1.2);
  rim.position.set(2.5, 1, -2);
  scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0x2a1408, 0.6));

  const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 50);
  camera.position.set(0, 0.55, 4.1);
  camera.lookAt(0, -0.05, 0);

  const bot = buildBot();
  bot.root.rotation.y = 0.95;   // rest three-quarters on, so it reads as a vehicle and not a circle
  const spinner = new THREE.Group();   // drag spin
  const pivot = new THREE.Group();     // cursor-following pose
  spinner.add(bot.root);
  pivot.add(spinner);
  scene.add(pivot);

  const labelsEl = host.querySelector("[data-pet-labels]");
  labelsEl.innerHTML = bot.anchors.map((a) => `<span class="pet-label">${a.text}</span>`).join("");
  const labelEls = [...labelsEl.children];

  /* ---- bubbles ---- */
  const MAX = 1000;
  const bPos = new Float32Array(MAX * 3), bVel = new Float32Array(MAX * 3), bLife = new Float32Array(MAX), bSize = new Float32Array(MAX);
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute("position", new THREE.BufferAttribute(bPos, 3));
  bGeo.setAttribute("life", new THREE.BufferAttribute(bLife, 1));
  bGeo.setAttribute("size", new THREE.BufferAttribute(bSize, 1));
  const bubbles = new THREE.Points(bGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uScale: { value: renderer.getPixelRatio() * 520 } },
    vertexShader: /* glsl */ `
      uniform float uScale; attribute float life; attribute float size; varying float vLife;
      void main() {
        vLife = life;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = life > 0.0 ? size * uScale / -mv.z : 0.0;
      }`,
    fragmentShader: /* glsl */ `
      varying float vLife;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float ring = smoothstep(0.5, 0.42, d) * (0.35 + 0.65 * smoothstep(0.28, 0.46, d));
        gl_FragColor = vec4(1.0, 0.98, 0.95, ring * clamp(vLife, 0.0, 1.0) * 0.9);
      }`,
  }));
  bubbles.frustumCulled = false;
  scene.add(bubbles);
  let next = 0;
  const wp = new THREE.Vector3(), wdir = new THREE.Vector3();
  function thrust() {
    scene.updateMatrixWorld(true);
    for (const j of bot.jets) {
      j.obj.getWorldPosition(wp);
      wdir.copy(j.dir).transformDirection(j.obj.matrixWorld);
      for (let k = 0; k < 30; k++) {
        const i = next++ % MAX;
        bPos[i * 3] = wp.x + (Math.random() - 0.5) * 0.04;
        bPos[i * 3 + 1] = wp.y + (Math.random() - 0.5) * 0.04;
        bPos[i * 3 + 2] = wp.z + (Math.random() - 0.5) * 0.04;
        const sp = 0.5 + Math.random() * 0.9;
        bVel[i * 3] = wdir.x * sp + (Math.random() - 0.5) * 0.25;
        bVel[i * 3 + 1] = wdir.y * sp + (Math.random() - 0.3) * 0.25;
        bVel[i * 3 + 2] = wdir.z * sp + (Math.random() - 0.5) * 0.25;
        bLife[i] = 1.1 + Math.random() * 1.1;
        bSize[i] = 0.01 + Math.random() * 0.026;
      }
    }
    kick = 1;
  }

  /* ---- interaction ---- */
  let explode = 0, explodeTarget = 0, kick = 0;
  let spin = 0, spinVel = 0, dragging = false, moved = 0, lastX = 0;
  let px = 0, py = 0, hasPointer = false;
  const explodeBtn = host.querySelector("[data-pet-explode]");
  explodeBtn.addEventListener("click", () => {
    explodeTarget = explodeTarget ? 0 : 1;
    explodeBtn.setAttribute("aria-pressed", String(!!explodeTarget));
    explodeBtn.textContent = explodeTarget ? "Put it back" : "Take it apart";
    host.classList.toggle("is-exploded", !!explodeTarget);
    wake();
  });
  host.querySelector("[data-pet-thrust]").addEventListener("click", () => { thrust(); wake(); });

  const section = host.closest("section") ?? document.body;
  addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    const sr = section.getBoundingClientRect();
    hasPointer = e.clientY > sr.top && e.clientY < sr.bottom;
    px = THREE.MathUtils.clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2), -1.6, 1.6);
    py = THREE.MathUtils.clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 2), -1.6, 1.6);
    if (dragging) {
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      moved += Math.abs(dx);
      spin += dx * 0.012;
      spinVel = dx * 0.012;
    }
    wake();
  }, { passive: true });
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true; moved = 0; lastX = e.clientX;
    host.classList.add("is-grabbing");
    canvas.setPointerCapture?.(e.pointerId);
  });
  addEventListener("pointerup", () => {
    if (!dragging) return;
    dragging = false;
    host.classList.remove("is-grabbing");
    if (moved < 6) thrust();
  });

  /* ---- loop ---- */
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  let visible = true, running = false, last = performance.now(), idleSince = performance.now();
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(); }).observe(host);
  function wake() { idleSince = performance.now(); if (!running && visible) { running = true; last = performance.now(); requestAnimationFrame(frame); } }

  const sv = new THREE.Vector3(), box = new THREE.Box3();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    const k = Math.min(1, dt * 3.2);

    // Pose: look toward the cursor while it is in this section, otherwise wander.
    const yaw = hasPointer && !reduceMotion ? THREE.MathUtils.clamp(px, -1, 1) * 0.55 : Math.sin(t * 0.35) * 0.45;
    const pitch = hasPointer && !reduceMotion ? py * 0.28 : Math.sin(t * 0.5) * 0.05;
    pivot.rotation.y += (yaw - pivot.rotation.y) * k;
    pivot.rotation.x += (pitch - pivot.rotation.x) * k;
    pivot.rotation.z += ((hasPointer ? -px * 0.08 : 0) - pivot.rotation.z) * k;
    const bob = reduceMotion ? 0 : Math.sin(t * 1.3) * 0.045;
    pivot.position.x += ((hasPointer ? THREE.MathUtils.clamp(px, -1, 1) * 0.12 : 0) - pivot.position.x) * k;
    pivot.position.y += ((hasPointer ? -py * 0.08 : 0) + bob - pivot.position.y) * k;
    kick *= Math.pow(0.04, dt);
    pivot.position.z = kick * 0.22;
    host.style.setProperty("--shadow", (1 - (pivot.position.y + 0.05) * 1.6).toFixed(3));

    if (!dragging) { spinVel *= Math.pow(0.08, dt); spin += spinVel; }
    spinner.rotation.y = spin;

    explode += (explodeTarget - explode) * Math.min(1, dt * 4);
    const e = explode * explode * (3 - 2 * explode);
    for (const p of bot.parts) p.obj.position.copy(p.base).addScaledVector(p.delta, e);
    // Pull back while it is apart, so every part stays in frame.
    camera.position.set(0, 0.55 + e * 0.3, 4.1 + e * 2.3);
    camera.lookAt(0, -0.05, 0);
    bot.tick(t, dt, kick);

    // Bubbles rise, slow down and fade.
    let alive = 0;
    for (let i = 0; i < MAX; i++) {
      if (bLife[i] <= 0) continue;
      alive++;
      bLife[i] -= dt;
      bVel[i * 3 + 1] += 0.55 * dt;
      const drag = Math.pow(0.25, dt);
      bVel[i * 3] *= drag; bVel[i * 3 + 2] *= drag;
      bPos[i * 3] += bVel[i * 3] * dt;
      bPos[i * 3 + 1] += bVel[i * 3 + 1] * dt + Math.sin(t * 6 + i) * 0.0015;
      bPos[i * 3 + 2] += bVel[i * 3 + 2] * dt;
    }
    bGeo.attributes.position.needsUpdate = true;
    bGeo.attributes.life.needsUpdate = true;
    bGeo.attributes.size.needsUpdate = true;

    renderer.render(scene, camera);

    // Labels follow their parts while the robot is apart.
    if (explode > 0.02) {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      bot.anchors.forEach((a, i) => {
        box.setFromObject(a.obj).getCenter(sv).project(camera);
        labelEls[i].style.setProperty("--lx", `${(canvas.offsetLeft + (sv.x + 1) / 2 * w).toFixed(0)}px`);
        labelEls[i].classList.toggle("is-left", sv.x > 0.15);   // labels on the right half point inward
        labelEls[i].style.setProperty("--ly", `${(canvas.offsetTop + (1 - sv.y) / 2 * h).toFixed(0)}px`);
      });
    }

    // Keep running while anything moves; sleep after a few quiet seconds.
    const busy = alive > 0 || dragging || Math.abs(explodeTarget - explode) > 0.001 || Math.abs(spinVel) > 0.0005 || kick > 0.01;
    if (visible && (busy || !reduceMotion || now - idleSince < 3000)) requestAnimationFrame(frame);
    else running = false;
  }

  host.classList.add("is-ready");
  wake();
}
