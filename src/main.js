import './style.css';
import { FAMILIES, familyOf, extOf, baseOf, normExt, targetsFor, defaultTarget, targetLabel, humanSize, FFMPEG_IMAGE_INPUT } from './formats.js';
import { convert, zipResults, mergePdfs, imagesToPdf, openPdf, renderPdfPage } from './convert.js';
import { openViewer, setViewerConvertHandler } from './viewer.js';

const $ = (s) => document.querySelector(s);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ───────────────────────── Palettes split-flap ─────────────────────────
const FLAP_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function setFlaps(host, text, len = text.length, stagger = 70) {
  const t = text.toUpperCase().padEnd(len, ' ').slice(0, len);
  while (host.children.length < len) host.append(Object.assign(document.createElement('span'), { className: 'flap', textContent: ' ' }));
  while (host.children.length > len) host.lastChild.remove();
  [...host.children].forEach((span, i) => {
    const target = t[i];
    if (span.dataset.ch === target) return;
    span.dataset.ch = target;
    if (reduceMotion) { span.textContent = target; return; }
    clearInterval(span._iv);
    let steps = 3 + Math.floor(Math.random() * 6);
    setTimeout(() => {
      span._iv = setInterval(() => {
        steps--;
        span.textContent = steps <= 0 ? target : FLAP_CHARS[Math.floor(Math.random() * FLAP_CHARS.length)];
        span.classList.remove('flip');
        void span.offsetWidth;
        span.classList.add('flip');
        if (steps <= 0) clearInterval(span._iv);
      }, 60);
    }, i * stagger);
  });
}

const ROUTES = [['PNG', 'WEBP'], ['DOCX', 'PDF'], ['HEIC', 'JPG'], ['CSV', 'XLSX'], ['MOV', 'MP4'], ['PDF', 'PNG'], ['WAV', 'MP3'], ['MP4', 'GIF'], ['MD', 'HTML'], ['JSON', 'YAML'], ['SVG', 'ICO'], ['XLSX', 'SQL']];
let routeIdx = 0;
function cycleHero() {
  const [a, b] = ROUTES[routeIdx++ % ROUTES.length];
  setFlaps($('#hero-from'), a, 4);
  setFlaps($('#hero-to'), b, 4);
}
cycleHero();
if (!reduceMotion) setInterval(cycleHero, 3400);

$('#ticker').textContent = ROUTES.concat([['AVIF', 'PNG'], ['FLAC', 'M4A'], ['ODS', 'JSON'], ['XML', 'CSV'], ['MKV', 'WEBM'], ['ZIP', 'FICHIERS']]).map(([a, b]) => `${a} → ${b}`).join('   ·   ');

