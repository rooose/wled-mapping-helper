// ---------- connect to the controller ----------

const ipEl = document.getElementById('landing-ip');
const connectForm = document.getElementById('connect-form');
const connectStatus = document.getElementById('connect-status');

function setConnectStatus(text, kind) {
  connectStatus.textContent = text;
  connectStatus.className = 'connect-status' + (kind ? ' ' + kind : '');
}

async function connect(ip, quiet) {
  if (!quiet) setConnectStatus('Connecting...');
  try {
    const res = await fetch('/api/wled/info?ip=' + encodeURIComponent(ip));
    const out = await res.json();
    if (!out.ok) {
      setConnectStatus(quiet ? 'Not connected' : 'Could not connect: ' + out.error, quiet ? '' : 'error');
      return;
    }
    localStorage.setItem('wledIp', ip);
    localStorage.setItem('wledCount', String(out.count));
    setConnectStatus(
      'Connected to ' + (out.name || 'WLED') + ' (v' + out.version + '), ' + out.count + ' LEDs',
      'ok'
    );
  } catch (e) {
    setConnectStatus(quiet ? 'Not connected' : 'Could not connect: ' + e.message, quiet ? '' : 'error');
  }
}

ipEl.value = localStorage.getItem('wledIp') || '';
if (ipEl.value) connect(ipEl.value, true);

connectForm.addEventListener('submit', (e) => {
  e.preventDefault();
  connect(ipEl.value.trim(), false);
});

// ---------- photo picker ----------

const input = document.getElementById('image-input');
const nameEl = document.getElementById('image-name');
const preview = document.getElementById('image-preview');
const start = document.getElementById('start-image');
const drop = document.querySelector('.drop');
const imageForm = document.getElementById('image-form');
let previewUrl = null;

input.addEventListener('change', () => {
  const file = input.files[0];
  if (previewUrl) URL.revokeObjectURL(previewUrl);

  if (!file) {
    previewUrl = null;
    preview.hidden = true;
    nameEl.textContent = 'Choose an image';
    start.disabled = true;
    return;
  }

  previewUrl = URL.createObjectURL(file);
  preview.src = previewUrl;
  preview.hidden = false;
  nameEl.textContent = file.name;
  start.disabled = false;
});

// let keyboard users open the picker from the label
drop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    input.click();
  }
});

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

imageForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = input.files[0];
  if (!file) return;

  start.disabled = true;
  start.textContent = 'Getting ready...';
  try {
    const dataUrl = await shrink(file, 1600);
    sessionStorage.setItem('bgImage', dataUrl);
    sessionStorage.setItem('bgKey', file.name + ':' + file.size + ':' + file.lastModified);
    location.href = '/place?mode=image';
  } catch (err) {
    start.disabled = false;
    start.textContent = 'Start placing on image';
    alert('Could not use that image: ' + err.message);
  }
});