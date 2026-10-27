/* Parallax Universe
 *
 * The idea: every layer is a box that is moved up by (scrollY * speed).
 *   speed < 1  -> moves slower than the page  -> looks far away
 *   speed = 1  -> moves with the page
 *   speed > 1  -> moves faster than the page  -> looks close to the camera
 *
 * To make an object appear in the middle of the screen at a chosen moment,
 * each object gets `at` (0 = top of the page, 1 = bottom) and `x` (% from left).
 * The script converts that into a position, so you never do the maths by hand.
 */

const world = document.getElementById('world');
const sky = document.getElementById('sky');
const bar = document.getElementById('bar');
const ship = document.getElementById('ship');
const captions = document.querySelectorAll('.caption');

/* Small seeded random generator: the universe looks the same on every load */
function seeded(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = seeded(2026);

/* ---------- 1. The layers, from farthest to nearest ---------- */
const LAYERS = [
  { speed: 0.12, depth: 6, items: [                       // nebula clouds
    { cls: 'nebula', at: 0.18, x: 25, size: 760, c1: '#6a3df0' },
    { cls: 'nebula', at: 0.45, x: 78, size: 820, c1: '#1fb6c9' },
    { cls: 'nebula', at: 0.7,  x: 30, size: 700, c1: '#ff5fa2' },
    { cls: 'nebula', at: 0.95, x: 60, size: 760, c1: '#ff8a3d' },
  ]},
  { speed: 0.06, depth: 4, count: 90, make: r => ({        // far stars
    cls: 'star', t: r(), x: r() * 100, size: 1 + r() * 1.2, d: r() * 3 + 's' }) },
  { speed: 0.2, depth: 9, count: 50, make: r => ({         // nearer stars
    cls: 'star', t: r(), x: r() * 100, size: 2 + r() * 1.6, d: r() * 3 + 's' }) },
  { speed: 0.3, depth: 12, items: [                       // small distant planets
    { cls: 'planet', at: 0.1,  x: 82, size: 90,  c1: '#8fd3ff', c2: '#1b3b7a' },
    { cls: 'planet', at: 0.33, x: 12, size: 60,  c1: '#b9f0c8', c2: '#2d6b52' },
    { cls: 'planet', at: 0.55, x: 86, size: 70,  c1: '#d9b3ff', c2: '#4a2a7a' },
    { cls: 'planet', at: 0.78, x: 14, size: 110, c1: '#ffcf8f', c2: '#8a3f12' },
  ]},
  { speed: 0.55, depth: 20, items: [                      // big planets, moon, sun
    { cls: 'planet', at: 0.22, x: 20, size: 170, c1: '#ff8a6b', c2: '#6b1d2e' },
    { cls: 'planet ring', at: 0.4, x: 72, size: 280, c1: '#f4c98b', c2: '#7a4a2a' },
    { cls: 'planet', at: 0.46, x: 18, size: 80, c1: '#e6e6ee', c2: '#555766' },
    { cls: 'sun', at: 1, x: 50, size: 560 },
  ]},
  { speed: 0.9, depth: 14, items: [                       // comets
    { cls: 'comet', at: 0.78, x: 82, size: 380, rot: 14, dx: -0.5 },
    { cls: 'comet', at: 0.9,  x: 28, size: 220, rot: 10, dx: -0.4 },
  ]},
  { speed: 1.25, depth: 28, count: 20, make: r => ({       // asteroid field
    cls: 'asteroid a' + ((r() * 3) | 0), at: 0.5 + r() * 0.2, x: r() * 100,
    size: 18 + r() * 52, rot: r() * 360, dx: (r() - 0.5) * 0.1, spin: (r() - 0.5) * 0.12 }) },
  { speed: 1.6, depth: 40, count: 36, make: r => ({        // foreground dust
    cls: 'dust', t: r(), x: r() * 100, size: 2 + r() * 5 }) },
  { speed: 1.95, depth: 56, items: [                      // blurred rocks very close to the camera
    { cls: 'asteroid rock-dark a0', at: 0.58, x: 8,  size: 190, rot: 20,  spin: 0.05 },
    { cls: 'asteroid rock-dark a1', at: 0.66, x: 92, size: 230, rot: 200, spin: -0.04 },
    { cls: 'asteroid rock-dark a2', at: 0.74, x: 14, size: 150, rot: 90,  spin: 0.06 },
  ]},
];

/* The sky colour changes as you travel: [progress, top colour, bottom colour] */
const SKY = [
  [0,    '#05060f', '#1a1f4a'],
  [0.25, '#0b0820', '#3a1b5c'],
  [0.5,  '#04101c', '#0e4a5c'],
  [0.75, '#120612', '#5c1f2e'],
  [1,    '#1a0b06', '#7a3a14'],
];

/* ---------- 2. Build the layers ---------- */
let vh, maxScroll, groups = [], drifters = [], mx = 0, lastY = 0, thrustTimer;

function build() {
  world.innerHTML = '';
  groups = []; drifters = [];
  vh = window.innerHeight;
  maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);

  LAYERS.forEach(L => {
    const group = document.createElement('div');
    group.className = 'layer';
    const items = L.items || Array.from({ length: L.count }, () => L.make(rnd));
    items.forEach(o => group.appendChild(createObject(o, L)));
    world.appendChild(group);
    groups.push({ el: group, speed: L.speed, depth: L.depth });
  });
  update();
}