const tickClock = () => { $('#clock').textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
tickClock();
setInterval(tickClock, 10000);

// ───────────────────────── Destinations ─────────────────────────
const INPUTS = {
  image: 'PNG JPG WEBP AVIF GIF BMP SVG ICO HEIC TIFF TGA',
  pdf: 'PDF',
  docx: 'DOCX',
  md: 'MD',
  html: 'HTML HTM',
  txt: 'TXT LOG',
  data: 'CSV TSV JSON XLSX XLS ODS XML YAML',
  audio: 'MP3 WAV OGG M4A AAC FLAC OPUS WMA AIFF',
  video: 'MP4 WEBM MOV MKV AVI M4V WMV FLV 3GP MPEG',
  zip: 'ZIP',
  other: 'Tout le reste',
};
$('#dest-grid').append(...Object.entries(FAMILIES).map(([key, f]) => {
  const card = document.createElement('article');
  card.className = `dest-card fam-${key}`;
  card.innerHTML = `<header><span class="dest-code">${f.code}</span><h3>${f.label}</h3></header>
    <p class="dest-in"><span class="eyebrow">Départ</span>${INPUTS[key]}</p>
    <p class="dest-out"><span class="eyebrow">Arrivée</span>${f.targets.map((t) => `<span class="chip">${targetLabel(t)}</span>`).join('')}</p>`;
  return card;
}), Object.assign(document.createElement('article'), {
  className: 'dest-card dest-reader',
  innerHTML: `<header><span class="dest-code">▶</span><h3>Lecteur</h3></header>
    <p class="dest-in">Cliquez sur un nom de fichier ou sur « Lire » pour l'ouvrir sans le convertir : images avec zoom, PDF page par page, audio avec forme d'onde, vidéo, Word, Markdown, HTML, tableaux filtrables, archives ZIP et vue hexadécimale pour le reste.</p>`,
}));

// ───────────────────────── État ─────────────────────────
const items = [];
let seq = 0;
let running = false;

function addFile(file, extra = {}) {
  const ext = extOf(file.name);
  const item = { id: ++seq, n: seq, file, ext, family: familyOf(file), status: 'idle', progress: 0, results: [], error: '', ...extra };
  item.target = extra.target && targetsFor(item).includes(extra.target) ? extra.target : defaultTarget(item);
  items.push(item);
  makeThumb(item);
  return item;
}

function addFiles(files, extra) {
  const list = [...files].filter((f) => f && f.size !== undefined && !f.name.startsWith('.'));
  if (!list.length) return;
  list.forEach((f) => addFile(f, extra));
  render();
  toast(`${list.length} fichier${list.length > 1 ? 's' : ''} à bord.`);
  if (items.length === list.length) $('#tableau').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}

setViewerConvertHandler((file, target) => { addFile(file, { target }); render(); });

async function makeThumb(item) {
  try {
    if (item.family === 'image' && !['heic', 'heif'].includes(item.ext) && !FFMPEG_IMAGE_INPUT.has(item.ext)) {
      item.thumb = URL.createObjectURL(item.file);
    } else if (item.family === 'pdf') {
      const doc = await openPdf(item.file);
      const page = await doc.getPage(1);
      const vp = page.getViewport({ scale: 1 });
      const c = await renderPdfPage(doc, 1, 96 / vp.width);
      item.thumb = c.toDataURL('image/jpeg', 0.7);
      item.meta = `${doc.numPages} page${doc.numPages > 1 ? 's' : ''}`;
    } else if (item.family === 'video') {
      const v = document.createElement('video');
      v.muted = true; v.preload = 'auto'; v.src = URL.createObjectURL(item.file);
      await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; setTimeout(rej, 8000); });
      v.currentTime = Math.min(1, (v.duration || 2) / 3);
      await new Promise((res) => { v.onseeked = res; setTimeout(res, 3000); });
      const c = document.createElement('canvas');
      c.width = 96; c.height = Math.round(96 * (v.videoHeight / v.videoWidth || 0.56));
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      item.thumb = c.toDataURL('image/jpeg', 0.7);
      item.meta = `${v.videoWidth}×${v.videoHeight} · ${Math.round(v.duration)} s`;
      URL.revokeObjectURL(v.src);
    } else return;
    const node = document.querySelector(`[data-id="${item.id}"] .thumb`);
    if (node) { node.style.backgroundImage = `url("${item.thumb}")`; node.classList.add('has-img'); }
    const meta = document.querySelector(`[data-id="${item.id}"] .file-meta`);
    if (meta && item.meta) meta.textContent = metaText(item);
  } catch { /* pas de vignette : on garde le code de famille */ }
}

const metaText = (item) => [humanSize(item.file.size), item.meta, item.sample ? 'exemple' : ''].filter(Boolean).join(' · ');

// ───────────────────────── Rendu du tableau ─────────────────────────
const STATUS = { idle: 'Prêt', run: 'Embarq', done: 'Arrivé', err: 'Annulé' };

function render() {
  const host = $('#rows');
  host.replaceChildren(...items.map(rowFor));
  items.forEach((it) => setFlaps(document.querySelector(`[data-id="${it.id}"] .status-flaps`), STATUS[it.status], 6, 30));
  const waiting = items.filter((i) => i.status === 'idle' || i.status === 'err').length;
  const done = items.filter((i) => i.status === 'done').length;
  $('#empty').hidden = items.length > 0;
  $('#board-sub').textContent = items.length
    ? `${items.length} fichier${items.length > 1 ? 's' : ''} · ${done} arrivé${done > 1 ? 's' : ''} · ${waiting} en attente`
    : "Aucun fichier à bord pour l'instant.";
  $('#convert-all').disabled = running || waiting === 0;
  $('#download-all').disabled = done === 0;
  $('#merge-pdf').disabled = items.filter((i) => i.family === 'pdf').length < 2;
  $('#images-pdf').disabled = items.filter((i) => i.family === 'image').length < 1;

  const all = new Set(items.flatMap((i) => targetsFor(i)));
  const sel = $('#all-to');
  const cur = sel.value;
  sel.replaceChildren(new Option('—', ''), ...[...all].map((t) => new Option(targetLabel(t), t)));
  sel.value = all.has(cur) ? cur : '';
}

