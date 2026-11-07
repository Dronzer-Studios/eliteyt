// MAIN world: flags AI-generated and low-effort videos. Everything runs in the page; nothing is sent anywhere.
//   Strong signal: YouTube's own "Altered or synthetic content" disclosure (watch page) and explicit AI labels.
//   Weaker signals add up: AI-tool names / #ai hashtags, and for low effort: hashtag spam, emoji and ALL-CAPS titles,
//   TTS story formats, template clickbait. A card is blurred with the reason (or hidden, if the user chose that);
//   one click shows it, and a channel can be trusted for good.
(() => {
  'use strict';
  let s = {};
  try { s = JSON.parse(localStorage.getItem('eliteyt')) || {}; } catch {}
  const player = () => document.getElementById('movie_player');

  // ---------------- scoring ----------------
  // strong: the video calls itself AI-made
  const AI_STRONG = /\b(ai[- ]?generated|(made|created|generated|animated) (with|by|using) (an )?ai|100% ai|full(y)? ai|ai[- ](short ?film|film|movie|animation|animated|trailer|commercial|slop))\b|#(aigenerated|aigeneratedvideo|aiart|aivideo|aianimation|aimusic|aicover|aifilm|aishorts|generativeai|aislop|soraai|veo3)\b/i;
  // also strong: "made with Sora", "generated in Veo 3"
  const AI_MADE_WITH = /\b(made|created|generated|animated|rendered) (with|by|using|in) (openai'?s )?(sora|google veo|veo|kling|runway|midjourney|suno|udio|hailuo|pika|luma|stable diffusion|dall[- ·]?e|heygen|synthesia|grok imagine|seedance)\b/i;
  // medium: usually AI-made, but also how people talk *about* AI
  const AI_MEDIUM = /\bai[- ](art|video|song|music ?video|music|cover|voice ?over|voice|influencer|baby|babies|cat|cats|dog|story|stories|girl|model)\b/i;
  // tool names: weak on their own (Sora is also a game character, Veo also Spanish)
  const AI_TOOLS = /\b(sora( ?2)?|veo ?[23]|google veo|kling( ai)?|runway ?(ml|gen-?\d)|midjourney|suno( ai)?|udio|hailuo|minimax|pika ?(labs|art)?|luma (ai|dream machine)|stable diffusion|dall[- ·]?e|elevenlabs|heygen|synthesia|invideo ai|leonardo ai|grok imagine|seedance|wan ?2\.\d)\b/i;
  const AI_WEAK = /(^|[\s#])ai($|[\s.,!?:|)-])|\bartificial intelligence\b|\bai[- ]?made\b/i;
  const AI_CHANNEL = /(^|[^A-Za-z])(ai|AI|Ai)([^A-Za-z]|$)|[a-z]AI\b|\bAI[A-Z][a-z]/; // "Cinematic AI", "DreamAI", "AIStories"
  // the video is *about* AI (reviews, news, tutorials) rather than made by it
  const ABOUT_AI = /\b(review|reviewed|tutorial|how to|explained|explainer|vs\.?|versus|news|comparison|compared|tested|testing|guide|course|react(s|ion)?|documentary|podcast|interview|lawsuit|dangers?|ethics|debate|jobs|update|announced|launch(es|ed)?|hands[- ]on|first look|prompt(s|ing)?|workflow)\b/i;
  const LOW = [
    [/\b(reddit stories|r\/(askreddit|aita|amitheasshole|tifu|prorevenge|maliciouscompliance|entitledparents)\b|text[- ]to[- ]speech|\btts\b|ai voice)\b/i, 3, 'TTS story format'],
    [/\b(you won'?t believe|gone wrong|(gone )?emotional|try not to (laugh|cry)|99% of people|only (1|a genius)% can|wait for (it|the end)|watch till the end|satisfying video|oddly satisfying|life ?hacks?|brain ?rot)\b/i, 1, 'clickbait template'],
    [/\b\d+\s+(facts|things|secrets|mysteries|signs)\s+(you|that|about|nobody|no one)\b/i, 1, 'list template'],
    [/\b(compilation|tiktok compilation|funny moments compilation)\b/i, 1, 'compilation']
  ];
  const SPAM_TAGS = /#(shorts|viral|trending|fyp|foryou|foryoupage|explore|viralvideo|trendingshorts|youtubeshorts|xyzbca|shortsfeed)\b/gi;
  const EMOJI = /\p{Extended_Pictographic}/gu;

  const list = (k) => (s[k] || []).map((n) => n.trim().toLowerCase()).filter(Boolean);
  // returns { ai, low, why[] } — ai/low are scores; >= THRESH means flagged
  function score(title = '', channel = '', extra = '') {
    const t = title.normalize('NFKC'), all = `${t} ${extra}`, why = [];
    let ai = 0, low = 0;
    const strong = AI_STRONG.test(all) || AI_MADE_WITH.test(all), medium = !strong && AI_MEDIUM.test(all), weak = !strong && !medium && AI_WEAK.test(all);
    const tool = AI_TOOLS.exec(all)?.[0], ch = !!channel && AI_CHANNEL.test(channel);
    if (strong) { ai += 3; why.push('labelled AI-generated'); }
    if (medium) { ai += 2; why.push('AI content'); }
    if (weak) { ai += 1; why.push('mentions AI'); }
    if (tool && (strong || medium || ch)) { ai += 2; why.push(`made with ${tool}`); } else if (tool && weak) ai += 1;
    if (ch) { ai += 1; why.push('AI channel name'); }
    if (ai && ABOUT_AI.test(t)) ai = Math.max(0, ai - 2); // a review of an AI tool isn't an AI video
    if (s.lowEffort !== false) {
      for (const [re, w, label] of LOW) if (re.test(`${all} ${channel}`)) { low += w; why.push(label); }
      const tags = (t.match(SPAM_TAGS) || []).length, hashes = (t.match(/#[\p{L}\p{N}_]+/gu) || []).length;
      if (tags >= 2 || hashes >= 4) { low += tags >= 3 || hashes >= 5 ? 2 : 1; why.push('hashtag spam'); }
      const emo = (t.match(EMOJI) || []).length;
      if (emo >= 3) { low += emo >= 5 ? 2 : 1; why.push('emoji bait'); }
      const words = t.replace(/#[^\s]+/g, '').match(/\p{L}{2,}/gu) || [];
      const caps = words.filter((w) => w === w.toUpperCase() && w !== w.toLowerCase()).length;
      if (words.length >= 4 && caps / words.length >= 0.6) { low += 1; why.push('ALL-CAPS title'); }
      if (/[!?]{3,}/.test(t)) { low += 1; why.push('!!!/???'); }
    }
    return { ai, low, why };
  }
  const THRESH = () => (s.slopStrict ? 2 : 3);
  // verdict for one video: null (fine) or { kind, why }
  function judge(title, channel, extra, disclosed) {
    const c = (channel || '').trim().toLowerCase();
    if (c && list('slopAllow').includes(c)) return null;
    if (c && list('slopBlock').includes(c)) return { kind: 'blocked', why: ['channel on your block list'] };
    const r = score(title, channel, extra);
    if (disclosed) { r.ai += 5; r.why.unshift('creator disclosed altered or synthetic content'); }
    const T = THRESH();
    if (s.aiFilter !== false && r.ai >= T) return { kind: 'ai', why: r.why };
    if (s.lowEffort !== false && r.low >= T) return { kind: 'low', why: r.why };
    return null;
  }
  window.__eytSlopScore = (t, c, x) => ({ ...score(t, c, x), verdict: judge(t, c, x, false) }); // for tests / debugging

  // ---------------- feed cards ----------------
  const CARD = '.eyt-card, yt-lockup-view-model, ytd-rich-grid-media, ytd-compact-video-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2';
  const TITLE = '.ytLockupMetadataViewModelTitle, #video-title, .eyt-card-title, h3, [class*="ShortsLockupViewModelHostMetadataTitle"]';
  const CHAN = 'ytd-channel-name #text, ytd-channel-name a, .ytContentMetadataViewModelMetadataRow:first-child span, .yt-content-metadata-view-model__metadata-row:first-child span, a[href^="/@"], .eyt-card-meta';
  const outer = (card) => card.closest('ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer') || card;
  const textOf = (card, sel) => (card.querySelector(sel)?.textContent || '').replace(/\s+/g, ' ').trim();
  const titleOf = (card) => textOf(card, TITLE) || card.querySelector('a[title]')?.title || '';
  // our shelf cards keep "channel • meta" in one line
  const chanOf = (card) => textOf(card, CHAN).split(' • ')[0];
  const shown = new Set(); // titles the user chose to show this session

  function clear(card) {
    const o = outer(card);
    o.classList.remove('eyt-slop', 'eyt-slop-hide');
    o.querySelector(':scope .eyt-slop-tag')?.remove();
    delete card.dataset.eytSlop;
  }
  function mark(card) {
    const title = titleOf(card);
    if (!title) return;
    const key = title + '|' + chanOf(card);
    if (card.dataset.eytSlop === key) return; // already judged (YouTube recycles cards: re-judge when the title changes)
    clear(card);
    card.dataset.eytSlop = key;
    if (shown.has(key)) return;
    const v = judge(title, chanOf(card), card.querySelector('a[aria-label]')?.getAttribute('aria-label') || '');
    if (!v) return;
    const o = outer(card);
    if (s.slopHide) { o.classList.add('eyt-slop-hide'); return; }
    o.classList.add('eyt-slop');
    const label = v.kind === 'ai' ? 'Likely AI-generated' : v.kind === 'low' ? 'Likely low-effort' : 'Blocked channel';
    const tag = document.createElement('div');
    tag.className = 'eyt-slop-tag';
    const b = document.createElement('b'); b.textContent = label;
    const why = document.createElement('small'); why.textContent = v.why.slice(0, 3).join(' · ');
    const show = document.createElement('button'); show.type = 'button'; show.textContent = 'Show';
    show.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); shown.add(key); clear(card); card.dataset.eytSlop = key; });
    tag.append(b, why, show);
    o.style.position ||= 'relative';
    o.append(tag);
  }
  const active = () => s.aiFilter !== false || s.lowEffort !== false || list('slopBlock').length;
  let queued = false;
  const scan = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      for (const c of document.querySelectorAll(CARD)) active() ? mark(c) : c.dataset.eytSlop && clear(c);
    });
  };
  // cards and their titles arrive late and get recycled: rescan (batched to one per frame) on DOM changes
  // (changes inside the player — progress bar, controls — can't add cards, skip those)
  new MutationObserver((ms) => { const p = player(); if (ms.some((m) => !p || !p.contains(m.target))) scan(); }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  setInterval(scan, 2000); // rAF doesn't run in background tabs; catch up when the tab comes back

  // ---------------- watch page ----------------
  const allowedHere = new Set();
  // YouTube's synthetic-content disclosure lives in the description's "How this content was made" section
  const disclosed = () => {
    if (document.querySelector('ytd-watch-flexy how-this-was-made-section-view-model, ytd-watch-flexy [class*="HowThisWasMade"]')) return true;
    let d = null;
    try { d = JSON.stringify(window.ytInitialData?.engagementPanels || ''); } catch {}
    return !!d && /howThisWasMadeSectionViewModel|Altered or synthetic content/i.test(d);
  };
  function cover(v) {
    const p = player(); if (!p) return;
    let el = p.querySelector('.eyt-slop-cover');
    if (!v) { el?.remove(); return; }
    if (!el) { el = document.createElement('div'); el.className = 'eyt-slop-cover'; p.append(el); }
    const id = p.getVideoData?.().video_id, ch = p.getVideoData?.().author || '';
    const t = document.createElement('div'); t.className = 'eyt-slop-cover-title';
    t.textContent = v.kind === 'ai' ? 'This looks like an AI-generated video' : v.kind === 'low' ? 'This looks like a low-effort video' : 'This channel is on your block list';
    const why = document.createElement('div'); why.className = 'eyt-slop-cover-why'; why.textContent = v.why.join(' · ');
    const go = document.createElement('button'); go.type = 'button'; go.textContent = 'Watch anyway';
    go.onclick = () => { allowedHere.add(id); cover(null); p.querySelector('video')?.play().catch(() => {}); };
    const trust = document.createElement('button'); trust.type = 'button'; trust.textContent = `Always allow ${ch || 'this channel'}`;
    trust.onclick = () => {
      const allow = [...new Set([...(s.slopAllow || []), ch])].filter(Boolean);
      s.slopAllow = allow;
      document.dispatchEvent(new CustomEvent('eliteyt:set', { detail: JSON.stringify({ slopAllow: allow }) }));
      go.onclick();
    };
    const row = document.createElement('div'); row.className = 'eyt-slop-cover-btns'; row.append(go, ch ? trust : '');
    el.replaceChildren(t, why, row);
  }
  let pending = [];
  function checkWatch() {
    const p = player(), d = p?.getVideoData?.();
    if (!d?.video_id || location.pathname !== '/watch' || allowedHere.has(d.video_id) || !active()) { cover(null); return; }
    const desc = p.getPlayerResponse?.()?.videoDetails?.shortDescription || '';
    // the description joins the title only for strong AI labels (a long description is too noisy for the rest)
    const v = judge(d.title || '', d.author || '', AI_STRONG.test(desc) ? 'ai-generated' : '', disclosed());
    cover(v);
    if (v) p.querySelector('video')?.pause();
  }
  const recheck = () => { pending.forEach(clearTimeout); pending = [300, 1500, 4000].map((t) => setTimeout(checkWatch, t)); };
  document.addEventListener('yt-navigate-finish', recheck);
  // a covered video must not start playing behind the cover (autoplay, keyboard)
  document.addEventListener('play', (e) => { if (player()?.querySelector('.eyt-slop-cover') && player().contains(e.target)) e.target.pause(); }, true);

  document.addEventListener('eliteyt:settings', (e) => {
    try { s = JSON.parse(e.detail); } catch { return; }
    for (const c of document.querySelectorAll(CARD)) if (c.dataset.eytSlop) clear(c);
    scan(); checkWatch();
  });
  recheck();
})();
