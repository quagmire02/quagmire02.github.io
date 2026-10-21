// Loads the compact point cloud written by the converter (see README). Shared by the hero and the contact orbit.
const cache = new Map();

export function loadCloud(url) {
  if (!cache.has(url)) cache.set(url, fetchCloud(url));
  return cache.get(url);
}

async function fetchCloud(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`cloud ${res.status}`);
  const buf = await res.arrayBuffer();
  const dv = new DataView(buf);
  const count = dv.getUint32(4, true);
  const mn = [0, 1, 2].map((k) => dv.getFloat32(8 + k * 4, true));
  const mx = [0, 1, 2].map((k) => dv.getFloat32(20 + k * 4, true));
  const q = new Int16Array(buf, 32, count * 3);
  const colors = new Uint8Array(buf, 32 + count * 6, count * 3);
  const slots = new Uint8Array(buf, 32 + count * 9, count);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) {
    const k = i % 3;
    positions[i] = mn[k] + ((q[i] + 32767) / 65534) * (mx[k] - mn[k]);
  }
  const radius = Math.max(mx[0] - mn[0], mx[2] - mn[2]) / 2;
  return { positions, colors, slots, count, radius, ground: mn[1], top: mx[1] };
}