function createObject(o, L) {
  const el = document.createElement('div');
  el.className = 'obj ' + o.cls;

  // vertical position: random spread (t) or "centred on screen at scroll position (at)"
  const top = o.t !== undefined
    ? o.t * (L.speed * maxScroll + vh)
    : o.at * maxScroll * L.speed + vh / 2;

  el.style.left = o.x + '%';
  el.style.top = top + 'px';
  el.style.fontSize = o.size + 'px';
  el.style.setProperty('--rot', (o.rot || 0) + 'deg');
  if (o.c1) el.style.setProperty('--c1', o.c1);
  if (o.c2) el.style.setProperty('--c2', o.c2);
  if (o.d) el.style.setProperty('--d', o.d);

  // objects that drift sideways or spin while you scroll
  if (o.dx || o.spin) {
    drifters.push({ el, at: (o.at || 0) * maxScroll, dx: o.dx || 0, rot: o.rot || 0, spin: o.spin || 0 });
  }
  return el;
}

/* ---------- 3. Update everything on scroll ---------- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

function skyAt(p) {
  let i = 0;
  while (i < SKY.length - 2 && p > SKY[i + 1][0]) i++;
  const [p0, t0, b0] = SKY[i], [p1, t1, b1] = SKY[i + 1];
  const t = clamp((p - p0) / (p1 - p0), 0, 1);
  return `linear-gradient(${mix(t0, t1, t)}, ${mix(b0, b1, t)})`;
}

function update() {
  const y = window.scrollY;
  const p = clamp(y / maxScroll, 0, 1);

  // the parallax itself: each layer moves up by scroll * speed, plus a mouse shift by depth
  groups.forEach(g => {
    g.el.style.transform = `translate3d(${-mx * g.depth}px, ${-y * g.speed}px, 0)`;
  });
  drifters.forEach(d => {
    const s = y - d.at;
    d.el.style.transform =
      `translate(-50%, -50%) translate(${d.dx * s}px, 0) rotate(${d.rot + d.spin * y}deg)`;
  });

  sky.style.background = skyAt(p);
  bar.style.transform = `scaleX(${p})`;

  // ship: leans toward the mouse, flame grows with scroll speed
  ship.style.transform = `translate(-50%, 0) translate(${mx * 14}px, 0) rotate(${mx * 6}deg)`;
  ship.style.setProperty('--thrust', 1 + Math.min(Math.abs(y - lastY) / 30, 1.2));
  clearTimeout(thrustTimer);
  thrustTimer = setTimeout(() => ship.style.setProperty('--thrust', 1), 120);
  lastY = y;

  // captions fade in as their scene reaches the middle of the screen
  captions.forEach(c => {
    const r = c.getBoundingClientRect();
    const d = Math.abs(r.top + r.height / 2 - vh / 2) / vh;
    c.style.opacity = clamp(1 - (d - 0.2) * 3, 0, 1);
  });
}

/* ---------- 4. Events ---------- */
let queued = false;
function requestUpdate() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; update(); });
}

window.addEventListener('scroll', requestUpdate, { passive: true });

if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  window.addEventListener('mousemove', e => {
    mx = (e.clientX / window.innerWidth - 0.5) * 2;
    requestUpdate();
  });
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(build, 150);
});

document.getElementById('again').addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

build();
