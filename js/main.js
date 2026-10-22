import { projects, worlds } from "./projects.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
const narrow = matchMedia("(max-width: 820px)");
const byId = Object.fromEntries(projects.map((p) => [p.id, p]));
const pad = (n) => String(n).padStart(2, "0");
const esc = (s = "") => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const CAT_LABEL = { "3d": "3D", language: "Vision-language", perception: "Perception", products: "Product" };

/* ------------------------------------------------------------------ nav */
const nav = $("[data-nav]");
const hero = $("[data-hero]");
new IntersectionObserver(([e]) => nav.classList.toggle("is-solid", !e.isIntersecting),
  { rootMargin: "-64px 0px 0px 0px" }).observe(hero);

const navLinks = $$(".nav-links a");
const sectionSpy = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) navLinks.forEach((a) => a.classList.toggle("is-current", a.getAttribute("href") === "#" + e.target.id));
  }
}, { rootMargin: "-45% 0px -50% 0px" });
navLinks.map((a) => $(a.getAttribute("href"))).filter(Boolean).forEach((s) => sectionSpy.observe(s));

const menu = $("[data-menu]");
const menuBtn = $("[data-menu-toggle]");
function setMenu(open) {
  menu.hidden = !open;
  menuBtn.setAttribute("aria-expanded", String(open));
  document.documentElement.classList.toggle("is-locked", open);
  nav.classList.toggle("is-menu", open);
}
menuBtn.addEventListener("click", () => setMenu(menu.hidden));
menu.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });

/* ------------------------------------------------------------ gallery */
const gallery = $("[data-gallery]");
gallery.innerHTML = projects.map((p, i) => `
  <li class="card" data-id="${p.id}" data-cats="${p.cats.join(" ")}">
    <button type="button" class="card-btn" data-open="${p.id}" aria-haspopup="dialog">
      <span class="card-frame">
        <span class="card-media" data-splat>
          <img src="${p.thumb}" alt="" loading="lazy" decoding="async">
          ${p.badge ? `<span class="card-badge">${esc(p.badge)}</span>` : ""}
          <span class="card-hud"><b>Cam ${pad(i + 1)}</b><span>${p.media.length} ${p.media.length === 1 ? "figure" : "figures"}</span></span>
        </span>
        <i class="vf vf-tl"></i><i class="vf vf-tr"></i><i class="vf vf-bl"></i><i class="vf vf-br"></i>
      </span>
      <span class="card-meta">
        <span class="card-row"><span class="card-num">${pad(i + 1)}</span><span class="card-title">${esc(p.title)}</span><span class="card-arrow" aria-hidden="true">↗</span></span>
        <span class="card-line">${esc(p.line)}</span>
        <span class="card-tags">${p.cats.map((c) => CAT_LABEL[c]).join(" · ")} · ${esc(p.year)}</span>
      </span>
    </button>
  </li>`).join("");

// Offset every other column so the grid reads like a contact sheet, not a spreadsheet.
function stagger() {
  const cols = getComputedStyle(gallery).gridTemplateColumns.split(" ").length;
  $$(".card", gallery).filter((c) => !c.hidden).forEach((c, i) => {
    c.dataset.stagger = cols > 1 && (i % cols) % 2 === 1 ? "1" : "0";
  });
}
stagger();
new ResizeObserver(stagger).observe(gallery);

