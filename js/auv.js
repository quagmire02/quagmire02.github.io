// The little AUV, built from primitives (no CAD file ships with the site).
// The layout is a hover-capable, six-degree-of-freedom AUV (in the spirit of Sparus II / Delphin2):
//   main ducted propulsor (surge), two side thrusters on pylons (surge + yaw by differential thrust),
//   two vertical tunnel thrusters fore and aft (heave + pitch), two lateral tunnel thrusters (sway + yaw),
//   X-tail control fins for flight at speed, a DVL with a downward camera, a forward camera, a beacon mast.
import * as THREE from "three";

/* ======================================================================== */
/* The AUV, built from primitives. Front is +Z, up is +Y.                   */
/* ======================================================================== */
export function buildBot() {
  const root = new THREE.Group();
  const mat = {
    shell: new THREE.MeshPhysicalMaterial({ color: 0xf2ece2, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 }),
    orange: new THREE.MeshPhysicalMaterial({ color: 0xff6a2b, roughness: 0.34, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.42, metalness: 0.65 }),
    duct: new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.42, metalness: 0.65, side: THREE.DoubleSide }),
    bore: new THREE.MeshStandardMaterial({ color: 0x161618, roughness: 0.8, metalness: 0.3, side: THREE.DoubleSide }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0a0b0e, roughness: 0.04, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.02 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xa3a6ab, roughness: 0.28, metalness: 1 }),
    line: new THREE.MeshStandardMaterial({ color: 0x2b2723, roughness: 0.6 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffc79a }),
    ring: new THREE.MeshBasicMaterial({ color: 0xff6a2b }),
    beacon: new THREE.MeshBasicMaterial({ color: 0xff3b1f }),
  };
  const parts = [];
  const part = (name, dir, dist) => {
    const g = new THREE.Group();
    g.name = name;
    root.add(g);
    parts.push({ obj: g, base: new THREE.Vector3(), delta: new THREE.Vector3(...dir).normalize().multiplyScalar(dist) });
    return g;
  };
  const add = (g, geo, m, setup) => { const mesh = new THREE.Mesh(geo, m); setup?.(mesh); g.add(mesh); return mesh; };
  const R = 0.32, L = 1.5;
  const jets = [];       // bubble emitters: { obj, dir } with dir in the emitter's local space
  const spinners = [];   // propellers: { obj, fast }

  // A propeller: hub plus blades. Built spinning about Z, then mounted to face `axis`.
  function propeller(parent, axis, radius, blades = 3) {
    const mount = new THREE.Group();
    if (axis === "y") mount.rotation.x = -Math.PI / 2;
    if (axis === "x") mount.rotation.y = Math.PI / 2;
    parent.add(mount);
    const p = new THREE.Group();
    mount.add(p);
    add(p, new THREE.CylinderGeometry(radius * 0.28, radius * 0.28, radius * 0.5, 16), mat.steel, (m) => { m.rotation.x = Math.PI / 2; });
    for (let k = 0; k < blades; k++) {
      const b = new THREE.Group();
      b.rotation.z = (k / blades) * Math.PI * 2;
      p.add(b);
      add(b, new THREE.BoxGeometry(radius * 0.3, radius * 0.8, radius * 0.06), mat.steel, (m) => { m.position.y = radius * 0.55; m.rotation.y = 0.5; });
    }
    spinners.push({ obj: p, fast: axis !== "z" });
    return mount;
  }

  // A propeller duct (Kort nozzle): a ring with a foil-shaped section, intake facing +Z.
  function duct(ri, t, len) {
    const h = len / 2;
    const pts = [
      [ri + t * 0.55, h], [ri + t * 0.12, h - len * 0.1], [ri, h - len * 0.32], [ri + t * 0.06, -h + len * 0.12],
      [ri + t * 0.28, -h], [ri + t * 0.5, -h], [ri + t * 0.9, -h + len * 0.45], [ri + t, h - len * 0.18],
      [ri + t * 0.9, h - len * 0.04], [ri + t * 0.55, h],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    return new THREE.LatheGeometry(pts, 56).rotateX(Math.PI / 2);
  }

  /* ---- hull: cylinder, rounded tail cap, orange band, panel lines, bolts ---- */
  // Tunnel thrusters go right through the hull: "y" = vertical (heave/pitch), "x" = lateral (sway/yaw).
  // `out` is the side the water leaves from when it fires.
  const TUN = [
    { z: 0.38, axis: "y", out: -1 },
    { z: 0.58, axis: "x", out: 1 },
    { z: -0.34, axis: "x", out: -1 },
    { z: -0.56, axis: "y", out: -1 },
  ];
  const TR = 0.072;
  const hullMat = mat.shell.clone();
  hullMat.onBeforeCompile = (sh) => {
    // Cut the tunnel openings out of the shell so you can see into (and through) each bore.
    const cut = TUN.map(({ z, axis }) =>
      `d = vec2(vHull.${axis === "y" ? "x" : "y"}, vHull.z - (${z.toFixed(3)})); if (dot(d, d) < ${(TR * TR).toFixed(6)}) discard;`).join("\n");
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vHull;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvHull = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vHull;")
      .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>\nvec2 d;\n${cut}`);
  };
  const hull = part("hull", [0, 0, 1], 0);
  add(hull, new THREE.CylinderGeometry(R, R, L, 96, 1, true).rotateX(Math.PI / 2), hullMat);
  add(hull, new THREE.SphereGeometry(R, 80, 24, 0, Math.PI * 2, 0, Math.PI / 2), mat.shell, (m) => { m.rotation.x = -Math.PI / 2; m.position.z = -L / 2; });
  add(hull, new THREE.CylinderGeometry(R + 0.006, R + 0.006, 0.17, 80, 1, true), mat.orange, (m) => { m.rotation.x = Math.PI / 2; m.position.z = 0; });
  for (const z of [-0.2, 0.2]) add(hull, new THREE.TorusGeometry(R + 0.002, 0.005, 8, 80), mat.line, (m) => { m.position.z = z; });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    add(hull, new THREE.SphereGeometry(0.012, 10, 8), mat.steel, (m) => { m.position.set(Math.cos(a) * (R + 0.007), Math.sin(a) * (R + 0.007), 0.12); });
  }
  // Front bulkhead with wet-mate connectors: what you see when the nose comes off.
  add(hull, new THREE.CircleGeometry(R - 0.002, 64), mat.dark, (m) => { m.position.z = L / 2; });
  add(hull, new THREE.TorusGeometry(R - 0.03, 0.008, 8, 64), mat.steel, (m) => { m.position.z = L / 2 + 0.004; });
  for (const [x, y] of [[-0.12, 0.08], [0, 0.13], [0.12, 0.08], [-0.08, -0.1], [0.08, -0.1]]) {
    add(hull, new THREE.CylinderGeometry(0.022, 0.022, 0.04, 16), mat.steel, (m) => { m.rotation.x = Math.PI / 2; m.position.set(x, y, L / 2 + 0.02); });
  }

  /* ---- tunnel thrusters: an open bore across the hull, a motor on a cross bar, a four-blade prop ---- */
  function tunnel({ z, axis, out }) {
    const g = new THREE.Group();
    g.position.z = z;
    if (axis === "x") g.rotation.z = -Math.PI / 2;   // built along Y, turned sideways for the lateral ones
    hull.add(g);
    add(g, new THREE.CylinderGeometry(TR, TR, 2 * R, 40, 1, true), mat.bore);
    for (const s of [-1, 1]) {
      add(g, new THREE.TorusGeometry(TR + 0.01, 0.011, 12, 44), mat.dark, (m) => { m.rotation.x = Math.PI / 2; m.position.y = s * (R - 0.003); });
    }
    add(g, new THREE.BoxGeometry(0.007, 0.01, 2 * TR), mat.dark, (m) => { m.position.y = 0.05; });
    add(g, new THREE.CylinderGeometry(0.021, 0.021, 0.05, 18), mat.dark, (m) => { m.position.y = 0.03; });
    propeller(g, "y", 0.062, 4);
    const nozzle = new THREE.Object3D();
    nozzle.position.y = out * R * 1.08;
    g.add(nozzle);
    jets.push({ obj: nozzle, dir: new THREE.Vector3(0, out, 0) });
    return g;
  }
  const [vFore] = TUN.map(tunnel);

  /* ---- nose: cream cap, dark glass camera window, glowing lens; blinks now and then ---- */
  const eye = part("eye", [0, 0, 1], 0.34);
  add(eye, new THREE.SphereGeometry(R, 72, 32, 0, Math.PI * 2, 0, Math.PI / 2), mat.shell, (m) => { m.rotation.x = Math.PI / 2; m.position.z = L / 2; });
  add(eye, new THREE.CircleGeometry(R - 0.002, 64), mat.dark, (m) => { m.rotation.y = Math.PI; m.position.z = L / 2 + 0.002; });
  add(eye, new THREE.SphereGeometry(R * 1.006, 64, 16, 0, Math.PI * 2, 0, 0.62), mat.glass, (m) => { m.rotation.x = Math.PI / 2; m.position.z = L / 2; });
  add(eye, new THREE.TorusGeometry(R * Math.sin(0.62) * 1.006, 0.01, 10, 64), mat.dark, (m) => { m.position.z = L / 2 + R * Math.cos(0.62); });
  const lens = new THREE.Group();
  lens.position.z = L / 2 + R * 0.935;
  eye.add(lens);
  add(lens, new THREE.TorusGeometry(0.11, 0.018, 16, 56), mat.ring);
  add(lens, new THREE.SphereGeometry(0.052, 24, 16), mat.glow, (m) => { m.scale.z = 0.55; m.position.z = 0.01; });
  add(lens, new THREE.TorusGeometry(0.165, 0.006, 8, 56), mat.steel);

  /* ---- mast with beacon and antenna on top ---- */
  const mast = part("mast", [0, 1, 0], 0.35);
  add(mast, new THREE.BoxGeometry(0.03, 0.16, 0.12), mat.dark, (m) => { m.position.set(0, R + 0.07, -0.08); });
  add(mast, new THREE.CylinderGeometry(0.006, 0.006, 0.2, 8), mat.steel, (m) => { m.position.set(0, R + 0.24, -0.11); });
  const beacon = add(mast, new THREE.SphereGeometry(0.03, 16, 12), mat.beacon, (m) => { m.position.set(0, R + 0.17, -0.04); });

  /* ---- underneath: DVL (four angled transducers) and a downward camera ---- */
  const dvl = part("dvl", [0, -1, 0], 0.32);
  add(dvl, new THREE.CylinderGeometry(0.1, 0.11, 0.07, 36), mat.dark, (m) => { m.position.set(0, -R - 0.025, 0.12); });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    add(dvl, new THREE.CylinderGeometry(0.026, 0.026, 0.014, 20), mat.orange, (m) => {
      m.position.set(Math.cos(a) * 0.055, -R - 0.062, 0.12 + Math.sin(a) * 0.055);
      m.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    });
  }
  add(dvl, new THREE.SphereGeometry(0.034, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat.glass, (m) => { m.rotation.x = Math.PI; m.position.set(0, -R + 0.004, -0.14); });

  /* ---- X-tail control fins ---- */
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0); finShape.lineTo(0.17, -0.06); finShape.lineTo(0.18, -0.2); finShape.lineTo(0, -0.29); finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.016, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.005, bevelSegments: 2 });
  finGeo.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
  finGeo.translate(-0.008, R - 0.02, -L / 2 + 0.16);
  const fins = [];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    const fin = part(`fin${k}`, [-Math.sin(a), Math.cos(a), -0.4], 0.3);
    add(fin, finGeo, mat.orange, (m) => { m.rotation.z = a; });
    fins.push(fin);
  }

  /* ---- main ducted propulsor at the tail ---- */
  // Stator vanes: thin radial struts that hold a duct around its motor.
  function vanes(g, n, r0, r1, x, z, phase = 0) {
    for (let k = 0; k < n; k++) {
      const a = phase + (k / n) * Math.PI * 2;
      add(g, new THREE.BoxGeometry(0.007, r1 - r0, 0.032), mat.dark, (m) => {
        m.position.set(x + Math.cos(a) * (r0 + r1) / 2, Math.sin(a) * (r0 + r1) / 2, z);
        m.rotation.z = a - Math.PI / 2;
      });
    }
  }

  const tail = part("tail", [0, 0, -1], 0.32);
  const tz = -L / 2 - R - 0.08;
  add(tail, duct(0.17, 0.034, 0.17), mat.duct, (m) => { m.position.z = tz; });
  add(tail, new THREE.TorusGeometry(0.17 + 0.034 * 0.55, 0.006, 8, 64), mat.orange, (m) => { m.position.z = tz + 0.085; });
  add(tail, new THREE.CylinderGeometry(0.05, 0.032, 0.12, 24), mat.dark, (m) => { m.rotation.x = Math.PI / 2; m.position.z = tz + 0.05; });
  vanes(tail, 4, 0.04, 0.175, 0, tz + 0.04, Math.PI / 4);
  const tailProp = propeller(tail, "z", 0.16, 3);
  tailProp.position.z = tz - 0.03;
  const tailNozzle = new THREE.Object3D();
  tailNozzle.position.z = tz - 0.12;
  tail.add(tailNozzle);
  jets.push({ obj: tailNozzle, dir: new THREE.Vector3(0, 0, -1) });

  /* ---- two side thrusters on pylons near the tail: ducted, motor pod on stator vanes ---- */
  const sides = [];
  for (const s of [-1, 1]) {
    const pod = part(s < 0 ? "sideL" : "sideR", [s, 0, -0.15], 0.38);
    const px = s * 0.54, pz = -0.6;
    add(pod, new THREE.BoxGeometry(0.15, 0.02, 0.09), mat.dark, (m) => { m.position.set(s * 0.375, 0, pz); });
    add(pod, duct(0.085, 0.024, 0.13), mat.duct, (m) => { m.position.set(px, 0, pz); });
    add(pod, new THREE.TorusGeometry(0.085 + 0.024 * 0.55, 0.005, 8, 48), mat.orange, (m) => { m.position.set(px, 0, pz + 0.065); });
    add(pod, new THREE.CylinderGeometry(0.03, 0.03, 0.09, 24), mat.dark, (m) => { m.rotation.x = Math.PI / 2; m.position.set(px, 0, pz + 0.01); });
    add(pod, new THREE.SphereGeometry(0.03, 20, 12), mat.dark, (m) => { m.scale.z = 1.3; m.position.set(px, 0, pz + 0.055); });
    vanes(pod, 3, 0.028, 0.088, px, pz + 0.03, Math.PI / 2);
    const prop = propeller(pod, "z", 0.08, 3);
    prop.position.set(px, 0, pz - 0.035);
    const nozzle = new THREE.Object3D();
    nozzle.position.set(px, 0, pz - 0.1);
    pod.add(nozzle);
    jets.push({ obj: nozzle, dir: new THREE.Vector3(0, 0, -1) });
    sides.push(pod);
  }

  // Normalise size. Callers choose the resting angle.
  root.scale.setScalar(0.92);
  parts.forEach((p) => p.base.copy(p.obj.position));

  let nextBlink = 2 + Math.random() * 3, blink = 0;
  return {
    root,
    parts,
    jets,
    anchors: [
      { text: "Camera eye", obj: lens },
      { text: "Main propulsor", obj: tail },
      { text: "Tunnel thrusters ×4", obj: vFore },
      { text: "Side thrusters ×2", obj: sides[1] },
      { text: "DVL + down camera", obj: dvl },
    ],
    tick(t, dt, kick) {
      const spin = (2.5 + kick * 30) * dt;
      for (const p of spinners) p.obj.rotation.z += spin * (p.fast ? 1.4 : 1);
      nextBlink -= dt;
      if (nextBlink < 0) { blink = 0.16; nextBlink = 2.5 + Math.random() * 4; }
      blink = Math.max(0, blink - dt);
      lens.scale.y = blink > 0 ? 0.12 : 1;
      beacon.scale.setScalar(0.75 + 0.35 * (0.5 + 0.5 * Math.sin(t * 4)));
    },
  };
}
