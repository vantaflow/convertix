// Lecteur universel : affiche ou lit un fichier (source ou résultat) selon sa famille.
import { extOf, familyOf, humanSize, normExt, FFMPEG_IMAGE_INPUT } from './formats.js';
import { openPdf, renderPdfPage, convert } from './convert.js';

const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) n.append(k);
  return n;
};

let urls = [];
const objUrl = (b) => { const u = URL.createObjectURL(b); urls.push(u); return u; };

let dialog, stage, titleEl, metaEl, toolsEl, onConvertCb;

function ensureDialog() {
  if (dialog) return;
  dialog = el('dialog', { class: 'viewer', 'aria-labelledby': 'viewer-title' });
  titleEl = el('h2', { id: 'viewer-title', class: 'viewer-title' });
  metaEl = el('p', { class: 'viewer-meta' });
  toolsEl = el('div', { class: 'viewer-tools' });
  const close = el('button', { class: 'btn ghost', type: 'button', onclick: () => dialog.close(), title: 'Fermer (Échap)' }, 'Fermer');
  stage = el('div', { class: 'viewer-stage' });
  dialog.append(
    el('header', { class: 'viewer-head' }, el('div', { class: 'viewer-id' }, el('span', { class: 'eyebrow' }, 'Lecteur'), titleEl, metaEl), toolsEl, close),
    stage,
  );
  dialog.addEventListener('close', () => {
    stage.replaceChildren();
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = [];
  });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);
}

export function setViewerConvertHandler(cb) { onConvertCb = cb; }

export async function openViewer(blob, name) {
  ensureDialog();
  const file = blob instanceof File ? blob : new File([blob], name, { type: blob.type });
  const ext = normExt(extOf(name));
  const fam = familyOf(file);
  titleEl.textContent = name;
  metaEl.textContent = `${ext.toUpperCase() || 'FICHIER'} · ${humanSize(file.size)}`;
  toolsEl.replaceChildren();
  stage.replaceChildren(el('p', { class: 'viewer-loading' }, 'Ouverture…'));
  if (!dialog.open) dialog.showModal();
  try {
    const view = await render(file, ext, fam);
    stage.replaceChildren(view);
  } catch (e) {
    stage.replaceChildren(el('div', { class: 'viewer-error' }, el('strong', {}, 'Lecture impossible'), el('p', {}, e.message || String(e))));
  }
}

