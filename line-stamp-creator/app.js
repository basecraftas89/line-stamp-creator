(() => {
  const $ = (id) => document.getElementById(id);
  const state = { files: [], images: [], results: [], selected: 0 };
  const els = { file: $('file-input'), drop: $('dropzone'), meta: $('source-meta'), sourceFiles: $('source-files'), clear: $('clear-source'), cols: $('cols'), rows: $('rows'), size: $('output-size'), background: $('background-mode'), trim: $('trim-mode'), padding: $('padding'), paddingValue: $('padding-value'), process: $('process-button'), downloadAll: $('download-all'), downloadCurrent: $('download-current'), empty: $('empty-state'), grid: $('results-grid'), footer: $('preview-footer'), count: $('result-count'), title: $('preview-title') };

  els.file.addEventListener('change', (event) => loadFiles([...event.target.files]));
  ['dragenter', 'dragover'].forEach((eventName) => els.drop.addEventListener(eventName, (event) => { event.preventDefault(); els.drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((eventName) => els.drop.addEventListener(eventName, (event) => { event.preventDefault(); els.drop.classList.remove('is-over'); }));
  els.drop.addEventListener('drop', (event) => loadFiles([...event.dataTransfer.files]));
  els.clear.addEventListener('click', clearSource);
  els.padding.addEventListener('input', () => { els.paddingValue.value = `${els.padding.value}%`; els.paddingValue.textContent = `${els.padding.value}%`; });
  els.process.addEventListener('click', processImages);
  els.downloadAll.addEventListener('click', downloadZip);
  els.downloadCurrent.addEventListener('click', () => { if (state.results[state.selected]) downloadResult(state.results[state.selected]); });
  [els.cols, els.rows, els.size, els.trim].forEach((el) => el.addEventListener('change', () => { if (state.images.length) processImages(); }));

  function loadFiles(files) {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (!imageFiles.length) return;
    clearSource();
    Promise.all(imageFiles.map((file) => loadImage(file))).then((loaded) => {
      state.files = imageFiles; state.images = loaded;
      renderSourceList(); els.meta.hidden = false; els.drop.hidden = true; els.process.disabled = false; els.title.textContent = '分割前のプレビュー'; processImages();
    });
  }

  function loadImage(file) {
    return new Promise((resolve) => { const image = new Image(); image.onload = () => resolve({ file, image, url: image.src }); image.src = URL.createObjectURL(file); });
  }

  function renderSourceList() {
    els.sourceFiles.innerHTML = '';
    const count = document.createElement('strong'); count.className = 'source-count'; count.textContent = `${state.files.length}枚の画像を読み込み中`; els.sourceFiles.appendChild(count);
    state.images.forEach(({ file, image }) => { const item = document.createElement('div'); item.className = 'source-item'; const thumb = document.createElement('div'); thumb.className = 'source-thumb checkerboard'; const img = document.createElement('img'); img.alt = file.name; img.src = image.src; thumb.appendChild(img); const details = document.createElement('div'); details.className = 'source-details'; const name = document.createElement('strong'); name.textContent = file.name; const dimensions = document.createElement('span'); dimensions.textContent = `${image.naturalWidth} × ${image.naturalHeight}px`; details.append(name, dimensions); item.append(thumb, details); els.sourceFiles.appendChild(item); });
  }

  function clearSource() {
    state.images.forEach(({ image }) => { if (image?.src) URL.revokeObjectURL(image.src); });
    state.files = []; state.images = []; state.results = []; els.file.value = ''; els.sourceFiles.innerHTML = ''; els.meta.hidden = true; els.drop.hidden = false; els.process.disabled = true; els.downloadAll.disabled = true; els.grid.innerHTML = ''; els.footer.hidden = true; els.empty.hidden = false; els.count.textContent = '0枚'; els.title.textContent = '切り出し結果';
  }

  function processImages() {
    if (!state.images.length) return;
    const cols = Number(els.cols.value), rows = Number(els.rows.value), output = Number(els.size.value), padding = Number(els.padding.value) / 100;
    const results = [];
    state.images.forEach(({ image }, sourceIndex) => { const full = document.createElement('canvas'); full.width = image.naturalWidth; full.height = image.naturalHeight; full.getContext('2d').drawImage(image, 0, 0); removeBackground(full); const components = els.trim.value === 'alpha' ? findComponents(full) : [];
      const cellW = image.naturalWidth / cols, cellH = image.naturalHeight / rows; for (let row = 0; row < rows; row += 1) for (let col = 0; col < cols; col += 1) {
      const cellBounds = { x: col * cellW, y: row * cellH, width: cellW, height: cellH };
      const bounds = els.trim.value === 'alpha' ? boundsForCell(components, cellBounds) : cellBounds;
      const canvas = document.createElement('canvas'); canvas.width = output; canvas.height = output;
      const ctx = canvas.getContext('2d'); const usable = output * (1 - padding * 2); const scale = Math.min(usable / bounds.width, usable / bounds.height);
      const drawW = bounds.width * scale, drawH = bounds.height * scale;
      ctx.drawImage(full, bounds.x, bounds.y, bounds.width, bounds.height, (output - drawW) / 2, (output - drawH) / 2, drawW, drawH);
      results.push({ index: results.length + 1, sourceIndex: sourceIndex + 1, cellIndex: row * cols + col + 1, canvas, blob: null });
    } });
    state.results = results; state.selected = 0; renderResults();
  }

  function removeBackground(canvas) {
    const ctx = canvas.getContext('2d'), { width, height } = canvas, image = ctx.getImageData(0, 0, width, height), pixels = image.data;
    const references = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1], [Math.floor(width / 2), 0], [Math.floor(width / 2), height - 1]].map(([x, y]) => {
      const i = (y * width + x) * 4; return [pixels[i], pixels[i + 1], pixels[i + 2]];
    });
    const visited = new Uint8Array(width * height), queue = [];
    const closeToBackground = (x, y) => { const i = (y * width + x) * 4; if (pixels[i + 3] < 8) return true; return references.some(([r, g, b]) => Math.hypot(pixels[i] - r, pixels[i + 1] - g, pixels[i + 2] - b) <= 48); };
    const enqueue = (x, y) => { if (x < 0 || y < 0 || x >= width || y >= height) return; const pos = y * width + x; if (visited[pos] || !closeToBackground(x, y)) return; visited[pos] = 1; queue.push(pos); };
    for (let x = 0; x < width; x += 1) { enqueue(x, 0); enqueue(x, height - 1); }
    for (let y = 0; y < height; y += 1) { enqueue(0, y); enqueue(width - 1, y); }
    while (queue.length) { const pos = queue.pop(), x = pos % width, y = Math.floor(pos / width), i = pos * 4; pixels[i + 3] = 0; enqueue(x - 1, y); enqueue(x + 1, y); enqueue(x, y - 1); enqueue(x, y + 1); }
    ctx.putImageData(image, 0, 0);
  }

  function alphaBounds(canvas) {
    const ctx = canvas.getContext('2d'), { width, height } = canvas, pixels = ctx.getImageData(0, 0, width, height).data; let left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) if (pixels[(y * width + x) * 4 + 3] > 8) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
    if (right < 0) return { x: 0, y: 0, width, height }; return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  }

  function findComponents(canvas) {
    const { width, height } = canvas, pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data, visited = new Uint8Array(width * height), components = [];
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const start = y * width + x; if (visited[start] || pixels[start * 4 + 3] < 16) continue;
      const queue = [start]; visited[start] = 1; let left = x, right = x, top = y, bottom = y, count = 0;
      while (queue.length) { const pos = queue.pop(), px = pos % width, py = Math.floor(pos / width); count += 1; left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py); for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) { if (!dx && !dy) continue; const nx = px + dx, ny = py + dy; if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue; const next = ny * width + nx; if (!visited[next] && pixels[next * 4 + 3] >= 16) { visited[next] = 1; queue.push(next); } } }
      if (count >= 12) components.push({ x: left, y: top, right: right + 1, bottom: bottom + 1, centerX: (left + right + 1) / 2, centerY: (top + bottom + 1) / 2 });
    }
    return components;
  }

  function boundsForCell(components, cell) {
    const inside = components.filter((component) => component.centerX >= cell.x && component.centerX < cell.x + cell.width && component.centerY >= cell.y && component.centerY < cell.y + cell.height);
    if (!inside.length) return cell;
    return { x: Math.min(...inside.map((item) => item.x)), y: Math.min(...inside.map((item) => item.y)), width: Math.max(...inside.map((item) => item.right)) - Math.min(...inside.map((item) => item.x)), height: Math.max(...inside.map((item) => item.bottom)) - Math.min(...inside.map((item) => item.y)) };
  }

  function renderResults() {
    els.grid.innerHTML = ''; els.empty.hidden = true; els.footer.hidden = false; els.title.textContent = '切り出し結果'; els.count.textContent = `${state.results.length}枚`; els.downloadAll.disabled = state.results.length === 0;
    state.results.forEach((result, index) => { const card = document.createElement('article'); card.className = `stamp-card ${index === state.selected ? 'selected' : ''}`; card.setAttribute('tabindex', '0'); card.setAttribute('aria-label', `スタンプ ${result.index}`); card.innerHTML = `<div class="checkerboard canvas-wrap"></div><div class="card-label"><span>${String(result.index).padStart(2, '0')} <small>元画像${result.sourceIndex}</small></span><button class="card-download" type="button" aria-label="スタンプ${result.index}を保存">↓</button></div>`; card.querySelector('.canvas-wrap').appendChild(result.canvas); card.addEventListener('click', (event) => { if (event.target.tagName !== 'BUTTON') { state.selected = index; renderResults(); } }); card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); state.selected = index; renderResults(); } }); card.querySelector('.card-download').addEventListener('click', (event) => { event.stopPropagation(); downloadResult(result); }); els.grid.appendChild(card); });
  }

  function canvasBlob(result) { return new Promise((resolve) => result.canvas.toBlob((blob) => resolve(blob), 'image/png')); }
  function outputName(result) { return `source_${String(result.sourceIndex).padStart(2, '0')}_sticker_${String(result.cellIndex).padStart(2, '0')}.png`; }
  async function downloadResult(result) { const blob = result.blob || await canvasBlob(result); result.blob = blob; saveBlob(blob, outputName(result)); }
  async function downloadZip() { const files = []; for (const result of state.results) files.push({ name: outputName(result), data: new Uint8Array(await (result.blob || (result.blob = await canvasBlob(result))).arrayBuffer()) }); const zip = makeZip(files); saveBlob(zip, `line-stickers-${state.files.length}sources-${state.results.length}items.zip`); }
  function saveBlob(blob, name) { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 500); }

  function crc32(data) { let crc = -1; for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ -1) >>> 0; }
  function u16(n) { return [n & 255, (n >>> 8) & 255]; } function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }
  function makeZip(files) { const chunks = [], central = []; let offset = 0; files.forEach(({ name, data }) => { const filename = new TextEncoder().encode(name), crc = crc32(data), header = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(filename.length), ...u16(0), ...filename]); chunks.push(header, data); central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(filename.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...filename])); offset += header.length + data.length; }); const centralSize = central.reduce((sum, part) => sum + part.length, 0), end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(centralSize), ...u32(offset), ...u16(0)]); return new Blob([...chunks, ...central, end], { type: 'application/zip' }); }
})();
