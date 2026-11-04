// MAIN world: needs the page's player API and must patch MediaSource before the player loads.
(() => {
  'use strict';
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  let s = read('eliteyt') || {};
  let onBattery = localStorage.getItem('eliteyt:onbat') !== '0';
  let bat = null;
  const saverOn = () => s.battery && (!s.onlyOnBattery || onBattery);
  const player = () => document.getElementById('movie_player');
  const video = () => document.querySelector('#movie_player video.html5-main-video');
  const flexy = () => document.querySelector('ytd-watch-flexy');
  const set = (patch) => {
    s = { ...s, ...patch };
    document.dispatchEvent(new CustomEvent('eliteyt:set', { detail: JSON.stringify(patch) }));
  };
  // YouTube enforces Trusted Types, so build DOM by hand (no innerHTML)
  const h = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k in e && !k.includes('-')) e[k] = v;
      else e.setAttribute(k, v);
    }
    e.append(...kids.flat().filter((x) => x != null && x !== false));
    return e;
  };

  // --- codec filter: hide 60fps / VP9 / AV1 formats from the player when saver is on
  const MS = window.MediaSource;
  if (MS?.isTypeSupported) {
    const orig = MS.isTypeSupported.bind(MS);
    MS.isTypeSupported = (t) => {
      if (saverOn()) {
        const fr = /framerate=(\d+)/.exec(t);
        if (s.cap30 && fr && +fr[1] > 30) return false;
        if (s.h264 && /av01|vp0?9/.test(t)) return false;
      }
      return orig(t);
    };
  }

  navigator.getBattery?.().then((b) => {
    bat = b;
    const upd = () => {
      onBattery = !b.charging;
      localStorage.setItem('eliteyt:onbat', onBattery ? '1' : '0');
      lastQ = '';
      applyQuality();
    };
    b.addEventListener('chargingchange', upd);
    upd();
  });

  // --- CSS toggles + layout variables
  const CLS = {
    noAmbient: 'eyt-noambient', hideShorts: 'eyt-hide-shorts', hideComments: 'eyt-hide-comments',
    hideRelated: 'eyt-hide-related', hideEndCards: 'eyt-hide-endcards', hideChat: 'eyt-hide-chat',
    expLayout: 'eyt-exp', homeClean: 'eyt-home', homeNoShorts: 'eyt-home-noshorts', homeNoAds: 'eyt-home-noads'
  };
  const applyClasses = () => {
    const root = document.documentElement, L = s.layout || {};
    for (const [k, c] of Object.entries(CLS)) root.classList.toggle(c, !!s[k]);
    root.classList.toggle('eyt-pause-noblur', s.pauseBlur === false);
    root.classList.toggle('eyt-pause-notitle', s.pauseTitle === false);
    root.classList.toggle('eyt-side-left', L.side === 'left');
    root.classList.toggle('eyt-card-grid', (L.card || 'grid') === 'grid');
    root.style.setProperty('--eyt-side', (L.width || 400) + 'px');
    root.style.setProperty('--eyt-cols', L.cols || 3);
    root.style.setProperty('--eyt-home-cols', s.homeCols || 4);
  };

  // --- quality follows speed
  let lastQ = '';
  const applyQuality = () => {
    const p = player(), v = video();
    if (!p?.setPlaybackQualityRange || !v || !(s.autoQuality && saverOn())) return;
    const r = v.playbackRate;
    const q = r >= 2.5 ? 'large' : r >= 1.75 ? 'hd720' : 'hd1080';
    const key = q + (p.getVideoData?.().video_id || '');
    if (key === lastQ) return;
    lastQ = key;
    p.setPlaybackQualityRange(q, q);
  };

  // --- speed
  const channel = () => player()?.getVideoData?.().author || '';
  const toast = (text) => {
    const p = player(); if (!p) return;
    let el = p.querySelector('.eyt-toast');
    if (!el) { el = h('div', { class: 'eyt-toast' }); p.append(el); }
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('on'), 700);
  };
  const clampRate = (r) => Math.round(Math.min(Math.max(r, 0.25), s.maxSpeed || 4) * 100) / 100;
  document.addEventListener('keydown', (e) => {
    if (!s.speed || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    const v = video(); if (!v) return;
    let r;
    if (e.key === ']') r = v.playbackRate + 0.25;
    else if (e.key === '[') r = v.playbackRate - 0.25;
    else if (e.key === '\\') r = 1;
    else return;
    e.preventDefault(); e.stopPropagation();
    v.playbackRate = clampRate(r);
    toast(v.playbackRate + '×');
  }, true);

  // music + exempt channels get their own speed and never overwrite the remembered one
  const isMusic = () => {
    const cat = player()?.getPlayerResponse?.()?.microformat?.playerMicroformatRenderer?.category;
    return / - Topic$|VEVO$/i.test(channel()) || cat === 'Music';
  };
  const isExempt = () => {
    const c = channel().toLowerCase();
    return !!c && (s.exempt || []).some((n) => n.trim().toLowerCase() === c);
  };
  const special = () => isExempt() || (s.musicSeparate && isMusic());
  const targetRate = () => {
    if (!s.speed) return null;
    if (isExempt()) return 1;
    if (s.musicSeparate && isMusic()) return s.musicSpeed || 1;
    return (s.rememberSpeed && (read('eliteyt:speeds') || {})[channel()]) || s.defaultSpeed || null;
  };

  // volume boost above 100% via Web Audio; graph is only built once boost is used
  let gain = null;
  const applyVolume = () => {
    const v = video(), pct = s.volume || 100;
    if (!v || (pct <= 100 && !gain)) return;
    if (!gain || gain.el !== v) {
      const ctx = new AudioContext();
      gain = ctx.createGain();
      ctx.createMediaElementSource(v).connect(gain).connect(ctx.destination);
      gain.el = v;
    }
    gain.gain.value = Math.max(pct, 100) / 100;
    if (gain.context.state === 'suspended') gain.context.resume();
  };

  let loadedAt = 0;
  const isMain = (e) => e.target instanceof HTMLVideoElement && e.target.matches('.html5-main-video');
  document.addEventListener('play', (e) => { if (isMain(e)) applyVolume(); }, true);
  document.addEventListener('loadeddata', (e) => {
    if (!isMain(e)) return;
    loadedAt = Date.now();
    lastQ = '';
    setTimeout(() => {
      const r = targetRate();
      if (r && e.target.playbackRate !== r) e.target.playbackRate = r;
      applyVolume();
      if (tab === 'tweaks') renderTweaks();
    }, 300);
    if (s.moveAudio) setTimeout(() => withMenu().then(() => { if (tab === 'tweaks') renderTweaks(); }), 1500);
  }, true);
  document.addEventListener('ratechange', (e) => {
    if (!isMain(e)) return;
    applyQuality();
    // ignore the player's own reset right after a video loads
    if (s.rememberSpeed && Date.now() - loadedAt > 2000 && channel() && !special()) {
      const m = read('eliteyt:speeds') || {};
      m[channel()] = e.target.playbackRate;
      localStorage.setItem('eliteyt:speeds', JSON.stringify(m));
    }
  }, true);

  // --- Stable Volume / Voice boost: pulled out of the player's ⚙ menu into the Tweaks page.
  // The menu items only exist after the menu has opened once, so prime it invisibly per video.
  const AUDIO = [['stable', 'Stable Volume', /stable volume/i], ['voice', 'Voice boost', /voice boost/i]];
  const audioItems = () => {
    const out = {};
    for (const m of document.querySelectorAll('.ytp-settings-menu .ytp-menuitem[role="menuitemcheckbox"]')) {
      const label = m.querySelector('.ytp-menuitem-label')?.textContent || '';
      for (const [k, , re] of AUDIO) if (re.test(label)) out[k] = m;
    }
    return out;
  };
  const markAudio = () => {
    for (const m of Object.values(audioItems())) m.classList.toggle('eyt-moved', !!s.moveAudio);
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let priming = false;
  async function withMenu(fn) {
    const b = document.querySelector('#movie_player .ytp-settings-button');
    if (!b || priming) return;
    priming = true;
    const root = document.documentElement;
    root.classList.add('eyt-priming');
    const wasOpen = b.getAttribute('aria-expanded') === 'true';
    if (!wasOpen) b.click();
    await sleep(150);
    fn?.(audioItems());
    markAudio();
    await sleep(50);
    if (!wasOpen && b.getAttribute('aria-expanded') === 'true') b.click();
    await sleep(80);
    // some toggles re-open the panel; close again if so
    if (!wasOpen && b.getAttribute('aria-expanded') === 'true') b.click();
    await sleep(50);
    root.classList.remove('eyt-priming');
    priming = false;
  }
  const toggleAudio = async (k) => {
    await withMenu((items) => items[k]?.click());
    await sleep(100);
    if (tab === 'tweaks') renderTweaks();
  };

  // --- stats overlay
  let statsTimer = 0;
  const drawStats = () => {
    const p = player(), v = video(); if (!p || !v) return;
    let el = p.querySelector('.eyt-stats');
    if (!el) { el = h('div', { class: 'eyt-stats' }); p.append(el); }
    const n = p.getStatsForNerds?.() || {};
    const fps = +(/@(\d+)/.exec(n.resolution || '')?.[1] || 30);
    const q = v.getVideoPlaybackQuality();
    const mpx = (v.videoWidth * v.videoHeight * fps * v.playbackRate / 1e6).toFixed(0);
    el.textContent = [
      `${v.videoWidth}×${v.videoHeight}@${fps}  ${(n.codecs || '?').split(' ')[0]}`,
      `${v.playbackRate}×  ${mpx} Mpx/s to decode`,
      `dropped ${q.droppedVideoFrames}/${q.totalVideoFrames}`,
      `${bat ? (bat.charging ? 'AC ' : 'battery ') + Math.round(bat.level * 100) + '%  ' : ''}saver ${saverOn() ? 'on' : 'off'}`
    ].join('\n');
  };
  const applyStats = () => {
    clearInterval(statsTimer);
    player()?.querySelector('.eyt-stats')?.remove();
    if (s.stats) statsTimer = setInterval(drawStats, 1000);
  };

  // --- comments panel: Comments / Description / Tweaks pages
  let tab = 'comments';
  const panel = h('div', { class: 'eyt-panel' });
  const tabs = h('div', { class: 'eyt-tabs', role: 'tablist' });
  const pages = { comments: h('div', { class: 'eyt-pg' }), description: h('div', { class: 'eyt-pg' }), tweaks: h('div', { class: 'eyt-pg eyt-tw' }) };
  for (const [id, label] of [['comments', 'Comments'], ['description', 'Description'], ['tweaks', 'Tweaks']]) {
    tabs.append(h('button', { type: 'button', role: 'tab', 'data-tab': id, onclick: () => showTab(id) }, label));
  }
  panel.append(tabs, ...Object.values(pages));
  const showTab = (id) => {
    // collapse while tab is still 'description', so the click interceptor lets it through
    if (tab === 'description' && id !== 'description') part('description')?.querySelector('#collapse')?.click();
    tab = id;
    for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.tab === id));
    for (const [k, pg] of Object.entries(pages)) pg.hidden = k !== id;
    if (id === 'description') {
      const d = part('description');
      if (d) {
        pages.description.append(d);
        d.querySelector('#expand')?.click();
      }
    } else {
      applyLayout(); // puts the description back in its own slot
    }
    if (id === 'tweaks') renderTweaks();
  };

  const sw = (on, onclick) => h('button', { type: 'button', class: 'eyt-sw', role: 'switch', 'aria-checked': String(!!on), onclick });
  const row = (label, right) => h('div', { class: 'eyt-tw-row' }, h('span', { class: 'eyt-tw-label' }, label), right);
  const fmtX = (n) => +n + '×';
  const slider = (min, max, step, value, fmt, commit) => {
    const val = h('span', { class: 'eyt-tw-val' }, fmt(value));
    const input = h('input', { type: 'range', min, max, step, value,
      oninput: () => { val.textContent = fmt(input.value); }, onchange: () => commit(+input.value) });
    return [val, input];
  };
  // pause-screen parts; with both off there is nothing left to show, so drop the overlay
  const togglePause = (k) => {
    set({ [k]: s[k] === false });
    if (s.pauseBlur === false && s.pauseTitle === false) hidePause();
    applyClasses(); renderTweaks();
  };
  function renderTweaks() {
    const c = channel();
    const kind = isExempt() ? 'never changed' : s.musicSeparate && isMusic() ? 'music speed' : 'normal speed';
    const setSpeed = (v) => {
      set({ defaultSpeed: v });
      const vid = video();
      if (vid && !special()) vid.playbackRate = clampRate(v);
      renderTweaks();
    };
    const [spVal, spIn] = slider(0.25, 4, 0.25, s.defaultSpeed || 1, fmtX, setSpeed);
    const [muVal, muIn] = slider(0.5, 2, 0.05, s.musicSpeed || 1, fmtX, (v) => {
      set({ musicSpeed: v });
      const vid = video();
      if (vid && !isExempt() && s.musicSeparate && isMusic()) vid.playbackRate = v;
    });
    const [voVal, voIn] = slider(100, 300, 10, s.volume || 100, (v) => v + '%', (v) => { set({ volume: v }); applyVolume(); });
    const addInput = h('input', { class: 'eyt-tw-input', placeholder: 'Channel name', autocomplete: 'off' });
    const addName = (name) => {
      name = name.trim();
      if (name && !(s.exempt || []).some((n) => n.toLowerCase() === name.toLowerCase())) set({ exempt: [...(s.exempt || []), name] });
      renderTweaks();
    };
    pages.tweaks.replaceChildren(
      h('div', { class: 'eyt-tw-sec' },
        row('Speed', spVal), spIn,
        h('div', { class: 'eyt-chips' }, [1, 1.25, 1.5, 2, 3].map((v) =>
          h('button', { type: 'button', class: 'eyt-chip', 'aria-pressed': String(v === s.defaultSpeed), onclick: () => setSpeed(v) }, fmtX(v)))),
        h('p', { class: 'eyt-tw-hint' }, c ? `${c} uses ${kind}. ` : '', 'Keys: [ ] \\')),
      h('div', { class: 'eyt-tw-sec' },
        row('Separate speed for music', sw(s.musicSeparate, () => { set({ musicSeparate: !s.musicSeparate }); renderTweaks(); })),
        h('p', { class: 'eyt-tw-hint' }, '"- Topic" and VEVO channels, and videos in the Music category.'),
        s.musicSeparate && [row('Music speed', muVal), muIn]),
      h('div', { class: 'eyt-tw-sec' },
        row('Never change speed for', c && !isExempt() ? h('button', { type: 'button', class: 'eyt-chip', onclick: () => addName(c) }, '+ This channel') : null),
        h('div', { class: 'eyt-chips' }, (s.exempt || []).length ? s.exempt.map((n) =>
          h('span', { class: 'eyt-chip eyt-chip-static' }, n,
            h('button', { type: 'button', class: 'eyt-chip-x', 'aria-label': 'Remove ' + n,
              onclick: () => { set({ exempt: s.exempt.filter((x) => x !== n) }); renderTweaks(); } }, '✕')))
          : h('span', { class: 'eyt-tw-hint' }, 'No channels yet')),
        h('form', { class: 'eyt-tw-add', onsubmit: (e) => { e.preventDefault(); addName(addInput.value); } },
          addInput, h('button', { type: 'submit', class: 'eyt-tw-btn' }, 'Add'))),
      h('div', { class: 'eyt-tw-sec' }, row('Volume boost', voVal), voIn,
        (() => {
          const items = audioItems();
          const rows = AUDIO.filter(([k]) => items[k]).map(([k, label]) =>
            row(label, sw(items[k].getAttribute('aria-checked') === 'true', () => toggleAudio(k))));
          return rows.length ? rows : h('p', { class: 'eyt-tw-hint' }, 'Stable Volume and Voice boost are not offered for this video.');
        })()),
      h('div', { class: 'eyt-tw-sec' },
        row('Quality follows speed', sw(s.autoQuality, () => { set({ autoQuality: !s.autoQuality }); lastQ = ''; applyQuality(); renderTweaks(); })),
        row('Ambient mode off', sw(s.noAmbient, () => { set({ noAmbient: !s.noAmbient }); applyClasses(); renderTweaks(); })),
        row('Blur video when paused', sw(s.pauseBlur !== false, () => togglePause('pauseBlur'))),
        row('Show title when paused', sw(s.pauseTitle !== false, () => togglePause('pauseTitle'))))
    );
  }

  // --- theme: YouTube's colour tokens are obfuscated (--tffc2…) and set on ytd-watch-metadata,
  // so read the real computed colours off its own elements and expose them as --eyt-* vars
  const opaque = (c) => c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c);
  function readTheme() {
    const m = document.querySelector('ytd-watch-metadata'); if (!m) return;
    const r = document.documentElement.style;
    r.setProperty('--eyt-fg', getComputedStyle(m).color);
    const d = document.querySelector('#description.ytd-watch-metadata');
    if (d) r.setProperty('--eyt-chip', getComputedStyle(d).backgroundColor);
    const sub = document.querySelector('#owner-sub-count');
    if (sub) r.setProperty('--eyt-fg2', getComputedStyle(sub).color);
    const bg = [document.querySelector('ytd-app'), document.body, document.documentElement]
      .map((e) => e && getComputedStyle(e).backgroundColor).find(opaque);
    if (bg) r.setProperty('--eyt-bg', bg);
  }
  new MutationObserver(() => setTimeout(readTheme, 50)).observe(document.documentElement, { attributes: true, attributeFilter: ['dark'] });

  // --- sidebar actions: Share / Save / Ask go into YouTube's ⋯ menu
  const OVERFLOW = /share|save|ask/i;
  function markOverflow() {
    const a = cache.get('actions');
    const inSide = !!a && ['secondary-inner', 'related'].includes(a.parentNode?.id);
    for (const b of document.querySelectorAll('.eyt-overflow')) b.classList.remove('eyt-overflow');
    if (!inSide) return;
    for (const item of a.querySelectorAll('#top-level-buttons-computed > *, #flexible-item-buttons > *')) {
      if (item.matches('segmented-like-dislike-button-view-model')) continue;
      const btn = item.querySelector('button');
      const label = btn?.getAttribute('aria-label') || item.textContent || '';
      if (OVERFLOW.test(label)) item.classList.add('eyt-overflow');
    }
  }
  document.addEventListener('click', (e) => {
    const more = e.target.closest(':is(#secondary-inner, #related) > #actions ytd-menu-renderer > yt-button-shape button, :is(#secondary-inner, #related) > #actions ytd-menu-renderer #button');
    if (!more) return;
    const hidden = [...document.querySelectorAll('.eyt-overflow')];
    if (!hidden.length) return;
    let tries = 0;
    const poll = setInterval(() => {
      const drop = [...document.querySelectorAll('ytd-popup-container tp-yt-iron-dropdown')]
        .find((d) => d.style.display !== 'none' && d.getAttribute('aria-hidden') !== 'true');
      const list = drop?.querySelector('ytd-menu-popup-renderer tp-yt-paper-listbox, ytd-menu-popup-renderer #items');
      if (!list && ++tries < 15) return; // the popup is created lazily on first open
      clearInterval(poll);
      if (!list || list.querySelector('.eyt-menu-item')) return;
      list.prepend(...hidden.map((item) => {
        const btn = item.querySelector('button');
        const label = (btn?.getAttribute('aria-label') || item.textContent).trim().replace(/ to playlist$/i, '');
        const icon = item.querySelector('svg')?.cloneNode(true);
        return h('div', { class: 'eyt-menu-item', role: 'menuitem', tabIndex: 0, onclick: () => {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          setTimeout(() => btn?.click(), 50);
        } }, h('span', { class: 'eyt-menu-icon' }, icon), label);
      }));
      drop.refit?.(); // the popup was sized for the original items; resize it for the added ones
    }, 100);
  }, true);

  // --- custom layout: move YouTube's blocks into the columns the layout studio saved
  const PARTS = {
    player: '#player', title: 'ytd-watch-metadata #title', description: 'ytd-watch-metadata #bottom-row',
    channel: 'ytd-watch-metadata #owner', actions: 'ytd-watch-metadata #actions', merch: 'ytd-merch-shelf-renderer',
    comments: 'ytd-comments#comments', recommendations: '#related', chat: '#chat-container'
  };
  const cache = new Map(), orig = new Map();
  const holder = h('div', { class: 'eyt-holder', hidden: true });
  let moved = false, observed = null;
  function part(id) {
    const f = flexy(); if (!f) return null;
    const c = cache.get(id);
    if (c?.isConnected && f.contains(c)) return c;
    const e = f.querySelector(PARTS[id]);
    if (e) cache.set(id, e);
    return e;
  }
  const place = (e, target) => {
    if (!orig.has(e)) orig.set(e, [e.parentNode, e.nextSibling]);
    target.append(e);
  };
  // ytd-watch-metadata's controller measures this.ownerElement (#owner inside the metadata) on resize. Once #owner is
  // moved that is null and it throws, which aborts the resize that brings the player back from the miniplayer.
  let guarded = false;
  function guardMetadata() {
    const P = !guarded && document.querySelector('ytd-watch-metadata')?.polymerController;
    const proto = P && Object.getPrototypeOf(P), f = proto?.maybeUpdateActionsOnSeparateLine;
    if (typeof f !== 'function') return;
    proto.maybeUpdateActionsOnSeparateLine = function (...args) { try { return f.apply(this, args); } catch {} };
    guarded = true;
  }
  const CHIPS = 'chip-bar-view-model, yt-chip-cloud-renderer, yt-related-chip-cloud-renderer';
  // One row under the player: channel (left) · filter chips · like/dislike/⋯ (right), like YouTube's own bar.
  // Channel and actions are pinned to the chip row's ends; the chips get margins so nothing overlaps.
  function alignActions() {
    const a = part('actions'), r = a?.parentNode;
    if (r?.id !== 'related') return;
    const o = part('channel'), own = o?.parentNode === r ? o : null;
    const chip = r.querySelector(CHIPS), on = !!chip?.offsetHeight;
    r.classList.toggle('eyt-on-chips', on);
    if (!on) { if (own) own.style.top = ''; return; }
    // measure a single chip: the bar's own box includes padding below the chips
    const one = chip.querySelector('chip-shape, chip-view-model, yt-chip-cloud-chip-renderer') || chip;
    const c = one.getBoundingClientRect(), rr = r.getBoundingClientRect();
    const mid = c.top - rr.top + c.height / 2 + 'px'; // CSS translateY(-50%) centres on the chips
    a.style.top = mid;
    if (own) own.style.top = mid;
    chip.style.marginLeft = own ? own.offsetWidth + 16 + 'px' : '';
    chip.style.marginRight = a.offsetWidth + 16 + 'px';
  }
  function applyLayout() {
    const f = flexy(); if (!f) return;
    if (observed !== f) {
      observed = f;
      new MutationObserver(applyLayout).observe(f, { attributes: true, attributeFilter: ['is-two-columns_'] });
    }
    const pri = f.querySelector('#primary-inner'), sec = f.querySelector('#secondary-inner');
    if (!pri || !sec) return;
    const L = s.layout;
    readTheme();
    if (s.expLayout && L && f.hasAttribute('is-two-columns_')) {
      if (!holder.isConnected) f.append(holder);
      const cols = { main: pri, sidebar: sec, hidden: holder };
      // actions + recommendations both under the player: actions share one row with the filter chips
      guardMetadata();
      const inline = L.main?.includes('actions') && L.main.includes('recommendations');
      const inlineCh = inline && L.main.includes('channel'); // channel joins the same row
      // only touch nodes that are out of place: re-appending #related reloads the whole grid (visible flash)
      const last = new Map();
      const put = (e, target, move = place) => {
        const prev = last.get(target);
        if (e.parentNode !== target || (prev && !(prev.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING))) move(e, target);
        last.set(target, e);
      };
      for (const col of ['main', 'sidebar', 'hidden']) {
        for (const id of L[col] || []) {
          if (id === 'player') continue; // YouTube moves the player itself (theater, fullscreen)
          if (id === 'description' && tab === 'description') continue;
          if ((id === 'actions' || (id === 'channel' && inlineCh)) && inline) continue;
          const e = part(id); if (!e) continue;
          if (id === 'comments') { if (e.parentNode !== pages.comments) place(e, pages.comments); put(panel, cols[col], (x, t) => t.append(x)); }
          else put(e, (id === 'description' && s.descToPanel) || (id === 'title' && s.titleInPlayer) ? holder : cols[col]); // description lives in its tab, title in the player
        }
      }
      const a = part('actions'), r = part('recommendations');
      if (inline && a && r) {
        if (r.firstElementChild !== a) { if (!orig.has(a)) orig.set(a, [a.parentNode, a.nextSibling]); r.prepend(a); }
        const o = inlineCh && part('channel');
        if (o && a.previousElementSibling !== o) { if (!orig.has(o)) orig.set(o, [o.parentNode, o.nextSibling]); a.before(o); }
        alignActions();
      } else if (a && r && a.parentNode === r) place(a, holder); // layout changed: don't leave it stuck in the grid
      // line the sidebar up with the player: hide empty shelves (e.g. merch with no items) and drop the top margin
      // of the first block that is actually visible
      requestAnimationFrame(() => {
        let first = true;
        for (const c of sec.children) {
          // a block YouTube collapsed to a sliver (e.g. tagged-products merch) still carries margins; hide it.
          // Marked once per video (it can't be measured while hidden); cleared on navigation.
          if (c !== panel && c.offsetHeight > 0 && c.offsetHeight <= 12) c.classList.add('eyt-empty');
          const vis = c.offsetHeight > 0 && !c.classList.contains('eyt-empty');
          c.classList.toggle('eyt-first', first && vis);
          if (vis) first = false;
        }
      });
      if (!tabs.querySelector('[aria-selected="true"]')) showTab('comments');
      moved = true;
      markOverflow();
    } else if (moved) {
      if (tab !== 'comments') { tab = 'comments'; for (const [k, pg] of Object.entries(pages)) pg.hidden = k !== 'comments'; }
      for (const [e, [p, n]] of [...orig].reverse()) p.insertBefore(e, n?.parentNode === p ? n : null);
      orig.clear();
      panel.remove(); holder.remove();
      moved = false;
      markOverflow();
    }
  }

  // clicking the description preview opens it in the panel instead of expanding in place
  document.addEventListener('click', (e) => {
    if (!s.descToPanel || !moved || tab === 'description') return;
    const d = cache.get('description');
    if (!d?.contains(e.target) || e.target.closest('a') || !panel.isConnected || holder.contains(panel)) return;
    e.preventDefault(); e.stopPropagation();
    showTab('description');
    panel.scrollIntoView({ block: 'nearest' });
  }, true);

  const applyAll = () => { playerTop(); applyClasses(); applyLayout(); applyQuality(); applyStats(); applyVolume(); if (tab === 'tweaks') renderTweaks(); };
  document.addEventListener('eliteyt:settings', (e) => { s = JSON.parse(e.detail); lastQ = ''; applyAll(); });
  // YouTube stamps the metadata parts late, so re-apply a few times after each navigation
  let retry = [];
  const relayout = () => { retry.forEach(clearTimeout); retry = [0, 500, 1500, 3000, 6000].map((t) => setTimeout(applyLayout, t)); };
  document.addEventListener('yt-navigate-finish', () => {
    document.querySelectorAll('#secondary-inner > .eyt-empty').forEach((e) => e.classList.remove('eyt-empty'));
    if (tab === 'description') showTab('comments');
    relayout(); applyStats();
  });
  document.addEventListener('yt-page-data-updated', relayout);
  addEventListener('resize', () => alignActions());
  // the title shown on the page (DeArrow's when it replaced YouTube's), else the player's
  const shownTitle = () => [...document.querySelectorAll('ytd-watch-flexy #title h1 :is(.eyt-da-title, yt-formatted-string:not(.eyt-da-hide))')]
    .map((e) => e.textContent.trim()).find(Boolean) || player()?.getVideoData?.().title || '';

  // --- title bar across the top of the player, shown with the controls (the sidebar no longer shows the title)
  function playerTop() {
    const p = player();
    if (!p) return;
    let el = p.querySelector('.eyt-ptop');
    if (!s.titleInPlayer) { el?.remove(); return; }
    if (!el) { el = h('div', { class: 'eyt-ptop' }); p.append(el); }
    el.replaceChildren(h('div', { class: 'eyt-ptop-title' }, shownTitle()), h('div', { class: 'eyt-ptop-ch' }, p.getVideoData?.().author || ''));
  }
  document.addEventListener('yt-navigate-finish', () => [300, 1500, 3500].forEach((t) => setTimeout(playerTop, t)));

  // --- Netflix-style pause screen: after a short pause, dim the video and show what you're watching
  let pauseT = 0;
  const hidePause = () => {
    clearTimeout(pauseT);
    player()?.querySelector('.eyt-pause')?.classList.remove('on');
    player()?.classList.remove('eyt-paused-info');
  };
  function showPause() {
    const p = player(), v = video();
    if (!s.pauseInfo || (s.pauseBlur === false && s.pauseTitle === false) || !p || !v?.paused || v.ended || p.classList.contains('ad-showing')) return;
    const r = p.getPlayerResponse?.() || {}, d = r.videoDetails || {}, mf = r.microformat?.playerMicroformatRenderer || {};
    const shown = shownTitle();
    const views = +d.viewCount ? new Intl.NumberFormat(undefined, { notation: 'compact' }).format(+d.viewCount) + ' views' : '';
    const date = mf.publishDate ? new Date(mf.publishDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
    const desc = (d.shortDescription || '').replace(/https?:\/\/\S+/g, '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).join(' ');
    let el = p.querySelector('.eyt-pause');
    if (!el) { el = h('div', { class: 'eyt-pause' }); p.append(el); }
    el.replaceChildren(h('div', { class: 'eyt-pause-body' },
      h('div', { class: 'eyt-pause-label' }, "You're watching"),
      h('div', { class: 'eyt-pause-title' }, shown || d.title || ''),
      h('div', { class: 'eyt-pause-meta' }, [d.author, views, date].filter(Boolean).join(' • ')),
      desc && h('div', { class: 'eyt-pause-desc' }, desc)));
    el.classList.add('on');
    p.classList.add('eyt-paused-info');
  }
  document.addEventListener('pause', (e) => { if (isMain(e)) { clearTimeout(pauseT); pauseT = setTimeout(showPause, 2500); } }, true);
  document.addEventListener('loadeddata', (e) => { if (isMain(e)) [0, 1500].forEach((t) => setTimeout(playerTop, t)); }, true);
  for (const ev of ['play', 'seeking', 'emptied']) document.addEventListener(ev, (e) => { if (isMain(e)) hidePause(); }, true);
  // like Netflix: any mouse movement over the player brings the controls back, then it returns after a while
  document.addEventListener('mousemove', (e) => {
    const p = player();
    if (!p?.contains(e.target) || !p.querySelector('.eyt-pause.on')) return;
    hidePause();
    if (video()?.paused) pauseT = setTimeout(showPause, 4000);
  }, { passive: true });
  document.addEventListener('yt-navigate-start', hidePause);

  applyClasses();
})();
