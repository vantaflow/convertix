// Moteurs de conversion. Tout tourne dans le navigateur : aucun fichier n'est envoyé.
import { baseOf, normExt, FFMPEG_IMAGE_INPUT } from './formats.js';

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', bmp: 'image/bmp',
  ico: 'image/x-icon', tiff: 'image/tiff', svg: 'image/svg+xml', pdf: 'application/pdf', txt: 'text/plain;charset=utf-8',
  md: 'text/markdown;charset=utf-8', html: 'text/html;charset=utf-8', csv: 'text/csv;charset=utf-8',
  tsv: 'text/tab-separated-values;charset=utf-8', json: 'application/json', yaml: 'application/yaml', xml: 'application/xml',
  sql: 'application/sql', zip: 'application/zip', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
  m4a: 'audio/mp4', opus: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
};

const textBlob = (s, ext) => new Blob([s], { type: MIME[ext] || 'text/plain' });
const tick = () => new Promise((r) => setTimeout(r, 0));

// ───────────────────────── ffmpeg (chargé à la demande) ─────────────────────────
let ffmpegPromise;
let ffmpegQueue = Promise.resolve();
export function loadFFmpeg(onStatus) {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import('@ffmpeg/ffmpeg'), import('@ffmpeg/util')]);
      const ff = new FFmpeg();
      const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
      onStatus?.('Chargement du moteur audio/vidéo (≈ 31 Mo, une seule fois)…');
      await ff.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      return ff;
    })().catch((e) => {
      ffmpegPromise = undefined;
      throw e;
    });
  }
  return ffmpegPromise;
}

async function runFFmpeg(file, inExt, outExt, args, onProgress, onStatus) {
  const job = ffmpegQueue.then(async () => {
    const ff = await loadFFmpeg(onStatus);
    onStatus?.('');
    const input = `entree.${inExt || 'bin'}`;
    const output = `sortie.${outExt}`;
    await ff.writeFile(input, new Uint8Array(await file.arrayBuffer()));
    const handler = ({ progress }) => onProgress?.(Math.max(0, Math.min(1, progress)));
    ff.on('progress', handler);
    const logs = [];
    const logger = ({ message }) => { logs.push(message); if (logs.length > 30) logs.shift(); };
    ff.on('log', logger);
    try {
      const code = await ff.exec(args(input, output));
      if (code !== 0) throw new Error(`ffmpeg a échoué : ${logs.slice(-3).join(' ').slice(0, 220)}`);
      const data = await ff.readFile(output);
      return new Blob([data.buffer], { type: MIME[outExt] || 'application/octet-stream' });
    } finally {
      ff.off('progress', handler);
      ff.off('log', logger);
      try { await ff.deleteFile(input); } catch {}
      try { await ff.deleteFile(output); } catch {}
    }
  });
  ffmpegQueue = job.catch(() => {});
  return job;
}

// ───────────────────────── Images ─────────────────────────
async function loadImageSource(item, ctx) {
  let blob = item.file;
  const ext = normExt(item.ext);
  if (ext === 'heic') {
    const { default: heic2any } = await import('heic2any');
    const r = await heic2any({ blob, toType: 'image/png' });
    blob = Array.isArray(r) ? r[0] : r;
  } else if (FFMPEG_IMAGE_INPUT.has(item.ext)) {
    blob = await runFFmpeg(item.file, item.ext, 'png', (i, o) => ['-i', i, o], null, ctx.onStatus);
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (!w || !h) { w = 1024; h = 1024; }
    return { src: img, w, h };
  } catch {
    throw new Error("Impossible de lire cette image : le fichier est peut-être abîmé.");
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

function drawCanvas({ src, w, h }, o, { opaque = false, maxSide = 0 } = {}) {
  let scale = (o.scale || 100) / 100;
  if (o.maxW && w * scale > o.maxW) scale = o.maxW / w;
  if (o.maxH && h * scale > o.maxH) scale = Math.min(scale, o.maxH / h);
  if (maxSide && Math.max(w, h) * scale > maxSide) scale = maxSide / Math.max(w, h);
  const dw = Math.max(1, Math.round(w * scale));
  const dh = Math.max(1, Math.round(h * scale));
  const rot = Number(o.rotate || 0);
  const swap = rot === 90 || rot === 270;
  const c = document.createElement('canvas');
  c.width = swap ? dh : dw;
  c.height = swap ? dw : dh;
  const g = c.getContext('2d');
  if (opaque || o.fillBg) {
    g.fillStyle = o.bg || '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
  }
  g.imageSmoothingQuality = 'high';
  g.translate(c.width / 2, c.height / 2);
  g.rotate((rot * Math.PI) / 180);
  g.scale(o.flipH ? -1 : 1, o.flipV ? -1 : 1);
  g.drawImage(src, -dw / 2, -dh / 2, dw, dh);
  if (o.gray) {
    const d = g.getImageData(0, 0, c.width, c.height);
    const p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const y = 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2];
      p[i] = p[i + 1] = p[i + 2] = y;
    }
    g.putImageData(d, 0, 0);
  }
  return c;
}

