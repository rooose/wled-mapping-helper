const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const ipInput = document.getElementById('ip');
const countInput = document.getElementById('count');
const connectForm = document.getElementById('connect-form');
const statusEl = document.getElementById('status');

const picInput = document.getElementById('pic');
const picBtn = document.getElementById('pic-btn');
const removePicBtn = document.getElementById('remove-pic');
const snapBox = document.getElementById('snap');
const colsInput = document.getElementById('cols');
const rowsInput = document.getElementById('rows');

const currentEl = document.getElementById('current');
const progressEl = document.getElementById('progress');

const exportW = document.getElementById('export-w');
const exportH = document.getElementById('export-h');
const exportMsg = document.getElementById('export-msg');

const PLUM = '#3b1f4a';
const PINK = '#ff8cc6';
const BUTTER = '#fff0a6';
const BLANK_W = 960;
const BLANK_H = 540;

const state = {
  ip: localStorage.getItem('wledIp') || '',
  count: parseInt(localStorage.getItem('wledCount'), 10) || 50,
  leds: [],          // each entry: null or {x, y} as fractions (0 to 1)
  current: 0,
  bg: null,          // an Image, or null when there's no picture
  dragging: null,
};

// ---------- helpers ----------

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function intValue(input, fallback, lo, hi) {
  return clamp(parseInt(input.value, 10) || fallback, lo, hi);
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (kind ? ' ' + kind : '');
}

function setExportMsg(text, kind) {
  exportMsg.textContent = text;
  exportMsg.className = 'status' + (kind ? ' ' + kind : '');
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

function gridSize() {
  return {
    cols: intValue(colsInput, 16, 1, 256),
    rows: intValue(rowsInput, 9, 1, 256),
  };
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

  if (state.bg) {
    ctx.drawImage(state.bg, 0, 0, W, H);
  } else {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#c9b8d3';
    ctx.font = '600 ' + Math.round(H / 22) + 'px Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Upload a picture of your room (optional)', W / 2, H / 2);
  }

  if (snapBox.checked) {
    const g = gridSize();
    ctx.strokeStyle = 'rgba(59, 31, 74, 0.35)';
    ctx.lineWidth = Math.max(1, W / 700);
    ctx.beginPath();
    for (let c = 0; c <= g.cols; c++) {
      const x = (c / g.cols) * W;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    for (let r = 0; r <= g.rows; r++) {
      const y = (r / g.rows) * H;
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
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

// ---------- connecting ----------

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

async function connect(quiet) {
  state.ip = ipInput.value.trim();
  if (!state.ip) return;
  if (!quiet) setStatus('Connecting...');
  try {
    const res = await fetch('/api/wled/info?ip=' + encodeURIComponent(state.ip));
    const out = await res.json();
    if (!out.ok) {
      setStatus(quiet ? 'Not connected' : 'Could not connect: ' + out.error, quiet ? '' : 'error');
      return;
    }
    localStorage.setItem('wledIp', state.ip);
    localStorage.setItem('wledCount', String(out.count));
    state.count = out.count;
    countInput.value = out.count;
    resizeLeds();
    setStatus(
      'Connected to ' + (out.name || 'WLED') + ' (v' + out.version + '), ' + out.count + ' LEDs',
      'ok'
    );
    draw();
    save();
    lightCurrent();
  } catch (e) {
    setStatus(quiet ? 'Not connected' : 'Could not connect: ' + e.message, quiet ? '' : 'error');
  }
}

connectForm.addEventListener('submit', (e) => {
  e.preventDefault();
  connect(false);
});

countInput.addEventListener('change', () => {
  state.count = intValue(countInput, 50, 1, 2048);
  countInput.value = state.count;
  resizeLeds();
  draw();
  save();
});

// ---------- picture ----------

function setBackground(img) {
  state.bg = img;
  canvas.width = img ? img.naturalWidth : BLANK_W;
  canvas.height = img ? img.naturalHeight : BLANK_H;
  removePicBtn.hidden = !img;
  draw();
}

// shrink the photo and keep it in this browser tab only (nothing is uploaded)
function shrink(file, maxSize) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('this image type is not supported'));
    };
    img.src = url;
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('could not load the picture'));
    img.src = dataUrl;
  });
}

picInput.addEventListener('change', async () => {
  const file = picInput.files[0];
  if (!file) return;
  try {
    const dataUrl = await shrink(file, 1600);
    try {
      sessionStorage.setItem('bgImage', dataUrl);
    } catch (e) {
      // too big to remember across reloads, but it still works for now
    }
    setBackground(await loadImage(dataUrl));
  } catch (err) {
    alert('Could not use that picture: ' + err.message);
  }
  picInput.value = '';
});

removePicBtn.addEventListener('click', () => {
  sessionStorage.removeItem('bgImage');
  setBackground(null);
});

