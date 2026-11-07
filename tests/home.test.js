const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const { ROOT: EXT } = require('./lib');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const vr = (id, title, ch, cid, pct, len, ago) => ({ videoRenderer: { videoId: id, title: { simpleText: title },
  ownerText: { runs: [{ text: ch, navigationEndpoint: { browseEndpoint: { browseId: cid } } }] }, lengthText: { simpleText: len },
  publishedTimeText: { simpleText: ago }, viewCountText: { simpleText: '1K views' },
  thumbnailOverlays: pct ? [{ thumbnailOverlayResumePlaybackRenderer: { percentDurationWatched: pct } }] : [] } });
const page = (data) => `<html><body><script>var ytInitialData = ${JSON.stringify(data)};</script></body></html>`;
const FEEDS = {
  '/feed/history': page({ c: [vr('hist0000001', 'Half watched A', 'Chan A', 'UCaaaaaaaaaaaaaaaaaaaaaa', 40, '10:00', '1 day ago'), vr('hist0000002', 'Half watched B', 'Chan B', 'UCbbbbbbbbbbbbbbbbbbbbbb', 50, '20:00', '2 days ago')] }),
  '/feed/subscriptions': page({ c: [vr('subs0000001', 'Sub upload 1', 'Chan C', 'UCcccccccccccccccccccccc', 0, '5:00', '3 hours ago'), vr('subs0000002', 'Sub upload 2', 'Chan D', 'UCdddddddddddddddddddddd', 0, '6:00', '5 days ago')] }),
};
const HOME = `<!doctype html><html><body><ytd-app><ytd-browse page-subtype="home"><ytd-rich-grid-renderer>
<div id="header"><div class="chips">All Music Gaming</div></div><div id="contents"><div class="yt-card">YouTube rec 1</div><div class="yt-card">YouTube rec 2</div></div>
</ytd-rich-grid-renderer></ytd-browse></ytd-app></body></html>`;
(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'eyt-')), {
    headless: true, channel: 'chromium', args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  const hits = [];
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.host !== 'www.youtube.com') return r.fulfill({ status: 404, body: '' });
    hits.push(u.pathname);
    if (u.pathname === '/') return r.fulfill({ contentType: 'text/html', body: HOME });
    if (FEEDS[u.pathname]) return r.fulfill({ contentType: 'text/html', body: FEEDS[u.pathname] });
    if (/^\/channel\/UC\w+\/videos$/.test(u.pathname)) return r.fulfill({ contentType: 'text/html', body: page({ c: [vr('chan' + u.pathname.slice(9, 16), 'Newest from channel', 'X', 'UCx', 0, '7:00', '1 hour ago')] }) });
    return r.fulfill({ status: 404, body: '' });
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { console.log('PAGEERROR', e.message); fails++; });
  await p.goto('https://www.youtube.com/');
  const set = async (patch) => {
    await p.evaluate((x) => document.dispatchEvent(new CustomEvent('eliteyt:set', { detail: JSON.stringify(x) })), patch);
    await p.waitForTimeout(1500);
  };
  const sections = () => p.evaluate(() => [...document.querySelectorAll('.eyt-shelves > *')].map((e) =>
    e.classList.contains('eyt-hero') ? 'hero' : e.classList.contains('eyt-rec-head') ? 'rec-head' : e.querySelector('h2')?.textContent));
  // (#header = chips: EliteYT's top bar already hides them until you scroll, so only the feed itself is checked)
  const ytFeedVisible = () => p.evaluate(() => getComputedStyle(document.querySelector('ytd-rich-grid-renderer > #contents')).display !== 'none');
  const chipsForcedOff = () => p.evaluate(() => { document.documentElement.classList.add('eyt-scrolled');
    const d = getComputedStyle(document.querySelector('ytd-rich-grid-renderer > #header')).display; document.documentElement.classList.remove('eyt-scrolled'); return d === 'none'; });
  await p.waitForSelector('.eyt-shelves .eyt-hero', { timeout: 10000 });

  let s = await sections();
  ok(JSON.stringify(s) === JSON.stringify(['hero', 'Continue watching', 'From your subscriptions', 'rec-head']), 'default home order: ' + s.join(' | '));
  ok(await ytFeedVisible(), 'default: YouTube feed visible');

  await set({ homeLayout: { shown: ['subs', 'recommended'], hidden: ['hero', 'continue'] } });
  s = await sections();
  ok(JSON.stringify(s) === JSON.stringify(['From your subscriptions', 'rec-head']), '#8 carousel + Continue watching removed: ' + s.join(' | '));
  ok(await p.evaluate(() => !document.querySelector('.eyt-hero, .eyt-card-x')), '#8 no carousel / no continue cards in the DOM');

  await set({ homeLayout: { shown: ['continue', 'hero', 'subs'], hidden: ['recommended'] } });
  s = await sections();
  ok(JSON.stringify(s) === JSON.stringify(['Continue watching', 'hero', 'From your subscriptions']), '#8 reordered, Recommended hidden: ' + s.join(' | '));
  ok(!(await ytFeedVisible()), '#8 Recommended hidden: YouTube feed hidden');
  ok(await chipsForcedOff(), '#8 Recommended hidden: filter chips stay hidden even after scrolling');

  await set({ homeLayout: { shown: ['hero', 'recommended'], hidden: ['continue', 'subs'] } });
  ok(await ytFeedVisible() && !(await chipsForcedOff()), '#8 Recommended shown again: feed + scrolled chips back');
  s = await sections();
  ok(JSON.stringify(s) === JSON.stringify(['hero', 'rec-head']), '#8 hero only: ' + s.join(' | '));

  // shelves master switch off: stock home, feed visible even if Recommended was hidden
  await set({ homeLayout: { shown: ['hero'], hidden: ['continue', 'subs', 'recommended'] } });
  await set({ homeShelves: false });
  ok(!(await p.$('.eyt-shelves')) && (await ytFeedVisible()), 'shelves off: stock home page');

  // garbage layout falls back to the default order
  await set({ homeShelves: true, homeLayout: { shown: ['nope'] } });
  s = await sections();
  ok(JSON.stringify(s) === JSON.stringify(['hero', 'Continue watching', 'From your subscriptions', 'rec-head']), 'invalid homeLayout falls back to default: ' + s.join(' | '));

  await ctx.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
