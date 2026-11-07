// The Layout Studio on the real extension page (real chrome.storage): toolbar button opens it, every view's drag /
// hide / restore, pieces inside blocks, keyboard moves, top bar, page zones, undo / redo, the movable panels.
const path = require('path');
const { SHOTS, launchExt, suite } = require('./lib');
const { ok, watch, done } = suite();
(async () => {
  const { ctx, id } = await launchExt({ viewport: { width: 1440, height: 1000 } });
  await ctx.route(/fonts\.(googleapis|gstatic)/, (r) => r.fulfill({ body: '' }));

  // ---- the toolbar button opens the studio (same path as a click), and the right-click menu
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  ok(/src\/background\.js$/.test(sw.url()), 'background runs as a service worker');
  await sw.evaluate(() => eytBackground.openStudio());
  let p;
  for (let i = 0; i < 50 && !p; i++) { p = ctx.pages().find((x) => x.url().includes('/options.html')); if (!p) await new Promise((r) => setTimeout(r, 100)); }
  watch(p);
  await p.waitForSelector('#profSel option', { state: 'attached' });
  ok(p.url() === `chrome-extension://${id}/options.html`, 'clicking the toolbar button opens the Layout Studio');
  const menu = await sw.evaluate(async () => { await eytBackground.buildMenu(); return eytBackground.menu.map((m) => m.id); });
  ok(JSON.stringify(menu) === '["studio"]', 'right-click menu: "Open Layout Studio" (no profile list with one profile)');

  const all = () => p.evaluate(() => new Promise((r) => chrome.storage.sync.get(null, r)));
  const settle = (ms = 600) => p.waitForTimeout(ms);
  const kids = (sel) => p.$$eval(sel + ' > [data-id]', (b) => b.map((x) => x.dataset.id));
  const view = (v) => p.click(`#pageSel [data-view=${v}]`);

  // ---- views
  ok(await p.isVisible('#main') && !(await p.isVisible('#homeMain')) && await p.getAttribute('#pageSel [data-view=watch]', 'aria-pressed') === 'true', 'opens on the Watch view');
  for (const [v, sel] of [['stack', '#stackMain'], ['home', '#homeMain'], ['topbar', '#tbCenter'], ['pages', '#pagesGrid'], ['watch', '#main']]) {
    await view(v);
    ok(await p.isVisible(sel) && (v === 'watch' || !(await p.isVisible('#main'))), `${v} view shows its page`);
  }
  await p.screenshot({ path: path.join(SHOTS, 'studio-watch.png') });

  // ---- watch: blocks
  ok(JSON.stringify(await kids('#main')) === '["player","channel","actions","recommendations"]' && JSON.stringify(await kids('#hidden')) === '["chat"]', 'default watch layout');
  await p.hover('#side [data-id=merch]'); await p.click('#side [data-id=merch] .x'); await settle();
  let s = await all();
  ok(s.layout.hidden.includes('merch') && (await kids('#hidden')).includes('merch'), 'Hide moves a block to the Hidden panel and saves');
  ok(/Saved/.test(await p.textContent('#toast')) && await p.$eval('#tally', (t) => t.classList.contains('rec')), 'the REC light shows the save');
  await p.click('#hidden [data-id=merch]'); await settle();
  ok((await kids('#side')).includes('merch'), 'clicking a hidden block brings it back');
  ok(!(await p.$('#main [data-id=player] .x')), 'the player has no Hide button');
  // player into the sidebar (allowed), never into Hidden
  await p.dragAndDrop('#main [data-id=player] .block-bar', '#side [data-id=title] .block-bar'); await settle();
  s = await all();
  ok(s.layout.sidebar.includes('player') && !s.layout.main.includes('player'), 'the player can be dragged into the sidebar: ' + s.layout.sidebar.join(','));
  await p.dragAndDrop('#side [data-id=player] .block-bar', '#hidden', { targetPosition: { x: 20, y: 20 } }); await settle();
  s = await all();
  ok(!s.layout.hidden.includes('player'), 'the player cannot be hidden');
  await p.click('#undo'); await settle(300);
  ok((await all()).layout.main.includes('player'), 'Undo puts the player back in the main column');

  // ---- watch: pieces inside blocks
  const order = (g) => p.$$eval(`#${g === 'related' ? 'main [data-id=recommendations]' : 'main [data-id=' + g + ']'} .pieces > .piece`, (x) => x.map((e) => e.dataset.id));
  ok(JSON.stringify(await order('actions')) === '["likes","share","save","download","clip","thanks"]', 'Actions shows its buttons as pieces');
  await p.dragAndDrop('[data-id=actions] .piece[data-id=download]', '[data-id=actions] .piece[data-id=likes]', { targetPosition: { x: 4, y: 10 } }); await settle();
  s = await all();
  ok(s.pieces.actions.order[0] === 'download', 'drag a button within its row: ' + s.pieces.actions.order.join(','));
  await p.hover('[data-id=actions] .piece[data-id=thanks]'); await p.click('[data-id=actions] .piece[data-id=thanks] .px'); await settle();
  s = await all();
  ok(s.pieces.actions.hidden.includes('thanks') && (await kids('#hid-actions')).includes('thanks'), 'hide one button (Thanks)');
  await p.hover('[data-id=channel] .piece[data-id=join]'); await p.click('[data-id=channel] .piece[data-id=join] .px');
  await p.hover('[data-id=recommendations] .piece[data-id=chips]'); await p.click('[data-id=recommendations] .piece[data-id=chips] .px'); await settle();
  s = await all();
  ok(s.pieces.channel.hidden.includes('join') && s.pieces.related.hidden.includes('chips'), 'hide Join and the filter chips');
  ok(!(await p.$('[data-id=recommendations] .piece[data-id=videos] .px')), 'the videos grid itself cannot be hidden');
  // keyboard: Alt+Arrow moves, Delete hides, Enter restores
  await p.focus('[data-id=channel] .piece[data-id=subscribe]');
  await p.keyboard.press('Alt+ArrowLeft'); await p.keyboard.press('Alt+ArrowLeft'); await settle();
  s = await all();
  ok(JSON.stringify(s.pieces.channel.order) === '["subscribe","avatar","name"]', 'Alt+ArrowLeft moves a piece: ' + s.pieces.channel.order.join(','));
  ok(await p.evaluate(() => document.activeElement?.dataset.id === 'subscribe'), 'focus stays on the moved piece');
  await p.keyboard.press('Delete'); await settle();
  ok((await all()).pieces.channel.hidden.includes('subscribe'), 'Delete hides the focused piece');
  await p.focus('#hid-channel [data-id=subscribe]'); await p.keyboard.press('Enter'); await settle();
  ok((await all()).pieces.channel.order.includes('subscribe'), 'Enter on a hidden piece brings it back');
  await p.focus('#side [data-id=comments]'); await p.keyboard.press('Alt+Shift+ArrowLeft'); await settle();
  ok((await all()).layout.main.includes('comments'), 'Alt+Shift+Arrow moves a block to the other column');

  // ---- narrow view
  await view('stack');
  await p.hover('#stackMain [data-id=description]'); await p.click('#stackMain [data-id=description] .x');
  await p.click('#stackTheater'); await settle();
  s = await all();
  ok(s.stackLayout.hidden.includes('description') && s.stackLayout.theater === true, 'narrow view: hide + "also in theater mode" saved');

  // ---- top bar
  await view('topbar');
  ok(JSON.stringify(await kids('#tbLeft')) === '["menu","logo"]' && JSON.stringify(await kids('#tbRight')) === '["create","nav","notifications","avatar"]', 'top bar: default zones');
  await p.dragAndDrop('#tbRight [data-id=notifications]', '#tbLeft [data-id=menu]', { targetPosition: { x: 2, y: 10 } }); await settle();
  await p.hover('#tbRight [data-id=create]'); await p.click('#tbRight [data-id=create] .px'); await settle();
  s = await all();
  ok(s.topbarLayout.left.includes('notifications') && s.topbarLayout.hidden.includes('create'), `top bar: drag between zones, hide Create (${JSON.stringify(s.topbarLayout)})`);
  await p.screenshot({ path: path.join(SHOTS, 'studio-topbar.png') });

  // ---- pages
  await view('pages');
  ok((await p.$$('.pgcard')).length === 3 && await p.textContent('.pgcard[data-page=subs] output') === 'Auto', 'Pages: three page cards, columns Auto');
  await p.dragAndDrop('#pg-subs-inline [data-id=live]', '#pg-subs-top', { targetPosition: { x: 40, y: 20 } }); await settle();
  await p.dragAndDrop('#pg-search-inline [data-id=shorts]', '#pg-search-bottom', { targetPosition: { x: 40, y: 20 } }); await settle();
  await p.hover('#pg-channel-inline [data-id=trailer]'); await p.click('#pg-channel-inline [data-id=trailer] .x'); await settle();
  s = await all();
  ok(s.pageLayouts.subs.top.includes('live') && s.pageLayouts.search.bottom.includes('shorts') && s.pageLayouts.channel.hidden.includes('trailer'),
    'Pages: pin Live to the top, move search Shorts to the bottom, hide the trailer: ' + JSON.stringify(s.pageLayouts));
  await p.dragAndDrop('#pg-channel-header [data-id=banner]', '#pg-channel-top', { targetPosition: { x: 40, y: 20 } }); await settle();
  ok((await all()).pageLayouts.channel.header.includes('banner'), 'the channel banner stays in the header (or Hidden)');
  await p.$eval('#cols-subs', (r) => { r.value = 6; r.dispatchEvent(new Event('input', { bubbles: true })); }); await settle();
  ok((await all()).pageLayouts.subs.cols === 6 && await p.textContent('.pgcard[data-page=subs] output') === '6', 'subscriptions columns: 6');
  await p.screenshot({ path: path.join(SHOTS, 'studio-pages.png') });

  // ---- undo / redo across views, reset
  const before = JSON.stringify((await all()).pageLayouts);
  await p.click('#undo'); await settle();
  ok(JSON.stringify((await all()).pageLayouts) !== before && (await all()).pageLayouts.subs.cols === 0, 'Undo reverts the last edit (columns)');
  await p.keyboard.press('Control+Shift+z'); await settle();
  ok(JSON.stringify((await all()).pageLayouts) === before, 'Ctrl+Shift+Z redoes it');
  await p.click('#reset'); await settle();
  s = await all();
  ok(s.pageLayouts.subs.top.length === 0 && s.pageLayouts.channel.hidden.length === 0 && s.topbarLayout.hidden.includes('create'), 'Reset this page resets Pages only');

  // ---- the studio's own panels
  const dockOf = (panel) => p.$eval(`[data-panel=${panel}]`, (e) => e.parentElement.dataset.dock);
  ok(await dockOf('layout') === 'right' && await dockOf('settings') === 'bottom', 'panels start in the right and bottom docks');
  // like a person: pick the panel up by its grip, the empty left dock opens, drop it there
  const g = await p.$eval('[data-panel=hidden] .grip', (e) => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await p.mouse.move(...g); await p.mouse.down(); await p.mouse.move(g[0] - 30, g[1] + 10, { steps: 4 });
  await p.waitForSelector('body.moving-panel #dockLeft', { state: 'visible' });
  const L = await p.$eval('#dockLeft', (e) => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + 40]; });
  await p.mouse.move(...L, { steps: 12 }); await p.mouse.up(); await settle(400);
  ok(await dockOf('hidden') === 'left', 'drag a panel by its grip into the empty left dock');
  await p.focus('[data-panel=profile] .grip'); await p.keyboard.press('ArrowRight'); await settle(300);
  ok(await dockOf('profile') === 'right', 'arrow keys on the grip move a panel between docks');
  await p.click('[data-panel=settings] .fold'); await settle(300);
  ok(await p.$eval('[data-panel=settings]', (e) => e.classList.contains('folded')) && await p.getAttribute('[data-panel=settings] .fold', 'aria-expanded') === 'false', 'fold a panel');
  await p.screenshot({ path: path.join(SHOTS, 'studio-panels.png') });
  await p.reload(); await p.waitForSelector('#profSel option', { state: 'attached' }); await settle(400);
  ok(await dockOf('hidden') === 'left' && await dockOf('profile') === 'right' && await p.$eval('[data-panel=settings]', (e) => e.classList.contains('folded')), 'panel places and folds persist');
  await p.click('#resetPanels'); await settle(300);
  ok(await dockOf('hidden') === 'right' && await dockOf('profile') === 'bottom' && !(await p.$eval('[data-panel=settings]', (e) => e.classList.contains('folded'))), 'Reset panels');

  // ---- theme, settings panel, phone width
  await p.click('#theme');
  const theme = await p.evaluate(() => document.documentElement.dataset.theme);
  ok(theme === 'dark' || theme === 'light', 'theme button sets a theme: ' + theme);
  await p.click('#theme'); await p.evaluate(() => { localStorage.removeItem('eyt-studio-theme'); delete document.documentElement.dataset.theme; });
  ok((await p.$$('#form input[type=checkbox]')).length > 30 && await p.isVisible('#form'), 'every setting is in the Settings panel');
  await p.setViewportSize({ width: 390, height: 844 }); await settle(300);
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll at 390px');
  await p.setViewportSize({ width: 320, height: 700 }); await settle(300);
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll at 320px');
  await done(ctx);
})();
