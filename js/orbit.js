// Two echoes of the hero: a fixed orbit that shows which "view" you are on,
// and the contact scene, where the town is rebuilt from 23 cameras and one slot is left for you.
import { loadCloud } from "./cloud.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const SLOTS = 24;
const OPEN_SLOT = 18;   // the camera that is missing (sits at the front-left when the scene starts)

/* ------------------------------------------------------- orbit indicator */
const ind = $("[data-orbit-ind]");
if (ind) {
  const ticks = $("[data-ticks]", ind);
  for (let i = 0; i < SLOTS; i++) {
    const a = (i / SLOTS) * Math.PI * 2 - Math.PI / 2;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", 32 + Math.cos(a) * 22); line.setAttribute("y1", 32 + Math.sin(a) * 22);
    line.setAttribute("x2", 32 + Math.cos(a) * 27); line.setAttribute("y2", 32 + Math.sin(a) * 27);
    ticks.append(line);
  }
  const lines = $$("line", ticks);
  const marker = $("[data-marker]", ind);
  const num = $("[data-orbit-num]", ind);
  const name = $("[data-orbit-name]", ind);
  const hero = $("[data-hero]");
  const views = $$("[data-view]");

  let raf = 0;
  const update = () => {
    raf = 0;
    const start = hero.offsetHeight * 0.6;
    const end = document.documentElement.scrollHeight - innerHeight;
    const p = Math.min(1, Math.max(0, (scrollY - start) / Math.max(1, end - start)));
    ind.classList.toggle("is-on", scrollY > start && !document.documentElement.classList.contains("is-locked"));
    marker.style.transform = `rotate(${(p * 360).toFixed(1)}deg)`;
    const lit = Math.round(p * SLOTS);
    lines.forEach((l, i) => l.classList.toggle("is-on", i < lit));
  };
  addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
  update();

  const viewSpy = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const v = e.target;
      num.textContent = `View ${String(v.dataset.view).padStart(2, "0")} / ${String(views.length).padStart(2, "0")}`;
      name.textContent = v.dataset.viewName;
      ind.style.color = getComputedStyle(v).color;   // take on the colour of the view we are in
    }
  }, { rootMargin: "-50% 0px -49% 0px" });
  views.forEach((v) => viewSpy.observe(v));
}

/* ------------------------------------------------------- contact scene */
const canvas = $("[data-contact-orbit]");
if (canvas) initContact().catch((err) => console.warn("contact orbit disabled:", err));

// Same tone lift as the hero shader, so the two renders match.
const lift = (c) => Math.min(255, 255 * Math.pow(c / 255, 0.86) * 1.15);

