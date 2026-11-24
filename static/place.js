const params = new URLSearchParams(location.search);
const mode = params.get('mode') === 'grid' ? 'grid' : 'image';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const ipInput = document.getElementById('ip');
const countInput = document.getElementById('count');
const connectBtn = document.getElementById('connect');
const statusEl = document.getElementById('status');
const currentEl = document.getElementById('current');
const progressEl = document.getElementById('progress');

const PLUM = '#3b1f4a';
const PINK = '#ff8cc6';
const BUTTER = '#fff0a6';

const state = {
  ip: localStorage.getItem('wledIp') || '',
  count: 50,
  leds: [],          // each entry: null or {x, y} as fractions (0 to 1)
  current: 0,
  key: '',
  grid: null,        // {w, h, cell} in grid mode
  bg: null,
  dragging: null,
};

// ---------- helpers ----------

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (kind ? ' ' + kind : '');
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

function resizeLeds() {
  while (state.leds.length < state.count) state.leds.push(null);
  state.leds.length = state.count;
  state.current = clamp(state.current, 0, state.count - 1);
}

function firstUnplaced() {
  const i = state.leds.findIndex((p) => p === null);
  return i === -1 ? state.count - 1 : i;
}

function lowestUnplaced() {
  return state.leds.findIndex((p) => p === null);
}

function nextUnplacedAfter(i) {
  for (let j = i + 1; j < state.count; j++) {
    if (state.leds[j] === null) return j;
  }
  return clamp(i + 1, 0, state.count - 1);
}

// ---------- drawing ----------

function dotRadius() {
  return Math.max(9, Math.min(canvas.width, canvas.height) / 55);
}

function draw() {
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  if (mode === 'image' && state.bg) {
    ctx.drawImage(state.bg, 0, 0, W, H);
  } else if (state.grid) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#e6d7ee';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= state.grid.w; x++) {
      ctx.moveTo(x * state.grid.cell + 0.5, 0);
      ctx.lineTo(x * state.grid.cell + 0.5, H);
    }
    for (let y = 0; y <= state.grid.h; y++) {
      ctx.moveTo(0, y * state.grid.cell + 0.5);
      ctx.lineTo(W, y * state.grid.cell + 0.5);
    }
    ctx.stroke();
  }

  const r = dotRadius();
  ctx.font = '800 ' + Math.round(r * 1.05) + 'px Nunito, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  state.leds.forEach((p, i) => {
    if (!p) return;
    const isCurrent = i === state.current;
    ctx.beginPath();
    ctx.arc(p.x * W, p.y * H, isCurrent ? r * 1.25 : r, 0, Math.PI * 2);
    ctx.fillStyle = isCurrent ? BUTTER : PINK;
    ctx.fill();
    ctx.lineWidth = Math.max(2, r / 5);
    ctx.strokeStyle = PLUM;
    ctx.stroke();
    ctx.fillStyle = PLUM;
    ctx.fillText(String(i), p.x * W, p.y * H + 1);
  });

  const placed = state.leds.filter(Boolean).length;
  currentEl.textContent = 'LED ' + state.current;
  progressEl.textContent = placed + ' of ' + state.count + ' placed';
}

// ---------- WLED ----------

async function lightCurrent() {
  if (!state.ip) return;
  try {
    const out = await post('/api/wled/light', {
      ip: state.ip,
      index: state.current,
      count: state.count,
    });
    if (!out.ok) setStatus('Could not light LED: ' + out.error, 'error');
  } catch (e) {
    setStatus('Could not reach the app: ' + e.message, 'error');
  }
}

async function connect() {
  state.ip = ipInput.value.trim();
  if (!state.ip) {
    setStatus('Enter the controller IP first', 'error');
    return;
  }
  setStatus('Connecting...');
  try {
    const res = await fetch('/api/wled/info?ip=' + encodeURIComponent(state.ip));
    const out = await res.json();
    if (!out.ok) {
      setStatus('Could not connect: ' + out.error, 'error');
      return;
    }
    localStorage.setItem('wledIp', state.ip);
    state.count = out.count;
    countInput.value = out.count;
    resizeLeds();
    setStatus('Connected to ' + (out.name || 'WLED') + ' (v' + out.version + '), ' + out.count + ' LEDs', 'ok');
    draw();
    save();
    lightCurrent();
  } catch (e) {
    setStatus('Could not connect: ' + e.message, 'error');
  }
}

// ---------- selecting and placing ----------

function select(i) {
  state.current = clamp(i, 0, state.count - 1);
  draw();
  lightCurrent();
}

function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) * canvas.width) / r.width,
    y: ((e.clientY - r.top) * canvas.height) / r.height,
  };
}