if (finePointer && !reduceMotion) {
  $$(".card", gallery).forEach((card) => {
    const p = byId[card.dataset.id];
    const frame = $(".card-frame", card);
    const media = $(".card-media", card);
    let video;
    card.addEventListener("mouseenter", () => {
      if (!p.preview) return;
      if (!video) {
        video = Object.assign(document.createElement("video"), { muted: true, loop: true, playsInline: true, preload: "auto", src: p.preview });
        video.setAttribute("aria-hidden", "true");
        video.addEventListener("playing", () => media.classList.add("is-playing"));
        media.insertBefore(video, media.querySelector(".card-hud"));
      }
      video.play().catch(() => {});
    });
    // Orbit the card a little toward the cursor, with the picture sliding the other way.
    frame.addEventListener("mousemove", (e) => {
      const r = frame.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      frame.style.setProperty("--ry", `${(x * 9).toFixed(2)}deg`);
      frame.style.setProperty("--rx", `${(-y * 9).toFixed(2)}deg`);
      media.style.setProperty("--px", `${(-x * 10).toFixed(1)}px`);
      media.style.setProperty("--py", `${(-y * 10).toFixed(1)}px`);
    });
    card.addEventListener("mouseleave", () => {
      video?.pause();
      media.classList.remove("is-playing");
      ["--rx", "--ry"].forEach((k) => frame.style.removeProperty(k));
      ["--px", "--py"].forEach((k) => media.style.removeProperty(k));
    });
  });

  // An "Open" cursor that follows the pointer over the gallery.
  const cursor = $("[data-cursor]");
  let cx = -200, cy = -200, tx = -200, ty = -200, raf = 0;
  const move = () => {
    cx += (tx - cx) * 0.22; cy += (ty - cy) * 0.22;
    cursor.style.setProperty("--cx", `${cx}px`);
    cursor.style.setProperty("--cy", `${cy}px`);
    raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.5 ? requestAnimationFrame(move) : 0;
  };
  const check = (el) => {
    cursor.classList.toggle("is-on", !!el?.closest?.(".card-btn") && !book.open);
    cursor.classList.toggle("on-ember", !!el?.closest?.(".t-ember"));
  };
  addEventListener("pointermove", (e) => {
    tx = e.clientX; ty = e.clientY;
    check(e.target);
    if (!raf) raf = requestAnimationFrame(move);
  }, { passive: true });
  // Scrolling moves the page under a still pointer, so look again.
  addEventListener("scroll", () => check(document.elementFromPoint(tx, ty)), { passive: true });
}

gallery.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-open]");
  if (btn) openBook(btn.dataset.open, $(".card-media", btn));
});
document.addEventListener("click", (e) => {
  const link = e.target.closest("[data-open-project]");
  if (!link) return;
  e.preventDefault();
  const id = link.dataset.openProject;
  openBook(id, cardMedia(id, true));
});

/* ------------------------------------------------------------ filters */
const filters = $("[data-filters]");
filters.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-filter]");
  if (!btn) return;
  const f = btn.dataset.filter;
  $$("button", filters).forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
  $$(".card", gallery).forEach((card) => {
    const show = f === "all" || card.dataset.cats.split(" ").includes(f);
    card.hidden = !show;
    if (show) {
      card.classList.add("is-out");
      requestAnimationFrame(() => requestAnimationFrame(() => card.classList.remove("is-out")));
    }
  });
  stagger();
});
const visibleIds = () => $$(".card", gallery).filter((c) => !c.hidden).map((c) => c.dataset.id);

/* --------------------------------------------------------------- book */
const book = $("[data-book]");
const stage = $("[data-stage]", book);
const spread = $("[data-spread]", book);
const leftEl = $("[data-left]", book);
const rightEl = $("[data-right]", book);
const backdrop = $("[data-backdrop]", book);
const countEl = $("[data-book-count]", book);
const EASE_MOVE = "cubic-bezier(.2,.7,.1,1)";
const EASE_TURN = "cubic-bezier(.45,.05,.2,1)";

let order = [];
let pos = 0;
let mediaIdx = 0;
let busy = false;
const current = () => byId[order[pos]];
const use3D = () => !reduceMotion && !narrow.matches;

function cardMedia(id, onlyIfOnScreen = false) {
  const el = $(`.card[data-id="${id}"]:not([hidden]) .card-media`, gallery);
  if (!el) return null;
  if (!onlyIfOnScreen) return el;
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight ? el : null;
}

