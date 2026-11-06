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

  // ---- #7 undo / redo
  await p.reload(); await p.waitForSelector('#main .block[data-id=player]', { state: 'attached' }); await p.waitForTimeout(300);
  ok(await p.isDisabled('#undo') && await p.isDisabled('#redo'), 'undo / redo disabled with no history');
  await p.click('#pageSel [data-view=watch]');
  const before = await ids('#side');
  await p.hover('#side [data-id=comments]'); await p.click('#side [data-id=comments] .x');
  ok(!(await ids('#side')).includes('comments') && !(await p.isDisabled('#undo')), 'an edit enables Undo');
  await p.click('#undo'); await p.waitForTimeout(400);
  ok(JSON.stringify(await ids('#side')) === JSON.stringify(before), 'Undo puts the block back');
  s = await saved();
  ok(s.layout.sidebar.includes('comments'), 'the undone state is saved');
  ok(!(await p.isDisabled('#redo')), 'Redo enabled after Undo');
  await p.click('#redo'); await p.waitForTimeout(300);
  ok(!(await ids('#side')).includes('comments'), 'Redo hides it again');
  await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
  ok((await ids('#side')).includes('comments'), 'Ctrl+Z undoes');
  await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(300);
  ok(!(await ids('#side')).includes('comments'), 'Ctrl+Shift+Z redoes');
  await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
  // a slider drag (many input events) is one step
  const w0 = await p.inputValue('#sideW');
  await p.evaluate(() => { const r = document.querySelector('#sideW'); for (const v of [410, 420, 430, 440, 450, 460]) { r.value = v; r.dispatchEvent(new Event('input', { bubbles: true })); } });
  ok(await p.inputValue('#sideW') === '460', 'slider dragged to 460');
  await p.click('#undo'); await p.waitForTimeout(300);
  ok(await p.inputValue('#sideW') === w0, `one Undo reverts the whole drag (${w0})`);
  // undo works across views: hide a home section, switch view, undo
  await p.click('#pageSel [data-view=home]');
  await p.hover('#homeMain [data-id=subs]'); await p.click('#homeMain [data-id=subs] .x');
  await p.click('#pageSel [data-view=pages]');
  await p.click('#pagesGrid button[data-page=search][data-sec=shorts]');
  await p.click('#undo'); await p.click('#undo'); await p.waitForTimeout(400);
  s = await saved();
  ok(s.homeLayout.shown.includes('subs') && !s.pageLayouts.search.hide.includes('shorts'), 'undo steps through home and pages edits too');
  // Ctrl+Z inside a text field is the field's own undo
  await p.click('#pageSel [data-view=watch]');
  await p.click('#profPanel summary');
  await p.fill('#profChannels', 'abc');
  const u0 = await p.isDisabled('#undo');
  await p.focus('#profChannels'); await p.keyboard.press('Control+z'); await p.waitForTimeout(200);
  ok((await ids('#main')).includes('player') && (await p.isDisabled('#undo')) === u0, 'Ctrl+Z in a text field is left to the field');

  // narrow viewport
  await p.setViewportSize({ width: 390, height: 844 });
  await p.click('#pageSel [data-view=home]');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll at phone width');
  await p.screenshot({ path: path.join(SHOTS, 'studio-home-phone.png'), fullPage: true });
  await b.close(); srv.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