const canvasBlob = (c, type, q) =>
  new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error(`Votre navigateur ne sait pas produire ce format (${type}).`))), type, q));

function canvasToBmp(c) {
  const { width: w, height: h } = c;
  const data = c.getContext('2d').getImageData(0, 0, w, h).data;
  const row = Math.ceil((w * 3) / 4) * 4;
  const size = 54 + row * h;
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  v.setUint8(0, 0x42); v.setUint8(1, 0x4d);
  v.setUint32(2, size, true); v.setUint32(10, 54, true); v.setUint32(14, 40, true);
  v.setInt32(18, w, true); v.setInt32(22, h, true); v.setUint16(26, 1, true); v.setUint16(28, 24, true);
  v.setUint32(34, row * h, true); v.setInt32(38, 2835, true); v.setInt32(42, 2835, true);
  const out = new Uint8Array(buf);
  for (let y = 0; y < h; y++) {
    const o = 54 + (h - 1 - y) * row;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      out[o + x * 3] = data[i + 2];
      out[o + x * 3 + 1] = data[i + 1];
      out[o + x * 3 + 2] = data[i];
    }
  }
  return new Blob([buf], { type: MIME.bmp });
}

async function canvasToIco(c) {
  const png = new Uint8Array(await (await canvasBlob(c, 'image/png')).arrayBuffer());
  const head = new ArrayBuffer(22);
  const v = new DataView(head);
  v.setUint16(2, 1, true); v.setUint16(4, 1, true);
  v.setUint8(6, c.width >= 256 ? 0 : c.width); v.setUint8(7, c.height >= 256 ? 0 : c.height);
  v.setUint16(10, 1, true); v.setUint16(12, 32, true);
  v.setUint32(14, png.length, true); v.setUint32(18, 22, true);
  return new Blob([head, png], { type: MIME.ico });
}

const blobToDataURL = (b) =>
  new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });

async function encodeImage(source, target, o, ctx) {
  const q = (o.quality || 90) / 100;
  switch (target) {
    case 'png': return canvasBlob(drawCanvas(source, o), 'image/png');
    case 'jpg': return canvasBlob(drawCanvas(source, o, { opaque: true }), 'image/jpeg', q);
    case 'webp': return canvasBlob(drawCanvas(source, o), 'image/webp', q);
    case 'avif': return canvasBlob(drawCanvas(source, o), 'image/avif', q);
    case 'bmp': return canvasToBmp(drawCanvas(source, o, { opaque: true }));
    case 'ico': return canvasToIco(drawCanvas(source, o, { maxSide: 256 }));
    case 'svg': {
      const c = drawCanvas(source, o);
      const uri = c.toDataURL('image/png');
      return textBlob(`<svg xmlns="http://www.w3.org/2000/svg" width="${c.width}" height="${c.height}" viewBox="0 0 ${c.width} ${c.height}"><image href="${uri}" width="${c.width}" height="${c.height}"/></svg>`, 'svg');
    }
    case 'gif':
    case 'tiff': {
      const png = await canvasBlob(drawCanvas(source, o), 'image/png');
      return runFFmpeg(png, 'png', target, (i, out) => ['-i', i, out], null, ctx.onStatus);
    }
    case 'pdf': {
      const { jsPDF } = await import('jspdf');
      const c = drawCanvas(source, o, { opaque: true });
      const w = c.width * 0.75, h = c.height * 0.75;
      const doc = new jsPDF({ orientation: w > h ? 'l' : 'p', unit: 'pt', format: [w, h], compress: true });
      doc.addImage(c.toDataURL('image/jpeg', q), 'JPEG', 0, 0, w, h);
      return doc.output('blob');
    }
    case 'base64': return textBlob(await blobToDataURL(await canvasBlob(drawCanvas(source, o), 'image/png')), 'txt');
    default: throw new Error('Format de sortie inconnu');
  }
}

