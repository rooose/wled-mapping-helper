const input = document.getElementById('image-input');
const nameEl = document.getElementById('image-name');
const preview = document.getElementById('image-preview');
const start = document.getElementById('start-image');
const drop = document.querySelector('.drop');
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
