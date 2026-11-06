// MAIN world: Netflix-style shelves on the YouTube home page.
//   Continue watching  – EliteYT's own local watch history (positions saved while you watch)
//   From your subscriptions – parsed from /feed/subscriptions (signed-in only; hidden otherwise)
//   Recommended for you – heading over YouTube's own feed, which stays below untouched
(() => {
  'use strict';
  let s = {};
  try { s = JSON.parse(localStorage.getItem('eliteyt')) || {}; } catch {}
  const HIST = 'eliteyt:history', MAX = 60;
  const readHist = () => { try { return JSON.parse(localStorage.getItem(HIST)) || []; } catch { return []; } };
  const writeHist = (h) => { try { localStorage.setItem(HIST, JSON.stringify(h.slice(0, MAX))); } catch {} };

  // ---------------- history: remember where each video was left ----------------
  let lastSave = 0;
  document.addEventListener('timeupdate', (e) => {
    const v = e.target;
    if (!(v instanceof HTMLVideoElement) || !v.matches('.html5-main-video') || !s.homeShelves) return;
    const now = Date.now();
    if (now - lastSave < 5000 || !v.duration || v.duration < 60) return; // shorts/clips aren't worth resuming
    const p = document.getElementById('movie_player');
    if (!p || p.classList.contains('ad-showing')) return;
    const d = p.getVideoData?.();
    if (!d?.video_id) return;
    lastSave = now;
    const h = readHist().filter((x) => x.id !== d.video_id);
    const cid = p.getPlayerResponse?.()?.videoDetails?.channelId;
    h.unshift({ id: d.video_id, title: d.title, ch: d.author, cid, t: Math.floor(v.currentTime), dur: Math.floor(v.duration), at: now });
    writeHist(h);
  }, true);

  // ✕ on a Continue watching card: remembered so YouTube-history entries don't come back
  const DIS = 'eliteyt:dismissed';
  const dismissed = () => { try { return JSON.parse(localStorage.getItem(DIS)) || []; } catch { return []; } };
  const dismiss = (id) => { try { localStorage.setItem(DIS, JSON.stringify([id, ...dismissed()].slice(0, 200))); } catch {} };

  // ---------------- YouTube feeds: parse a page's ytInitialData ----------------
  // YouTube serves two card formats (new lockupViewModel, older videoRenderer); read both.
  const txt = (t) => t?.content ?? t?.simpleText ?? t?.runs?.map((r) => r.text).join('') ?? '';
  function extract(data, max) {
    const out = [], seenIds = new Set();
    const add = (v) => { if (v.id && !seenIds.has(v.id) && out.length < max) { seenIds.add(v.id); out.push(v); } };
    const walk = (o) => {
      if (!o || typeof o !== 'object' || out.length >= max) return;
      const l = o.lockupViewModel;
      if (l?.contentId && /VIDEO/.test(l.contentType || '')) {
        const md = l.metadata?.lockupMetadataViewModel;
        const rows = md?.metadata?.contentMetadataViewModel?.metadataRows || [];
        const img = JSON.stringify(l.contentImage || {});
        add({ id: l.contentId, title: txt(md?.title), ch: txt(rows[0]?.metadataParts?.[0]?.text),
          meta: (rows[1]?.metadataParts || []).map((x) => txt(x.text)).filter(Boolean).join(' · '),
          badge: img.match(/"thumbnailBadgeViewModel":\{"text":"([^"]+)"/)?.[1], pct: +(img.match(/"startPercent":(\d+)/)?.[1] || 0),
          cid: JSON.stringify(md?.metadata || {}).match(/"browseId":"(UC[\w-]+)"/)?.[1],
          av: JSON.stringify(md?.image || {}).match(/"url":"(https:[^"]+)"/)?.[1] });
        return;
      }
      const r = o.videoRenderer || o.gridVideoRenderer || o.compactVideoRenderer;
      if (r?.videoId) {
        const ov = JSON.stringify(r.thumbnailOverlays || []);
        add({ id: r.videoId, title: txt(r.title), ch: txt(r.ownerText || r.shortBylineText || r.longBylineText),
          meta: [txt(r.viewCountText || r.shortViewCountText), txt(r.publishedTimeText)].filter(Boolean).join(' · '),
          badge: txt(r.lengthText) || undefined, pct: +(ov.match(/"percentDurationWatched":(\d+)/)?.[1] || 0),
          cid: (r.ownerText || r.shortBylineText)?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId,
          av: r.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.[0]?.url });
        return;
      }
      for (const k in o) walk(o[k]);
    };
    walk(data);
    return out;
  }
  const feeds = new Map(); // path -> [time, Promise<items>]
  function feed(path, max) {
    const hit = feeds.get(path);
    if (hit && Date.now() - hit[0] < 10 * 60e3) return hit[1];
    const p = fetch(path, { credentials: 'include' }).then((r) => r.text()).then((html) => {
      const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
      return m ? extract(JSON.parse(m[1]), max) : [];
    }).catch(() => []);
    feeds.set(path, [Date.now(), p]);
    return p;
  }
  const secs = (badge) => (badge || '').split(':').reduce((a, n) => a * 60 + (+n || 0), 0);

  // ---------------- rendering ----------------
  const h = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'style') e.style.cssText = v;
      else e.setAttribute(k, v);
    }
    e.append(...kids.flat().filter((x) => x != null && x !== false));
    return e;
  };
  // "New": uploaded in the last 48 h (read from YouTube's "21 hours ago" / "2d ago" text) and not watched yet
  const UNIT = { s: 1, m: 60, h: 3600, d: 86400, w: 604800, mo: 2592000, y: 31536000 };
  const ageSecs = (text) => {
    const m = /(\d+)\s*(second|minute|hour|day|week|month|year|mo|s|m|h|d|w|y)s?\b[^·•]*ago/i.exec(text || '');
    if (!m) return Infinity;
    const u = m[2].toLowerCase(), key = u === 'mo' || u === 'month' ? 'mo' : u[0];
    return +m[1] * UNIT[key];
  };
  let watchedIds = new Set();
  const isNew = (v, meta) => !watchedIds.has(v.id) && ageSecs(meta ?? v.meta) < 48 * 3600;
  const fmtTime = (t) => { const m = Math.floor(t / 60), sec = String(t % 60).padStart(2, '0'); return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${sec}` : `${m}:${sec}`; };
  const ago = (ms) => { const m = Math.round((Date.now() - ms) / 60e3); return m < 60 ? `${m || 1}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };

  // Navigate inside YouTube's single-page app (a plain link would reload the whole page).
  function go(e, id, t) {
    if (e.button || e.ctrlKey || e.metaKey || e.shiftKey) return; // let new-tab clicks through
    e.preventDefault();
    const url = `/watch?v=${id}${t ? `&t=${t}s` : ''}`;
    const app = document.querySelector('ytd-app');
    if (!app) { location.href = url; return; }
    app.dispatchEvent(new CustomEvent('yt-navigate', { bubbles: true, composed: true, detail: { endpoint: {
      commandMetadata: { webCommandMetadata: { url, webPageType: 'WEB_PAGE_TYPE_WATCH', rootVe: 3832 } },
      watchEndpoint: { videoId: id, ...(t ? { startTimeSeconds: t } : {}) } } } }));
  }

  // Tile: one link, picture with the title over it (Netflix style). Class names are what DeArrow looks for.
  const card = (v, opts = {}) => {
    const href = `/watch?v=${v.id}${opts.t ? `&t=${opts.t}s` : ''}`;
    return h('div', { class: 'eyt-card' },
      h('a', { class: 'eyt-card-thumb', href, title: v.title, onclick: (e) => go(e, v.id, opts.t) },
        h('img', { src: `https://i.ytimg.com/vi/${v.id}/${s.calmThumbs && !/LIVE|watching/.test(`${opts.badge || ''} ${opts.meta || ''}`) ? 'hq2' : 'mqdefault'}.jpg`, alt: '', loading: 'lazy' }),
        opts.badge && h('span', { class: 'eyt-card-badge' }, opts.badge),
        opts.progress != null && h('span', { class: 'eyt-card-bar' }, h('span', { style: `width:${Math.min(100, opts.progress * 100)}%` }))),
      opts.onRemove && h('button', { class: 'eyt-card-x', type: 'button', title: 'Remove from Continue watching', onclick: opts.onRemove }, '✕'),
      // title under the picture: over it, it fights with the text most thumbnails already carry
      h('div', { class: 'eyt-card-info' },
        v.av && h('img', { class: 'eyt-card-av', src: v.av, alt: '', loading: 'lazy' }),
        h('a', { class: 'eyt-card-text', href, onclick: (e) => go(e, v.id, opts.t) },
          h('span', { class: 'eyt-card-title' }, v.title),
          h('span', { class: 'eyt-card-meta' }, [v.ch, opts.meta].filter(Boolean).join(' • ')),
          !opts.t && isNew(v, opts.meta) && h('span', { class: 'eyt-new' }, 'New'))));
  };

  const shelf = (title, cards) => {
    const row = h('div', { class: 'eyt-row' }, cards);
    const scroll = (dir) => row.scrollBy({ left: dir * row.clientWidth * 0.9, behavior: 'smooth' });
    return h('section', { class: 'eyt-shelf' }, h('h2', {}, title),
      h('div', { class: 'eyt-rowwrap' },
        h('button', { class: 'eyt-arrow eyt-arrow-l', type: 'button', 'aria-label': 'Scroll left', onclick: () => scroll(-1) }, '‹'),
        row,
        h('button', { class: 'eyt-arrow eyt-arrow-r', type: 'button', 'aria-label': 'Scroll right', onclick: () => scroll(1) }, '›')));
  };

  // Hero carousel: slide 1 = the last video watched, then the newest upload from recently watched channels.
  const slide = (v, opts) => {
    // calm mode: a frame from the video (maxres2) instead of the creator's artwork
    const live = /LIVE|watching/.test(`${v.badge || ''} ${v.meta || ''} ${opts.meta || ''}`); // live: no frames exist
    const [big, small] = s.calmThumbs && !live ? ['maxres2', 'hq2'] : ['maxresdefault', 'hqdefault'];
    const img = h('img', { class: 'eyt-hero-bg', alt: '', src: `https://i.ytimg.com/vi/${v.id}/${big}.jpg` });
    const low = () => { if (!img.src.includes(small)) img.src = `https://i.ytimg.com/vi/${v.id}/${small}.jpg`; };
    img.addEventListener('load', () => { if (img.naturalWidth <= 120) low(); }); // no HD version: YouTube serves a tiny placeholder
    img.addEventListener('error', low);
    const href = `/watch?v=${v.id}${opts.t ? `&t=${opts.t}s` : ''}`;
    return h('div', { class: 'eyt-slide eyt-card' }, img,
      h('div', { class: 'eyt-hero-body' },
        h('div', { class: 'eyt-hero-label' }, opts.label),
        h('h1', { class: 'eyt-card-title' }, v.title),
        h('div', { class: 'eyt-hero-meta' }, [v.ch, opts.meta].filter(Boolean).join(' · '),
          !opts.t && isNew(v, opts.meta) && h('span', { class: 'eyt-new eyt-new-hero' }, 'New')),
        opts.progress != null && h('div', { class: 'eyt-hero-bar' }, h('span', { style: `width:${Math.min(100, opts.progress * 100)}%` })),
        h('div', { class: 'eyt-hero-btns' },
          h('a', { class: 'eyt-btn eyt-btn-play', href, onclick: (e) => go(e, v.id, opts.t) }, icon('M8 5v14l11-7z'), opts.btn || (opts.t ? 'Resume' : 'Play')))));
  };
  const hero = (slides) => {
    const els = slides.map(([v, o]) => slide(v, o));
    let i = 0, paused = false;
    const dots = h('div', { class: 'eyt-dots' }, els.map((_, n) => h('button', { type: 'button', 'aria-label': `Slide ${n + 1}`, onclick: () => show(n) })));
    const show = (n) => {
      i = (n + els.length) % els.length;
      els.forEach((e, k) => e.classList.toggle('on', k === i));
      [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
    };
    const box = h('section', { class: 'eyt-hero', onmouseenter: () => { paused = true; }, onmouseleave: () => { paused = false; } }, els, els.length > 1 && dots);
    show(0);
    if (els.length > 1) {
      const timer = setInterval(() => {
        if (!box.isConnected) return clearInterval(timer);
        if (!paused && !document.hidden) show(i + 1);
      }, 7000);
    }
    return box;
  };

  // home sections from the layout studio; anything unknown or missing falls back to the default order
  const HOME_IDS = ['hero', 'continue', 'subs', 'recommended'];
  const homeLayout = () => {
    const L = s.homeLayout, all = [...(L?.shown || []), ...(L?.hidden || [])];
    return Array.isArray(L?.shown) && HOME_IDS.every((id) => all.includes(id)) ? L : { shown: HOME_IDS, hidden: [] };
  };
  // "Recommended" hidden in the studio: hide YouTube's own feed under the shelves
  const applyHomeClasses = () => document.documentElement.classList.toggle('eyt-home-norec', !!s.homeShelves && !homeLayout().shown.includes('recommended'));

  let building = false, nav = 0;
  async function render(force) {
    const grid = document.querySelector('ytd-browse[page-subtype="home"] ytd-rich-grid-renderer');
    const contents = grid?.querySelector(':scope > #contents');
    document.querySelectorAll('.eyt-shelves').forEach((x) => { if (!s.homeShelves || x.parentNode !== grid) x.remove(); });
    if (!s.homeShelves || !contents || location.pathname !== '/' || building) return;
    const old = grid.querySelector(':scope > .eyt-shelves');
    if (!force && old?.dataset.nav === String(nav)) return; // already built for this visit
    building = true;
    try {
      const local = readHist();
      // every source is requested at once; each is cached for 10 minutes
      const L = homeLayout(), on = (id) => L.shown.includes(id);
      const [hist, sub] = await Promise.all([feed('/feed/history', 60), on('subs') ? feed('/feed/subscriptions', 24) : []]);
      watchedIds = new Set([...local.map((x) => x.id), ...hist.map((x) => x.id)]);

      // Local positions first (exact second), then half-watched videos from YouTube's own history (signed in).
      const cont = local.filter((x) => x.t > 30 && x.t < x.dur * 0.95);
      const have = new Set([...local.map((x) => x.id), ...dismissed()]);
      for (const v of hist) {
        const dur = secs(v.badge);
        if (have.has(v.id) || !dur || v.pct < 3 || v.pct > 95) continue;
        have.add(v.id);
        cont.push({ id: v.id, title: v.title, ch: v.ch, t: Math.floor(dur * v.pct / 100), dur });
      }
      const resume = (v) => ({ t: v.t, progress: v.t / v.dur, badge: `${fmtTime(v.dur - v.t)} left`, meta: v.at ? ago(v.at) : '' });

      const parts = {};
      // slide 1: the last video watched (resume it if unfinished)
      const watched = [...local, ...hist.filter((v) => !local.some((x) => x.id === v.id))];
      const lastV = watched[0], slides = [];
      if (lastV) {
        const c = cont.find((x) => x.id === lastV.id);
        slides.push([lastV, c ? { ...resume(c), label: 'Continue watching' } : { label: 'Last watched', btn: 'Watch again' }]);
      }
      // slides 2-4: newest upload from up to three other recently watched channels (fetched in parallel)
      const chans = [];
      for (const v of on('hero') ? watched : []) {
        const key = v.cid || v.ch;
        if (!key || key === (lastV?.cid || lastV?.ch) || v.ch === lastV?.ch || chans.some((c) => (c.cid || c.ch) === key)) continue;
        chans.push(v);
        if (chans.length === 3) break;
      }
      // channel page: from the saved channel id, else ask YouTube's oEmbed (same origin) who uploaded the video
      const chanOf = async (v) => {
        if (v.cid) return { url: `/channel/${v.cid}`, name: v.ch };
        try {
          const j = await (await fetch(`/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + v.id)}`)).json();
          return { url: new URL(j.author_url).pathname, name: j.author_name };
        } catch { return null; }
      };
      const newest = await Promise.all(chans.map(async (c) => {
        const ch = await chanOf(c);
        return ch && [(await feed(`${ch.url}/videos`, 1))[0], ch.name || c.ch];
      }));
      for (const r of newest) {
        if (!r?.[0]) continue;
        const [v, name] = r;
        slides.push([{ ...v, ch: name, meta: undefined }, { label: `New from ${name}`, meta: [v.ch, v.meta].filter(Boolean).join(' · ') }]);
      }
      if (on('hero') && !slides.length) { const pick = (await feed('/', 1))[0]; if (pick) slides.push([pick, { label: 'Top pick for you', meta: pick.meta }]); }
      if (slides.length) parts.hero = hero(slides);
      if (cont.length) parts.continue = shelf('Continue watching', cont.slice(0, 20).map((v) => card(v, {
        ...resume(v), onRemove: (e) => { e.preventDefault(); e.stopPropagation(); writeHist(readHist().filter((x) => x.id !== v.id)); dismiss(v.id); render(true); }
      })));
      if (sub.length) parts.subs = shelf('From your subscriptions', sub.map((v) => card(v, { badge: v.badge, meta: v.meta })));
      // sections in the order the layout studio saved; hidden ones are left out
      const shown = L.shown.filter((id) => id !== 'recommended').map((id) => parts[id]).filter(Boolean);
      if (on('recommended') && shown.length) shown.push(h('h2', { class: 'eyt-rec-head' }, 'Recommended for you'));

      const box = old || h('div', { class: 'eyt-shelves' });
      box.replaceChildren(...shown);
      box.dataset.nav = nav;
      if (box.nextElementSibling !== contents) contents.before(box);
    } finally { building = false; }
  }

  // ---------------- top bar: EliteYT logo, Home / Subscriptions / You next to the avatar ----------------
  const SVG = 'http://www.w3.org/2000/svg';
  const icon = (d) => { const s2 = document.createElementNS(SVG, 'svg'); s2.setAttribute('viewBox', '0 0 24 24');
    const p2 = document.createElementNS(SVG, 'path'); p2.setAttribute('d', d); s2.append(p2); return s2; };
  const NAV = [
    // [label, url, browseId, outline icon, filled icon] — outline normally, filled on the current page, as YouTube does
    ['Home', '/', 'FEwhat_to_watch', 'M12 4.44l7 6.09V20h-4v-5H9v5H5v-9.47l7-6.09m0-1.32l-8 6.96V21h6v-5h4v5h6V10.08l-8-6.96z', 'M4 21V10.08l8-6.96 8 6.96V21h-6v-6h-4v6H4z'],
    ['Subscriptions', '/feed/subscriptions', 'FEsubscriptions', 'M10 18v-6l5 3-5 3zm7-15H7v1h10V3zm3 3H4v1h16V6zm2 3H2v12h20V9zM3 10h18v10H3V10z', 'M20 8H4V6h16v2zm-2-6H6v2h12V2zm4 10v8c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2v-8c0-1.1.9-2 2-2h16c1.1 0 2 .9 2 2zm-6 4-6-3.27v6.53L16 16z'],
    // the left guide is gone, so "You" (history, playlists, Watch later, liked) needs a way in
    ['You', '/feed/you', 'FElibrary', 'M11 7l6 3.5-6 3.5V7zm7 13H4V6H3v15h15v-1zm3-2H6V3h15v15zM7 17h13V4H7v13z', 'M4 6H3v15h15v-1H4V6zm17-3H6v15h15V3zm-10 12V7l6 4-6 4z']
  ];
  const browse = (e, url, browseId) => {
    if (e.button || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    document.querySelector('ytd-app')?.dispatchEvent(new CustomEvent('yt-navigate', { bubbles: true, composed: true, detail: { endpoint: {
      commandMetadata: { webCommandMetadata: { url, webPageType: 'WEB_PAGE_TYPE_BROWSE' } }, browseEndpoint: { browseId } } } }));
  };
  function topbar() {
    const logo = document.querySelector('ytd-masthead ytd-topbar-logo-renderer a#logo');
    if (logo && !logo.querySelector('.eyt-logo')) {
      const play = document.createElementNS(SVG, 'svg'); play.setAttribute('viewBox', '0 0 28 20');
      const r = document.createElementNS(SVG, 'rect'); Object.entries({ width: 28, height: 20, rx: 5, fill: '#f00' }).forEach(([k, v]) => r.setAttribute(k, v));
      const t = document.createElementNS(SVG, 'path'); t.setAttribute('d', 'M11 5.5v9l7.5-4.5z'); t.setAttribute('fill', '#fff');
      play.append(r, t);
      logo.append(h('span', { class: 'eyt-logo' }, play, h('b', {}, 'Elite'), 'YT'));
    }
    const btns = document.querySelector('ytd-masthead #end #buttons');
    if (btns && !btns.querySelector('.eyt-nav')) {
      btns.lastElementChild?.before(h('div', { class: 'eyt-nav' }, NAV.map(([label, url, id, off, on]) => {
        const i0 = icon(off), i1 = icon(on);
        i0.setAttribute('class', 'eyt-i-off'); i1.setAttribute('class', 'eyt-i-on');
        return h('a', { class: 'eyt-nav-btn', href: url, title: label, 'aria-label': label, 'data-path': url, onclick: (e) => browse(e, url, id) }, i0, i1);
      })));
    }
    document.querySelectorAll('.eyt-nav-btn').forEach((a) => a.classList.toggle('on', a.dataset.path === location.pathname));
  }
  document.documentElement.classList.toggle('eyt-chrome', !!s.topbar);
  applyHomeClasses();

  // ---------------- home chip bar: hidden at the top, slides in as a fixed bar once you scroll ----------------
  let raf = 0;
  addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; document.documentElement.classList.toggle('eyt-scrolled', scrollY > 160); });
  }, { passive: true });

  const later = () => {
    document.documentElement.classList.toggle('eyt-on-home', location.pathname === '/');
    [0, 800, 2500].forEach((t) => setTimeout(() => { if (s.topbar) topbar(); render(); }, t));
  }; // the grid is stamped late
  document.addEventListener('yt-navigate-finish', () => { nav++; later(); });
  document.addEventListener('eliteyt:settings', (e) => {
    s = JSON.parse(e.detail);
    document.documentElement.classList.toggle('eyt-chrome', !!s.topbar);
    applyHomeClasses();
    if (s.topbar) topbar();
    render(true);
  });
  later();
})();