async function render(file, ext, fam) {
  if (fam === 'image') return renderImage(file, ext);
  if (fam === 'pdf') return renderPdf(file);
  if (fam === 'audio') return renderAudio(file);
  if (fam === 'video') return renderVideo(file);
  if (fam === 'docx' || fam === 'md' || fam === 'html') return renderDoc(file, fam);
  if (fam === 'data') return renderData(file, ext);
  if (fam === 'zip') return renderZip(file);
  if (fam === 'txt' || /^text\//.test(file.type) || ['sql', 'base64'].includes(ext)) return renderText(await file.text());
  // Dernier recours : si c'est du texte lisible on l'affiche, sinon vue hexadécimale.
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  const printable = head.filter((b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127) || b >= 160).length;
  if (head.length && printable / head.length > 0.92) return renderText(await file.text());
  return renderHex(head, file.size);
}

function renderImage(file, ext) {
  const wrap = el('div', { class: 'v-image' });
  const img = el('img', { alt: file.name, draggable: 'false' });
  let zoom = 'fit';
  const apply = () => { wrap.dataset.zoom = zoom; zbtn.textContent = zoom === 'fit' ? 'Taille réelle' : 'Ajuster'; };
  const zbtn = el('button', { class: 'btn ghost', type: 'button', onclick: () => { zoom = zoom === 'fit' ? 'real' : 'fit'; apply(); } });
  toolsEl.append(zbtn);
  apply();
  const show = (blob) => {
    img.src = objUrl(blob);
    img.onload = () => { metaEl.textContent += ` · ${img.naturalWidth} × ${img.naturalHeight} px`; };
  };
  if (ext === 'heic' || FFMPEG_IMAGE_INPUT.has(ext)) {
    wrap.append(el('p', { class: 'viewer-loading' }, 'Décodage de l’image…'));
    convert({ file, ext, family: 'image' }, 'png', {}, { onProgress() {}, onStatus() {} })
      .then(([r]) => { wrap.replaceChildren(img); show(r.blob); })
      .catch((e) => wrap.replaceChildren(el('p', { class: 'viewer-error' }, e.message)));
  } else {
    wrap.append(img);
    show(file);
  }
  return wrap;
}

async function renderPdf(file) {
  const doc = await openPdf(file);
  let n = 1;
  let scale = 1.4;
  const canvasHost = el('div', { class: 'v-pdf' });
  const counter = el('span', { class: 'v-counter' });
  const draw = async () => {
    counter.textContent = `Page ${n} / ${doc.numPages}`;
    const c = await renderPdfPage(doc, n, scale * (window.devicePixelRatio || 1));
    c.style.width = `${c.width / (window.devicePixelRatio || 1)}px`;
    canvasHost.replaceChildren(c);
  };
  const go = (d) => { const m = Math.min(doc.numPages, Math.max(1, n + d)); if (m !== n) { n = m; draw(); } };
  toolsEl.append(
    el('button', { class: 'btn ghost', type: 'button', onclick: () => go(-1), 'aria-label': 'Page précédente' }, '←'),
    counter,
    el('button', { class: 'btn ghost', type: 'button', onclick: () => go(1), 'aria-label': 'Page suivante' }, '→'),
    el('button', { class: 'btn ghost', type: 'button', onclick: () => { scale = Math.max(0.5, scale - 0.25); draw(); } }, '−'),
    el('button', { class: 'btn ghost', type: 'button', onclick: () => { scale = Math.min(4, scale + 0.25); draw(); } }, '+'),
  );
  const keys = (e) => { if (!dialog.open) return document.removeEventListener('keydown', keys); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
  document.addEventListener('keydown', keys);
  metaEl.textContent += ` · ${doc.numPages} page${doc.numPages > 1 ? 's' : ''}`;
  await draw();
  return canvasHost;
}

function fmtTime(s) {
  if (!isFinite(s)) return '–';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function notPlayable(file, media) {
  return el('div', { class: 'viewer-error' },
    el('strong', {}, 'Votre navigateur ne lit pas ce format directement.'),
    el('p', {}, `Convertissez-le en ${media === 'video' ? 'MP4' : 'MP3'} pour le lire ici ; la conversion se fait sur votre appareil.`),
    onConvertCb ? el('button', { class: 'btn primary', type: 'button', onclick: () => { dialog.close(); onConvertCb(file, media === 'video' ? 'mp4' : 'mp3'); } }, `Ajouter au tableau en ${media === 'video' ? 'MP4' : 'MP3'}`) : null);
}

async function renderAudio(file) {
  const box = el('div', { class: 'v-audio' });
  const wave = el('canvas', { class: 'v-wave', width: '1200', height: '220' });
  const audio = el('audio', { controls: '', src: objUrl(file), preload: 'metadata' });
  box.append(wave, audio);
  audio.addEventListener('error', () => box.replaceChildren(notPlayable(file, 'audio')));
  audio.addEventListener('loadedmetadata', () => { metaEl.textContent += ` · ${fmtTime(audio.duration)}`; });
  // Forme d'onde, calculée en arrière-plan.
  (async () => {
    try {
      if (file.size > 150 * 1024 * 1024) return;
      const ac = new OfflineAudioContext(1, 1, 44100);
      const buf = await ac.decodeAudioData(await file.arrayBuffer());
      const data = buf.getChannelData(0);
      const g = wave.getContext('2d');
      const W = wave.width, H = wave.height, bars = 200, step = Math.floor(data.length / bars) || 1;
      const peaks = [];
      for (let i = 0; i < bars; i++) {
        let m = 0;
        for (let j = i * step; j < (i + 1) * step && j < data.length; j += 16) m = Math.max(m, Math.abs(data[j]));
        peaks.push(m);
      }
      const max = Math.max(...peaks, 0.01);
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--flap-ink').trim() || '#f5c518';
      const dim = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#777';
      const paint = () => {
        g.clearRect(0, 0, W, H);
        const played = audio.duration ? audio.currentTime / audio.duration : 0;
        peaks.forEach((p, i) => {
          const h = Math.max(4, (p / max) * (H - 20));
          g.fillStyle = i / bars <= played ? accent : dim;
          g.fillRect(i * (W / bars) + 1, (H - h) / 2, W / bars - 3, h);
        });
      };
      paint();
      audio.addEventListener('timeupdate', paint);
      wave.addEventListener('click', (e) => {
        const r = wave.getBoundingClientRect();
        if (audio.duration) audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration;
      });
    } catch { wave.remove(); }
  })();
  return box;
}

function renderVideo(file) {
  const box = el('div', { class: 'v-video' });
  const v = el('video', { controls: '', src: objUrl(file), playsinline: '', preload: 'metadata' });
  v.addEventListener('error', () => box.replaceChildren(notPlayable(file, 'video')));
  v.addEventListener('loadedmetadata', () => {
    if (!v.videoWidth && v.duration) return;
    metaEl.textContent += ` · ${v.videoWidth} × ${v.videoHeight} · ${fmtTime(v.duration)}`;
  });
  box.append(v);
  toolsEl.append(el('button', { class: 'btn ghost', type: 'button', onclick: () => { v.playbackRate = v.playbackRate >= 2 ? 0.5 : v.playbackRate + 0.5; vit.textContent = `×${v.playbackRate}`; } }, 'Vitesse'), (() => { const s = el('span', { class: 'v-counter' }, '×1'); return s; })());
  const vit = toolsEl.lastChild;
  return box;
}

async function renderDoc(file, fam) {
  let html;
  if (fam === 'docx') {
    const { default: mammoth } = await import('mammoth/mammoth.browser.js');
    html = (await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })).value;
  } else if (fam === 'md') {
    const { marked } = await import('marked');
    html = marked.parse(await file.text());
  } else html = await file.text();
  const page = /<html[\s>]/i.test(html)
    ? html
    : `<!doctype html><meta charset="utf-8"><style>body{font:17px/1.65 Georgia,serif;max-width:44rem;margin:2.5rem auto;padding:0 1.5rem;color:#1d1d1b;background:#fff}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:.3rem .6rem}pre,code{background:#f3f3f1;font-size:.9em}pre{padding:1rem;overflow:auto}</style>${html}`;
  // Bac à sable sans script : le document est affiché, jamais exécuté.
  const frame = el('iframe', { class: 'v-doc', sandbox: '', referrerpolicy: 'no-referrer', title: file.name });
  frame.srcdoc = page;
  if (fam !== 'docx') {
    let raw = false;
    const pre = el('pre', { class: 'v-text' });
    const box = el('div', { class: 'v-docwrap' }, frame);
    toolsEl.append(el('button', { class: 'btn ghost', type: 'button', onclick: async (e) => {
      raw = !raw;
      e.target.textContent = raw ? 'Rendu' : 'Source';
      if (raw) { pre.textContent = await file.text(); box.replaceChildren(pre); } else box.replaceChildren(frame);
    } }, 'Source'));
    return box;
  }
  return frame;
}

async function renderData(file, ext) {
  const { convert: conv } = await import('./convert.js');
  // On réutilise le moteur : conversion en JSON de lignes, puis affichage en tableau.
  const item = { file, ext, family: 'data' };
  const [res] = await conv(item, 'csv', { csvDelim: '\u0001' }, { onProgress() {}, onStatus() {} });
  const text = (await res.blob.text()).replace(/^﻿/, '');
  const lines = text.split('\r\n');
  const parse = (l) => {
    const out = []; let f = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) { if (c === '"' && l[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
      else if (c === '"' && f === '') q = true; else if (c === '\u0001') { out.push(f); f = ''; } else f += c;
    }
    out.push(f); return out;
  };
  const head = parse(lines[0] || '');
  const rows = lines.slice(1).filter(Boolean);
  const LIMIT = 1000;
  metaEl.textContent += ` · ${rows.length} ligne${rows.length > 1 ? 's' : ''} · ${head.length} colonne${head.length > 1 ? 's' : ''}`;
  const filter = el('input', { type: 'search', class: 'v-filter', placeholder: 'Filtrer les lignes…', 'aria-label': 'Filtrer les lignes', id: 'viewer-filter' });
  toolsEl.append(filter);
  const tbody = el('tbody');
  const fill = () => {
    const q = filter.value.trim().toLowerCase();
    const sel = (q ? rows.filter((r) => r.toLowerCase().includes(q)) : rows).slice(0, LIMIT);
    tbody.replaceChildren(...sel.map((r, i) => el('tr', {}, el('td', { class: 'v-rownum' }, String(i + 1)), ...parse(r).map((c) => el('td', {}, c)))));
  };
  filter.addEventListener('input', fill);
  fill();
  const table = el('table', { class: 'v-table' }, el('thead', {}, el('tr', {}, el('th', { class: 'v-rownum' }, '#'), ...head.map((h) => el('th', {}, h)))), tbody);
  const wrap = el('div', { class: 'v-tablewrap' }, table);
  if (rows.length > LIMIT) wrap.append(el('p', { class: 'v-note' }, `Affichage des ${LIMIT} premières lignes. La conversion, elle, garde tout.`));
  return wrap;
}

async function renderZip(file) {
  const { default: JSZip } = await import('jszip');
  const z = await JSZip.loadAsync(file);
  const entries = Object.values(z.files).filter((f) => !f.dir && !f.name.startsWith('__MACOSX/'));
  metaEl.textContent += ` · ${entries.length} fichier${entries.length > 1 ? 's' : ''}`;
  const list = el('ul', { class: 'v-zip' });
  for (const f of entries) {
    const size = f._data?.uncompressedSize;
    list.append(el('li', {},
      el('span', { class: 'v-zip-name' }, f.name),
      el('span', { class: 'v-zip-size' }, size != null ? humanSize(size) : ''),
      el('button', { class: 'btn ghost small', type: 'button', onclick: async () => openViewer(await f.async('blob'), f.name.split('/').pop()) }, 'Ouvrir')));
  }
  return list;
}

function renderText(text) {
  const MAX = 400000;
  const t = text.length > MAX ? `${text.slice(0, MAX)}\n\n… (aperçu tronqué)` : text;
  const lines = t.split('\n');
  metaEl.textContent += ` · ${text.split('\n').length} ligne${lines.length > 1 ? 's' : ''}`;
  let wrapOn = true;
  const pre = el('pre', { class: 'v-text', 'data-wrap': 'on' });
  const gutter = lines.length < 20000;
  if (gutter) pre.append(...lines.map((l) => el('span', { class: 'v-line' }, l + '\n')));
  else pre.textContent = t;
  toolsEl.append(
    el('button', { class: 'btn ghost', type: 'button', onclick: (e) => { wrapOn = !wrapOn; pre.dataset.wrap = wrapOn ? 'on' : 'off'; e.target.textContent = wrapOn ? 'Sans retour à la ligne' : 'Retour à la ligne'; } }, 'Sans retour à la ligne'),
    el('button', { class: 'btn ghost', type: 'button', onclick: async (e) => { try { await navigator.clipboard.writeText(text); e.target.textContent = 'Copié'; } catch { e.target.textContent = 'Copie refusée'; } } }, 'Copier'),
  );
  return pre;
}

function renderHex(bytes, total) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = [...bytes.slice(i, i + 16)];
    const hex = chunk.map((b) => b.toString(16).padStart(2, '0')).join(' ').padEnd(47, ' ');
    const asc = chunk.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '·')).join('');
    out += `${i.toString(16).padStart(8, '0')}  ${hex}  ${asc}\n`;
  }
  const box = el('div', {},
    el('p', { class: 'v-note' }, `Format binaire sans lecteur dédié : voici les ${bytes.length} premiers octets sur ${humanSize(total)}.`),
    el('pre', { class: 'v-text v-hex' }, out));
  return box;
}
