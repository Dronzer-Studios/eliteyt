const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const { ROOT: EXT, SHOTS } = require('./lib');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
// [title, channel, expected verdict kind or null]
const CORPUS = [
  ['Cat saves baby from flood | AI generated', 'Daily Clips', 'ai'],
  ["Grandma's cat cooks dinner 🐱 #aivideo #veo3", 'Kitty Kitchen', 'ai'],
  ['Titanic 2 – Official Trailer (AI Short Film)', 'Cinema Dreams', 'ai'],
  ['Jesus walks on water, made with Sora', 'Faith Visions', 'ai'],
  ['Lost city of Atlantis found 4K', 'Cinematic AI', null],          // one weak signal: not enough on its own
  ['Baby elephant plays in the rain | AI video', 'NatureDreamAI', 'ai'],
  ['😱😱😱 YOU WON\'T BELIEVE THIS!!! #shorts #viral #fyp', 'Viral Hub', 'low'],
  ["r/AskReddit - What's the creepiest thing you've seen? (Reddit Stories)", 'Story Time TTS', 'low'],
  ['TRY NOT TO LAUGH 🤣🤣🤣 Funny Moments Compilation', 'LOL Daily', 'low'],
  // must NOT be flagged
  ['Sora vs Riku - Kingdom Hearts 3 boss fight', 'GameGrumps', null],
  ["Sora 2 review: is OpenAI's AI video tool any good?", 'MKBHD', null],
  ['How AI will change programming jobs', 'Fireship', null],
  ['Veo 3 tutorial: how to write prompts', 'Matt Wolfe', null],
  ['Restoring a 1978 film camera with a broken shutter', 'Bench & Lens', null],
  ['Thai street food tour in Bangkok', 'Mark Wiens', null],
  ["NASA's Artemis II launch LIVE", 'NASA', null],
  ['10 Facts You Didn\'t Know About Sharks', 'Ocean Notes', null],
  ['I built a CPU from scratch', 'Ben Eater', null],
  ['Dubai Marina night walk 4K', 'Walk With Me', null],
  ['Why the AI bubble might burst | Economics explained', 'Economics Explained', null],
];
const card = (i, [t, c]) => `<ytd-rich-item-renderer id="c${i}"><div id="content"><ytd-rich-grid-media>
  <a href="/watch?v=vid${String(i).padStart(8, '0')}"><div style="width:320px;height:180px;background:#456"></div></a>
  <h3><a id="video-title" href="/watch?v=vid${String(i).padStart(8, '0')}">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</a></h3>
  <ytd-channel-name><div id="text">${c.replace(/&/g, '&amp;')}</div></ytd-channel-name><span>12K views · 2 days ago</span></ytd-rich-grid-media></div></ytd-rich-item-renderer>`;