function hit(pt) {
  const r = dotRadius() * 1.4;
  for (let i = state.leds.length - 1; i >= 0; i--) {
    const p = state.leds[i];
    if (!p) continue;
    if (Math.hypot(p.x * canvas.width - pt.x, p.y * canvas.height - pt.y) <= r) return i;
  }
  return -1;
}

function toFraction(pt) {
  let x = pt.x;
  let y = pt.y;
  if (mode === 'grid' && state.grid) {
    // snap to the center of the cell
    const c = state.grid.cell;
    x = (clamp(Math.floor(x / c), 0, state.grid.w - 1) + 0.5) * c;
    y = (clamp(Math.floor(y / c), 0, state.grid.h - 1) + 0.5) * c;
  }
  return {
    x: clamp(x / canvas.width, 0, 1),
    y: clamp(y / canvas.height, 0, 1),
  };
}

canvas.addEventListener('pointerdown', (e) => {
  const pt = toCanvas(e);
  const i = hit(pt);
  if (i >= 0) {
    state.dragging = i;
    canvas.setPointerCapture(e.pointerId);
    select(i);
  } else {
    // place the selected LED if it's still unplaced,
    // otherwise place the lowest unplaced one
    const target = state.leds[state.current] === null
      ? state.current
      : lowestUnplaced();
    if (target === -1) {
      setStatus('All LEDs are placed. Drag a dot to adjust it.', 'ok');
      return;
    }
    state.leds[target] = toFraction(pt);
    save();
    select(nextUnplacedAfter(target));
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (state.dragging === null) return;
  state.leds[state.dragging] = toFraction(toCanvas(e));
  draw();
});

canvas.addEventListener('pointerup', () => {
  if (state.dragging === null) return;
  state.dragging = null;
  save();
});

// ---------- buttons ----------

document.getElementById('prev').addEventListener('click', () => select(state.current - 1));
document.getElementById('next').addEventListener('click', () => select(state.current + 1));
connectBtn.addEventListener('click', connect);

document.getElementById('restore').addEventListener('click', async () => {
  if (!state.ip) return;
  const out = await post('/api/wled/restore', { ip: state.ip });
  setStatus(
    out.ok ? 'Effects restored' : 'Could not restore: ' + out.error,
    out.ok ? 'ok' : 'error'
  );
});

document.getElementById('clear').addEventListener('click', () => {
  if (!state.leds.some(Boolean)) return;
  if (!confirm('Remove all placed LEDs and start over?')) return;
  state.leds = new Array(state.count).fill(null);
  state.current = 0;
  save();
  draw();
  lightCurrent();
});

countInput.addEventListener('change', () => {
  state.count = clamp(parseInt(countInput.value, 10) || 1, 1, 2048);
  countInput.value = state.count;
  resizeLeds();
  draw();
  save();
});

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowLeft') select(state.current - 1);
  if (e.key === 'ArrowRight') select(state.current + 1);
});

// ---------- saving ----------

let saveTimer = null;

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    post('/api/positions', {
      key: state.key,
      mode: mode,
      wled_ip: state.ip,
      led_count: state.count,
      canvas: { width: canvas.width, height: canvas.height },
      grid: state.grid,
      leds: state.leds,
    });
  }, 300);
}

// ---------- startup ----------

async function loadSaved() {
  try {
    const res = await fetch('/api/positions');
    const saved = await res.json();
    if (saved && saved.key === state.key) {
      state.count = saved.led_count;
      state.leds = saved.leds;
      countInput.value = state.count;
      if (!state.ip && saved.wled_ip) state.ip = saved.wled_ip;
    }
  } catch (e) {
    // start fresh
  }
  ipInput.value = state.ip;
  resizeLeds();
  state.current = firstUnplaced();
  draw();
}

function init() {
  if (mode === 'grid') {
    const w = clamp(parseInt(params.get('w'), 10) || 16, 1, 256);
    const h = clamp(parseInt(params.get('h'), 10) || 8, 1, 256);
    const cell = clamp(parseInt(params.get('cell'), 10) || 32, 4, 200);
    state.grid = { w: w, h: h, cell: cell };
    state.key = 'grid:' + w + 'x' + h + ':' + cell;
    canvas.width = w * cell;
    canvas.height = h * cell;
    loadSaved();
  } else {
    const img = params.get('img');
    if (!img) {
      location.href = '/';
      return;
    }
    state.key = 'image:' + img;
    const bg = new Image();
    bg.onload = () => {
      state.bg = bg;
      canvas.width = bg.naturalWidth;
      canvas.height = bg.naturalHeight;
      loadSaved();
    };
    bg.onerror = () => setStatus('Could not load the image', 'error');
    bg.src = '/data/' + encodeURIComponent(img);
  }
}

init();