function rowFor(item) {
  const row = document.createElement('div');
  row.className = `row status-${item.status} fam-${item.family}`;
  row.dataset.id = item.id;
  row.setAttribute('role', 'row');
  const fam = FAMILIES[item.family];
  const opts = targetsFor(item).map((t) => `<option value="${t}"${t === item.target ? ' selected' : ''}>${targetLabel(t)}</option>`).join('');
  row.innerHTML = `
    <span class="cell vol" role="cell">CX ${String(item.n).padStart(3, '0')}</span>
    <span class="cell file" role="cell">
      <button type="button" class="thumb${item.thumb ? ' has-img' : ''}" data-act="view" aria-label="Ouvrir ${esc(item.file.name)} dans le lecteur" ${item.thumb ? `style="background-image:url('${item.thumb}')"` : ''}><span>${fam.code}</span></button>
      <span class="file-text">
        <button type="button" class="file-name" data-act="view" title="Ouvrir dans le lecteur">${esc(item.file.name)}</button>
        <span class="file-meta">${metaText(item)}</span>
      </span>
    </span>
    <span class="cell from" role="cell"><span class="ext-tag">${esc((normExt(item.ext) || fam.code).toUpperCase())}</span></span>
    <span class="cell to" role="cell">
      <label class="sr-only" for="to-${item.id}">Format de destination de ${esc(item.file.name)}</label>
      <select id="to-${item.id}" class="to-select" data-act="target" ${item.status === 'run' ? 'disabled' : ''}>${opts}</select>
    </span>
    <span class="cell status" role="cell">
      <span class="status-flaps" aria-label="${STATUS[item.status]}"></span>
      <span class="bar"><i style="width:${Math.round(item.progress * 100)}%"></i></span>
      ${item.error ? `<span class="err-msg">${esc(item.error)}</span>` : ''}
    </span>
    <span class="cell actions" role="cell">
      ${item.status === 'done'
        ? `<button type="button" class="btn primary small" data-act="download">Télécharger</button>`
        : `<button type="button" class="btn primary small" data-act="convert" ${item.status === 'run' || running ? 'disabled' : ''}>${item.status === 'err' ? 'Réessayer' : 'Convertir'}</button>`}
      <button type="button" class="icon-btn" data-act="remove" aria-label="Retirer ${esc(item.file.name)}" ${item.status === 'run' ? 'disabled' : ''}>×</button>
    </span>`;
  if (item.status === 'done' && item.results.length) {
    const res = document.createElement('div');
    res.className = 'results';
    res.innerHTML = `<span class="results-label">Arrivée · ${item.results.length} fichier${item.results.length > 1 ? 's' : ''}</span>` +
      item.results.slice(0, 60).map((r, i) => `
        <span class="result">
          <button type="button" class="result-name" data-act="view-result" data-i="${i}" title="Ouvrir dans le lecteur">${esc(outName(item, r))}</button>
          <span class="result-size">${humanSize(r.blob.size)}${i === 0 && item.results.length === 1 ? sizeDelta(item.file.size, r.blob.size) : ''}</span>
          <button type="button" class="btn ghost small" data-act="view-result" data-i="${i}">Lire</button>
          <button type="button" class="btn ghost small" data-act="dl-result" data-i="${i}">Télécharger</button>
          <button type="button" class="btn ghost small" data-act="rebook" data-i="${i}" title="Remettre ce fichier sur le tableau pour le convertir à nouveau">Reconvertir</button>
        </span>`).join('') +
      (item.results.length > 60 ? `<span class="results-more">… et ${item.results.length - 60} autres, inclus dans le téléchargement.</span>` : '');
    row.append(res);
  }
  return row;
}