// ───────────────────────── PDF ─────────────────────────
let pdfjsPromise;
async function pdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const lib = await import('pdfjs-dist');
      const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      lib.GlobalWorkerOptions.workerSrc = worker;
      return lib;
    })();
  }
  return pdfjsPromise;
}

export async function openPdf(blob) {
  const lib = await pdfjs();
  return lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
}

export async function renderPdfPage(doc, n, scale) {
  const page = await doc.getPage(n);
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.ceil(vp.width);
  c.height = Math.ceil(vp.height);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: g, viewport: vp }).promise;
  return c;
}

async function pdfText(doc) {
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    let s = '';
    for (const it of tc.items) s += it.str + (it.hasEOL ? '\n' : '');
    pages.push(s.trim());
  }
  return pages;
}

async function convertPdf(item, target, o, ctx) {
  const base = baseOf(item.file.name);
  if (target === 'pdf-pages') {
    const { PDFDocument } = await import('pdf-lib');
    const src = await PDFDocument.load(await item.file.arrayBuffer(), { ignoreEncryption: true });
    const out = [];
    const n = src.getPageCount();
    for (let i = 0; i < n; i++) {
      const d = await PDFDocument.create();
      const [p] = await d.copyPages(src, [i]);
      d.addPage(p);
      out.push({ name: `${base}-page-${String(i + 1).padStart(3, '0')}.pdf`, blob: new Blob([await d.save()], { type: MIME.pdf }) });
      ctx.onProgress((i + 1) / n);
    }
    return out;
  }
  const doc = await openPdf(item.file);
  if (['txt', 'md', 'html'].includes(target)) {
    const pages = await pdfText(doc);
    if (!pages.join('').trim()) throw new Error("Ce PDF ne contient pas de texte (c'est sûrement un scan). Convertissez-le plutôt en image.");
    if (target === 'txt') return [{ name: `${base}.txt`, blob: textBlob(pages.join('\n\n'), 'txt') }];
    if (target === 'md') return [{ name: `${base}.md`, blob: textBlob(pages.map((p, i) => `## Page ${i + 1}\n\n${p}`).join('\n\n'), 'md') }];
    const body = pages.map((p, i) => `<section><h2>Page ${i + 1}</h2>${p.split(/\n+/).map((l) => `<p>${esc(l)}</p>`).join('')}</section>`).join('');
    return [{ name: `${base}.html`, blob: textBlob(htmlDoc(base, body), 'html') }];
  }
  const scale = Number(o.pdfScale || 2);
  if (target === 'pdf-light') {
    const { jsPDF } = await import('jspdf');
    let pdf;
    for (let i = 1; i <= doc.numPages; i++) {
      const s = Math.min(scale, 1.5);
      const c = await renderPdfPage(doc, i, s);
      // À l'échelle 1, pdf.js rend 1 px par point : on retrouve la taille d'origine de la page.
      const w = c.width / s, h = c.height / s;
      if (!pdf) pdf = new jsPDF({ unit: 'pt', format: [w, h], orientation: w > h ? 'l' : 'p', compress: true });
      else pdf.addPage([w, h], w > h ? 'l' : 'p');
      pdf.addImage(c.toDataURL('image/jpeg', (o.quality || 75) / 100), 'JPEG', 0, 0, w, h);
      ctx.onProgress(i / doc.numPages);
    }
    return [{ name: `${base}-allege.pdf`, blob: pdf.output('blob') }];
  }
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await renderPdfPage(doc, i, scale);
    const blob = await encodeImage({ src: c, w: c.width, h: c.height }, target, o, ctx);
    out.push({ name: doc.numPages > 1 ? `${base}-page-${String(i).padStart(3, '0')}.${target}` : `${base}.${target}`, blob });
    ctx.onProgress(i / doc.numPages);
  }
  return out;
}