function mediaHTML(m, still) {
  if (m.type === "video" && !still) {
    return `<video class="${m.tall ? "is-tall" : ""}" src="${m.src}" poster="${m.poster}" muted loop playsinline autoplay controls
      controlslist="nodownload noplaybackrate" disablepictureinpicture></video>`;
  }
  const src = m.type === "video" ? m.poster : m.src;
  return `<img class="${m.tall ? "is-tall" : ""}" src="${src}" alt="${esc(m.cap)}" decoding="async">`;
}

function leftHTML(p, mi = 0, still = false) {
  const m = p.media[mi];
  const page = order.indexOf(p.id) * 2 + 1;
  const thumbs = p.media.length > 1 ? `<div class="plate-thumbs" role="tablist" aria-label="Media">
      ${p.media.map((x, i) => `<button type="button" role="tab" class="${x.type === "video" ? "is-video" : ""}" data-media="${i}"
        aria-current="${i === mi}" aria-label="${esc(x.cap)}"><img src="${x.type === "video" ? x.poster : x.src}" alt="" loading="lazy"></button>`).join("")}
    </div>` : "";
  return `<div class="plate">
      <div class="plate-stage" data-plate-stage>${mediaHTML(m, still)}</div>
      <div class="plate-foot">
        <p class="plate-cap" data-plate-cap><b>Fig. ${mi + 1}</b>${esc(m.cap)}</p>
        ${thumbs}
      </div>
      <span class="folio">p. ${pad(page)}</span>
    </div>`;
}

function rightHTML(p, withId = true) {
  const n = order.indexOf(p.id);
  const facts = p.facts?.length ? `<dl class="rp-facts">
      ${p.facts.map(([v, l]) => `<div><dt>${esc(v)}</dt><dd>${esc(l)}</dd></div>`).join("")}</dl>` : "";
  const links = p.links?.length ? `<p class="rp-links">${p.links.map(([t, u]) =>
      `<a class="link-arrow" href="${u}" target="_blank" rel="noopener">${esc(t)}</a>`).join("")}</p>` : "";
  return `<article class="rp" data-rp>
      <p class="rp-kicker"><span>Cam ${pad(projects.indexOf(p) + 1)} · ${p.cats.map((c) => CAT_LABEL[c]).join(" · ")} · ${esc(p.year)}</span>
        <span class="rp-status${p.live ? " is-live" : ""}">${esc(p.status)}</span></p>
      <h2 class="rp-title"${withId ? ' id="book-title"' : ""}>${esc(p.title)}${p.subtitle ? `<small>${esc(p.subtitle)}</small>` : ""}</h2>
      <p class="rp-line">${esc(p.line)}</p>
      ${facts}
      <h3 class="rp-label">In plain words</h3>
      <p class="rp-plain">${esc(p.plain)}</p>
      <h3 class="rp-label">${esc(p.techLabel ?? "Under the hood")}</h3>
      <ul class="rp-tech">${p.tech.map((t) => `<li>${Array.isArray(t) ? `<b>${esc(t[0])}:</b> ${esc(t[1])}` : esc(t)}</li>`).join("")}</ul>
      <ul class="rp-stack" aria-label="Stack">${p.stack.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
      ${links}
      <span class="folio">p. ${pad(n * 2 + 2)}</span>
    </article>`;
}

function coverHTML(p) {
  return `<div class="cover">
      <img src="${p.thumb}" alt="">
      <span class="cover-band"></span>
      <div class="cover-text"><p>Cam ${pad(projects.indexOf(p) + 1)} · ${esc(p.year)}</p><h3>${esc(p.title)}</h3></div>
    </div>`;
}

function makeLeaf(side, frontHTML, frontKind, backHTML, backKind) {
  const leaf = document.createElement("div");
  leaf.className = `leaf ${side}`;
  leaf.innerHTML = `
    <div class="leaf-face leaf-front ${frontKind}">${frontHTML}<i class="leaf-shade"></i></div>
    <div class="leaf-face leaf-back ${backKind}">${backHTML}<i class="leaf-shade"></i></div>`;
  spread.append(leaf);
  return leaf;
}

