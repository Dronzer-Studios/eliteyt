const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const { ROOT: EXT } = require('./lib');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const PR = { videoDetails: { videoId: 'abcdefghijk', title: 'Real video' }, adPlacements: [{ adPlacementRenderer: { x: 1 } }],
  playerAds: [{ playerLegacyDesktopWatchAdsRenderer: {} }], adSlots: [{ adSlotRenderer: {} }], streamingData: { formats: [1] } };
const FEED = { contents: { richGridRenderer: { contents: [
  { richItemRenderer: { content: { videoRenderer: { videoId: 'vid00000001' } } } },
  { richItemRenderer: { content: { adSlotRenderer: { ad: 1 } } } },
  { richSectionRenderer: { content: { statementBannerRenderer: {} } } },
  { richItemRenderer: { content: { videoRenderer: { videoId: 'vid00000002' } } } }] } },
  secondary: { results: [{ compactPromotedVideoRenderer: {} }, { compactVideoRenderer: { videoId: 'vid00000003' } }, { promotedSparklesWebRenderer: {} }] } };
const page = (adBlock) => `<!doctype html><html><head>
<script>var ytInitialPlayerResponse = ${JSON.stringify(PR)};</script>
<script>var ytInitialData = ${JSON.stringify(FEED)};</script>
<script>
window.got = {};
got.initialPR = JSON.parse(JSON.stringify(window.ytInitialPlayerResponse));
got.initialData = JSON.parse(JSON.stringify(window.ytInitialData));
got.fetchJson = fetch('/youtubei/v1/player?key=x', { method: 'POST' }).then((r) => r.json());
got.fetchText = fetch('/youtubei/v1/next?key=x', { method: 'POST' }).then((r) => r.text()).then((t) => JSON.parse(t));
got.other = fetch('/some/other.json').then((r) => r.json());
</script></head><body><ytd-app>
<div id="masthead-ad">MASTHEAD AD</div>
<ytd-rich-item-renderer id="feedAd"><div id="content"><ytd-ad-slot-renderer>AD</ytd-ad-slot-renderer></div></ytd-rich-item-renderer>
<ytd-rich-item-renderer id="feedVid"><div id="content"><ytd-rich-grid-media>real</ytd-rich-grid-media></div></ytd-rich-item-renderer>
<ytd-compact-promoted-video-renderer id="sideAd">promo</ytd-compact-promoted-video-renderer>
<div id="movie_player" class="html5-video-player"><video class="html5-main-video"></video><div class="ytp-ad-overlay-container" id="ovl">overlay</div></div>
<ytd-popup-container><tp-yt-paper-dialog id="dlg"><ytd-enforcement-message-view-model>Ad blockers are not allowed</ytd-enforcement-message-view-model></tp-yt-paper-dialog></ytd-popup-container>
</ytd-app>
<script>
const mp = document.getElementById('movie_player');
mp.getVideoData = () => ({ video_id: 'abcdefghijk', title: 'Real video', author: 'Chan' });
</script></body></html>`;
(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'eyt-')), {
    headless: true, channel: 'chromium', args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  let adBlockOff = false;
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.host !== 'www.youtube.com') return r.fulfill({ status: 404, body: '' });
    if (u.pathname === '/watch') return r.fulfill({ contentType: 'text/html', body: page() });
    if (u.pathname.startsWith('/youtubei/v1/')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ playerResponse: PR, ...FEED }) });
    if (u.pathname === '/some/other.json') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ adPlacements: ['keep me'] }) });
    return r.fulfill({ status: 404, body: '' });
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { console.log('PAGEERROR', e.message); fails++; });
  await p.goto('https://www.youtube.com/watch?v=abcdefghijk');
  const got = () => p.evaluate(async () => ({ initialPR: got.initialPR, initialData: got.initialData, fetchJson: await got.fetchJson, fetchText: await got.fetchText, other: await got.other }));
  let g = await got();
  const noAds = (pr) => pr && !('adPlacements' in pr) && !('playerAds' in pr) && !('adSlots' in pr) && pr.videoDetails?.videoId === 'abcdefghijk' && pr.streamingData?.formats?.length === 1;
  const feedIds = (d) => JSON.stringify(d).match(/vid0000000\d/g)?.join(',');
  const feedAdFree = (d) => !/adSlotRenderer|statementBannerRenderer|compactPromotedVideoRenderer|promotedSparklesWebRenderer/.test(JSON.stringify(d));
  ok(noAds(g.initialPR), 'ytInitialPlayerResponse: ad placements stripped, video data kept');
  ok(feedAdFree(g.initialData) && feedIds(g.initialData) === 'vid00000001,vid00000002,vid00000003', 'ytInitialData: feed/sidebar ads removed, videos kept (' + feedIds(g.initialData) + ')');
  ok(noAds(g.fetchJson.playerResponse) && feedAdFree(g.fetchJson), 'fetch /youtubei/v1/player .json(): ads stripped');
  ok(noAds(g.fetchText.playerResponse) && feedAdFree(g.fetchText), 'fetch .text() + JSON.parse: ads stripped');
  ok(g.other.adPlacements?.[0] === 'keep me', 'non-YouTube-API .json() left alone');
  ok(await p.evaluate(() => window.__eytAdsRemoved?.() > 0), 'removal counter: ' + await p.evaluate(() => window.__eytAdsRemoved?.()));

  // cosmetic
  const disp = (id) => p.evaluate((id) => getComputedStyle(document.getElementById(id)).display, id);
  ok(await disp('masthead-ad') === 'none' && await disp('feedAd') === 'none' && await disp('sideAd') === 'none' && await disp('ovl') === 'none', 'rendered ad slots hidden');
  ok(await disp('feedVid') !== 'none', 'normal feed item visible');
  ok(await p.evaluate(() => !document.getElementById('dlg')), '"Ad blockers are not allowed" dialog removed');

  // player fallback: an ad that plays anyway
  await p.evaluate(() => {
    const mp = document.getElementById('movie_player'), v = mp.querySelector('video');
    v.muted = false; v.playbackRate = 1.5;
    localStorage.removeItem('eliteyt:speeds');
    const skip = document.createElement('button'); skip.className = 'ytp-skip-ad-button'; skip.onclick = () => { window.skipped = true; mp.classList.remove('ad-showing'); };
    mp.append(skip);
    window.skipped = false; window.__rates = [];
    const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');
    Object.defineProperty(v, 'playbackRate', { configurable: true, get() { return desc.get.call(this); }, set(x) { window.__rates.push(x); desc.set.call(this, x); } });
    mp.classList.add('ad-showing');
  });
  await p.waitForTimeout(300);
  const st = await p.evaluate(() => { const v = document.querySelector('#movie_player video'); return { muted: v.muted, rate: v.playbackRate, skipped: window.skipped, ad: document.getElementById('movie_player').classList.contains('ad-showing') }; });
  ok(st.skipped && !st.ad, 'ad in the player: Skip pressed');
  ok(await p.evaluate(() => window.__rates?.includes(16)), 'ad sped up to 16x while showing');
  ok(st.muted === false && st.rate === 1.5, 'sound and speed restored after the ad (rate ' + st.rate + ')');
  await p.waitForTimeout(2300); // main.js only remembers speeds 2 s after load
  await p.evaluate(() => { const mp = document.getElementById('movie_player'); mp.querySelector('.ytp-skip-ad-button')?.remove(); mp.classList.add('ad-showing'); });
  await p.waitForTimeout(300);
  ok(await p.evaluate(() => !/:16\b/.test(localStorage.getItem('eliteyt:speeds') || '')), "16x during an ad isn't remembered as the channel's speed: " + await p.evaluate(() => localStorage.getItem('eliteyt:speeds')));
  await p.evaluate(() => document.getElementById('movie_player').classList.remove('ad-showing'));

  // switched off: data passes through untouched
  await p.evaluate(() => document.dispatchEvent(new CustomEvent('eliteyt:set', { detail: JSON.stringify({ adBlock: false }) })));
  await p.waitForTimeout(600);
  await p.reload();
  g = await got();
  ok('adPlacements' in g.initialPR && !feedAdFree(g.initialData) && 'adPlacements' in g.fetchJson.playerResponse, 'Block YouTube ads off: nothing stripped');
  ok(await disp('sideAd') !== 'none' && await disp('ovl') !== 'none', 'Block YouTube ads off: its CSS is off (masthead stays covered by "Hide ads on home")');
  await ctx.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