// ───────────────────────── Documents texte ─────────────────────────
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function htmlDoc(title, body) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:46rem;margin:3rem auto;padding:0 1rem;color:#1b1b1b}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:.3rem .6rem}pre{background:#f4f4f4;padding:1rem;overflow:auto}</style>
</head><body>
${body}
</body></html>`;
}

function parseHtml(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

const BLOCKS = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'BLOCKQUOTE', 'BR', 'TABLE', 'UL', 'OL', 'HR']);
function htmlToText(html) {
  const doc = parseHtml(html);
  doc.querySelectorAll('script,style,noscript').forEach((n) => n.remove());
  let out = '';
  const walk = (n) => {
    if (n.nodeType === 3) { out += n.nodeValue.replace(/\s+/g, ' '); return; }
    if (n.nodeType !== 1) return;
    if (n.tagName === 'TD' || n.tagName === 'TH') out += '\t';
    if (n.tagName === 'LI') out += '\n• ';
    for (const c of n.childNodes) walk(c);
    if (BLOCKS.has(n.tagName)) out += '\n';
  };
  walk(doc.body);
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function htmlToMd(html) {
  const { default: TurndownService } = await import('turndown');
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
  td.remove(['script', 'style']);
  return td.turndown(html);
}

// Le PDF standard de jsPDF n'accepte que le latin : on remplace les signes typographiques courants.
function pdfSafe(s) {
  return s.replace(/[‘’‛]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—]/g, '-')
    .replace(/…/g, '...').replace(/ | /g, ' ').replace(/[•●]/g, '-').replace(/[^\x00-\xFFŒœ]/g, '?');
}

async function htmlToPdf(html) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const W = 595.28, H = 841.89, M = 60;
  let y = M;
  const line = (text, { size = 11, style = 'normal', font = 'helvetica', indent = 0, after = 6, pre = false } = {}) => {
    const t = pre ? text : text.replace(/\s+/g, ' ').trim();
    if (!t) return;
    pdf.setFont(font, style);
    pdf.setFontSize(size);
    const lines = pre ? t.split('\n').flatMap((l) => pdf.splitTextToSize(pdfSafe(l) || ' ', W - 2 * M - indent)) : pdf.splitTextToSize(pdfSafe(t), W - 2 * M - indent);
    for (const l of lines) {
      if (y + size > H - M) { pdf.addPage(); y = M; }
      pdf.text(l, M + indent, y + size);
      y += size * 1.4;
    }
    y += after;
  };
  const sizes = { H1: 24, H2: 19, H3: 16, H4: 13, H5: 12, H6: 11 };
  const walk = (el, indent = 0) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { line(n.nodeValue, { indent }); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName;
      if (sizes[tag]) { y += 6; line(n.textContent, { size: sizes[tag], style: 'bold', indent, after: 8 }); }
      else if (tag === 'PRE') line(n.textContent, { font: 'courier', size: 9.5, indent: indent + 10, pre: true, after: 10 });
      else if (tag === 'UL' || tag === 'OL') {
        let k = 1;
        for (const li of n.children) line(`${tag === 'OL' ? `${k++}.` : '-'} ${li.textContent}`, { indent: indent + 14, after: 3 });
        y += 6;
      } else if (tag === 'TABLE') {
        for (const tr of n.querySelectorAll('tr')) line([...tr.children].map((c) => c.textContent.trim()).join('  |  '), { size: 9.5, indent, after: 2 });
        y += 8;
      } else if (tag === 'BLOCKQUOTE') walk(n, indent + 18);
      else if (tag === 'HR') { pdf.setDrawColor(180); pdf.line(M, y + 4, W - M, y + 4); y += 14; }
      else if (['SCRIPT', 'STYLE', 'IMG', 'SVG'].includes(tag)) continue;
      else if ([...n.children].some((c) => BLOCKS.has(c.tagName) || sizes[c.tagName])) walk(n, indent);
      else line(n.textContent, { indent, after: ['P', 'DIV', 'LI'].includes(tag) ? 8 : 2 });
    }
  };
  walk(parseHtml(html).body);
  return pdf.output('blob');
}

async function docToHtml(item) {
  const ext = item.family;
  if (ext === 'docx') {
    const { default: mammoth } = await import('mammoth/mammoth.browser.js');
    return (await mammoth.convertToHtml({ arrayBuffer: await item.file.arrayBuffer() })).value;
  }
  const text = await item.file.text();
  if (ext === 'md') {
    const { marked } = await import('marked');
    return marked.parse(text);
  }
  if (ext === 'html') return text;
  return text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n');
}

async function convertDoc(item, target) {
  const base = baseOf(item.file.name);
  const html = await docToHtml(item);
  if (target === 'html') return [{ name: `${base}.html`, blob: textBlob(item.family === 'html' ? html : htmlDoc(base, html), 'html') }];
  if (target === 'md') return [{ name: `${base}.md`, blob: textBlob(await htmlToMd(html), 'md') }];
  if (target === 'txt') {
    const t = item.family === 'txt' ? await item.file.text() : htmlToText(html);
    return [{ name: `${base}.txt`, blob: textBlob(t, 'txt') }];
  }
  if (target === 'pdf') return [{ name: `${base}.pdf`, blob: await htmlToPdf(html) }];
  throw new Error('Format de sortie inconnu');
}

// ───────────────────────── Données ─────────────────────────
function detectDelimiter(text) {
  const first = text.split(/\r?\n/).slice(0, 5).join('\n');
  const counts = [',', ';', '\t', '|'].map((d) => [d, first.split(d).length]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 1 ? counts[0][0] : ',';
}

function parseDelimited(text, delim) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"' && field === '') q = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v !== ''));
}

function aoaToRows(aoa) {
  if (!aoa.length) return [];
  const seen = {};
  const head = aoa[0].map((h, i) => {
    let k = String(h ?? '').trim() || `colonne ${i + 1}`;
    if (seen[k]) k = `${k} ${++seen[k]}`; else seen[k] = 1;
    return k;
  });
  return aoa.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

function xmlToObj(el) {
  const kids = [...el.children];
  const attrs = [...el.attributes];
  if (!kids.length && !attrs.length) return el.textContent.trim();
  const o = {};
  for (const a of attrs) o[`@${a.name}`] = a.value;
  for (const k of kids) {
    const v = xmlToObj(k);
    if (k.tagName in o) { if (!Array.isArray(o[k.tagName])) o[k.tagName] = [o[k.tagName]]; o[k.tagName].push(v); }
    else o[k.tagName] = v;
  }
  if (!kids.length && el.textContent.trim()) o['#texte'] = el.textContent.trim();
  return o;
}

function xmlTag(k) {
  let t = String(k).replace(/[^A-Za-z0-9_.-]/g, '_');
  if (!/^[A-Za-z_]/.test(t)) t = `_${t}`;
  return t;
}
function toXml(v, tag, pad = '') {
  if (Array.isArray(v)) return v.map((x) => toXml(x, tag, pad)).join('\n');
  if (v && typeof v === 'object') {
    const attrs = Object.entries(v).filter(([k]) => k.startsWith('@')).map(([k, x]) => ` ${xmlTag(k.slice(1))}="${esc(x)}"`).join('');
    const kids = Object.entries(v).filter(([k]) => !k.startsWith('@'));
    if (!kids.length) return `${pad}<${tag}${attrs}/>`;
    return `${pad}<${tag}${attrs}>\n${kids.map(([k, x]) => toXml(x, xmlTag(k), pad + '  ')).join('\n')}\n${pad}</${tag}>`;
  }
  return `${pad}<${tag}>${esc(v ?? '')}</${tag}>`;
}

function flatten(o, pre = '', out = {}) {
  for (const [k, v] of Object.entries(o ?? {})) {
    const key = pre ? `${pre}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = Array.isArray(v) ? (v.every((x) => typeof x !== 'object') ? v.join(', ') : JSON.stringify(v)) : v;
  }
  return out;
}

