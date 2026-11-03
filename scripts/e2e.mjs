// Test de bout en bout : chaque fichier de test est converti vers chacune de ses destinations,
// puis chaque résultat est ouvert dans le lecteur. Usage : node scripts/e2e.mjs <url> <dossier-fixtures>
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const [url, dir] = process.argv.slice(2);
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('dialog', (d) => { errors.push(`dialog ouvert : ${d.message()}`); d.dismiss(); });
await page.goto(url);

const files = readdirSync(dir).filter((f) => !f.startsWith('.') && !f.endsWith('.output') && (!only || only.some((o) => f.endsWith(o))));
const report = [];
for (const f of files) {
  await page.evaluate(() => document.querySelector('#clear-all').click());
  await page.setInputFiles('#file-input', join(dir, f));
  await page.waitForSelector('#rows .row');
  const targets = await page.$$eval('#rows .row .to-select option', (o) => o.map((x) => x.value));
  // Une ligne par destination.
  for (let i = 1; i < targets.length; i++) await page.setInputFiles('#file-input', join(dir, f));
  await page.waitForFunction((n) => document.querySelectorAll('#rows .row').length === n, targets.length);
  for (let i = 0; i < targets.length; i++) await page.locator('#rows .row .to-select').nth(i).selectOption(targets[i]);
  await page.click('#convert-all');
  await page.waitForFunction(() => ![...document.querySelectorAll('#rows .row')].some((r) => r.classList.contains('status-run') || r.classList.contains('status-idle')), null, { timeout: 300000 });
  const rows = await page.$$eval('#rows .row', (rs) => rs.map((r) => ({
    target: r.querySelector('.to-select').value,
    ok: r.classList.contains('status-done'),
    err: r.querySelector('.err-msg')?.textContent || '',
    out: [...r.querySelectorAll('.result-name')].map((x) => x.textContent).slice(0, 2).join(', '),
    size: r.querySelector('.result-size')?.textContent || '',
  })));
  // Ouvre le premier résultat de chaque ligne dans le lecteur.
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i].ok) continue;
    await page.locator('#rows .row').nth(i).locator('[data-act="view-result"]').first().click();
    await page.waitForFunction(() => { const s = document.querySelector('.viewer-stage'); return s && !s.querySelector('.viewer-loading'); }, null, { timeout: 30000 }).catch(() => {});
    rows[i].viewer = await page.evaluate(() => {
      const s = document.querySelector('.viewer-stage');
      if (s.querySelector('.viewer-error')) return `ERREUR ${s.textContent.slice(0, 120)}`;
      return s.firstElementChild?.className || s.firstElementChild?.tagName || '?';
    });
    await page.keyboard.press('Escape');
  }
  // Et la source elle-même.
  await page.locator('#rows .row').first().locator('.file-name').click();
  await page.waitForFunction(() => { const s = document.querySelector('.viewer-stage'); return s && !s.querySelector('.viewer-loading'); }, null, { timeout: 30000 }).catch(() => {});
  const srcView = await page.evaluate(() => { const s = document.querySelector('.viewer-stage'); return s.querySelector('.viewer-error') ? `ERREUR ${s.textContent.slice(0, 120)}` : s.firstElementChild?.className || s.firstElementChild?.tagName; });
  await page.keyboard.press('Escape');
  report.push({ f, srcView, rows });
  console.log(`\n■ ${f}  (lecteur source : ${srcView})`);
  for (const r of rows) console.log(`  ${r.ok ? '✓' : '✗'} → ${r.target.padEnd(10)} ${r.ok ? `${r.out} ${r.size} [lecteur: ${r.viewer}]` : r.err}`);
}
console.log('\nErreurs de page :', errors.length ? errors : 'aucune');
const ko = report.flatMap((r) => r.rows.filter((x) => !x.ok || String(x.viewer).startsWith('ERREUR')).map((x) => `${r.f}→${x.target}`));
console.log('Échecs :', ko.length ? ko.join(' | ') : 'aucun');
await browser.close();
