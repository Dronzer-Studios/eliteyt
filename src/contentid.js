// MAIN world: Content ID warning before you click. When YouTube's Content ID matches music in a video, the watch
// page lists it in a "Music" section (song, artist, "Licensed to YouTube by …"). Feed cards don't carry that, so on
// hover we ask YouTube's own /next endpoint (the request the watch page makes) for that one video and badge the card.
// No list = YouTube shows no matched music; that's not a guarantee there's no claim, so the clear badge says "listed".
// YouTube takes ~0.6 s to answer, so the cards on screen are looked up ahead of the hover (a few at a time, at
// most 3 in flight): hovering a looked-up card badges it at once. The same response carries YouTube's "Made with
// AI" label, which feed cards don't show either: labelled videos are handed to slop.js.
(() => {
  'use strict';
  let s = {};
  try { s = JSON.parse(localStorage.getItem('eliteyt')) || {}; } catch {}
  const on = () => s.contentId !== false, aiOn = () => s.aiFilter !== false;

  const CARD = 'yt-lockup-view-model, ytd-rich-grid-media, ytd-compact-video-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, .eyt-card';
  const outer = (card) => card.closest('ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer') || card;
  const idOf = (card) => {
    const a = card.querySelector('a[href*="/watch?v="], a[href^="/shorts/"]');
    const m = a && /(?:[?&]v=|\/shorts\/)([\w-]{11})/.exec(a.getAttribute('href'));
    return m ? m[1] : '';
  };

  const text = (o) => o == null ? '' : typeof o === 'string' ? o : o.simpleText || o.content || (o.runs || []).map((r) => r.text).join('') || '';
  // every object under `key`, anywhere in the response
  function find(node, key, out = []) {
    if (!node || typeof node !== 'object') return out;
    if (node[key]) out.push(node[key]);
    for (const v of Object.values(node)) if (v && typeof v === 'object') find(v, key, out);
    return out;
  }
  // { songs: ['Song – Artist'], licensors: ['UMG', …] } or null when YouTube lists no music
  function parse(next) {
    const songs = [], licensors = new Set();
    const add = (v) => { // title = song, subtitle = artist
      const t = text(v.title), sub = text(v.subtitle), x = sub ? `${t} – ${sub}` : t;
      if (t && !songs.includes(x)) songs.push(x);
    };
    // current layout: a card list in the description, one card per song
    for (const l of find(next, 'horizontalCardListRenderer')) for (const c of l.cards || []) if (c.videoAttributeViewModel) add(c.videoAttributeViewModel);
    const sections = find(next, 'videoDescriptionMusicSectionRenderer');
    if (!songs.length && !sections.length) return null;
    for (const sec of sections) {
      // previous layout: the same cards inside a music section
      for (const v of find(sec, 'videoAttributeViewModel')) add(v);
      // older layout and the license line: rows of "Song" / "Artist" / "Licenses"
      let song = '', artist = '';
      for (const r of find(sec, 'infoRowRenderer')) {
        const k = text(r.title).toLowerCase(), v = text(r.defaultMetadata) || text(r.expandedMetadata);
        if (!v) continue;
        if (/^licen[sc]e/.test(k)) v.split(/[;,]\s*/).forEach((x) => x.trim() && licensors.add(x.trim()));
        else if (k === 'song') song = v;
        else if (k === 'artist') artist = v;
      }
      if (song && !songs.some((x) => x.startsWith(song))) songs.push(artist ? `${song} – ${artist}` : song);
    }
    return { songs: songs.length ? songs : ['Music'], licensors: [...licensors] };
  }
  // YouTube's "How this was made" section also carries non-AI notes (auto-dubbing, camera capture): only the
  // altered-or-generated one counts. Its help link is the same in every language; the wording is the fallback.
  const AI_NOTE = /answer\/15447836|altered or synthetic content|altered or fully generated/i;
  const madeWithAi = (next) => find(next, 'howThisWasMadeSectionViewModel').some((h) => AI_NOTE.test(JSON.stringify(h)));

  const cache = new Map(); // videoId -> Promise<{ music: result | null, ai: boolean } | undefined>  (undefined = couldn't check)
  let fails = 0; // requests failed in a row: the background lookups stop rather than hammer a YouTube that says no
  function check(id) {
    if (cache.has(id)) return cache.get(id);
    const cfg = window.ytcfg;
    const ctx = cfg?.get?.('INNERTUBE_CONTEXT'), key = cfg?.get?.('INNERTUBE_API_KEY');
    const p = !ctx ? Promise.resolve(undefined)
      : fetch(`/youtubei/v1/next?prettyPrint=false${key ? '&key=' + key : ''}`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: ctx, videoId: id })
      }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((j) => {
        fails = 0;
        const ai = madeWithAi(j);
        if (ai) document.dispatchEvent(new CustomEvent('eliteyt:ai', { detail: id }));
        return { music: parse(j), ai };
      }).catch(() => { fails++; cache.delete(id); return undefined; });
    cache.set(id, p);
    return p;
  }

  function badge(card, id, info) {
    const o = outer(card);
    o.querySelector(':scope .eyt-cid')?.remove();
    if (info === undefined || idOf(card) !== id) return; // failed, or YouTube recycled the card for another video
    const r = info.music;
    const b = document.createElement('div');
    b.className = 'eyt-cid' + (r ? ' hit' : '');
    b.dataset.video = id;
    b.textContent = r ? `♪ Content ID: ${r.songs[0]}${r.songs.length > 1 ? ` +${r.songs.length - 1}` : ''}` : '✓ No Content ID music listed';
    b.title = r ? [...r.songs, r.licensors.length ? 'Licensed by ' + r.licensors.join(', ') : ''].filter(Boolean).join('\n')
      : 'YouTube lists no matched music for this video. That is not a guarantee: other claims (video, non-music audio) don\'t show here.';
    o.classList.add('eyt-cid-host');
    o.append(b);
  }

  let timer = 0, hovered = null;
  document.addEventListener('pointerover', (e) => {
    if (!on()) return;
    const card = e.target.closest?.(CARD);
    if (!card || card === hovered) return;
    hovered = card;
    clearTimeout(timer);
    const id = idOf(card);
    if (!id || outer(card).querySelector(`:scope .eyt-cid[data-video="${id}"]`)) return;
    // already looked up: badge now. Otherwise a short pause so sweeping the mouse across the grid doesn't fire a request per card
    timer = setTimeout(() => check(id).then((r) => badge(card, id, r)), cache.has(id) ? 0 : 120);
  }, { passive: true });
  document.addEventListener('pointerout', (e) => {
    if (hovered && !hovered.contains(e.relatedTarget)) { hovered = null; clearTimeout(timer); }
  }, { passive: true });

  // look up the cards on screen (and just below it) before they're hovered
  let inFlight = 0;
  setInterval(() => {
    if (!(on() || aiOn()) || document.hidden || fails >= 3) return;
    for (const card of document.querySelectorAll(CARD)) {
      if (inFlight >= 3) return;
      const id = idOf(card);
      if (!id || cache.has(id)) continue;
      const r = card.getBoundingClientRect();
      if (!r.height || r.bottom < 0 || r.top > innerHeight * 1.5) continue;
      inFlight++;
      check(id).finally(() => inFlight--);
    }
  }, 400);

  document.addEventListener('eliteyt:settings', (e) => {
    try { s = JSON.parse(e.detail); } catch {}
    if (!on()) for (const b of document.querySelectorAll('.eyt-cid')) b.remove();
  });
  window.__eytContentIdParse = parse; // for tests
  window.__eytMadeWithAi = madeWithAi;
})();
