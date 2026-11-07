// MAIN world: the small pieces inside watch-page blocks (action buttons, channel row, description, chips) and the
// items of YouTube's top bar, ordered and hidden the way the Layout Studio saved them.
// Hiding is always applied. Reordering flattens YouTube's own wrappers (display: contents), so it is only switched on
// for a group whose order differs from YouTube's.
(() => {
  'use strict';
  let s = {};
  try { s = JSON.parse(localStorage.getItem('eliteyt')) || {}; } catch {}
  const ORDER = {
    actions: ['likes', 'share', 'save', 'download', 'clip', 'thanks'],
    channel: ['avatar', 'name', 'join', 'subscribe'],
    description: ['info', 'text']
  };
  const TB = { left: ['menu', 'logo'], center: ['search', 'voice'], right: ['create', 'nav', 'notifications', 'avatar'] };
  const same = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);

  // YouTube's button view models carry an iconName in their data; the accessible name is the fallback (English UI)
  const icon = (el) => {
    for (const d of [el.data, el.__data?.data, el.polymerController?.data]) {
      if (!d) continue;
      try { const m = /"iconName":"([A-Z_]+)"/.exec(JSON.stringify(d)); if (m) return m[1]; } catch {}
    }
    return '';
  };
  const label = (el) => (el.querySelector('button, a')?.getAttribute('aria-label') || el.getAttribute('aria-label') || el.textContent || '').trim();
  function actionId(el) {
    if (el.matches('segmented-like-dislike-button-view-model, ytd-segmented-like-dislike-button-renderer, like-button-view-model')) return 'likes';
    if (el.matches('ytd-download-button-renderer')) return 'download';
    const i = icon(el), l = label(el);
    if (i === 'SHARE' || /^share\b/i.test(l)) return 'share';
    if (/PLAYLIST_ADD|BOOKMARK/.test(i) || /^save\b/i.test(l)) return 'save';
    if (i === 'DOWNLOAD' || /^download\b/i.test(l)) return 'download';
    if (i === 'CONTENT_CUT' || /^clip\b/i.test(l)) return 'clip';
    if (/MONEY_HEART|THANKS/.test(i) || /^thanks\b/i.test(l)) return 'thanks';
    return '';
  }
  // mark each item with its piece id, then order (when `flat`) and hide it
  function apply(items, conf, flat, attr = 'eytPart') {
    const order = conf?.order || [], hidden = conf?.hidden || [];
    for (const [el, id] of items) {
      if (!el) continue;
      // something we don't know (a button YouTube added) is left as it is, after the known ones when reordering
      if (!id) { el.style.order = flat ? '90' : ''; continue; }
      el.dataset[attr] = id;
      const i = order.indexOf(id);
      el.style.order = flat ? String(i < 0 ? 90 : i + 1) : '';
      el.toggleAttribute('data-eyt-hidden', hidden.includes(id));
    }
  }

  function watchPieces() {
    const f = document.querySelector('ytd-watch-flexy'); if (!f) return;
    const P = s.pieces || {};
    // like / share / save / download / clip / thanks: both of YouTube's button rows and their wrapper flatten into one row
    const menu = f.querySelector('#actions ytd-menu-renderer');
    if (menu) {
      const flat = !same(P.actions?.order, ORDER.actions);
      menu.classList.toggle('eyt-flat', flat);
      const btns = menu.querySelectorAll(':scope > #top-level-buttons-computed > *, :scope > #flexible-item-buttons > *');
      apply([...btns].map((b) => [b, actionId(b)]), P.actions, flat);
    }
    // channel row: avatar, name + subscribers, Join, Subscribe
    const owner = f.querySelector('#owner');
    if (owner) {
      const flat = !same(P.channel?.order, ORDER.channel);
      owner.classList.toggle('eyt-flat', flat);
      apply([[owner.querySelector('ytd-video-owner-renderer > #avatar, ytd-video-owner-renderer > a'), 'avatar'],
        [owner.querySelector('ytd-video-owner-renderer > #upload-info'), 'name'],
        [owner.querySelector(':scope > #sponsor-button'), 'join'],
        [owner.querySelector(':scope > #subscribe-button'), 'subscribe']], P.channel, flat);
    }
    // description: views + date line, and the text
    const inner = f.querySelector('#bottom-row #description-inner');
    if (inner) {
      const flat = !same(P.description?.order, ORDER.description);
      inner.classList.toggle('eyt-flat-col', flat);
      apply([[inner.querySelector(':scope > #info-container, ytd-watch-info-text'), 'info'],
        [inner.querySelector(':scope > ytd-text-inline-expander, :scope > #description-text-container'), 'text']], P.description, flat);
    }
    // filter chips above the recommendations: hide only
    for (const c of f.querySelectorAll('#related :is(chip-bar-view-model, yt-chip-cloud-renderer, yt-related-chip-cloud-renderer)')) {
      apply([[c, 'chips']], P.related, false);
    }
  }

  function topbar() {
    const m = document.querySelector('ytd-masthead'); if (!m) return;
    const L = s.topbarLayout || TB;
    const custom = !(['left', 'center', 'right'].every((z) => same(L[z], TB[z])) && !(L.hidden || []).length);
    document.documentElement.classList.toggle('eyt-tb', custom);
    const one = (sel) => m.querySelector(sel);
    const btns = [...m.querySelectorAll('#end #buttons > :is(ytd-button-renderer, yt-button-view-model, ytd-topbar-menu-button-renderer, a)')];
    const signIn = btns.find((b) => b.querySelector('a[href*="ServiceLogin"], a[href*="accounts.google"]') || /ServiceLogin/.test(b.getAttribute('href') || ''));
    const items = {
      menu: one('#start #guide-button'), logo: one('#start ytd-topbar-logo-renderer'),
      search: one('#center :is(yt-searchbox, ytd-searchbox)') || one('#center #search-form'), voice: one('#center #voice-search-button'),
      create: btns.find((b) => b !== signIn && b.matches('ytd-button-renderer, yt-button-view-model')),
      nav: one('#end .eyt-nav'), notifications: one('ytd-notification-topbar-button-renderer'),
      avatar: one('ytd-topbar-menu-button-renderer') || signIn
    };
    const base = { left: 10, center: 40, right: 70 };
    for (const [id, el] of Object.entries(items)) {
      if (!el) continue;
      el.dataset.eytTb = id;
      const zone = ['left', 'center', 'right'].find((z) => (L[z] || []).includes(id));
      el.style.order = custom && zone ? String(base[zone] + L[zone].indexOf(id)) : '';
      el.toggleAttribute('data-eyt-hidden', (L.hidden || []).includes(id));
      // the first item of the center and right zones pushes away from what's before it
      el.toggleAttribute('data-eyt-tb-gap', !!(custom && zone && zone !== 'left' && L[zone][0] === id));
    }
  }

  let queued = false;
  const run = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; watchPieces(); topbar(); });
  };
  // YouTube re-renders these rows often (new video, hover cards, resize): re-apply on changes, batched per frame
  let observing = false;
  const observe = () => {
    if (observing || !document.body) return;
    observing = true;
    new MutationObserver((ms) => {
      if (ms.some((x) => x.target.closest?.('ytd-masthead, ytd-watch-metadata, #owner, #related, ytd-menu-renderer'))) run();
    }).observe(document.body, { childList: true, subtree: true });
  };
  document.addEventListener('eliteyt:settings', (e) => { try { s = JSON.parse(e.detail); } catch {} run(); });
  document.addEventListener('yt-navigate-finish', () => { observe(); [0, 600, 2000].forEach((t) => setTimeout(run, t)); });
  addEventListener('DOMContentLoaded', () => { observe(); run(); });
  setInterval(run, 3000); // rAF doesn't run in background tabs; catch up when the tab comes back
})();
