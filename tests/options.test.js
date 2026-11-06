const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { ROOT, SHOTS } = require('./lib');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split(/[?#]/)[0])); fs.readFile(f, (e, d) => { r.writeHead(e ? 404 : 200, { 'content-type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'text/plain' }); r.end(d); }); }).listen(0);
(async () => {
  const port = srv.address().port, b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)/, (r) => r.fulfill({ body: '' }));
  await ctx.addInitScript(() => {
    const store = JSON.parse(sessionStorage.getItem('store') || '{}');
    window.__sets = [];
    window.chrome = { storage: { sync: {
      get: (d, cb) => setTimeout(() => cb({ ...d, ...structuredClone(store) })),
      set: (o, cb) => { Object.assign(store, o); window.__sets.push(structuredClone(o)); sessionStorage.setItem('store', JSON.stringify(store)); cb?.(); } } } };
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { console.log('PAGEERROR', e.message); fails++; });
  await p.goto(`http://localhost:${port}/options.html`);
  await p.waitForSelector('#main .block[data-id=player]');
  const saved = async () => { await p.waitForTimeout(500); return p.evaluate(() => JSON.parse(sessionStorage.getItem('store') || '{}')); };
  const ids = (sel) => p.$$eval(sel + ' > .block', (bs) => bs.map((x) => x.dataset.id));

  ok(await p.isVisible('#page') && !(await p.isVisible('#homeMain')), 'watch view by default');
  await p.screenshot({ path: path.join(SHOTS, 'studio-watch.png') });
  await p.click('#pageSel [data-view=home]');
  ok(!(await p.isVisible('#page')) && await p.isVisible('#homeMain') && !(await p.isVisible('#presets')), 'home view shows the home mock, hides watch-only controls');
  ok(JSON.stringify(await ids('#homeMain')) === '["hero","continue","subs","recommended"]', 'home default order');
  await p.screenshot({ path: path.join(SHOTS, 'studio-home.png'), fullPage: true });

  // hide the carousel and Continue watching with ✕ (the issue's ask)
  for (const id of ['hero', 'continue']) { await p.hover(`#homeMain [data-id=${id}]`); await p.click(`#homeMain [data-id=${id}] .x`); }
  let s = await saved();
  ok(JSON.stringify(s.homeLayout) === JSON.stringify({ shown: ['subs', 'recommended'], hidden: ['hero', 'continue'] }), 'hide saves homeLayout: ' + JSON.stringify(s.homeLayout));
  ok(JSON.stringify(await ids('#homeHidden')) === '["hero","continue"]', 'hidden sections show in the home tray');
  await p.screenshot({ path: path.join(SHOTS, 'studio-home-hidden.png'), fullPage: true });

  // click a chip in the tray to restore: goes above Recommended
  await p.click('#homeHidden [data-id=hero]');
  ok(JSON.stringify(await ids('#homeMain')) === '["subs","hero","recommended"]', 'restored section lands above Recommended');

  // drag Recommended to the top: it snaps back to last
  await p.dragAndDrop('#homeMain [data-id=recommended]', '#homeMain [data-id=subs]', { targetPosition: { x: 20, y: 5 } });
  await p.waitForTimeout(400);
  ok((await ids('#homeMain')).at(-1) === 'recommended', 'Recommended always stays last: ' + (await ids('#homeMain')).join(','));
  // drag subs below hero
  await p.dragAndDrop('#homeMain [data-id=subs]', '#homeMain [data-id=hero]', { targetPosition: { x: 20, y: 160 } });
  await p.waitForTimeout(400);
  ok(JSON.stringify(await ids('#homeMain')) === '["hero","subs","recommended"]', 'drag reorders: ' + (await ids('#homeMain')).join(','));
  s = await saved();
  ok(JSON.stringify(s.homeLayout.shown) === '["hero","subs","recommended"]', 'drag order saved');

  // persisted across reload and view remembered via #home
  await p.reload(); await p.waitForSelector('#homeMain .block');
  ok(await p.isVisible('#homeMain') && JSON.stringify(await ids('#homeMain')) === '["hero","subs","recommended"]' && JSON.stringify(await ids('#homeHidden')) === '["continue"]', 'reload keeps home layout + home view');

  // watch layout untouched by home edits
  ok(!s.layout || s.layout.main.includes('player'), 'watch layout intact');
  // reset in home view resets home only
  await p.click('#reset');
  s = await saved();
  ok(JSON.stringify(s.homeLayout) === JSON.stringify({ shown: ['hero', 'continue', 'subs', 'recommended'], hidden: [] }), 'Reset (home view) restores default home');

  // watch view: player ✕ still ignored, other ✕ still works
  await p.click('#pageSel [data-view=watch]');
  await p.hover('#side [data-id=merch]'); await p.click('#side [data-id=merch] .x');
  s = await saved();
  ok(s.layout.hidden.includes('merch') && JSON.stringify(s.homeLayout.hidden) === '[]', 'watch ✕ still hides into the watch tray only');

  // narrow viewport
  await p.setViewportSize({ width: 390, height: 844 });
  await p.click('#pageSel [data-view=home]');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll at phone width');
  await p.screenshot({ path: path.join(SHOTS, 'studio-home-phone.png'), fullPage: true });
  await b.close(); srv.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