function rowsFromValue(v) {
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? flatten(x) : { valeur: x }));
  if (v && typeof v === 'object') {
    const arr = Object.values(v).find((x) => Array.isArray(x) && x.some((y) => y && typeof y === 'object'));
    if (arr) return rowsFromValue(arr);
    const inner = Object.values(v);
    if (inner.length === 1 && inner[0] && typeof inner[0] === 'object') return rowsFromValue(inner[0]);
    return [flatten(v)];
  }
  return [{ valeur: v }];
}

async function readData(item) {
  const ext = normExt(item.ext);
  if (['xlsx', 'xls', 'ods'].includes(ext)) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await item.file.arrayBuffer(), { type: 'array', cellDates: true });
    const sheets = Object.fromEntries(wb.SheetNames.map((n) => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '', raw: false })]));
    const rows = sheets[wb.SheetNames[0]];
    return { rows, value: wb.SheetNames.length > 1 ? sheets : rows, sheets };
  }
  const text = (await item.file.text()).replace(/^﻿/, '');
  if (ext === 'csv' || ext === 'tsv') {
    const rows = aoaToRows(parseDelimited(text, ext === 'tsv' ? '\t' : detectDelimiter(text)));
    return { rows, value: rows };
  }
  if (ext === 'json') {
    let value;
    try { value = JSON.parse(text); } catch (e) {
      // JSON Lines
      try { value = text.trim().split(/\n+/).map((l) => JSON.parse(l)); } catch { throw new Error(`JSON invalide : ${e.message}`); }
    }
    return { rows: rowsFromValue(value), value };
  }
  if (ext === 'yaml') {
    const { default: yaml } = await import('js-yaml');
    const value = yaml.load(text);
    return { rows: rowsFromValue(value), value };
  }
  if (ext === 'xml') {
    const d = new DOMParser().parseFromString(text, 'application/xml');
    if (d.querySelector('parsererror')) throw new Error('XML invalide : vérifiez les balises.');
    const value = { [d.documentElement.tagName]: xmlToObj(d.documentElement) };
    return { rows: rowsFromValue(value), value };
  }
  throw new Error('Format de données non reconnu');
}

