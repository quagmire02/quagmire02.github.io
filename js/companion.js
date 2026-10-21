// The little AUV from About swims down (or up) the page with you, peeking in from the right edge.
// Hover a project and it flies over to that card and shines its flashlight where you are looking.
// A click on it dives to the next view.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildBot } from "./auv.js";

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
const root = document.querySelector("[data-buddy]");
if (root) start().catch((err) => { console.warn("companion disabled:", err); root.remove(); });

async function start() {
  const canvas = root.querySelector("canvas");
  const tip = root.querySelector("[data-buddy-tip]");
  const beam = document.querySelector("[data-beam]");
  const bubbleLayer = document.querySelector("[data-bubbles]");
  const hero = document.querySelector("[data-hero]");
  const bigPet = document.querySelector("[data-pet]");
  const gallery = document.querySelector("[data-gallery]");
  const contact = document.querySelector("#contact");
  const views = [...document.querySelectorAll("[data-view]")];

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xfff1e0, 1.7);
  key.position.set(-2, 3, 2.5);
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0x2a1408, 0.7));
  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
  camera.position.set(0, 0.5, 4.2);
  camera.lookAt(0, 0, 0);

  const bot = buildBot();
  const model = bot.root;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.position.sub(box.getCenter(new THREE.Vector3()));
  const holder = new THREE.Group();
  holder.scale.setScalar(2.2 / Math.max(size.x, size.z));
  holder.add(model);
  const pose = new THREE.Group();
  pose.add(holder);
  scene.add(pose);

  // A small lamp on the nose, so the flashlight reads on the model too.
  const lamp = new THREE.PointLight(0xffe6b0, 0, 3);
  lamp.position.set(0, 0, 0.9);
  pose.add(lamp);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  /* ---- what is on screen ---- */
  let heroVisible = true, bigPetVisible = false, contactVisible = false;
  new IntersectionObserver(([e]) => { heroVisible = e.intersectionRatio > 0.35; }, { threshold: [0, 0.35, 1] }).observe(hero);
  if (bigPet) new IntersectionObserver(([e]) => { bigPetVisible = e.isIntersecting; }, { threshold: 0.25 }).observe(bigPet);
  if (contact) new IntersectionObserver(([e]) => { contactVisible = e.isIntersecting; }, { threshold: 0.3 }).observe(contact);

  /* ---- pointer, hovered card, hovered buddy ---- */
  let mx = -1, my = -1, overBuddy = false, card = null, cardTimer = 0;
  addEventListener("pointermove", (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });
  root.addEventListener("pointerenter", () => { overBuddy = true; updateTip(); });
  root.addEventListener("pointerleave", () => { overBuddy = false; });
  if (gallery && finePointer) {
    gallery.addEventListener("pointerover", (e) => {
      const c = e.target.closest(".card");
      if (!c) return;
      clearTimeout(cardTimer);
      if (card && card !== c) card.classList.remove("is-lit");
      card = c;
      card.classList.add("is-lit");
      gallery.classList.add("has-light");
    });
    gallery.addEventListener("pointerout", (e) => {
      const c = e.target.closest(".card");
      if (!c || c.contains(e.relatedTarget)) return;
      // A short grace period so moving between cards does not send it back to the edge.
      cardTimer = setTimeout(() => {
        card?.classList.remove("is-lit");
        card = null;
        gallery.classList.remove("has-light");
      }, 220);
    });
  }

  function currentIndex() {
    const mid = innerHeight * 0.45;
    let idx = -1;
    views.forEach((v, i) => { if (v.getBoundingClientRect().top < mid) idx = i; });
    return idx;
  }
  function updateTip() {
    const next = views[currentIndex() + 1];
    tip.textContent = next ? `Dive to ${next.dataset.viewName}` : "Surface ↑";
  }
  root.addEventListener("focus", updateTip);
  root.addEventListener("click", () => {
    const next = views[currentIndex() + 1];
    kick = 1;
    burst(14);
    if (next) next.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    else scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  });

  /* ---- bubbles ---- */
  function burst(n) {
    if (reduceMotion || !bubbleLayer) return;
    for (let i = 0; i < n; i++) {
      const b = document.createElement("i");
      const s = 4 + Math.random() * 9;
      b.style.cssText = `left:${x + (Math.random() - 0.5) * W * 0.5}px;top:${y + (Math.random() - 0.2) * H * 0.5}px;width:${s}px;height:${s}px;--dx:${(Math.random() - 0.5) * 60}px;--dur:${1.2 + Math.random() * 1.4}s`;
      bubbleLayer.append(b);
      setTimeout(() => b.remove(), 2800);
    }
  }

  /* ---- loop ---- */
  let W = root.offsetWidth, H = root.offsetHeight;
  addEventListener("resize", () => { W = root.offsetWidth; H = root.offsetHeight; });
  let x = innerWidth - W * 0.2, y = innerHeight * 0.2, vx = 0, vy = 0;
  let kick = 0, last = performance.now(), shown = 0, light = 0, lastScroll = scrollY, speed = 0;
  let yaw = -0.6, pitch = 0, lookX, lookY;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;

    const ds = scrollY - lastScroll;
    lastScroll = scrollY;
    speed += ((ds / Math.max(1, dt)) / innerHeight - speed) * Math.min(1, dt * 6);

    // Where to be: next to the hovered project, or swimming down the right edge with your scroll.
    let tx, ty, inspect = false;
    if (card) {
      const media = card.querySelector(".card-media");
      const r = media.getBoundingClientRect();
      if (r.bottom > 0 && r.top < innerHeight) {
        inspect = true;
        const orbit = reduceMotion ? 0 : 1;
        const side = r.right + W * 0.6 < innerWidth ? 1 : -1;   // sit beside the card, on whichever side has room
        tx = (side > 0 ? r.right + W * 0.2 : r.left - W * 0.2) + Math.cos(t * 1.3) * 16 * orbit;
        ty = Math.max(70 + H / 2, r.top + H * 0.2) + Math.sin(t * 1.7) * 10 * orbit;
        const inside = mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom;
        lookX = inside ? mx : r.left + r.width / 2;
        lookY = inside ? my : r.top + r.height * 0.45;
        media.style.setProperty("--sx", `${(((lookX - r.left) / r.width) * 100).toFixed(1)}%`);
        media.style.setProperty("--sy", `${(((lookY - r.top) / r.height) * 100).toFixed(1)}%`);
      }
    }
    if (!inspect) {
      const max = document.documentElement.scrollHeight - innerHeight;
      const progress = max > 0 ? scrollY / max : 0;
      tx = innerWidth - W * (overBuddy ? 0.56 : 0.2);   // peeks in from the edge, comes out when you point at it
      ty = innerHeight * (0.18 + progress * 0.62) + Math.max(-60, Math.min(60, speed * 40));
    }

    // Springy swim toward the target.
    const k = inspect ? 10 : 8;
    vx += (tx - x) * k * dt; vy += (ty - y) * k * dt;
    vx *= Math.pow(0.015, dt); vy *= Math.pow(0.015, dt);
    x += vx * dt * 4; y += vy * dt * 4;
    root.style.setProperty("--x", `${x.toFixed(1)}px`);
    root.style.setProperty("--y", `${y.toFixed(1)}px`);

    const want = inspect || (!heroVisible && !bigPetVisible && !contactVisible) ? 1 : 0;
    shown += (want - shown) * Math.min(1, dt * 4);
    root.style.opacity = shown.toFixed(3);
    root.style.pointerEvents = shown > 0.5 && !inspect ? "auto" : "none";

    // Face the thing it is lighting, or nose along your scroll direction.
    let tyaw, tpitch;
    if (inspect) {
      tyaw = Math.max(-1.3, Math.min(1.3, (lookX - x) / 160));
      tpitch = Math.max(-0.7, Math.min(0.7, (lookY - y) / 220));
    } else {
      tyaw = -0.6 + Math.sin(t * 0.4) * 0.25;
      tpitch = Math.max(-0.55, Math.min(0.55, speed * 0.5));
    }
    yaw += (tyaw - yaw) * Math.min(1, dt * 5);
    pitch += (tpitch - pitch) * Math.min(1, dt * 5);
    pose.rotation.set(pitch, yaw, Math.sin(t * 1.1) * 0.05);
    bot.tick(t, dt, kick);
    pose.position.y = reduceMotion ? 0 : Math.sin(t * 1.6) * 0.06;
    kick *= Math.pow(0.03, dt);
    pose.position.x = -kick * 0.4;

    // The flashlight: a soft cone from the nose to where you are looking.
    light += ((inspect ? 1 : 0) - light) * Math.min(1, dt * 6);
    lamp.intensity = light * 6;
    if (beam) {
      if (light > 0.01 && lookX !== undefined) {
        const dx = lookX - x, dy = lookY - y;
        beam.style.setProperty("--bx", `${x.toFixed(1)}px`);
        beam.style.setProperty("--by", `${y.toFixed(1)}px`);
        beam.style.setProperty("--bl", `${Math.hypot(dx, dy).toFixed(1)}px`);
        beam.style.setProperty("--ba", `${Math.atan2(dy, dx).toFixed(4)}rad`);
      }
      beam.style.opacity = light.toFixed(3);
    }

    if (!inspect && Math.abs(speed) > 0.9 && Math.random() < dt * 14 && shown > 0.5) burst(1);

    if (shown > 0.01) renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  root.classList.add("is-ready");
  requestAnimationFrame(frame);
}