function turnLeaf(leaf, from, to, opts = {}) {
  const shades = $$(".leaf-shade", leaf);
  const timing = { duration: opts.duration ?? 900, delay: opts.delay ?? 0, easing: EASE_TURN, fill: "forwards" };
  shades[0].animate([{ opacity: 0 }, { opacity: 0.28 }], timing);
  shades[1].animate([{ opacity: 0.28 }, { opacity: 0 }], timing);
  return leaf.animate([
    { transform: `translateZ(1px) rotateY(${from}deg)` },
    { transform: `translateZ(1px) rotateY(${to}deg)` },
  ], timing).finished;
}

function render(p, mi = 0) {
  mediaIdx = mi;
  leftEl.innerHTML = leftHTML(p, mi);
  rightEl.innerHTML = rightHTML(p);
  countEl.textContent = `${pad(pos + 1)} / ${pad(order.length)}`;
  book.setAttribute("aria-labelledby", "book-title");
}

function setMedia(i) {
  const p = current();
  mediaIdx = i;
  $("[data-plate-stage]", leftEl).innerHTML = mediaHTML(p.media[i]);
  $("[data-plate-cap]", leftEl).innerHTML = `<b>Fig. ${i + 1}</b>${esc(p.media[i].cap)}`;
  $$("[data-media]", leftEl).forEach((b) => b.setAttribute("aria-current", String(+b.dataset.media === i)));
}
leftEl.addEventListener("click", (e) => {
  const b = e.target.closest("[data-media]");
  if (b) setMedia(+b.dataset.media);
});