// let keyboard users open the file picker from the label
picBtn.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    picInput.click();
  }
});

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
  let x = clamp(pt.x / canvas.width, 0, 1);
  let y = clamp(pt.y / canvas.height, 0, 1);
  if (snapBox.checked) {
    // snap to the center of the grid cell
    const g = gridSize();
    x = (clamp(Math.floor(x * g.cols), 0, g.cols - 1) + 0.5) / g.cols;
    y = (clamp(Math.floor(y * g.rows), 0, g.rows - 1) + 0.5) / g.rows;
  }
  return { x: x, y: y };
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

// ---------- grid ----------

function syncExportSize() {
  const g = gridSize();
  exportW.value = g.cols;
  exportH.value = g.rows;
}

snapBox.addEventListener('change', () => {
  draw();
  save();
});

[colsInput, rowsInput].forEach((input) => {
  input.addEventListener('change', () => {
    syncExportSize();
    draw();
    save();
  });
});

// ---------- buttons ----------

document.getElementById('prev').addEventListener('click', () => select(state.current - 1));
document.getElementById('next').addEventListener('click', () => select(state.current + 1));

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

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowLeft') select(state.current - 1);
  if (e.key === 'ArrowRight') select(state.current + 1);
});

// ---------- export ----------

function buildLedmap(w, h) {
  const map = new Array(w * h).fill(-1);
  const collisions = [];
  const missing = [];

  state.leds.forEach((p, i) => {
    if (!p) {
      missing.push(i);
      return;
    }
    const cx = clamp(Math.floor(p.x * w), 0, w - 1);
    const cy = clamp(Math.floor(p.y * h), 0, h - 1);
    const cell = cy * w + cx;
    if (map[cell] !== -1) {
      collisions.push({ led: i, other: map[cell] });
    } else {
      map[cell] = i;
    }
  });

  return { map: map, collisions: collisions, missing: missing };
}

function listShort(items) {
  return items.length > 8 ? items.slice(0, 8).join(', ') + '...' : items.join(', ');
}

document.getElementById('export').addEventListener('click', () => {
  const w = intValue(exportW, 16, 1, 256);
  const h = intValue(exportH, 9, 1, 256);
  exportW.value = w;
  exportH.value = h;

  const result = buildLedmap(w, h);
  const problems = [];
  if (result.missing.length) {
    problems.push(
      result.missing.length + ' LEDs are not placed yet (' + listShort(result.missing) + ').'
    );
  }
  if (result.collisions.length) {
    problems.push(
      result.collisions.length + ' LEDs share a cell with another one and would be left out (' +
      listShort(result.collisions.map((c) => c.led + ' with ' + c.other)) +
      '). A bigger width and height will fix this.'
    );
  }

  if (problems.length && !confirm(problems.join('\n\n') + '\n\nDownload anyway?')) {
    setExportMsg(problems.join(' '), 'warn');
    return;
  }

  const json = JSON.stringify({ map: result.map, width: w, height: h });
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ledmap1.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  const mapped = state.count - result.missing.length - result.collisions.length;
  setExportMsg(
    'Exported ledmap1.json (' + w + ' x ' + h + ', ' + mapped + ' LEDs mapped)',
    problems.length ? 'warn' : 'ok'
  );
});

// ---------- saving ----------

let saveTimer = null;

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const g = gridSize();
    post('/api/positions', {
      wled_ip: state.ip,
      led_count: state.count,
      snap: { enabled: snapBox.checked, cols: g.cols, rows: g.rows },
      leds: state.leds,
    });
  }, 300);
}

// ---------- startup ----------

async function init() {
  ipInput.value = state.ip;
  countInput.value = state.count;

  try {
    const res = await fetch('/api/positions');
    const saved = await res.json();
    if (saved && Array.isArray(saved.leds)) {
      state.count = saved.led_count || saved.leds.length;
      state.leds = saved.leds;
      countInput.value = state.count;
      if (!state.ip && saved.wled_ip) {
        state.ip = saved.wled_ip;
        ipInput.value = state.ip;
      }
      if (saved.snap) {
        snapBox.checked = !!saved.snap.enabled;
        colsInput.value = saved.snap.cols || 16;
        rowsInput.value = saved.snap.rows || 9;
      }
    }
  } catch (e) {
    // start fresh
  }

  resizeLeds();
  state.current = firstUnplaced();
  syncExportSize();

  // bring back the picture from earlier in this tab, if any
  const dataUrl = sessionStorage.getItem('bgImage');
  if (dataUrl) {
    try {
      setBackground(await loadImage(dataUrl));
    } catch (e) {
      setBackground(null);
    }
  } else {
    setBackground(null);
  }

  // connect right away if we already know the controller
  if (state.ip) connect(true);
}

init();