// Narrow-window / theater stacked layout (#6) and subscriptions / search / channel page layouts (#5),
// set up through the real studio page and checked on YouTube-shaped fixtures.
const path = require('path');
const { SHOTS, fixture, launchExt, suite } = require('./lib');
const WATCH = fixture('watch.html');
const { ok, watch, done } = suite();
const item = (cls, inner) => `<ytd-rich-item-renderer class="${cls}"><div id="content"><a href="/watch?v=x">${inner}</a></div></ytd-rich-item-renderer>`;
const SUBS = `<!doctype html><meta charset="utf-8"><body><ytd-app><ytd-browse page-subtype="subscriptions"><ytd-rich-grid-renderer id="grid"><div id="contents">
${item('normal', 'A normal upload')}
${item('watched', '<ytd-thumbnail-overlay-resume-playback-renderer></ytd-thumbnail-overlay-resume-playback-renderer>Watched')}
${item('upcoming', '<ytd-thumbnail-overlay-time-status-renderer overlay-style="UPCOMING"></ytd-thumbnail-overlay-time-status-renderer>Premiere')}
${item('live', '<ytd-thumbnail-overlay-time-status-renderer overlay-style="LIVE"></ytd-thumbnail-overlay-time-status-renderer>Live now')}
<ytd-rich-item-renderer class="short"><div id="content"><a href="/shorts/abc">A short</a></div></ytd-rich-item-renderer>
<ytd-rich-section-renderer class="shortshelf"><ytd-rich-shelf-renderer is-shorts>Shorts</ytd-rich-shelf-renderer></ytd-rich-section-renderer>
</div></ytd-rich-grid-renderer></ytd-browse></ytd-app>`;
const SEARCH = `<!doctype html><meta charset="utf-8"><body><ytd-app><ytd-search>
<ytd-video-renderer class="normal"><a href="/watch?v=y">A video</a></ytd-video-renderer>
<ytd-video-renderer class="short"><a href="/shorts/s1">A short result</a></ytd-video-renderer>
<ytd-reel-shelf-renderer class="reels">Shorts shelf</ytd-reel-shelf-renderer>
<ytd-shelf-renderer class="shelf">People also watched</ytd-shelf-renderer>
<ytd-channel-renderer class="chan">A channel</ytd-channel-renderer>
<yt-lockup-view-model class="pl"><a href="/watch?v=z&list=PL1">Play</a><a href="/playlist?list=PL1">View full playlist</a></yt-lockup-view-model>
<yt-lockup-view-model class="mix"><a href="/watch?v=z&list=RDz">Mix</a></yt-lockup-view-model>
<yt-lockup-view-model class="vid"><a href="/watch?v=w">A lockup video</a></yt-lockup-view-model>
</ytd-search></ytd-app>`;
const CHANNEL = `<!doctype html><meta charset="utf-8"><body><ytd-app><ytd-browse page-subtype="channels">
<div id="page-header-banner" class="banner">Banner</div>
<ytd-channel-video-player-renderer class="trailer">Trailer</ytd-channel-video-player-renderer>
<ytd-item-section-renderer class="shortsec"><ytd-reel-shelf-renderer>Shorts</ytd-reel-shelf-renderer></ytd-item-section-renderer>
<ytd-rich-grid-renderer id="grid"><div id="contents">${item('normal', 'Upload')}</div></ytd-rich-grid-renderer>
</ytd-browse></ytd-app>`;
(async () => {
  const { ctx, id } = await launchExt();
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.protocol === 'chrome-extension:') return r.continue();
    if (u.host !== 'www.youtube.com') return r.fulfill({ status: 404, body: '' });
    const body = u.pathname === '/watch' ? WATCH : u.pathname === '/feed/subscriptions' ? SUBS : u.pathname === '/results' ? SEARCH : u.pathname.startsWith('/@') ? CHANNEL : '';
    return r.fulfill(body ? { contentType: 'text/html', body } : { status: 404, body: '' });
  });
  const studio = watch(await ctx.newPage());
  await studio.goto(`chrome-extension://${id}/options.html#stack`);
  await studio.waitForSelector('#stackMain .block', { state: 'attached' });
  const all = () => studio.evaluate(() => new Promise((r) => chrome.storage.sync.get(null, r)));
  const settle = (ms = 700) => studio.waitForTimeout(ms);
  const sids = (sel) => studio.$$eval(sel + ' > .block', (b) => b.map((e) => e.dataset.id));

  // ---- #6 studio: Narrow view
  ok(await studio.isVisible('#stackMain') && !(await studio.isVisible('#main')), 'Narrow view shows the stacked mock');
  ok(JSON.stringify(await sids('#stackMain')) === '["player","title","channel","actions","description","comments","recommendations"]' && JSON.stringify(await sids('#stackHidden')) === '["merch","chat"]', 'default stacked order');
  await studio.screenshot({ path: path.join(SHOTS, 'studio-narrow.png'), fullPage: true });
  await studio.hover('#stackMain [data-id=description]'); await studio.click('#stackMain [data-id=description] .x');
  await studio.dragAndDrop('#stackMain [data-id=title]', '#stackMain [data-id=player]', { targetPosition: { x: 40, y: 5 } }); await settle();
  let s = await all();
  ok(JSON.stringify(s.stackLayout.order) === '["title","player","channel","actions","comments","recommendations"]' && s.stackLayout.hidden.includes('description'), 'drag + hide saved: ' + s.stackLayout.order.join(','));
  ok(JSON.stringify(s.layout.main) !== JSON.stringify(s.stackLayout.order), 'the two-column layout is separate');

  // ---- #6 on YouTube: narrow window (no is-two-columns_)
  const yt = watch(await ctx.newPage());
  await yt.goto('https://www.youtube.com/watch?v=abcdefghijk');
  await yt.waitForFunction(() => document.documentElement.classList.contains('eyt-exp'));
  await yt.waitForTimeout(800);
  const order = () => yt.evaluate(() => [...document.querySelector('#primary-inner').children].map((e) => e.id || e.className).filter((i) => i !== 'below'));
  const two = await order();
  ok(two[0] === 'player' && two.includes('related'), 'two columns: the normal watch layout: ' + two.join(','));
  await yt.evaluate(() => document.querySelector('ytd-watch-flexy').removeAttribute('is-two-columns_')); await yt.waitForTimeout(600);
  ok(JSON.stringify(await order()) === JSON.stringify(['title', 'player', 'owner', 'actions', 'eyt-panel', 'related']), 'narrow window: the stacked order: ' + (await order()).join(','));
  ok(await yt.evaluate(() => document.querySelector('ytd-watch-flexy').classList.contains('eyt-stacked') && document.querySelector('.eyt-holder #bottom-row, .eyt-holder ytd-merch-shelf-renderer') !== null), 'hidden blocks parked out of sight');
  ok(await yt.evaluate(() => document.getElementById('ytd-player').isConnected && document.querySelector('#primary-inner > #player #movie_player') !== null), 'player node untouched');
  await yt.evaluate(() => document.querySelector('ytd-watch-flexy').setAttribute('is-two-columns_', '')); await yt.waitForTimeout(600);
  const back = await order();
  ok(back[0] === 'player' && back.includes('related') && !(await yt.evaluate(() => document.querySelector('ytd-watch-flexy').classList.contains('eyt-stacked'))), 'wide again: back to the two-column layout: ' + back.join(','));

  // ---- #6 theater mode
  await yt.evaluate(() => document.querySelector('ytd-watch-flexy').setAttribute('theater', '')); await yt.waitForTimeout(600);
  ok((await order())[0] === 'player', 'theater, "also in theater mode" off: two-column layout kept');
  await studio.click('#stackTheater'); await settle();
  await yt.waitForTimeout(600);
  ok(JSON.stringify(await order()) === JSON.stringify(['title', 'player', 'owner', 'actions', 'eyt-panel', 'related']), 'theater + switch on: stacked layout');
  ok(await yt.evaluate(() => getComputedStyle(document.querySelector('#secondary')).display === 'none'), 'theater + stacked: the empty sidebar column is gone (full width)');
  await yt.evaluate(() => { const p = document.createElement('ytd-playlist-panel-renderer'); p.textContent = 'Playlist'; document.querySelector('#secondary-inner').append(p); }); await yt.waitForTimeout(200);
  ok(await yt.evaluate(() => getComputedStyle(document.querySelector('#secondary')).display !== 'none'), '...but kept when it holds a playlist');
  await yt.evaluate(() => document.querySelector('ytd-watch-flexy').removeAttribute('theater')); await yt.waitForTimeout(600);
  ok((await order())[0] === 'player', 'leaving theater: two-column layout again');

  // ---- #5 studio: Pages view
  await studio.click('#pageSel [data-view=pages]');
  ok(await studio.isVisible('#pagesGrid') && (await studio.$$('#pagesGrid .pg-card')).length === 3, 'Pages view: Subscriptions, Search and Channel cards');
  ok(await studio.textContent('#pagesGrid .pg-card:first-child .val') === 'Auto', 'columns default to Auto (YouTube decides)');
  await studio.screenshot({ path: path.join(SHOTS, 'studio-pages.png'), fullPage: true });
  for (const [pg, sec] of [['subs', 'shorts'], ['subs', 'watched'], ['subs', 'upcoming'], ['subs', 'live'], ['search', 'shorts'], ['search', 'shelves'],
    ['search', 'channels'], ['search', 'playlists'], ['channel', 'banner'], ['channel', 'trailer'], ['channel', 'shorts']]) {
    await studio.click(`#pagesGrid button[data-page=${pg}][data-sec=${sec}]`);
  }
  await studio.$eval('#cols-subs', (r) => { r.value = 6; r.dispatchEvent(new Event('input', { bubbles: true })); });
  await studio.$eval('#cols-channel', (r) => { r.value = 3; r.dispatchEvent(new Event('input', { bubbles: true })); });
  await settle();
  s = await all();
  ok(s.pageLayouts.subs.cols === 6 && s.pageLayouts.channel.cols === 3 && s.pageLayouts.subs.hide.length === 4 && s.pageLayouts.search.hide.length === 4 && s.pageLayouts.channel.hide.length === 3, 'Pages edits saved');

  const shown = (p, cls) => p.$$eval(cls.map((c) => '.' + c).join(','), (els) => els.filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.className));
  const subs = watch(await ctx.newPage());
  await subs.goto('https://www.youtube.com/feed/subscriptions'); await subs.waitForTimeout(800);
  ok(JSON.stringify(await shown(subs, ['normal', 'watched', 'upcoming', 'live', 'short', 'shortshelf'])) === '["normal"]', 'subscriptions: shorts, watched, upcoming and live hidden, uploads stay');
  ok(await subs.$eval('#grid', (g) => getComputedStyle(g).getPropertyValue('--ytd-rich-grid-items-per-row').trim()) === '6', 'subscriptions: 6 columns');
  const search = watch(await ctx.newPage());
  await search.goto('https://www.youtube.com/results?search_query=x'); await search.waitForTimeout(800);
  ok(JSON.stringify(await shown(search, ['normal', 'short', 'reels', 'shelf', 'chan', 'pl', 'mix', 'vid'])) === '["normal","vid"]', 'search: shorts, shelves, channels, playlists and mixes hidden, videos stay: ' + (await shown(search, ['normal', 'short', 'reels', 'shelf', 'chan', 'pl', 'mix', 'vid'])).join(','));
  const chan = watch(await ctx.newPage());
  await chan.goto('https://www.youtube.com/@benchandlens'); await chan.waitForTimeout(800);
  ok(JSON.stringify(await shown(chan, ['banner', 'trailer', 'shortsec', 'normal'])) === '["normal"]', 'channel: banner, trailer and Shorts shelf hidden');
  ok(await chan.$eval('#grid', (g) => getComputedStyle(g).getPropertyValue('--ytd-rich-grid-items-per-row').trim()) === '3', 'channel: 3 columns');

  // back to defaults: nothing hidden, YouTube's own column count
  await studio.click('#reset'); await settle();
  await subs.waitForTimeout(500);
  ok((await shown(subs, ['normal', 'watched', 'upcoming', 'live', 'short', 'shortshelf'])).length === 6, 'Reset (Pages view): everything shows again');
  ok(await subs.$eval('#grid', (g) => getComputedStyle(g).getPropertyValue('--ytd-rich-grid-items-per-row').trim()) === '', 'Reset: column count left to YouTube');
  await done(ctx);
})();