function writeDelimited(rows, d) {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v) => {
    const s = v instanceof Date ? v.toISOString() : String(v ?? '');
    return /["\n\r]/.test(s) || s.includes(d) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map(cell).join(d), ...rows.map((r) => cols.map((c) => cell(r[c])).join(d))].join('\r\n');
}

async function convertData(item, target, o) {
  const base = baseOf(item.file.name);
  const { rows, value, sheets } = await readData(item);
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const one = (ext, s) => [{ name: `${base}.${ext}`, blob: textBlob(s, ext) }];
  switch (target) {
    case 'csv': return [{ name: `${base}.csv`, blob: textBlob('﻿' + writeDelimited(rows, o.csvDelim || ','), 'csv') }];
    case 'tsv': return one('tsv', writeDelimited(rows, '\t'));
    case 'json': return one('json', JSON.stringify(value, null, 2));
    case 'yaml': { const { default: yaml } = await import('js-yaml'); return one('yaml', yaml.dump(value, { lineWidth: 120 })); }
    case 'xml': {
      // Une seule racine possible en XML : on garde la clé d'origine seulement si elle porte un objet.
      const keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [];
      const root = keys.length === 1 && value[keys[0]] && typeof value[keys[0]] === 'object' && !Array.isArray(value[keys[0]]) ? keys[0] : null;
      const body = root ? toXml(value[root], xmlTag(root)) : `<donnees>\n${toXml(Array.isArray(value) ? value : [value], 'element', '  ')}\n</donnees>`;
      return one('xml', `<?xml version="1.0" encoding="UTF-8"?>\n${body}`);
    }
    case 'xlsx':
    case 'ods': {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const src = sheets || { Feuille1: rows };
      for (const [n, r] of Object.entries(src)) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r), n.slice(0, 31));
      const buf = XLSX.write(wb, { bookType: target, type: 'array' });
      return [{ name: `${base}.${target}`, blob: new Blob([buf], { type: MIME[target] }) }];
    }
    case 'html': {
      const t = `<table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      return one('html', htmlDoc(base, t));
    }
    case 'md': {
      const c = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      return one('md', [`| ${cols.map(c).join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${cols.map((k) => c(r[k])).join(' | ')} |`)].join('\n'));
    }
    case 'sql': {
      const table = xmlTag(base).toLowerCase();
      const q = (v) => (v === '' || v == null ? 'NULL' : /^-?\d+(\.\d+)?$/.test(String(v)) ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
      const ddl = `CREATE TABLE ${table} (\n${cols.map((c) => `  "${c.replace(/"/g, '')}" TEXT`).join(',\n')}\n);`;
      const ins = rows.map((r) => `INSERT INTO ${table} (${cols.map((c) => `"${c.replace(/"/g, '')}"`).join(', ')}) VALUES (${cols.map((c) => q(r[c])).join(', ')});`);
      return one('sql', [ddl, '', ...ins].join('\n'));
    }
    default: throw new Error('Format de sortie inconnu');
  }
}

// ───────────────────────── Audio / vidéo (ffmpeg) ─────────────────────────
const AUDIO_CODEC = {
  mp3: ['-c:a', 'libmp3lame'], wav: ['-c:a', 'pcm_s16le'], ogg: ['-c:a', 'libvorbis'], flac: ['-c:a', 'flac'],
  m4a: ['-c:a', 'aac'], opus: ['-c:a', 'libopus'],
};

function trimArgs(o) {
  const a = [];
  if (Number(o.start) > 0) a.push('-ss', String(Number(o.start)));
  if (Number(o.duration) > 0) a.push('-t', String(Number(o.duration)));
  return a;
}

async function convertAV(item, target, o, ctx) {
  const base = baseOf(item.file.name);
  const run = (args) => runFFmpeg(item.file, item.ext, target, args, ctx.onProgress, ctx.onStatus);
  let blob;
  if (AUDIO_CODEC[target]) {
    blob = await run((i, out) => {
      const a = [...trimArgs(o), '-i', i, '-vn', ...AUDIO_CODEC[target]];
      if (o.mono) a.push('-ac', '1');
      if (o.rate) a.push('-ar', String(o.rate));
      if (!['wav', 'flac'].includes(target)) a.push('-b:a', `${o.bitrate || 192}k`);
      if (o.normalize) a.push('-af', 'loudnorm');
      return [...a, out];
    });
  } else if (target === 'png' || target === 'jpg') {
    blob = await run((i, out) => ['-ss', String(Number(o.frameAt) || 1), '-i', i, '-frames:v', '1', ...(target === 'jpg' ? ['-q:v', '2'] : []), out]);
  } else if (target === 'gif') {
    const w = Number(o.vWidth) || 480;
    const fps = Number(o.fps) || 12;
    blob = await run((i, out) => [...trimArgs(o), '-i', i, '-vf', `fps=${fps},scale=${w}:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse`, '-loop', '0', out]);
  } else {
    const crf = String(o.crf || 26);
    const scale = Number(o.vWidth) ? ['-vf', `scale='min(${Number(o.vWidth)},iw)':-2`] : [];
    const fps = Number(o.fps) ? ['-r', String(Number(o.fps))] : [];
    const audio = o.mute ? ['-an'] : null;
    const codecs = {
      mp4: ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', crf, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', ...(audio || ['-c:a', 'aac'])],
      mov: ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', crf, '-pix_fmt', 'yuv420p', ...(audio || ['-c:a', 'aac'])],
      mkv: ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', crf, ...(audio || ['-c:a', 'aac'])],
      webm: ['-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-crf', String(Math.min(63, Number(crf) + 4)), '-b:v', '2M', ...(audio || ['-c:a', 'libvorbis'])],
      avi: ['-c:v', 'mpeg4', '-q:v', '4', ...(audio || ['-c:a', 'libmp3lame'])],
    }[target];
    if (!codecs) throw new Error('Format de sortie inconnu');
    blob = await run((i, out) => [...trimArgs(o), '-i', i, ...scale, ...fps, ...codecs, out]);
  }
  return [{ name: `${base}.${target}`, blob }];
}

// ───────────────────────── Divers ─────────────────────────
async function convertOther(item, target) {
  const base = baseOf(item.file.name);
  if (target === 'base64') return [{ name: `${item.file.name}.base64.txt`, blob: textBlob(await blobToDataURL(item.file), 'txt') }];
  if (target === 'zip') {
    const { default: JSZip } = await import('jszip');
    const z = new JSZip();
    z.file(item.file.name, item.file);
    return [{ name: `${base}.zip`, blob: await z.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } }) }];
  }
  if (target === 'extract') {
    const { default: JSZip } = await import('jszip');
    const z = await JSZip.loadAsync(item.file);
    const out = [];
    for (const f of Object.values(z.files)) {
      if (f.dir || f.name.startsWith('__MACOSX/') || f.name.endsWith('.DS_Store')) continue;
      out.push({ name: f.name.split('/').pop(), path: f.name, blob: await f.async('blob') });
    }
    if (!out.length) throw new Error("L'archive est vide.");
    return out;
  }
  throw new Error('Format de sortie inconnu');
}

export async function zipResults(files, name) {
  const { default: JSZip } = await import('jszip');
  const z = new JSZip();
  const used = new Set();
  for (const f of files) {
    let n = f.path || f.name;
    let k = 1;
    while (used.has(n)) n = (f.path || f.name).replace(/(\.[^.]+)?$/, ` (${++k})$1`);
    used.add(n);
    z.file(n, f.blob);
  }
  return { name, blob: await z.generateAsync({ type: 'blob' }) };
}

// ───────────────────────── Point d'entrée ─────────────────────────
export async function convert(item, target, o, ctx) {
  const fam = item.family;
  if (fam === 'image') {
    if (target === 'base64' && !o.scale && !o.maxW) return convertOther(item, 'base64');
    const src = await loadImageSource(item, ctx);
    const blob = await encodeImage(src, target, o, ctx);
    return [{ name: `${baseOf(item.file.name)}.${target}`, blob }];
  }
  if (fam === 'pdf') return convertPdf(item, target, o, ctx);
  if (['docx', 'md', 'html', 'txt'].includes(fam)) return convertDoc(item, target);
  if (fam === 'data') return convertData(item, target, o);
  if (fam === 'audio' || fam === 'video') return convertAV(item, target, o, ctx);
  return convertOther(item, target);
}

export async function mergePdfs(items, ctx) {
  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();
  for (let i = 0; i < items.length; i++) {
    const src = await PDFDocument.load(await items[i].file.arrayBuffer(), { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
    ctx.onProgress?.((i + 1) / items.length);
  }
  return new File([await out.save()], 'fusion.pdf', { type: MIME.pdf });
}

export async function imagesToPdf(items, o, ctx) {
  const { jsPDF } = await import('jspdf');
  let pdf;
  for (let i = 0; i < items.length; i++) {
    const src = await loadImageSource(items[i], ctx);
    const c = drawCanvas(src, o, { opaque: true });
    const w = c.width * 0.75, h = c.height * 0.75;
    const orient = w > h ? 'l' : 'p';
    if (!pdf) pdf = new jsPDF({ unit: 'pt', format: [w, h], orientation: orient, compress: true });
    else pdf.addPage([w, h], orient);
    pdf.addImage(c.toDataURL('image/jpeg', (o.quality || 90) / 100), 'JPEG', 0, 0, w, h);
    ctx.onProgress?.((i + 1) / items.length);
    await tick();
  }
  return new File([pdf.output('blob')], 'images.pdf', { type: MIME.pdf });
}
