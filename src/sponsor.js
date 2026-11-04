// MAIN world: SponsorBlock (skip segments + progress-bar markers), DeArrow (crowd titles/thumbnails) and
// Return YouTube Dislike. SponsorBlock/DeArrow are queried by a 4-char SHA-256 prefix of the video id, so those
// servers never learn which video is watched; RYD only accepts the full id.
(() => {
  'use strict';
  const API = 'https://sponsor.ajay.app/api';
  const THUMB = 'https://dearrow-thumb.ajay.app/api/v1/getThumbnail';
  const RYD = 'https://returnyoutubedislikeapi.com/votes?videoId=';
  const CATS = {
    sponsor: ['Sponsor', '#00d400', 'sbSponsor'], selfpromo: ['Self-promotion', '#ffff00', 'sbSelfpromo'],
    interaction: ['Interaction reminder', '#cc00ff', 'sbInteraction'], intro: ['Intro', '#00ffff', 'sbIntro'],
    outro: ['Outro', '#0202ed', 'sbOutro'], preview: ['Preview', '#008fd6', 'sbPreview'],
    filler: ['Filler', '#7300ff', 'sbFiller'], music_offtopic: ['Non-music', '#ff9900', 'sbMusic']
  };
  let s = {};
  try { s = JSON.parse(localStorage.getItem('eliteyt')) || {}; } catch {}
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pick = (list) => list?.find((x) => !x.original && (x.locked || x.votes >= 0));
  const clean = (t) => t.replace(/(^|\s)>(\S)/g, '$1$2'); // '>' marks words to leave uncapitalised

  // ---------------- lookups: in-memory promise cache + compact persistent cache ----------------
  // Persisted per video (not per prefix) and only the fields we use, so ~1500 entries stay ~200 KB.
  const TTL = { b: 24 * 3600e3, s: 2 * 3600e3 }; // branding changes slowly; segments get new submissions
  const STORE = 'eliteyt:cache', MAX = 1500;
  let disk = {};
  try { disk = JSON.parse(localStorage.getItem(STORE)) || {}; } catch {}
  let saveT = 0;
  const persist = (key, val) => {
    disk[key] = [Date.now(), val];
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      const keys = Object.keys(disk);
      if (keys.length > MAX) keys.sort((a, b) => disk[a][0] - disk[b][0]).slice(0, keys.length - MAX).forEach((k) => delete disk[k]);
      try { localStorage.setItem(STORE, JSON.stringify(disk)); } catch { disk = {}; localStorage.removeItem(STORE); }
    }, 2000);
  };

  const prefix = async (id) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id)))]
    .slice(0, 2).map((b) => b.toString(16).padStart(2, '0')).join('');
  const SB_Q = `?categories=${encodeURIComponent(JSON.stringify(Object.keys(CATS)))}&actionTypes=["skip"]`;
  const FETCH = {
    // segments → [[category, start, end, UUID], ...]
    s: async (id) => {
      const r = await fetch(`${API}/skipSegments/${await prefix(id)}${SB_Q}`);
      if (r.status === 404) return [];
      if (!r.ok) throw r.status;
      return ((await r.json()).find((v) => v.videoID === id)?.segments || [])
        .filter((g) => CATS[g.category]).map((g) => [g.category, g.segment[0], g.segment[1], g.UUID]);
    },
    // branding → { t: title | null, th: thumbnail timestamp | null }
    b: async (id) => {
      const r = await fetch(`${API}/branding/${await prefix(id)}`);
      if (r.status === 404) return { t: null, th: null };
      if (!r.ok) throw r.status;
      const d = (await r.json())[id];
      return { t: pick(d?.titles)?.title ?? null, th: pick(d?.thumbnails)?.timestamp ?? null };
    }
  };
  const mem = new Map();
  const lookup = (kind, id) => {
    const key = kind + id;
    if (mem.has(key)) return mem.get(key);
    const hit = disk[key];
    const p = hit && Date.now() - hit[0] < TTL[kind] ? Promise.resolve(hit[1])
      : FETCH[kind](id).then((v) => (persist(key, v), v)).catch(() => (mem.delete(key), null)); // errors aren't cached
    mem.set(key, p);
    if (mem.size > 3000) mem.delete(mem.keys().next().value);
    return p;
  };

  // ---------------- SponsorBlock ----------------
  const player = () => document.getElementById('movie_player');
  const video = () => document.querySelector('#movie_player video.html5-main-video');
  const idFrom = (href) => { try { const u = new URL(href, location.href); return u.pathname === '/watch' ? u.searchParams.get('v') : null; } catch { return null; } };
  let segs = [], forId = '', ignored = new Set(), selfSeek = false;
  const skipOn = (cat) => s.sponsorBlock && s[CATS[cat][2]];

  const toast = (text) => {
    const p = player(); if (!p) return;
    let el = p.querySelector('.eyt-toast');
    if (!el) { el = document.createElement('div'); el.className = 'eyt-toast'; p.append(el); }
    el.textContent = text; el.classList.add('on');
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 1200);
  };

  function drawMarkers() {
    const bar = document.querySelector('#movie_player .ytp-progress-bar');
    bar?.querySelector('.eyt-sb-bar')?.remove();
    const dur = video()?.duration;
    if (!bar || !s.sponsorBlock || !segs.length || !dur) return;
    const wrap = document.createElement('div');
    wrap.className = 'eyt-sb-bar';
    for (const [cat, a, b] of segs) {
      const m = document.createElement('div');
      m.style.left = (a / dur * 100) + '%';
      m.style.width = (Math.max(b - a, 0) / dur * 100) + '%';
      m.style.background = CATS[cat][1];
      m.title = CATS[cat][0];
      wrap.append(m);
    }
    bar.append(wrap);
  }

  async function loadSegments() {
    const id = player()?.getVideoData?.().video_id;
    if (!id || id === forId) return;
    forId = id; segs = []; ignored = new Set(); drawMarkers();
    if (!s.sponsorBlock) return;
    const list = await lookup('s', id);
    if (forId !== id) return;
    segs = list || [];
    drawMarkers();
  }

  const isMain = (e) => e.target instanceof HTMLVideoElement && e.target.matches('.html5-main-video');
  document.addEventListener('loadeddata', (e) => { if (isMain(e)) { loadSegments(); loadDislikes(); } }, true);
  document.addEventListener('durationchange', (e) => { if (isMain(e)) drawMarkers(); }, true);
  document.addEventListener('seeking', (e) => {
    if (!isMain(e)) return;
    if (selfSeek) { selfSeek = false; return; }
    const t = e.target.currentTime; // a manual seek into a segment means the viewer wants to watch it
    for (const [, a, b, uuid] of segs) if (t >= a && t < b) ignored.add(uuid);
  }, true);
  document.addEventListener('timeupdate', (e) => {
    if (!isMain(e) || !segs.length || !s.sponsorBlock) return;
    const v = e.target, t = v.currentTime;
    for (const [cat, a, b, uuid] of segs) {
      if (t < a || t >= b - 0.3 || ignored.has(uuid) || !skipOn(cat)) continue;
      selfSeek = true;
      v.currentTime = Math.min(b, v.duration || b);
      toast('Skipped ' + CATS[cat][0].toLowerCase());
      fetch(`${API}/viewedVideoSponsorTime?UUID=${uuid}`, { method: 'POST' }).catch(() => {}); // credits the submitter
      break;
    }
  }, true);

  // Warm the cache before playback: on click/navigation start, and after a short hover over any video link.
  const warm = (id) => { if (!id) return; if (s.sponsorBlock) lookup('s', id); if (s.deArrow) lookup('b', id); };
  document.addEventListener('yt-navigate-start', (e) => {
    warm(idFrom(e.detail?.url || ''));
    // the watch title belongs to the video being left: show YouTube's own until the new one is looked up
    const h1 = document.querySelector('ytd-watch-flexy #title h1 yt-formatted-string');
    if (h1) setTitle(h1, '', null);
  });
  let hoverT = 0;
  document.addEventListener('pointerover', (e) => {
    const a = e.target.closest?.('a[href*="/watch?v="]');
    clearTimeout(hoverT);
    if (a) hoverT = setTimeout(() => warm(idFrom(a.href)), 150);
  }, { passive: true });

  // ---------------- DeArrow ----------------
  const CARD = '.eyt-card, yt-lockup-view-model, ytd-rich-grid-media, ytd-compact-video-renderer, ytd-video-renderer, ytd-grid-video-renderer';
  const CARD_TITLE = '.ytLockupMetadataViewModelTitle span, #video-title, .eyt-card-title';
  const CARD_IMG = ':is(.ytLockupViewModelContentImage, yt-thumbnail-view-model, ytd-thumbnail, .eyt-card-thumb) img';
  const vidOf = (root) => idFrom(root.querySelector('a[href*="/watch?v="]')?.href || '');

  // Never rewrite YouTube's own title node: it then stops updating on navigation and keeps showing the old
  // video's title. Hide it and show ours beside it instead (text = null puts the original back).
  function setTitle(el, id, text) {
    if (!el) return;
    if (el.classList.contains('eyt-card-title')) { if (text) el.textContent = text; return; } // our own shelf cards
    let alt = el.nextElementSibling?.classList.contains('eyt-da-title') ? el.nextElementSibling : null;
    if (!text) { alt?.remove(); el.classList.remove('eyt-da-hide'); return; }
    if (!alt) { alt = document.createElement('span'); alt.className = 'eyt-da-title'; el.after(alt); }
    alt.dataset.eytId = id; alt.textContent = text; alt.title = 'Original: ' + el.textContent;
    el.classList.add('eyt-da-hide');
  }

  // YouTube lazy-loads thumbnails and overwrites src later; watch only the imgs we replaced and put ours back.
  const imgWatch = new MutationObserver((ms) => {
    for (const { target: img } of ms) if (img.dataset.eytBlob && img.src !== img.dataset.eytBlob) { img.removeAttribute('srcset'); img.src = img.dataset.eytBlob; }
  });
  const blobs = new Map(); // id@time → blob: URL, so recycled cards don't refetch
  function setThumb(img, id, time) {
    if (!img || time == null || !s.daThumbs || img.dataset.eytId === id) return;
    img.dataset.eytId = id; delete img.dataset.eytBlob;
    const key = id + '@' + time;
    // YouTube's thumbnail <img> refuses cross-origin URLs, so hand it a same-origin blob: URL instead.
    // The thumb server answers 204 until it has rendered the frame; keep the original then.
    const url = blobs.get(key) || fetch(`${THUMB}?videoID=${id}&time=${time}`)
      .then((r) => (r.status === 200 ? r.blob() : null)).then((b) => b && URL.createObjectURL(b)).catch(() => null);
    blobs.set(key, url);
    Promise.resolve(url).then((u) => {
      if (!u || img.dataset.eytId !== id) return;
      img.removeAttribute('srcset');
      img.src = img.dataset.eytBlob = u;
      imgWatch.observe(img, { attributes: true, attributeFilter: ['src'] });
    });
  }

  // Calm mode: where DeArrow has no thumbnail, show a frame YouTube auto-generates from the video itself
  // (hq2 = middle of the video; its letterbox bars are cropped by the 16:9 box) instead of the creator's artwork.
  function setFrame(img, id) {
    if (!img || img.dataset.eytId === id) return;
    img.dataset.eytId = id;
    img.removeAttribute('srcset');
    img.src = img.dataset.eytBlob = `https://i.ytimg.com/vi/${id}/hq2.jpg`;
    img.style.objectFit = 'cover';
    imgWatch.observe(img, { attributes: true, attributeFilter: ['src'] });
  }
  // live = the LIVE badge on the thumbnail itself, or a "watching" count (not just "LIVE" somewhere in the title)
  const isLive = (card) => /\bLIVE\b/.test(card.querySelector('.ytLockupViewModelContentImage, yt-thumbnail-view-model, ytd-thumbnail')?.innerText || '')
    || /\d\s*watching/.test(card.innerText);
  async function brand(card) {
    const id = vidOf(card);
    if (!id || card.dataset.eytDa === id) return;
    card.dataset.eytDa = id;
    setTitle(card.querySelector(CARD_TITLE), id, null); // recycled card: drop the previous video's title now
    const b = s.deArrow ? await lookup('b', id) : null;
    if (vidOf(card) !== id) return;
    if (s.deArrow) setTitle(card.querySelector(CARD_TITLE), id, b?.t && clean(b.t));
    if (s.daThumbs && b?.th != null) setThumb(card.querySelector(CARD_IMG), id, b.th);
    // live streams have no auto-generated frames (YouTube serves a grey placeholder), so they keep their thumbnail
    else if (s.calmThumbs && !isLive(card)) setFrame(card.querySelector(CARD_IMG), id);
  }

  // Only cards near the viewport are looked up; the rest wait until scrolled to.
  const seen = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting && (s.deArrow || s.calmThumbs)) brand(e.target); }, { rootMargin: '600px 0px' });
  const track = (n) => {
    if (n.nodeType !== 1) return;
    if (n.matches(CARD)) seen.observe(n);
    for (const c of n.querySelectorAll(CARD)) seen.observe(c);
  };
  // Watch only for added cards and links that get re-pointed (YouTube recycles cards), not the whole page state.
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'childList') m.addedNodes.forEach(track);
      else if (s.deArrow || s.calmThumbs) { const c = m.target.closest(CARD); if (c && c.dataset.eytDa && vidOf(c) !== c.dataset.eytDa) brand(c); }
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });

  async function watchTitle() {
    const id = idFrom(location.href);
    if (!id || !s.deArrow) return;
    const t = (await lookup('b', id))?.t;
    for (const wait of [0, 1000, 3000]) { // the title is stamped late after navigation
      await sleep(wait);
      if (idFrom(location.href) !== id) return;
      setTitle(document.querySelector('ytd-watch-flexy #title h1 yt-formatted-string'), id, t ? clean(t) : null);
    }
  }
  function restore() {
    document.querySelectorAll('.eyt-da-title').forEach((el) => el.remove());
    document.querySelectorAll('.eyt-da-hide').forEach((el) => el.classList.remove('eyt-da-hide'));
    for (const el of document.querySelectorAll('[data-eyt-da]')) delete el.dataset.eytDa;
  }
  const scanAll = () => { if (s.deArrow || s.calmThumbs) document.querySelectorAll(CARD).forEach((c) => seen.observe(c)); watchTitle(); };

  // ---------------- Return YouTube Dislike ----------------
  const fmt = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  let rydFor = '';
  async function loadDislikes() {
    const id = idFrom(location.href);
    if (!s.ryd || !id) return;
    if (rydFor !== id) { rydFor = id; document.querySelectorAll('.eyt-dislikes').forEach((e) => e.remove()); }
    let d;
    try { d = await (await fetch(RYD + id)).json(); } catch { return; }
    for (const wait of [0, 1000, 3000]) { // the like/dislike buttons are re-rendered after navigation
      await sleep(wait);
      if (rydFor !== id) return;
      const btn = document.querySelector('ytd-watch-flexy #actions dislike-button-view-model button, ytd-watch-flexy #actions #segmented-dislike-button button');
      if (!btn) continue;
      let el = btn.querySelector('.eyt-dislikes');
      if (!el) { el = document.createElement('span'); el.className = 'eyt-dislikes'; btn.append(el); }
      el.textContent = fmt.format(d.dislikes);
      btn.title = `${d.likes.toLocaleString()} likes · ${d.dislikes.toLocaleString()} dislikes (Return YouTube Dislike estimate)`;
    }
  }

  document.addEventListener('eliteyt:settings', (e) => {
    const was = s.deArrow;
    s = JSON.parse(e.detail);
    if (was && !s.deArrow) restore();
    if (!s.ryd) document.querySelectorAll('.eyt-dislikes').forEach((x) => x.remove());
    forId = ''; rydFor = ''; loadSegments(); loadDislikes(); scanAll();
  });
  document.addEventListener('yt-navigate-finish', () => { loadSegments(); loadDislikes(); scanAll(); });
})();