function sizeDelta(a, b) {
  if (!a) return '';
  const p = Math.round((b / a - 1) * 100);
  if (Math.abs(p) < 1) return '';
  return ` <em class="${p < 0 ? 'gain' : 'loss'}">${p > 0 ? '+' : ''}${p} %</em>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ───────────────────────── Options ─────────────────────────
function readOpts() {
  const f = $('#opts');
  const o = {};
  for (const el of f.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'number' || el.type === 'range') o[el.name] = el.value === '' ? 0 : Number(el.value);
    else o[el.name] = el.value;
  }
  if (o.scale === 100) o.scale = 0;
  return o;
}

function outName(item, r) {
  const pattern = ($('#o-pattern').value || '{nom}').trim();
  const base = baseOf(item.file.name);
  if (pattern === '{nom}' || !r.name.startsWith(base)) return r.name;
  const date = new Date().toISOString().slice(0, 10);
  const named = pattern.replaceAll('{nom}', base).replaceAll('{n}', String(item.n).padStart(3, '0')).replaceAll('{date}', date).replace(/[\\/:*?"<>|]/g, '-');
  return named + r.name.slice(base.length);
}

const OPTS_KEY = 'convertix:opts';
try {
  const saved = JSON.parse(localStorage.getItem(OPTS_KEY) || '{}');
  for (const [k, v] of Object.entries(saved)) {
    const el = $('#opts').elements[k];
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  }
} catch {}
const syncOutputs = () => { $('#o-quality-out').value = $('#o-quality').value; $('#o-crf-out').value = $('#o-crf').value; };
syncOutputs();
$('#opts').addEventListener('input', () => {
  syncOutputs();
  try {
    const raw = {};
    for (const el of $('#opts').elements) if (el.name) raw[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    localStorage.setItem(OPTS_KEY, JSON.stringify(raw));
  } catch {}
});
$('#opts').addEventListener('reset', () => { setTimeout(() => { syncOutputs(); try { localStorage.removeItem(OPTS_KEY); } catch {} }, 0); toast('Réglages par défaut rétablis.'); });

const settings = $('#settings');
const openSettings = () => { settings.hidden = false; requestAnimationFrame(() => settings.classList.add('open')); $('#close-settings').focus(); };
const closeSettings = () => { settings.classList.remove('open'); setTimeout(() => { settings.hidden = true; }, reduceMotion ? 0 : 260); $('#open-settings').focus(); };
$('#open-settings').addEventListener('click', openSettings);
$('#close-settings').addEventListener('click', closeSettings);
settings.addEventListener('click', (e) => { if (e.target === settings) closeSettings(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !settings.hidden) closeSettings(); });

// ───────────────────────── Conversion ─────────────────────────
function updateProgress(item) {
  const bar = document.querySelector(`[data-id="${item.id}"] .bar i`);
  if (bar) bar.style.width = `${Math.round(item.progress * 100)}%`;
  const fl = document.querySelector(`[data-id="${item.id}"] .status-flaps`);
  if (fl && item.status === 'run') setFlaps(fl, item.progress > 0 ? `${String(Math.round(item.progress * 100)).padStart(3, ' ')} %` : STATUS.run, 6, 0);
}

function engineStatus(msg) { $('#engine-status').textContent = msg || ''; }

async function runItem(item) {
  item.status = 'run'; item.progress = 0; item.error = ''; item.results = [];
  render();
  try {
    item.results = await convert(item, item.target, readOpts(), {
      onProgress: (p) => { item.progress = p; updateProgress(item); },
      onStatus: engineStatus,
    });
    item.status = 'done'; item.progress = 1;
  } catch (e) {
    console.error(e);
    item.status = 'err';
    item.error = friendlyError(e);
  } finally {
    engineStatus('');
  }
  render();
}

function friendlyError(e) {
  const m = e?.message || String(e);
  if (/memory|allocation|OOM/i.test(m)) return 'Mémoire insuffisante pour ce fichier. Essayez une taille ou une durée plus petite dans les réglages.';
  if (/fetch|network|Failed to load/i.test(m)) return 'Le moteur n’a pas pu se charger. Vérifiez votre connexion puis réessayez.';
  return m;
}

async function runAll() {
  if (running) return;
  running = true;
  render();
  const queue = items.filter((i) => i.status === 'idle' || i.status === 'err');
  for (const it of queue) if (items.includes(it)) await runItem(it);
  running = false;
  render();
  const ok = queue.filter((i) => i.status === 'done').length;
  const ko = queue.length - ok;
  toast(ko ? `${ok} arrivé${ok > 1 ? 's' : ''}, ${ko} annulé${ko > 1 ? 's' : ''}. Le détail est sur le tableau.` : `${ok} fichier${ok > 1 ? 's' : ''} arrivé${ok > 1 ? 's' : ''} à destination.`);
}

// ───────────────────────── Téléchargements ─────────────────────────
function saveBlob(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

async function downloadItem(item) {
  if (item.results.length === 1) return saveBlob(outName(item, item.results[0]), item.results[0].blob);
  const z = await zipResults(item.results.map((r) => ({ ...r, name: outName(item, r) })), `${baseOf(item.file.name)}-${targetLabel(item.target).toLowerCase().replace(/\W+/g, '-')}.zip`);
  saveBlob(z.name, z.blob);
}

// ───────────────────────── Événements du tableau ─────────────────────────
$('#rows').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const item = items.find((i) => i.id === Number(btn.closest('[data-id]').dataset.id));
  if (!item) return;
  const r = item.results[Number(btn.dataset.i)];
  switch (btn.dataset.act) {
    case 'view': openViewer(item.file, item.file.name); break;
    case 'convert': if (!running) { running = true; await runItem(item); running = false; render(); } break;
    case 'download': downloadItem(item); break;
    case 'remove': items.splice(items.indexOf(item), 1); if (item.thumb?.startsWith('blob:')) URL.revokeObjectURL(item.thumb); render(); break;
    case 'view-result': openViewer(r.blob, outName(item, r)); break;
    case 'dl-result': saveBlob(outName(item, r), r.blob); break;
    case 'rebook': addFile(new File([r.blob], outName(item, r), { type: r.blob.type })); render(); toast('Fichier remis sur le tableau.'); break;
  }
});
$('#rows').addEventListener('change', (e) => {
  if (e.target.dataset.act !== 'target') return;
  const item = items.find((i) => i.id === Number(e.target.closest('[data-id]').dataset.id));
  item.target = e.target.value;
  if (item.status !== 'run') { item.status = 'idle'; item.results = []; item.error = ''; item.progress = 0; }
  render();
});

$('#all-to').addEventListener('change', (e) => {
  const t = e.target.value;
  if (!t) return;
  let n = 0;
  for (const it of items) if (it.status !== 'run' && targetsFor(it).includes(t)) { it.target = t; it.status = 'idle'; it.results = []; it.error = ''; it.progress = 0; n++; }
  render();
  toast(`${n} fichier${n > 1 ? 's' : ''} réorienté${n > 1 ? 's' : ''} vers ${targetLabel(t)}.`);
});
$('#convert-all').addEventListener('click', runAll);
$('#download-all').addEventListener('click', async () => {
  const done = items.filter((i) => i.status === 'done');
  if (done.length === 1) return downloadItem(done[0]);
  const z = await zipResults(done.flatMap((it) => it.results.map((r) => ({ ...r, name: outName(it, r) }))), `convertix-${new Date().toISOString().slice(0, 10)}.zip`);
  saveBlob(z.name, z.blob);
});
const closeMore = () => $('.more').removeAttribute('open');
$('#merge-pdf').addEventListener('click', async () => {
  closeMore();
  const pdfs = items.filter((i) => i.family === 'pdf');
  toast(`Fusion de ${pdfs.length} PDF dans l’ordre du tableau…`);
  try { const f = await mergePdfs(pdfs, {}); const it = addFile(f); it.status = 'done'; it.results = [{ name: f.name, blob: f }]; render(); toast('PDF fusionné : il est en bas du tableau.'); }
  catch (e) { toast(`Fusion impossible : ${friendlyError(e)}`, true); }
});
$('#images-pdf').addEventListener('click', async () => {
  closeMore();
  const imgs = items.filter((i) => i.family === 'image');
  toast(`Assemblage de ${imgs.length} image${imgs.length > 1 ? 's' : ''}…`);
  try { const f = await imagesToPdf(imgs, readOpts(), { onStatus: engineStatus }); const it = addFile(f); it.status = 'done'; it.results = [{ name: f.name, blob: f }]; render(); toast('PDF créé : il est en bas du tableau.'); }
  catch (e) { toast(`Assemblage impossible : ${friendlyError(e)}`, true); }
});
$('#clear-done').addEventListener('click', () => { closeMore(); for (let i = items.length - 1; i >= 0; i--) if (items[i].status === 'done') items.splice(i, 1); render(); });
$('#clear-all').addEventListener('click', () => { closeMore(); if (running) return toast('Attendez la fin des conversions en cours.', true); items.length = 0; render(); });

// ───────────────────────── Dépôt, sélection, collage ─────────────────────────
$('#file-input').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
$('#folder-input').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
$('#pick-folder').addEventListener('click', (e) => { e.preventDefault(); $('#folder-input').click(); });
$('#load-samples').addEventListener('click', (e) => { e.preventDefault(); loadSamples(); });

let dragDepth = 0;
const veil = $('#dropveil');
window.addEventListener('dragenter', (e) => { if (![...(e.dataTransfer?.types || [])].includes('Files')) return; dragDepth++; veil.classList.add('show'); $('#gate').classList.add('hot'); });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; veil.classList.remove('show'); $('#gate').classList.remove('hot'); } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0; veil.classList.remove('show'); $('#gate').classList.remove('hot');
  const dt = e.dataTransfer;
  const entries = [...(dt.items || [])].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (entries.some((en) => en.isDirectory)) addFiles(await readEntries(entries));
  else addFiles(dt.files);
});

async function readEntries(entries) {
  const out = [];
  const walk = async (en) => {
    if (en.isFile) out.push(await new Promise((res, rej) => en.file(res, rej)));
    else if (en.isDirectory) {
      const reader = en.createReader();
      let batch;
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const b of batch) await walk(b);
      } while (batch.length);
    }
  };
  for (const en of entries) await walk(en);
  return out;
}

document.addEventListener('paste', (e) => {
  if (e.target.closest('input, textarea, select')) return;
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) return addFiles(files.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `colle-${Date.now()}-${i}.${(f.type.split('/')[1] || 'bin').replace('jpeg', 'jpg')}`, { type: f.type }))));
  const text = e.clipboardData?.getData('text/plain');
  if (!text) return;
  let ext = 'txt';
  try { JSON.parse(text); ext = 'json'; } catch {
    if (/^\s*<(!doctype|html)/i.test(text)) ext = 'html';
    else if (/^(#{1,6} |\s*[-*] |\s*\d+\. )/m.test(text)) ext = 'md';
    else if (text.split('\n')[0].split(/[;,\t]/).length > 2 && text.split('\n').length > 1) ext = 'csv';
  }
  addFiles([new File([text], `texte-colle.${ext}`, { type: 'text/plain' })]);
});

// ───────────────────────── Exemples ─────────────────────────
async function loadSamples() {
  const c = document.createElement('canvas');
  c.width = 1200; c.height = 800;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 1200, 800);
  grd.addColorStop(0, '#1b1c18'); grd.addColorStop(1, '#3a3218');
  g.fillStyle = grd; g.fillRect(0, 0, 1200, 800);
  const word = 'CONVERTIX';
  for (let i = 0; i < word.length; i++) {
    g.fillStyle = '#2b2d27'; g.fillRect(57 + i * 122, 310, 108, 170);
    g.fillStyle = '#0b0c0a'; g.fillRect(57 + i * 122, 394, 108, 3);
    g.fillStyle = '#f2b705'; g.font = '800 130px "Big Shoulders Display", Impact, sans-serif'; g.textAlign = 'center';
    g.fillText(word[i], 111 + i * 122, 443);
  }
  g.fillStyle = '#e9e4d4'; g.font = '600 34px "JetBrains Mono", monospace'; g.fillText('EXEMPLE · CX 001 · PNG → WEBP', 600, 600);
  const png = await new Promise((r) => c.toBlob(r, 'image/png'));
  const csv = 'vol;depart;arrivee;taille_ko;statut\nCX001;PNG;WEBP;2480;arrivé\nCX002;DOCX;PDF;318;arrivé\nCX003;MOV;MP4;48211;embarquement\nCX004;CSV;XLSX;92;prêt\nCX005;HEIC;JPG;3105;prêt\n';
  const md = '# Carnet de bord\n\nCe fichier **Markdown** est un exemple. Convertissez-le en *PDF* ou en *HTML*, ou ouvrez-le dans le lecteur.\n\n## Escales\n\n- Images : PNG, JPG, WEBP, AVIF, HEIC\n- Documents : DOCX, PDF, Markdown\n- Données : CSV, XLSX, JSON, YAML\n\n> Aucun fichier ne quitte votre appareil.\n';
  addFiles([
    new File([png], 'affiche-exemple.png', { type: 'image/png' }),
    new File([csv], 'vols-exemple.csv', { type: 'text/csv' }),
    new File([md], 'carnet-exemple.md', { type: 'text/markdown' }),
  ], { sample: true });
}

// ───────────────────────── Notifications ─────────────────────────
function toast(msg, bad = false) {
  const t = document.createElement('p');
  t.className = `toast${bad ? ' bad' : ''}`;
  t.textContent = msg;
  $('#toasts').append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 3800);
}

render();
