// The pieces the Layout Studio can move or hide, applied to a YouTube-shaped page: action buttons (found by icon even
// in a non-English UI), channel row, description, chips, the top bar, and the player in the sidebar.
const { fixture, launchExt, suite } = require('./lib');
const HTML = fixture('pieces.html');
const { ok, watch, done } = suite();
(async () => {
  const { ctx } = await launchExt();
  await ctx.route('**/*', (r) => r.request().url().startsWith('https://www.youtube.com/watch')
    ? r.fulfill({ contentType: 'text/html', body: HTML }) : r.fulfill({ status: 404, body: '' }));
  const p = watch(await ctx.newPage());
  await p.goto('https://www.youtube.com/watch?v=abcdefghijk');
  await p.waitForFunction(() => document.querySelector('[data-eyt-part="likes"]'), null, { timeout: 8000 });
  const set = async (x) => { await p.evaluate((v) => document.dispatchEvent(new CustomEvent('eliteyt:set', { detail: JSON.stringify(v) })), x); await p.waitForTimeout(700); };
  const part = (id) => `[data-eyt-part="${id}"]`;
  const shown = (sel) => p.$eval(sel, (e) => getComputedStyle(e).display !== 'none');
  const ord = (sel) => p.$eval(sel, (e) => +getComputedStyle(e).order);
  const x = (sel) => p.$eval(sel, (e) => e.getBoundingClientRect().x);

  // defaults: everything marked, nothing reordered or hidden
  const marked = await p.$$eval('[data-eyt-part]', (els) => els.map((e) => e.dataset.eytPart).sort());
  ok(JSON.stringify(marked) === JSON.stringify(['avatar', 'chips', 'clip', 'download', 'info', 'join', 'likes', 'name', 'save', 'share', 'subscribe', 'text', 'thanks']), 'every piece found: ' + marked.join(','));
  ok(await p.$eval('#share-btn', (e) => e.dataset.eytPart) === 'share', 'Share found by its icon although the label is "Teilen"');
  ok(!(await p.$('#ask[data-eyt-part]')), 'an unknown button is left alone');
  ok(!(await p.$('ytd-menu-renderer.eyt-flat, #owner.eyt-flat')) && !(await p.$('[data-eyt-hidden]')), "default order: YouTube's own rows untouched");
  ok(!(await p.evaluate(() => document.documentElement.classList.contains('eyt-tb'))), 'default top bar untouched');

  // action buttons: reorder + hide
  await set({ pieces: { actions: { order: ['download', 'likes', 'share', 'save', 'clip'], hidden: ['thanks'] },
    channel: { order: ['subscribe', 'avatar', 'name'], hidden: ['join'] }, description: { order: ['info', 'text'], hidden: ['info'] },
    related: { order: ['videos'], hidden: ['chips'] } } });
  ok(await p.$eval('ytd-menu-renderer', (e) => e.classList.contains('eyt-flat')), 'a changed order flattens the button rows into one');
  ok(await x(part('download')) < await x(part('likes')) && await x(part('likes')) < await x(part('share')), 'Download now comes before Like and Share (on screen)');
  ok(!(await shown(part('thanks'))) && await ord('#ask') === 90, 'Thanks hidden; the unknown button goes last');
  ok(await x(part('subscribe')) < await x(part('avatar')) && !(await shown(part('join'))), 'channel row: Subscribe first, Join hidden');
  ok(!(await shown(part('info'))) && await shown(part('text')), 'description: views and date hidden, text kept');
  ok(!(await shown(part('chips'))), 'filter chips hidden');

  // YouTube re-renders a row: the new button is picked up
  await p.evaluate(() => {
    const old = document.querySelector('[data-eyt-part="download"]');
    const n = document.createElement('ytd-download-button-renderer'); n.innerHTML = '<button aria-label="Download">Download</button>';
    old.replaceWith(n);
  });
  await p.waitForTimeout(400);
  ok(await p.$eval('ytd-download-button-renderer', (e) => e.dataset.eytPart === 'download' && e.style.order === '1'), 'a re-rendered button is marked and ordered again');

  // back to defaults
  await set({ pieces: { actions: { order: ['likes', 'share', 'save', 'download', 'clip', 'thanks'], hidden: [] }, channel: { order: ['avatar', 'name', 'join', 'subscribe'], hidden: [] },
    description: { order: ['info', 'text'], hidden: [] }, related: { order: ['chips', 'videos'], hidden: [] } } });
  ok(!(await p.$('ytd-menu-renderer.eyt-flat, #owner.eyt-flat, [data-eyt-hidden]')) && await p.$eval(part('likes'), (e) => e.style.order === ''), 'back to defaults: rows restored');

  // top bar
  await set({ topbarLayout: { left: ['notifications', 'menu', 'logo'], center: ['search', 'voice'], right: ['nav', 'avatar'], hidden: ['create'] } });
  ok(await p.evaluate(() => document.documentElement.classList.contains('eyt-tb')), 'a custom top bar switches the flattened bar on');
  const tb = (id) => `[data-eyt-tb="${id}"]`;
  // (the menu button itself is already hidden by EliteYT's own top bar, which drops YouTube's left sidebar)
  ok(await ord(tb('notifications')) < await ord(tb('menu')) && await x(tb('notifications')) < await x(tb('logo')), 'Notifications moved to the far left');
  ok(!(await shown(tb('create'))), 'Create hidden');
  ok(await x(tb('logo')) < await x(tb('search')) && await x(tb('voice')) < await x(tb('avatar')), 'center and right zones keep their places');
  ok(await p.$eval(tb('search'), (e) => e.hasAttribute('data-eyt-tb-gap')) && await p.$eval(tb('nav') + ',' + tb('avatar'), (e) => e.hasAttribute('data-eyt-tb-gap')), 'the first item of the center and right zones is pushed apart');
  await set({ topbarLayout: { left: ['menu', 'logo'], center: ['search', 'voice'], right: ['create', 'nav', 'notifications', 'avatar'], hidden: [] } });
  ok(!(await p.evaluate(() => document.documentElement.classList.contains('eyt-tb'))) && await shown(tb('create')), 'default top bar: flattening off again');

  // player in the sidebar
  await set({ layout: { side: 'right', width: 400, cols: 3, card: 'grid', main: ['channel', 'actions', 'recommendations'], sidebar: ['player', 'title', 'description', 'merch', 'comments'], hidden: ['chat'], }, layoutV: 2 });
  ok(await p.evaluate(() => document.querySelector('#player').parentElement.id === 'secondary-inner' && document.querySelector('#secondary-inner').firstElementChild.id === 'player'), 'player docked at the top of the sidebar');
  ok(await p.evaluate(() => document.getElementById('ytd-player').isConnected && document.querySelector('ytd-watch-flexy').classList.contains('eyt-player-side')), 'same player node, sidebar class set');
  await set({ layout: { side: 'right', width: 400, cols: 3, card: 'grid', main: ['player', 'channel', 'actions', 'recommendations'], sidebar: ['title', 'description', 'merch', 'comments'], hidden: ['chat'] } });
  ok(await p.evaluate(() => document.querySelector('#primary-inner').firstElementChild.id === 'player' && !document.querySelector('ytd-watch-flexy').classList.contains('eyt-player-side')), 'player back in its own slot in the main column');
  await done(ctx);
})();
