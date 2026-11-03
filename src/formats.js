// Catalogue des formats : détection de la famille d'un fichier et destinations possibles.

export const FAMILIES = {
  image: { label: 'Image', code: 'IMG', targets: ['png', 'jpg', 'webp', 'avif', 'gif', 'bmp', 'ico', 'tiff', 'svg', 'pdf', 'base64'] },
  pdf: { label: 'PDF', code: 'PDF', targets: ['png', 'jpg', 'webp', 'txt', 'md', 'html', 'pdf-pages', 'pdf-light'] },
  docx: { label: 'Word', code: 'DOC', targets: ['pdf', 'html', 'md', 'txt'] },
  md: { label: 'Markdown', code: 'MD', targets: ['html', 'pdf', 'txt'] },
  html: { label: 'HTML', code: 'WEB', targets: ['md', 'pdf', 'txt'] },
  txt: { label: 'Texte', code: 'TXT', targets: ['pdf', 'html', 'md'] },
  data: { label: 'Données', code: 'DAT', targets: ['xlsx', 'csv', 'tsv', 'json', 'yaml', 'xml', 'ods', 'html', 'md', 'sql'] },
  audio: { label: 'Audio', code: 'AUD', targets: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'opus'] },
  video: { label: 'Vidéo', code: 'VID', targets: ['mp4', 'webm', 'mov', 'mkv', 'avi', 'gif', 'mp3', 'wav', 'm4a', 'png', 'jpg'] },
  zip: { label: 'Archive', code: 'ZIP', targets: ['extract'] },
  other: { label: 'Fichier', code: 'BIN', targets: ['zip', 'base64'] },
};

const EXT_FAMILY = {
  png: 'image', jpg: 'image', jpeg: 'image', jfif: 'image', webp: 'image', gif: 'image', bmp: 'image',
  svg: 'image', ico: 'image', avif: 'image', heic: 'image', heif: 'image', tif: 'image', tiff: 'image', tga: 'image',
  pdf: 'pdf',
  docx: 'docx',
  md: 'md', markdown: 'md',
  html: 'html', htm: 'html',
  txt: 'txt', log: 'txt', text: 'txt',
  csv: 'data', tsv: 'data', json: 'data', xlsx: 'data', xls: 'data', ods: 'data', xml: 'data', yaml: 'data', yml: 'data',
  mp3: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio', m4a: 'audio', aac: 'audio', flac: 'audio', opus: 'audio', weba: 'audio', wma: 'audio', aiff: 'audio', aif: 'audio',
  mp4: 'video', webm: 'video', mov: 'video', mkv: 'video', m4v: 'video', avi: 'video', ogv: 'video', wmv: 'video', flv: 'video', '3gp': 'video', mpeg: 'video', mpg: 'video',
  zip: 'zip',
};

// Formats d'image que le navigateur ne sait pas lire seul : on passe par ffmpeg.
export const FFMPEG_IMAGE_INPUT = new Set(['tif', 'tiff', 'tga']);

export const TARGET_LABEL = {
  'pdf-pages': 'PDF / page',
  'pdf-light': 'PDF allégé',
  base64: 'BASE64',
  extract: 'EXTRAIRE',
};

export function targetLabel(t) {
  return TARGET_LABEL[t] || t.toUpperCase();
}

export function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

export function baseOf(name) {
  return (name || 'fichier').replace(/\.[a-z0-9]+$/i, '');
}

export function familyOf(file) {
  const ext = extOf(file.name);
  if (EXT_FAMILY[ext]) return EXT_FAMILY[ext];
  const t = file.type || '';
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('text/')) return 'txt';
  return 'other';
}

export function normExt(ext) {
  return { jpeg: 'jpg', jfif: 'jpg', tif: 'tiff', yml: 'yaml', htm: 'html', markdown: 'md', heif: 'heic' }[ext] || ext;
}

export function targetsFor(item) {
  let list = [...FAMILIES[item.family].targets];
  if (item.family === 'image' && !supportsAvif()) list = list.filter((t) => t !== 'avif');
  return list;
}

export function defaultTarget(item) {
  const src = normExt(item.ext);
  const prefs = { png: 'webp', jpg: 'webp', webp: 'png', heic: 'jpg', svg: 'png', gif: 'mp4', csv: 'xlsx', xlsx: 'csv', xls: 'xlsx', json: 'csv', docx: 'pdf', md: 'html', html: 'md', txt: 'pdf', pdf: 'png', mov: 'mp4', mkv: 'mp4', avi: 'mp4', mp4: 'webm', webm: 'mp4', wav: 'mp3', flac: 'mp3', mp3: 'wav', m4a: 'mp3', zip: 'extract' };
  const list = targetsFor(item);
  const pref = prefs[src];
  if (pref && list.includes(pref)) return pref;
  return list.find((t) => t !== src) || list[0];
}

let avifCache;
export function supportsAvif() {
  if (avifCache === undefined) {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      avifCache = c.toDataURL('image/avif').startsWith('data:image/avif');
    } catch {
      avifCache = false;
    }
  }
  return avifCache;
}

export function humanSize(n) {
  if (n < 1024) return `${n} o`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} Ko`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} Mo`;
  return `${(n / 1024 ** 3).toFixed(2)} Go`;
}
