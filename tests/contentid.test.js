// Content ID warning: hovering a card asks YouTube's /next for that video and badges music it lists (song, artist,
// licensors), "none listed" otherwise; one request per video, and off when the setting is off.
const { launchExt, suite } = require('./lib');
const { ok, watch, done } = suite();
const card = (id, t) => `<ytd-rich-item-renderer id="c-${id}"><div id="content"><ytd-rich-grid-media>
  <a href="/watch?v=${id}"><div style="width:320px;height:180px;background:#456"></div></a>
  <h3><a id="video-title" href="/watch?v=${id}">${t}</a></h3></ytd-rich-grid-media></div></ytd-rich-item-renderer>`;
const HOME = `<!doctype html><html><head><meta charset="utf-8">
<script>window.ytcfg = { d: { INNERTUBE_CONTEXT: { client: { clientName: 'WEB', clientVersion: '2.2026' } }, INNERTUBE_API_KEY: 'k' }, get(k) { return this.d[k]; } };</script></head>
<body><div style="display:grid;grid-template-columns:repeat(3,320px);gap:16px">
${card('musicvid001', 'Gaming with a banger soundtrack')}${card('oldlayout01', 'Old music layout')}${card('cleanvid001', 'Restoring a film camera')}</div></body></html>`;
// the newer layout: one videoAttributeViewModel per song, and a "Licenses" info row
const MUSIC = { engagementPanels: [{ engagementPanelSectionListRenderer: { content: { structuredDescriptionContentRenderer: { items: [{ videoDescriptionMusicSectionRenderer: {
  sectionTitle: { simpleText: 'Music' },
  carouselLockups: [{ carouselLockupRenderer: { videoLockup: { videoAttributeViewModel: { title: { content: 'Blinding Lights' }, subtitle: { content: 'The Weeknd' } } },
    infoRows: [{ infoRowRenderer: { title: { simpleText: 'LICENSES' }, defaultMetadata: { runs: [{ text: 'UMG, Sony Music Publishing' }] } } }] } }] } }] } } } }] };
// the older layout: Song / Artist rows only
const OLD = { engagementPanels: [{ videoDescriptionMusicSectionRenderer: { carouselLockups: [{ carouselLockupRenderer: { infoRows: [
  { infoRowRenderer: { title: { simpleText: 'SONG' }, defaultMetadata: { simpleText: 'Levitating' } } },
  { infoRowRenderer: { title: { simpleText: 'ARTIST' }, defaultMetadata: { simpleText: 'Dua Lipa' } } }] } }] } }] };
(async () => {
  const { ctx } = await launchExt();
  const asked = [];
  await ctx.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (u.host !== 'www.youtube.com') return r.fulfill({ status: 404, body: '' });
    if (u.pathname === '/') return r.fulfill({ contentType: 'text/html', body: HOME });
    if (u.pathname === '/youtubei/v1/next') {
      const { videoId } = JSON.parse(r.request().postData());
      asked.push(videoId);
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify(videoId === 'musicvid001' ? MUSIC : videoId === 'oldlayout01' ? OLD : { contents: {} }) });
    }
    return r.fulfill({ status: 404, body: '' });
  });
  const p = watch(await ctx.newPage());
  await p.goto('https://www.youtube.com/');
  await p.waitForFunction(() => window.__eytContentIdParse);
  const hover = async (id) => { await p.hover(`#c-${id} a`); await p.waitForSelector(`#c-${id} .eyt-cid`, { timeout: 4000 }).catch(() => {}); };
  const badge = (id) => p.$eval(`#c-${id}`, (c) => { const b = c.querySelector('.eyt-cid'); return b ? { text: b.textContent, title: b.title, hit: b.classList.contains('hit') } : null; });

  await hover('musicvid001');
  const m = await badge('musicvid001');
  ok(m?.hit && m.text.includes('Blinding Lights – The Weeknd'), 'music listed: red badge names the song: ' + m?.text);
  ok(/Licensed by UMG, Sony Music Publishing/.test(m?.title || ''), 'licensors in the tooltip');
  await hover('oldlayout01');
  ok((await badge('oldlayout01'))?.text.includes('Levitating – Dua Lipa'), 'older Song / Artist rows are read too');
  await hover('cleanvid001');
  const c = await badge('cleanvid001');
  ok(c && !c.hit && /No Content ID music listed/.test(c.text), 'no music section: "none listed" badge');
  await p.mouse.move(0, 0); await hover('musicvid001');
  ok(asked.filter((x) => x === 'musicvid001').length === 1, 'one request per video (cached)');

  await p.evaluate(() => document.dispatchEvent(new CustomEvent('eliteyt:set', { detail: JSON.stringify({ contentId: false }) })));
  await p.waitForTimeout(700);
  ok(!(await p.$('.eyt-cid')), 'setting off: badges removed');
  await done(ctx);
})();