async function initContact() {
  const cloud = await loadCloud(canvas.dataset.cloud);
  const ctx = canvas.getContext("2d");
  const N = 60000;
  const step = Math.max(1, Math.floor(cloud.count / N));
  const pts = [];
  for (let i = 0; i < cloud.count; i += step) {
    pts.push({
      x: cloud.positions[i * 3], y: cloud.positions[i * 3 + 1], z: cloud.positions[i * 3 + 2],
      r: lift(cloud.colors[i * 3]), g: lift(cloud.colors[i * 3 + 1]), b: lift(cloud.colors[i * 3 + 2]),
      s: cloud.slots[i], j: Math.random(),
    });
  }
  const R = cloud.radius;
  const ringR = R * 1.03, ringH = cloud.top + R * 0.3;
  const cams = Array.from({ length: SLOTS }, (_, s) => {
    const th = ((s + 0.5) / SLOTS) * Math.PI * 2 - Math.PI;
    return { th, x: Math.cos(th) * ringR, y: ringH, z: Math.sin(th) * ringR };
  });

  let W = 0, H = 0, dpr = 1, img = null;
  function resize() {
    dpr = Math.min(devicePixelRatio, 2);
    W = Math.round(canvas.clientWidth * dpr);
    H = Math.round(canvas.clientHeight * dpr);
    canvas.width = W; canvas.height = H;
    img = ctx.createImageData(W, H);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  // Simple orbit camera: yaw around the town, fixed pitch, mild perspective.
  const pitch = 0.62, cp = Math.cos(pitch), sp = Math.sin(pitch);
  function project(x, y, z, yaw) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
    const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    const f = 3.2 / (3.2 + z2 / R * 0.55);
    const s = Math.min(W, H * 1.25) / (R * 2.35);
    return [W / 2 + x1 * s * f, H * 0.56 - y2 * s * f, z2, f];
  }

  let t0 = null, visible = false, running = false, fill = 0, fillTarget = 0;
  const BUILD = 2.6, FLY = 1.1;
  // Reaching for a way to get in touch places the last camera.
  $$(".contact-mail, [data-copy], .contact-links a").forEach((el) => {
    el.addEventListener("mouseenter", () => { fillTarget = 1; loop(); });
    el.addEventListener("focus", () => { fillTarget = 1; loop(); });
    el.addEventListener("mouseleave", () => { fillTarget = 0; loop(); });
    el.addEventListener("blur", () => { fillTarget = 0; loop(); });
  });

  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && t0 === null) t0 = performance.now();
    if (visible) loop();
  }, { threshold: 0.15 }).observe(canvas);

  function loop() { if (!running && visible) { running = true; requestAnimationFrame(draw); } }

  function draw(now) {
    if (!visible) { running = false; return; }
    const t = reduceMotion ? 99 : (now - t0) / 1000;
    const yaw = reduceMotion ? 0.6 : 0.6 + t * 0.06;
    fill += (fillTarget - fill) * 0.08;

    const data = img.data;
    data.fill(0);
    const size = dpr > 1.5 ? 3 : 2;
    for (const p of pts) {
      let k;
      if (p.s === OPEN_SLOT) k = fill;                       // the open slot only fills when you reach for it
      else k = Math.min(1, Math.max(0, (t - (p.s / SLOTS) * BUILD - p.j * 0.5) / FLY));
      if (k <= 0) continue;
      k = 1 - (1 - k) ** 3;
      const c = cams[p.s];
      const [sx, sy, , f] = project(c.x + (p.x - c.x) * k, c.y + (p.y - c.y) * k, c.z + (p.z - c.z) * k, yaw);
      const px = sx | 0, py = sy | 0;
      const edge = 1 - Math.min(1, Math.max(0, (Math.hypot(p.x, p.z) / R - 0.8) / 0.2));
      const a = (80 + 175 * edge * k) * Math.min(1, f);
      for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
        const X = px + dx, Y = py + dy;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const o = (Y * W + X) * 4;
        data[o] = p.r; data[o + 1] = p.g; data[o + 2] = p.b; data[o + 3] = a;  // colours pre-brightened below
      }
    }
    ctx.putImageData(img, 0, 0);

    // Camera frustums on the ring.
    ctx.lineWidth = 1 * dpr;
    for (let s = 0; s < SLOTS; s++) {
      const c = cams[s];
      const on = s === OPEN_SLOT ? fill : Math.min(1, Math.max(0, (t - (s / SLOTS) * BUILD) / 0.3));
      const [ax, ay, az] = project(c.x, c.y, c.z, yaw);
      const depth = 0.45 + 0.55 * (1 - (az / (R * 1.4) + 1) / 2);
      // A tiny frustum pointing at the centre of the town.
      const dir = [-c.x, -ringH * 0.9, -c.z];
      const len = Math.hypot(...dir);
      const fwd = dir.map((d) => (d / len) * R * 0.13);
      const right = [-Math.sin(c.th) * R * 0.07, 0, Math.cos(c.th) * R * 0.07];
      const up = [0, R * 0.045, 0];
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) =>
        project(c.x + fwd[0] + right[0] * u + up[0] * v, c.y + fwd[1] + up[1] * v, c.z + fwd[2] + right[2] * u, yaw));
      const open = s === OPEN_SLOT;
      ctx.setLineDash(open && fill < 0.95 ? [3 * dpr, 3 * dpr] : []);
      ctx.strokeStyle = open ? `rgba(255,90,31,${0.55 + 0.45 * fill})` : `rgba(238,235,228,${0.5 * on * depth})`;
      if (!open && on <= 0) continue;
      ctx.beginPath();
      for (const [cx, cy] of corners) { ctx.moveTo(ax, ay); ctx.lineTo(cx, cy); }
      ctx.moveTo(corners[0][0], corners[0][1]);
      for (const [cx, cy] of corners.slice(1)) ctx.lineTo(cx, cy);
      ctx.closePath();
      ctx.stroke();
      if (open) {
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255,90,31,1)";
        ctx.beginPath(); ctx.arc(ax, ay, 3 * dpr, 0, Math.PI * 2); ctx.fill();
        ctx.font = `600 ${11 * dpr}px ${getComputedStyle(document.body).fontFamily}`;
        ctx.textAlign = "center";
        ctx.fillText(fill > 0.5 ? "THANK YOU" : "YOU?", ax, ay - 12 * dpr);
      }
    }

    const busy = !reduceMotion || Math.abs(fillTarget - fill) > 0.002;
    if (busy) requestAnimationFrame(draw); else running = false;
  }
}
