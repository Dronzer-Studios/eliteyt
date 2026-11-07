// MAIN world, document_start: EliteYT's own YouTube ad blocker. Three layers, cheapest first:
//   1. data: strip ad slots from YouTube's JSON before the player or page reads it (the technique uBlock Origin's
//      YouTube filters use): ytInitialPlayerResponse / ytInitialData, JSON.parse and fetch().json()
//   2. page: hide any ad slot that still gets rendered (CSS in style.css, html.eyt-adblock)
//   3. player: if an ad plays anyway, mute it, run it at 16x to the end and press Skip
(() => {
  'use strict';
  let s = {};
  try { s = JSON.parse(localStorage.getItem('eliteyt')) || {}; } catch {}
  document.addEventListener('eliteyt:settings', (e) => { try { s = JSON.parse(e.detail); } catch {} cls(); });
  const on = () => s.adBlock !== false;
  const cls = () => document.documentElement.classList.toggle('eyt-adblock', on());
  cls();

  // ---- 1. data ----
  // keys that carry video ads in a player response
  const AD_KEYS = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams'];
  // renderers that are an ad (or a paid promo) wherever they appear in a feed, sidebar or search results
  const AD_ITEMS = new Set(['adSlotRenderer', 'inFeedAdLayoutRenderer', 'displayAdRenderer', 'promotedSparklesWebRenderer',
    'promotedSparklesTextSearchRenderer', 'promotedVideoRenderer', 'compactPromotedVideoRenderer', 'searchPyvRenderer',
    'bannerPromoRenderer', 'statementBannerRenderer', 'brandVideoShelfRenderer', 'brandVideoSingletonRenderer',
    'actionCompanionAdRenderer', 'playerLegacyDesktopWatchAdsRenderer', 'adsEngagementPanelContentRenderer']);
  // only parse/walk text that can contain one of them
  const HINT = /adPlacements|adSlots|playerAds|AdRenderer|AdLayoutRenderer|adSlotRenderer|[pP]romoted|PyvRenderer|PromoRenderer|BannerRenderer|brandVideo/;
  const isAd = (x) => {
    if (!x || typeof x !== 'object') return false;
    for (const k in x) {
      if (AD_ITEMS.has(k)) return true;
      // wrappers: richItemRenderer.content / richSectionRenderer.content / itemSectionRenderer.contents[0]
      const inner = x[k]?.content || (Array.isArray(x[k]?.contents) && x[k].contents.length === 1 ? x[k].contents[0] : null);
      if (inner && typeof inner === 'object' && Object.keys(inner).some((n) => AD_ITEMS.has(n))) return true;
    }
    return false;
  };
  let removed = 0;
  function prune(o, depth = 0) {
    if (!o || typeof o !== 'object' || depth > 60) return o;
    if (Array.isArray(o)) {
      for (let i = o.length - 1; i >= 0; i--) {
        if (isAd(o[i])) { o.splice(i, 1); removed++; } else prune(o[i], depth + 1);
      }
      return o;
    }
    for (const k of AD_KEYS) if (k in o) { delete o[k]; removed++; }
    for (const k in o) {
      if (AD_ITEMS.has(k)) { delete o[k]; removed++; } else if (o[k] && typeof o[k] === 'object') prune(o[k], depth + 1);
    }
    return o;
  }
  const clean = (o) => { if (on()) { try { prune(o); } catch {} } return o; };
  window.__eytAdsRemoved = () => removed; // read by the Tweaks page / tests

  // the page's first data arrives as `var ytInitialPlayerResponse = {...}` / `var ytInitialData = {...}`
  for (const name of ['ytInitialPlayerResponse', 'ytInitialData']) {
    let v = window[name];
    if (v) clean(v);
    try {
      Object.defineProperty(window, name, { configurable: true, get: () => v, set: (x) => { v = clean(x); } });
    } catch {}
  }
  // later data: JSON text parsed by the page, and fetch responses read with .json()
  const parse = JSON.parse;
  JSON.parse = function (text, reviver) {
    const r = parse.call(this, text, reviver);
    return typeof text === 'string' && on() && HINT.test(text) ? clean(r) : r;
  };
  const json = Response.prototype.json;
  Response.prototype.json = function () {
    const url = this.url || '';
    return json.call(this).then((r) => (/\/youtubei\/v1\/|\/watch|\/get_watch/.test(url) ? clean(r) : r));
  };

  // ---- 3. player: an ad that slipped through is muted, sped through and skipped ----
  const SKIP = '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-slot button';
  let before = null, watched = null; // sound + speed from before the ad
  function onAd(p) {
    const v = p.querySelector('video.html5-main-video');
    if (!on() || !v) return;
    if (p.classList.contains('ad-showing')) {
      if (!before) before = { muted: v.muted, rate: v.playbackRate };
      v.muted = true;
      v.playbackRate = 16;
      if (Number.isFinite(v.duration) && v.duration > 0 && v.currentTime < v.duration - 0.2) v.currentTime = v.duration - 0.1;
      p.querySelector(SKIP)?.click();
    } else if (before) {
      // restore at once: the 16x ratechange event fires after this, and main.js must not remember 16x as the channel's speed
      v.muted = before.muted;
      v.playbackRate = before.rate;
      before = null;
    }
  }
  const player = () => document.getElementById('movie_player');
  const watch = () => {
    const p = player();
    if (!p || p === watched) return;
    watched = p;
    new MutationObserver(() => onAd(p)).observe(p, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
    onAd(p);
  };
  // the player is created after document_start; look for it as the page builds, then on every navigation
  const boot = new MutationObserver(() => { if (player()) { watch(); boot.disconnect(); } });
  boot.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('yt-navigate-finish', watch);
  // an ad's own video can start before the class lands: re-check on time updates while an ad is showing
  document.addEventListener('timeupdate', (e) => { const p = player(); if (p?.classList.contains('ad-showing') && p.contains(e.target)) onAd(p); }, true);

  // YouTube's "Ad blockers are not allowed" dialog: close it and resume the video it paused
  new MutationObserver(() => {
    if (!on()) return;
    const m = document.querySelector('ytd-enforcement-message-view-model');
    if (!m) return;
    const dlg = m.closest('tp-yt-paper-dialog, ytd-popup-container > *') || m;
    dlg.remove();
    document.querySelector('tp-yt-iron-overlay-backdrop')?.remove();
    const v = player()?.querySelector('video.html5-main-video');
    if (v?.paused) v.play().catch(() => {});
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