const HOME = `<!doctype html><html><head><meta charset="utf-8"></head><body style="font:14px Roboto,Arial"><ytd-app><ytd-browse page-subtype="home"><ytd-rich-grid-renderer><div id="contents" style="display:grid;grid-template-columns:repeat(4,320px);gap:16px">
${CORPUS.map((x, i) => card(i, x)).join('')}</div></ytd-rich-grid-renderer></ytd-browse></ytd-app></body></html>`;
const WATCH = (disclosed) => `<!doctype html><html><head><meta charset="utf-8"><script>var ytInitialData = ${JSON.stringify({ engagementPanels: disclosed ? [{ engagementPanelSectionListRenderer: { content: { structuredDescriptionContentRenderer: { items: [{ howThisWasMadeSectionViewModel: { sectionTitle: { content: 'How this content was made' }, bodyHeader: { content: 'Altered or synthetic content' } } }] } } } }] : [] })};</script></head>
<body><ytd-app><ytd-watch-flexy><div id="movie_player" style="position:relative;width:854px;height:480px;background:#000"><video class="html5-main-video"></video></div></ytd-watch-flexy></ytd-app>
<script>const mp = document.getElementById('movie_player');
mp.getVideoData = () => ({ video_id: '${disclosed ? 'synthvid001' : 'normalvid01'}', title: 'A dog surfs a giant wave', author: 'Ocean Moments' });
mp.getPlayerResponse = () => ({ videoDetails: { shortDescription: 'Amazing!' } });
addEventListener('load', () => document.dispatchEvent(new CustomEvent('yt-navigate-finish')));</script></body></html>`;
(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'eyt-')), {
    headless: true, channel: 'chromium', viewport: { width: 1400, height: 1100 }, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.host !== 'www.youtube.com') return r.fulfill({ status: 404, body: '' });
    if (u.pathname === '/') return r.fulfill({ contentType: 'text/html', body: HOME });
    if (u.pathname === '/watch') return r.fulfill({ contentType: 'text/html', body: WATCH(u.searchParams.get('v') === 'synth') });
    return r.fulfill({ status: 404, body: '' });
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { console.log('PAGEERROR', e.message); fails++; });
  await p.goto('https://www.youtube.com/');
  await p.waitForFunction(() => window.__eytSlopScore);
  const set = async (x) => { await p.evaluate((x) => document.dispatchEvent(new CustomEvent('eliteyt:set', { detail: JSON.stringify(x) })), x); await p.waitForTimeout(700); };

  // scoring corpus
  let right = 0;
  for (const [t, c, want] of CORPUS) {
    const r = await p.evaluate(([t, c]) => window.__eytSlopScore(t, c, ''), [t, c]);
    const got = r.verdict?.kind || null;
    if (got === want) right++; else console.log(`   ✗ "${t}" [${c}] → ${got} (ai ${r.ai}, low ${r.low}: ${r.why.join(', ')}) expected ${want}`);
  }
  ok(right === CORPUS.length, `scoring corpus: ${right}/${CORPUS.length} as expected (9 flagged, 11 normal incl. game/review/tutorial/news traps)`);

  // feed cards: blur + reason + Show
  await p.waitForTimeout(800);
  const flagged = () => p.$$eval('ytd-rich-item-renderer', (els) => els.filter((e) => e.matches('.eyt-slop, .eyt-slop-hide')).map((e) => +e.id.slice(1)));
  const want = CORPUS.map((x, i) => (x[2] ? i : -1)).filter((i) => i >= 0);
  ok(JSON.stringify(await flagged()) === JSON.stringify(want), 'feed: exactly the flagged cards are blurred: ' + (await flagged()).join(','));
  ok(await p.$eval('#c0 .eyt-slop-tag b', (b) => b.textContent) === 'Likely AI-generated' && (await p.$eval('#c6 .eyt-slop-tag b', (b) => b.textContent)) === 'Likely low-effort', 'labels say AI vs low-effort');
  ok(/labelled AI-generated/.test(await p.$eval('#c0 .eyt-slop-tag small', (b) => b.textContent)), 'reason shown on the card');
  ok(await p.$eval('#c0 > #content', (e) => getComputedStyle(e).filter.includes('blur')), 'flagged card content is blurred');
  await p.screenshot({ path: path.join(SHOTS, 'slop-feed.png'), clip: { x: 0, y: 0, width: 1400, height: 1100 } });
  await p.click('#c0 .eyt-slop-tag button');
  await p.waitForTimeout(300);
  ok(!(await p.$eval('#c0', (e) => e.classList.contains('eyt-slop'))) && !(await p.$('#c0 .eyt-slop-tag')), '"Show" reveals the card');
  await p.waitForTimeout(500);
  ok(!(await p.$eval('#c0', (e) => e.classList.contains('eyt-slop'))), 'revealed card stays revealed after rescans');

  // recycled card: YouTube swaps the title in place
  await p.$eval('#c13 #video-title', (a) => { a.textContent = 'AI generated: dragons over New York #aiart'; });
  await p.waitForTimeout(400);
  ok(await p.$eval('#c13', (e) => e.classList.contains('eyt-slop')), 'recycled card re-judged when its title changes');
  await p.$eval('#c13 #video-title', (a) => { a.textContent = 'Restoring a 1978 film camera with a broken shutter'; });
  await p.waitForTimeout(400);
  ok(!(await p.$eval('#c13', (e) => e.classList.contains('eyt-slop'))), '...and cleared when it changes back');

  // settings
  await set({ slopHide: true });
  ok(await p.$eval('#c1', (e) => e.classList.contains('eyt-slop-hide') && getComputedStyle(e).display === 'none'), 'hide mode: flagged cards removed from view');
  await set({ slopHide: false, slopAllow: ['Kitty Kitchen'], slopBlock: ['Mark Wiens'] });
  ok(!(await p.$eval('#c1', (e) => e.matches('.eyt-slop, .eyt-slop-hide'))), 'allow-listed channel never flagged');
  ok(await p.$eval('#c14 .eyt-slop-tag b', (b) => b.textContent) === 'Blocked channel', 'block-listed channel always flagged');
  await set({ lowEffort: false, slopAllow: [], slopBlock: [] });
  ok(!(await p.$eval('#c6', (e) => e.matches('.eyt-slop'))) && await p.$eval('#c2', (e) => e.matches('.eyt-slop')), 'low-effort off: only AI flagged');
  await set({ aiFilter: false, lowEffort: false });
  ok((await flagged()).length === 0, 'both off: nothing flagged');
  const border = () => p.evaluate(() => window.__eytSlopScore('10 facts that will shock you 😱😱😱', 'Fact Hub', '').verdict?.kind || null);
  await set({ aiFilter: true, lowEffort: true });
  const normal = await border();
  await set({ slopStrict: true });
  const strict = await border();
  ok(normal === null && strict === 'low', `strict mode flags a 2-signal title that normal mode lets through (${normal} → ${strict})`);
  await set({ slopStrict: false });

  // watch page: YouTube's synthetic-content disclosure
  await p.goto('https://www.youtube.com/watch?v=synth');
  await p.waitForSelector('.eyt-slop-cover', { timeout: 6000 });
  ok(/AI-generated/.test(await p.textContent('.eyt-slop-cover-title')) && /disclosed altered or synthetic/.test(await p.textContent('.eyt-slop-cover-why')), 'disclosed video: player covered with the reason');
  ok(await p.evaluate(() => document.querySelector('video').paused), 'covered video is paused');
  await p.screenshot({ path: path.join(SHOTS, 'slop-watch.png'), clip: { x: 0, y: 0, width: 870, height: 500 } });
  await p.click('.eyt-slop-cover-btns button:nth-child(2)'); // Always allow channel
  await p.waitForTimeout(600);
  ok(!(await p.$('.eyt-slop-cover')), '"Always allow" removes the cover');
  await p.goto('https://www.youtube.com/watch?v=synth'); await p.waitForTimeout(2500);
  ok(!(await p.$('.eyt-slop-cover')) && await p.evaluate(() => JSON.parse(localStorage.getItem('eliteyt')).slopAllow.includes('Ocean Moments')), 'allowed channel saved; not covered on reload');
  await set({ slopAllow: [] });
  await p.goto('https://www.youtube.com/watch?v=normal'); await p.waitForTimeout(2500);
  ok(!(await p.$('.eyt-slop-cover')), 'undisclosed, normal title: not covered');
  await ctx.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