function flyTransform(target) {
  // Transform that puts the closed cover (right half of the spread) over a gallery card.
  const sr = spread.getBoundingClientRect();
  const cr = target.getBoundingClientRect();
  const s = cr.height / sr.height;
  const dx = cr.left + cr.width / 2 - (sr.left + sr.width * 0.75);
  const dy = cr.top + cr.height / 2 - (sr.top + sr.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${s})`;
}

async function openBook(id, origin) {
  if (busy || book.open) return;
  order = visibleIds();
  if (!order.includes(id)) order = projects.map((p) => p.id);
  pos = order.indexOf(id);
  const p = current();
  render(p);
  document.documentElement.classList.add("is-locked");
  $("[data-cursor]")?.classList.remove("is-on");
  book.showModal();

  if (!use3D() || !origin) {
    busy = true;
    const anims = [
      backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" }),
      stage.animate(narrow.matches && !reduceMotion
        ? [{ transform: "translateY(40px)", opacity: 0 }, { transform: "none", opacity: 1 }]
        : [{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: EASE_MOVE }),
    ];
    await Promise.all(anims.map((a) => a.finished));
    busy = false;
    return;
  }

  busy = true;
  book.classList.add("is-animating");
  leftEl.classList.add("is-hidden-page");
  const leaf = makeLeaf("is-right", coverHTML(p), "", leftHTML(p, 0, true), "is-plate");
  spread.style.transformOrigin = "75% 50%";
  origin.style.visibility = "hidden";
  backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: "ease-out" });
  spread.animate([{ transform: flyTransform(origin) }, { transform: "none" }], { duration: 620, easing: EASE_MOVE });
  await turnLeaf(leaf, 0, -180, { delay: 420, duration: 950 });
  origin.style.visibility = "";
  leftEl.classList.remove("is-hidden-page");
  leaf.remove();
  book.classList.remove("is-animating");
  busy = false;
}

async function closeBook() {
  if (busy || !book.open) return;
  busy = true;
  const p = current();
  $$("video", book).forEach((v) => v.pause());
  const target = cardMedia(p.id, true);

  if (use3D() && target) {
    book.classList.add("is-animating");
    const leaf = makeLeaf("is-right", coverHTML(p), "", leftHTML(p, mediaIdx, true), "is-plate");
    leaf.style.transform = "translateZ(1px) rotateY(-180deg)";
    leftEl.classList.add("is-hidden-page");
    await turnLeaf(leaf, -180, 0, { duration: 780 });
    spread.style.transformOrigin = "75% 50%";
    target.style.visibility = "hidden";
    backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 480, easing: "ease-in", fill: "forwards" });
    await spread.animate([{ transform: "none" }, { transform: flyTransform(target) }],
      { duration: 520, easing: "cubic-bezier(.5,0,.2,1)", fill: "forwards" }).finished;
    target.style.visibility = "";
    leaf.remove();
  } else {
    await Promise.all([
      backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: "forwards" }).finished,
      stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: "forwards" }).finished,
    ]);
  }
  book.close();
  book.getAnimations({ subtree: true }).forEach((a) => a.cancel());
  spread.style.transformOrigin = "";
  leftEl.classList.remove("is-hidden-page");
  leftEl.innerHTML = rightEl.innerHTML = "";
  book.classList.remove("is-animating");
  document.documentElement.classList.remove("is-locked");
  busy = false;
}

async function turn(dir) {
  if (busy || order.length < 2) return;
  const from = current();
  const fromMedia = mediaIdx;
  const fromScroll = $("[data-rp]", rightEl)?.scrollTop ?? 0;
  pos = (pos + dir + order.length) % order.length;
  const to = current();
  $$("video", leftEl).forEach((v) => v.pause());

  if (!use3D()) {
    busy = true;
    const target = narrow.matches ? spread : stage;
    await target.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards" }).finished;
    render(to);
    if (narrow.matches) spread.scrollTo(0, 0);
    await target.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, fill: "forwards" }).finished;
    busy = false;
    return;
  }

  busy = true;
  if (dir > 0) {
    const leaf = makeLeaf("is-right", rightHTML(from, false), "is-paper", leftHTML(to, 0, true), "is-plate");
    $("[data-rp]", leaf).scrollTop = fromScroll;
    rightEl.innerHTML = rightHTML(to);
    await turnLeaf(leaf, 0, -180);
    leftEl.innerHTML = leftHTML(to, 0);
    leaf.remove();
  } else {
    const leaf = makeLeaf("is-left", leftHTML(from, fromMedia, true), "is-plate", rightHTML(to, false), "is-paper");
    leftEl.innerHTML = leftHTML(to, 0);
    await turnLeaf(leaf, 0, 180);
    rightEl.innerHTML = rightHTML(to);
    leaf.remove();
  }
  mediaIdx = 0;
  countEl.textContent = `${pad(pos + 1)} / ${pad(order.length)}`;
  busy = false;
}

$("[data-book-close]", book).addEventListener("click", closeBook);
$("[data-book-next]", book).addEventListener("click", () => turn(1));
$("[data-book-prev]", book).addEventListener("click", () => turn(-1));
backdrop.addEventListener("click", closeBook);
stage.addEventListener("click", (e) => { if (e.target === stage) closeBook(); });
book.addEventListener("cancel", (e) => { e.preventDefault(); closeBook(); });
book.addEventListener("keydown", (e) => {
  if (e.target.closest("video")) return;
  if (e.key === "ArrowRight") { e.preventDefault(); turn(1); }
  if (e.key === "ArrowLeft") { e.preventDefault(); turn(-1); }
});

// Swipe between projects on touch screens.
let touchX = null;
book.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
book.addEventListener("touchend", (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  touchX = null;
  if (Math.abs(dx) > 70 && !e.target.closest(".plate-thumbs, video")) turn(dx < 0 ? 1 : -1);
}, { passive: true });

/* ------------------------------------------------------------- worlds */
$("[data-worlds]").innerHTML = worlds.map((w) => `
  <figure class="world">
    <div class="world-frame" data-splat style="aspect-ratio:${w.ratio ?? "16 / 10"}">
      <video muted loop playsinline preload="none" poster="${w.poster}" data-autoplay aria-label="${esc(w.title)}">
        <source src="${w.src}" type="video/mp4">
      </video>
    </div>
    <figcaption><span class="world-title">${esc(w.title)}</span><span class="world-tag">${esc(w.tag)}</span></figcaption>
  </figure>`).join("");

/* ------------------------------------------------ autoplay in view only */
const autoplay = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const v = e.target;
    if (e.isIntersecting && !reduceMotion) { v.preload = "auto"; v.play().catch(() => {}); }
    else v.pause();
  }
}, { threshold: 0.35 });
$$("video[data-autoplay]").forEach((v) => autoplay.observe(v));

/* ------------------------------------------------------- copy, CV, etc. */
const toast = Object.assign(document.createElement("div"), { className: "toast", role: "status" });
document.body.append(toast);
$$("[data-copy]").forEach((btn) => btn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(btn.dataset.copy);
    toast.textContent = "Email copied";
  } catch {
    toast.textContent = btn.dataset.copy;
  }
  toast.classList.add("is-on");
  setTimeout(() => toast.classList.remove("is-on"), 1800);
}));

// Hide the CV links until a CV file is actually in place.
const cvLinks = $$("[data-cv]");
fetch(cvLinks[0]?.getAttribute("href") ?? "", { method: "HEAD" })
  .then((r) => { if (!r.ok) throw 0; })
  .catch(() => cvLinks.forEach((a) => (a.closest("[data-cv-item]") ?? a).remove()));

/* --------------------------------------- splat-in: grow from points on view */
if (!reduceMotion && "IntersectionObserver" in window && CSS.supports?.("mask-image", "none")) {
  const targets = [
    ...$$(".section-head h2, .contact-title, .stat-num"),
    ...$$("[data-splat]"),
    ...$$(".clip"),
  ];
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      io.unobserve(el);
      requestAnimationFrame(() => el.classList.add("is-in"));
      // Drop the mask once solid, so it costs nothing afterwards.
      setTimeout(() => el.classList.add("is-done"), 1700 + (parseFloat(el.style.transitionDelay) || 0));
    }
  }, { rootMargin: "0px 0px -10% 0px" });
  targets.forEach((el) => { el.classList.add("splat"); io.observe(el); });
  // Cards in one row arrive one after another, like cameras firing round the ring.
  $$(".card-media", gallery).forEach((el, i) => { el.style.transitionDelay = `${(i % 4) * 110}ms`; });
}

/* ------------------------------------------- headings: words rise into place */
$$("h2").forEach((h) => {
  let i = 0;
  const wrap = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(part); return; }
          const w = document.createElement("span");
          w.className = "w";
          w.style.setProperty("--i", i++);
          w.textContent = part;
          frag.append(w);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === 1 && child.tagName !== "BR") wrap(child);
    }
  };
  wrap(h);
});

/* ------------------------------------------- trajectory: the path draws as you read */
{
  const path = $("[data-trajectory]");
  if (path) {
    const keys = $$(".keyframe", path);
    const update = () => {
      const r = path.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (innerHeight * 0.6 - r.top) / r.height));
      path.style.setProperty("--p", p.toFixed(3));
      keys.forEach((k) => k.classList.toggle("is-on", k.getBoundingClientRect().top < innerHeight * 0.6));
    };
    addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });
    update();
  }
}

/* ------------------------------------------- numbers count up when they arrive */
{
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const node = [...e.target.childNodes].find((n) => n.nodeType === 3 && /\d/.test(n.textContent));
      if (!node || reduceMotion) continue;
      const [, num, suffix] = node.textContent.match(/^([\d.]+)(.*)$/s) || [];
      if (!num) continue;
      const end = parseFloat(num);
      const dec = (num.split(".")[1] || "").length;
      const t0 = performance.now();
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / 1400);
        node.textContent = (end * (1 - Math.pow(1 - k, 3))).toFixed(dec) + suffix;
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }, { threshold: 0.6 });
  $$(".stat-num, .duburi-facts dt").forEach((el) => io.observe(el));
}
