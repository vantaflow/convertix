// Captures d'écran du README : node scripts/captures.mjs <url> docs/captures <dossier-de-test>
// Le dossier de test doit contenir rapport.pdf, doc.docx et melodie.wav.
import { chromium } from 'playwright-core';
const [url, out, fx] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function page(vp) {
  const c = await b.newContext({ viewport: vp, deviceScaleFactor: 2, reducedMotion: 'no-preference' });
  const p = await c.newPage(); await p.goto(url, { waitUntil: 'networkidle' }); await p.addStyleTag({ content: '#toasts{display:none!important}' }); await wait(2500); return p;
}
// 1. accueil
let p = await page({ width: 1440, height: 900 });
const settle = async () => { await p.waitForFunction(() => { const t = document.querySelector('#hero-from').textContent + document.querySelector('#hero-to').textContent; const now = Date.now(); if (window.__t !== t) { window.__t = t; window.__ts = now; } return now - window.__ts > 700; }, null, { polling: 100, timeout: 20000 }); };
await settle();
await p.screenshot({ path: `${out}/accueil.jpg`, type: "jpeg", quality: 82 });
// 2. tableau : exemples + fichiers de test, puis conversion
await p.click('#load-samples'); await wait(800);
await p.setInputFiles('#file-input', [`${fx}/rapport.pdf`, `${fx}/doc.docx`, `${fx}/melodie.wav`]); await wait(1500);
await p.click('#convert-all');
await p.waitForFunction(() => !document.querySelector('#rows .row.is-run') && document.querySelectorAll('#rows .row').length > 0 && [...document.querySelectorAll('#rows .row')].every(r => !/EMBARQ|PRÊT/.test(r.textContent)), null, { timeout: 180000 }).catch(() => {});
await wait(2500);
await p.evaluate(() => window.scrollTo(0, document.querySelector('#tableau').getBoundingClientRect().top + scrollY - 40)); await wait(4000);
await p.screenshot({ path: `${out}/tableau.jpg`, type: "jpeg", quality: 82 });
// 3. lecteurs
const viewByName = async (re) => {
  const btn = p.locator('#rows .file-name', { hasText: re }).first(); await btn.click(); await wait(2500);
};
await viewByName(/\.csv$/); await p.screenshot({ path: `${out}/lecteur-donnees.jpg`, type: "jpeg", quality: 82 }); await p.keyboard.press('Escape'); await wait(500);
await viewByName(/melodie\.wav/); await p.screenshot({ path: `${out}/lecteur-audio.jpg`, type: "jpeg", quality: 82 }); await p.keyboard.press('Escape'); await wait(500);
await viewByName(/affiche-exemple\.png/); await p.screenshot({ path: `${out}/lecteur-image.jpg`, type: "jpeg", quality: 82 }); await p.keyboard.press('Escape'); await wait(500);
// 4. réglages
await p.click('#open-settings'); await wait(900); await p.screenshot({ path: `${out}/reglages.jpg`, type: "jpeg", quality: 82 }); await p.click('#close-settings'); await wait(400);
// 5. destinations
await p.evaluate(() => window.scrollTo(0, document.querySelector('#destinations').getBoundingClientRect().top + scrollY - 40)); await wait(800);
await p.screenshot({ path: `${out}/destinations.jpg`, type: "jpeg", quality: 82 });
// 6. mobile
p = await page({ width: 390, height: 844 });
await settle();
await p.screenshot({ path: `${out}/mobile-accueil.jpg`, type: "jpeg", quality: 82 });
await p.click('#load-samples'); await wait(1500);
await p.evaluate(() => window.scrollTo(0, document.querySelector('#tableau').getBoundingClientRect().top + scrollY - 20)); await wait(4000);
await p.screenshot({ path: `${out}/mobile-tableau.jpg`, type: "jpeg", quality: 82 });
await b.close(); console.log('ok');
