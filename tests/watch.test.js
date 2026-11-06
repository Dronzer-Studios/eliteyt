const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const { ROOT: EXT } = require('./lib'), HTML = fs.readFileSync(path.join(__dirname, 'fixtures', 'watch.html'), 'utf8');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'eyt-')), {
    headless: true, channel: 'chromium', args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  await ctx.route('**/*', (r) => r.request().url().startsWith('https://www.youtube.com/watch')
    ? r.fulfill({ contentType: 'text/html', body: HTML }) : r.fulfill({ status: 404, body: '' }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('PAGEERROR', e.message); fails++; });
  await page.goto('https://www.youtube.com/watch?v=abcdefghijk');
  await page.waitForFunction(() => document.documentElement.classList.contains('eyt-exp'), null, { timeout: 10000 });
  const setLayout = async (patch) => {
    await page.evaluate((p) => document.dispatchEvent(new CustomEvent('eliteyt:set', { detail: JSON.stringify(p) })), patch);
    await page.waitForTimeout(800);
  };
  // the ids in #primary-inner in DOM order, mapped to layout-studio ids
  const order = (sel) => page.evaluate((sel) => [...document.querySelector(sel).children].map((e) =>
    e.id === 'player' ? 'player' : e.id === 'title' ? 'title' : e.id === 'owner' ? 'channel' : e.id === 'actions' ? 'actions'
    : e.id === 'related' ? 'recommendations' : e.classList.contains('eyt-panel') ? 'comments' : e.id === 'bottom-row' ? 'description'
    : e.localName === 'ytd-merch-shelf-renderer' ? 'merch' : e.id || e.localName), sel);
  const vis = (sel) => page.evaluate((sel) => { const e = document.querySelector(sel); return !!e && !e.closest('[hidden]') && e.offsetHeight > 0; }, sel);
  const base = { side: 'right', width: 400, cols: 3, card: 'grid', layoutV: 2 };
  const playerNode = await page.evaluate(() => (window.__pl = document.getElementById('ytd-player'), true));

  // --- #6: player position
  await setLayout({ titleInPlayer: false, layout: { ...base, main: ['channel', 'title', 'player', 'recommendations'], sidebar: ['description', 'merch', 'comments', 'actions'], hidden: ['chat'] } });
  let o = (await order('#primary-inner')).filter((x) => x !== 'below');
  ok(JSON.stringify(o) === JSON.stringify(['channel', 'title', 'player', 'recommendations']), '#6 player follows channel+title: ' + o.join(','));
  ok(await page.evaluate(() => document.getElementById('ytd-player') === window.__pl && window.__pl.isConnected), '#6 ytd-player node kept (never re-created)');

  await setLayout({ layout: { ...base, main: ['title', 'player', 'channel', 'recommendations'], sidebar: ['description', 'merch', 'comments', 'actions'], hidden: ['chat'] } });
  o = (await order('#primary-inner')).filter((x) => x !== 'below');
  ok(JSON.stringify(o) === JSON.stringify(['title', 'player', 'channel', 'recommendations']), '#6 channel moved from above to below the player: ' + o.join(','));

  await setLayout({ layout: { ...base, main: ['recommendations', 'player'], sidebar: ['title', 'channel', 'actions', 'description', 'merch', 'comments'], hidden: ['chat'] } });
  o = (await order('#primary-inner')).filter((x) => x !== 'below');
  ok(o[0] === 'recommendations' && o[1] === 'player', '#6 recommendations above player: ' + o.join(','));

  await setLayout({ layout: { ...base, main: ['comments', 'player', 'title'], sidebar: ['channel', 'actions', 'description', 'merch', 'recommendations'], hidden: ['chat'] } });
  o = (await order('#primary-inner')).filter((x) => x !== 'below');
  ok(o[0] === 'comments' && o[1] === 'player' && o[2] === 'title', '#6 comments panel above player: ' + o.join(','));

  // stable: repeated applies don't shuffle
  await page.waitForTimeout(1500);
  const o2 = (await order('#primary-inner')).filter((x) => x !== 'below');
  ok(JSON.stringify(o) === JSON.stringify(o2), '#6 order stable across re-applies');

  // --- #7: title above the player, with "title on the player" ON (the default)
  await setLayout({ titleInPlayer: true, layout: { ...base, main: ['title', 'player', 'channel', 'actions', 'recommendations'], sidebar: ['description', 'merch', 'comments'], hidden: ['chat'] } });
  o = (await order('#primary-inner')).filter((x) => x !== 'below');
  ok(o[0] === 'title' && o[1] === 'player', '#7 title sits above the player: ' + o.join(','));
  ok(await vis('ytd-watch-flexy #primary-inner > #title'), '#7 title above the player is visible');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('#primary-inner > #title')).marginTop === '0px'), '#7 first block is flush (margin-top 0)');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('#primary-inner > #player')).marginTop === '16px'), '#7 player gets the 16px gap');
  ok(await page.evaluate(() => !!document.querySelector('#movie_player .eyt-ptop')), '#7 hover title on the player still present');

  // title in sidebar + titleInPlayer: still replaced by the player title (unchanged behaviour)
  await setLayout({ layout: { ...base, main: ['player', 'recommendations'], sidebar: ['title', 'description', 'channel', 'actions', 'merch', 'comments'], hidden: ['chat'] } });
  ok(await page.evaluate(() => !!document.querySelector('.eyt-holder > #title')), '#7 sidebar title still moves to the player when titleInPlayer is on');
  o = (await order('#primary-inner')).filter((x) => x !== 'below');
  ok(o[0] === 'player', 'default-ish layout: player first: ' + o.join(','));

  // turning the custom layout off restores YouTube's DOM
  await setLayout({ expLayout: false });
  ok(await page.evaluate(() => !!document.querySelector('ytd-watch-metadata > #title') && document.querySelector('#primary-inner').firstElementChild.id === 'player'), 'custom layout off restores original DOM');

  await ctx.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
