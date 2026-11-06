// Shared by the test suites: where the extension is, where screenshots go, launching Chromium with it loaded.
const path = require('path'), os = require('os'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'eyt-shots-'));
fs.mkdirSync(SHOTS, { recursive: true });
const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

// Chromium with the unpacked extension; returns the context and the extension's id (for chrome-extension:// pages)
async function launchExt(opts = {}) {
  const { chromium } = require('playwright');
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'eyt-')), {
    headless: true, channel: 'chromium', viewport: { width: 1280, height: 900 }, acceptDownloads: true, ...opts,
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`] });
  const x = await ctx.newPage();
  await x.goto('chrome://extensions');
  const id = await x.evaluate(() => new Promise((r) => chrome.developerPrivate.getExtensionsInfo((l) => r(l.find((e) => e.name === 'EliteYT').id))));
  await x.close();
  return { ctx, id };
}
// PASS/FAIL lines, page errors count as failures, exit code for the runner
function suite() {
  let fails = 0;
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
  const watch = (p) => { p.on('pageerror', (e) => { console.log('PAGEERROR', e.message); fails++; }); return p; };
  const done = async (...closeables) => {
    for (const c of closeables) await c?.close?.();
    console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
    process.exit(fails ? 1 : 0);
  };
  return { ok, watch, done };
}
module.exports = { ROOT, SHOTS, fixture, launchExt, suite };
