// EliteYT Layout Studio.
// One model ({ layout, pieces, home, stack, topbar, pages }) is shown as five editable mock pages. Everything on them
// (blocks, the buttons inside blocks, top-bar items, page sections) is dragged between lists; hidden things live in the
// Hidden panel. The studio's own panels can be dragged between three docks and folded. Edits save into the active
// profile (profiles.js) and apply to open YouTube tabs.
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const SVG = 'http://www.w3.org/2000/svg';
const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e && !k.includes('-')) e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...kids.flat().filter((x) => x != null && x !== false));
  return e;
};
const ICONS = {
  like: 'M7 10v12M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9Z',
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
  save: 'M3 6h11M3 12h11M3 18h7M18 9v6M15 12h6',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  clip: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12',
  thanks: 'M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z',
  menu: 'M3 6h18M3 12h18M3 18h18', search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3',
  create: 'M15 10l5-3v10l-5-3M3 6h12v12H3zM9 9v6M6 12h6', bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0',
  home: 'M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', subs: 'M3 8h18v13H3zM6 4.5h12M10 11.5v6l5-3z', you: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'
};
const icon = (name, flip) => {
  const s = document.createElementNS(SVG, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ico'); s.setAttribute('aria-hidden', 'true');
  if (flip) s.style.transform = 'rotate(180deg)';
  const p = document.createElementNS(SVG, 'path'); p.setAttribute('d', ICONS[name]); s.append(p);
  return s;
};

// ---------------------------------------------------------------- vocabulary
const PRESETS = {
  experimental: { side: 'right', width: 400, cols: 3, card: 'grid',
    main: ['player', 'recommendations'], sidebar: ['title', 'description', 'channel', 'actions', 'merch', 'comments'], hidden: ['chat'] },
  classic: { side: 'right', width: 400, cols: 1, card: 'list',
    main: ['player', 'title', 'channel', 'actions', 'description', 'comments'], sidebar: ['chat', 'merch', 'recommendations'], hidden: [] },
  focus: { side: 'right', width: 380, cols: 3, card: 'grid',
    main: ['player', 'title', 'channel', 'actions', 'description'], sidebar: ['comments'], hidden: ['merch', 'recommendations', 'chat'] }
};
const NAMES = { player: 'Player', title: 'Title', description: 'Description', channel: 'Channel', actions: 'Actions', merch: 'Merch shelf',
  comments: 'Comments', recommendations: 'Recommendations', chat: 'Live chat' };
const PIECES = {
  actions: { likes: 'Like and dislike', share: 'Share', save: 'Save', download: 'Download', clip: 'Clip', thanks: 'Thanks' },
  channel: { avatar: 'Avatar', name: 'Channel name', join: 'Join', subscribe: 'Subscribe' },
  description: { info: 'Views and date', text: 'Description text' },
  related: { chips: 'Filter chips', videos: 'Videos' }
};
const BLOCK_GROUP = { actions: 'actions', channel: 'channel', description: 'description', recommendations: 'related' };
const HOME_NAMES = { hero: 'Carousel', continue: 'Continue watching', subs: 'From your subscriptions', recommended: 'Recommended' };
const TB_NAMES = { menu: 'Menu', logo: 'Logo', search: 'Search', voice: 'Voice search', create: 'Create', nav: 'Home, Subscriptions, You',
  notifications: 'Notifications', avatar: 'Account' };
const PAGE_DEF = {
  subs: { title: 'Subscriptions', cols: true, secs: { shorts: 'Shorts', live: 'Live streams', upcoming: 'Upcoming premieres', watched: 'Videos you have watched' } },
  search: { title: 'Search results', secs: { shorts: 'Shorts', shelves: '"For you" and similar shelves', channels: 'Channel results', playlists: 'Playlists and mixes' } },
  channel: { title: 'Channel pages', cols: true, header: true, secs: { banner: 'Banner', trailer: 'Channel trailer', shorts: 'Shorts shelf' } }
};
const ZONES = { header: ['Header', 'The channel banner lives here'], top: ['Top', 'Pinned above YouTube\'s results'],
  inline: ['In YouTube\'s order', 'Left where YouTube puts them'], bottom: ['Bottom', 'Moved after YouTube\'s results'] };
const pageZones = (pg) => [...(PAGE_DEF[pg].header ? ['header'] : []), 'top', 'inline', 'bottom'];
const D = structuredClone(EYT_DEFAULTS);
const VIEWS = ['watch', 'stack', 'home', 'topbar', 'pages'];
const URLS = { watch: 'youtube.com/watch', stack: 'youtube.com/watch, narrow window', home: 'youtube.com', topbar: 'youtube.com, top bar', pages: 'subscriptions, search, channels' };

// ---------------------------------------------------------------- mock content
const THUMBS = [['#5b6b7a', '#2e3a46'], ['#9a6b3f', '#4a2f1c'], ['#4c6b4f', '#22362a'], ['#7a5a8a', '#38264a'], ['#a35a4f', '#4a221e'], ['#4f7a8a', '#1f3a44']];
const RECS = [['Cleaning fungus out of old lenses', 'Bench & Lens', '214K views'], ['Pushing Tri-X two stops', 'Grain Lab', '88K views'],
  ['Why rangefinders came back', 'Optic Notes', '1.1M views'], ['Home C-41 in a sink', 'Grain Lab', '302K views'],
  ['Light seals in 10 minutes', 'Bench & Lens', '57K views'], ['Scanning negatives with a phone', 'Frame Rate', '640K views']];
const grad = (i) => `background:linear-gradient(135deg,${THUMBS[i % 6][0]},${THUMBS[i % 6][1]})`;
const card = ([t, c, v], i) => h('div', { class: 'card' }, h('div', { class: 'th', style: grad(i) }, h('em', {}, `${12 + i * 3}:0${i}`)),
  h('div', { class: 'meta' }, h('span', { class: 'dot' }), h('div', {}, h('b', {}, t), h('small', {}, c), h('small', {}, ' · ' + v))));
const sk = (w) => h('span', { class: 'sk', style: `width:${w}%` });
const playerMock = () => h('div', { class: 'player' }, h('span', { class: 'play' }), h('span', { class: 'prog' }), h('span', { class: 'ctl' }, '0:42 / 13:31'));

// a draggable piece; `anchor` pieces stay put (the recommendations grid)
function piece(group, id, cls, ...body) {
  const name = (PIECES[group] || TB_NAMES)[id] || id;
  const anchor = /\banchor\b/.test(cls || '');
  return h('span', { class: `piece ${cls || ''}`, tabindex: anchor ? null : 0, 'data-id': id, 'aria-label': name, title: anchor ? null : `${name}: drag to move` },
    h('span', { class: 'piece-label' }, name), h('span', { class: 'piece-body' }, ...body),
    anchor ? null : h('button', { type: 'button', class: 'px', 'aria-label': `Hide ${name}`, title: 'Hide', tabindex: -1 }, '×'));
}
const pieceEls = {
  actions: {
    likes: piece('actions', 'likes', '', icon('like'), '41K', h('span', { class: 'sub' }, '│'), icon('like', true)),
    share: piece('actions', 'share', '', icon('share'), 'Share'), save: piece('actions', 'save', '', icon('save'), 'Save'),
    download: piece('actions', 'download', '', icon('download'), 'Download'), clip: piece('actions', 'clip', '', icon('clip'), 'Clip'),
    thanks: piece('actions', 'thanks', '', icon('thanks'), 'Thanks')
  },
  channel: {
    avatar: piece('channel', 'avatar', 'plain', h('span', { class: 'av' })),
    name: piece('channel', 'name', 'plain ch-name', h('span', {}, h('b', {}, 'Bench & Lens'), h('small', {}, '1.2M subscribers'))),
    join: piece('channel', 'join', '', 'Join'), subscribe: piece('channel', 'subscribe', 'dark', 'Subscribe')
  },
  description: {
    info: piece('description', 'info', '', h('b', {}, '812K views  ·  3 days ago')),
    text: piece('description', 'text', '', 'A full teardown of a seized leaf shutter, from cleaning the blades to re-timing at 1/500 s. ', h('b', {}, '...more'))
  },
  related: {
    chips: piece('related', 'chips', '', h('span', { class: 'chips' }, h('span', {}, 'All'), h('span', {}, 'From Bench & Lens'), h('span', {}, 'Related'))),
    videos: piece('related', 'videos', 'anchor', h('div', { class: 'vgrid' }, RECS.map(card)))
  }
};
const pieceList = (block) => h('div', { class: 'pieces', 'data-group': 'p-' + BLOCK_GROUP[block], 'aria-label': `${NAMES[block]} parts` });
function blockBody(id) {
  switch (id) {
    case 'player': return playerMock();
    case 'title': return h('h3', { class: 'title' }, 'Restoring a 1978 film camera with a broken shutter');
    case 'channel': case 'actions': case 'recommendations': return pieceList(id);
    case 'description': return h('div', { class: 'desc-box' }, pieceList('description'));
    case 'comments': return [h('div', { class: 'tabs' }, h('span', {}, 'Comments'), h('span', {}, 'Description'), h('span', {}, 'Tweaks')),
      h('b', {}, '2,318 Comments'), ...[[40], [95, 80], [90, 55]].map((ws) => h('div', { class: 'cm' }, h('span', { class: 'dot' }), h('div', {}, ws.map(sk))))];
    case 'merch': return [h('b', {}, 'Shop the store'), h('div', { class: 'merch-items' }, h('i'), h('i'), h('i'), h('i'))];
    case 'chat': return h('div', { class: 'chatbox' }, sk(70), sk(50), sk(80));
  }
  return null;
}
function block(id, name, body, opts = {}) {
  return h('div', { class: `block ${opts.cls || ''}`, tabindex: 0, 'data-id': id, 'aria-label': `${name}: drag to move, Delete to hide` },
    h('div', { class: 'block-bar' }, h('span', { class: 'block-name' }, name),
      opts.fixed ? null : h('button', { type: 'button', class: 'x', 'aria-label': `Hide ${name}`, tabindex: -1 }, 'Hide')),
    body != null ? h('div', { class: 'block-body' }, body) : null);
}
const watchBlocks = Object.fromEntries(Object.keys(NAMES).map((id) => [id, block(id, NAMES[id], blockBody(id), { fixed: id === 'player' })]));
const blockPieces = (g) => watchBlocks[Object.keys(BLOCK_GROUP).find((b) => BLOCK_GROUP[b] === g)].querySelector('.pieces');
for (const g of Object.keys(PIECES)) blockPieces(g).append(...Object.values(pieceEls[g]));
const stackBlocks = Object.fromEntries(Object.keys(NAMES).map((id) => [id, block(id, NAMES[id],
  id === 'player' ? playerMock() : [sk(30 + (id.length * 7) % 50)], { cls: 'compact', fixed: id === 'player' })]));
const homeBlocks = {
  hero: block('hero', 'Carousel', h('div', { class: 'hero' }, h('small', {}, 'Continue watching'), h('b', {}, 'Restoring a 1978 film camera'), h('span', { class: 'pill' }, '▶ Resume'))),
  continue: block('continue', 'Continue watching', [h('h3', { class: 'shelf-h' }, 'Continue watching'),
    h('div', { class: 'strip prog' }, [72, 35, 88, 20].map((p, i) => h('i', { style: `${grad(i)};--p:${p}%` })))]),
  subs: block('subs', 'From your subscriptions', [h('h3', { class: 'shelf-h' }, 'From your subscriptions'), h('div', { class: 'strip' }, [2, 3, 4, 5].map((i) => h('i', { style: grad(i) })))]),
  recommended: block('recommended', 'Recommended', [h('h3', { class: 'shelf-h' }, 'Recommended for you'), h('div', { class: 'vgrid', style: '--cols:4' }, RECS.slice(0, 4).map(card))])
};
const tbEls = {
  menu: piece('tb', 'menu', '', icon('menu')), logo: piece('tb', 'logo', '', h('span', { class: 'logo' }, h('i'), 'YouTube')),
  search: piece('tb', 'search', 'search', 'Search', icon('search')), voice: piece('tb', 'voice', '', icon('mic')),
  create: piece('tb', 'create', '', icon('create'), 'Create'), nav: piece('tb', 'nav', '', icon('home'), icon('subs'), icon('you')),
  notifications: piece('tb', 'notifications', '', icon('bell')), avatar: piece('tb', 'avatar', '', h('span', { class: 'avatar' }))
};
const pageEls = Object.fromEntries(Object.entries(PAGE_DEF).map(([pg, def]) =>
  [pg, Object.fromEntries(Object.entries(def.secs).map(([id, name]) => [id, block(id, name, null)]))]));

// ---------------------------------------------------------------- lists (every drop target), grouped
const lists = {};
const list = (sel, group) => { const el = $(sel); el.dataset.group = group; lists[sel] = el; return el; };
['#main', '#side', '#hidden'].forEach((s) => list(s, 'blocks'));
['#stackMain', '#stackHidden'].forEach((s) => list(s, 'stack'));
['#homeMain', '#homeHidden'].forEach((s) => list(s, 'home'));
['#tbLeft', '#tbCenter', '#tbRight', '#tbHidden'].forEach((s) => list(s, 'tb'));
for (const g of Object.keys(PIECES)) list('#hid-' + g, 'p-' + g);
// the Pages view: one card per page, each with its zones
const colsOut = {};
for (const [pg, def] of Object.entries(PAGE_DEF)) {
  const zones = pageZones(pg).map((z) => h('div', { class: `pz ${z === 'inline' ? 'youtube' : ''}` },
    h('span', { class: 'zone-tag' }, ZONES[z][0]),
    h('div', { class: 'list', id: `pg-${pg}-${z}`, 'data-empty': ZONES[z][1], 'aria-label': `${def.title}: ${ZONES[z][0]}` })));
  const cols = def.cols ? h('div', { class: 'range' }, h('label', { class: 'lab', htmlFor: `cols-${pg}` }, 'Columns'),
    h('input', { type: 'range', id: `cols-${pg}`, min: 1, max: 8, step: 1, 'data-page': pg }), colsOut[pg] = h('output', {})) : null;
  $('#pagesGrid').append(h('section', { class: 'pgcard', 'data-page': pg, 'aria-label': def.title }, h('h3', {}, def.title), cols, ...zones));
  for (const z of [...pageZones(pg), 'hidden']) list(`#pg-${pg}-${z}`, 'pg-' + pg);
}
const isTray = (el) => el.classList.contains('tray');
const trayOf = (group) => Object.values(lists).find((l) => l.dataset.group === group && isTray(l));
const allLists = () => Object.values(lists).concat(Object.keys(PIECES).map(blockPieces));

// ---------------------------------------------------------------- model, validation
// partition `src` into `zones` so that every known id appears exactly once (missing ones go where the default has them)
function partition(src, zones, known, dflt) {
  const out = {}, seen = new Set();
  for (const z of zones) out[z] = (Array.isArray(src?.[z]) ? src[z] : []).filter((id) => typeof id === 'string' && known.includes(id) && !seen.has(id) && seen.add(id));
  for (const id of known) if (!seen.has(id)) out[zones.find((z) => (dflt[z] || []).includes(id)) || zones[0]].push(id);
  return out;
}
const clampN = (n, lo, hi, d) => (n != null && Number.isFinite(+n) ? Math.min(Math.max(+n, lo), hi) : d);
const fixLayout = (L) => {
  const p = partition(L, ['main', 'sidebar', 'hidden'], Object.keys(NAMES), D.layout);
  if (p.hidden.includes('player')) { p.hidden = p.hidden.filter((x) => x !== 'player'); p.main.unshift('player'); }
  return { side: L?.side === 'left' ? 'left' : 'right', width: clampN(L?.width, 300, 560, 400), cols: clampN(L?.cols, 1, 5, 3), card: L?.card === 'list' ? 'list' : 'grid', ...p };
};
const fixPieces = (P) => Object.fromEntries(Object.keys(PIECES).map((g) => {
  const p = partition(P?.[g], ['order', 'hidden'], Object.keys(PIECES[g]), D.pieces[g]);
  if (g === 'related') { p.hidden = p.hidden.filter((x) => x !== 'videos'); p.order = [...p.order.filter((x) => x !== 'videos'), 'videos']; }
  return [g, p];
}));
const fixHome = (H) => { const p = partition(H, ['shown', 'hidden'], Object.keys(HOME_NAMES), D.homeLayout); const i = p.shown.indexOf('recommended'); if (i >= 0) p.shown.push(...p.shown.splice(i, 1)); return p; };
const fixStack = (S) => {
  const p = partition(S, ['order', 'hidden'], Object.keys(NAMES), D.stackLayout);
  if (p.hidden.includes('player')) { p.hidden = p.hidden.filter((x) => x !== 'player'); p.order.unshift('player'); }
  return { ...p, theater: !!S?.theater };
};
const fixTopbar = (T) => partition(T, ['left', 'center', 'right', 'hidden'], Object.keys(TB_NAMES), D.topbarLayout);
const fixPages = (P) => Object.fromEntries(Object.keys(PAGE_DEF).map((pg) => {
  const src = { ...(P?.[pg] || {}) };
  if (!src.hidden && Array.isArray(src.hide)) src.hidden = src.hide; // the first format: hidden sections only
  const p = partition(src, [...pageZones(pg), 'hidden'], Object.keys(PAGE_DEF[pg].secs), D.pageLayouts[pg]);
  if (PAGE_DEF[pg].header) { // the banner can only be in the header (or hidden); nothing else can
    for (const z of ['top', 'inline', 'bottom']) if (p[z].includes('banner')) { p[z] = p[z].filter((x) => x !== 'banner'); p.header.push('banner'); }
    p.inline.push(...p.header.filter((x) => x !== 'banner')); p.header = p.header.filter((x) => x === 'banner');
  }
  return [pg, { ...(PAGE_DEF[pg].cols ? { cols: +src.cols >= 2 ? Math.min(+src.cols, 8) : 0 } : {}), ...p }];
}));
const modelFrom = (s) => ({ layout: fixLayout(s.layout), pieces: fixPieces(s.pieces), home: fixHome(s.homeLayout), stack: fixStack(s.stackLayout),
  topbar: fixTopbar(s.topbarLayout), pages: fixPages(s.pageLayouts) });
const storageOf = (m) => ({ layout: m.layout, pieces: m.pieces, homeLayout: m.home, stackLayout: m.stack, topbarLayout: m.topbar, pageLayouts: m.pages });
let M = modelFrom(D);

// ---------------------------------------------------------------- render: put every element where the model says
const ids = (el) => [...el.children].map((c) => c.dataset.id).filter(Boolean);
const place = (el, order, els) => { for (const id of order) if (els[id]) el.append(els[id]); };
const press = (sel, attr, v) => { for (const b of $$(sel + ' button')) b.setAttribute('aria-pressed', String(b.dataset[attr] === v)); };
function renderAll() {
  place(lists['#main'], M.layout.main, watchBlocks); place(lists['#side'], M.layout.sidebar, watchBlocks); place(lists['#hidden'], M.layout.hidden, watchBlocks);
  for (const g of Object.keys(PIECES)) { place(blockPieces(g), M.pieces[g].order, pieceEls[g]); place(lists['#hid-' + g], M.pieces[g].hidden, pieceEls[g]); }
  place(lists['#stackMain'], M.stack.order, stackBlocks); place(lists['#stackHidden'], M.stack.hidden, stackBlocks);
  place(lists['#homeMain'], M.home.shown, homeBlocks); place(lists['#homeHidden'], M.home.hidden, homeBlocks);
  for (const [z, sel] of [['left', '#tbLeft'], ['center', '#tbCenter'], ['right', '#tbRight'], ['hidden', '#tbHidden']]) place(lists[sel], M.topbar[z], tbEls);
  for (const pg of Object.keys(PAGE_DEF)) for (const z of [...pageZones(pg), 'hidden']) place(lists[`#pg-${pg}-${z}`], M.pages[pg][z], pageEls[pg]);
  const L = M.layout;
  // like the real page: with actions and recommendations both in the main column, channel and actions share one row
  // above the recommendations (src/main.js, `inline`)
  const inline = L.main.includes('actions') && L.main.includes('recommendations');
  lists['#main'].classList.toggle('inline-row', inline);
  const recAt = L.main.indexOf('recommendations') * 2;
  L.main.forEach((id, i) => { watchBlocks[id].style.order = !inline ? '' : String(id === 'channel' || id === 'actions' ? recAt - 1 : i * 2); });
  for (const id of [...L.sidebar, ...L.hidden]) watchBlocks[id].style.order = '';
  $('#page').classList.toggle('left', L.side === 'left');
  $('#page').style.setProperty('--side', Math.round(L.width * 0.62) + 'px'); // the mock page is about 62% of a real one
  for (const g of $$('.vgrid', watchBlocks.recommendations)) { g.style.setProperty('--cols', L.cols); g.classList.toggle('list', L.card === 'list'); }
  $('#sideW').value = L.width; $('#sideWv').textContent = L.width + 'px';
  $('#cols').value = L.cols; $('#colsv').textContent = L.cols;
  press('#sidePos', 'side', L.side); press('#cardStyle', 'card', L.card);
  const { side, width, cols, card: c, main, sidebar, hidden } = L;
  press('#presets', 'preset', Object.entries(PRESETS).find(([, p]) => JSON.stringify(p) === JSON.stringify({ side, width, cols, card: c, main, sidebar, hidden }))?.[0] || '');
  $('#stackTheater').setAttribute('aria-checked', String(!!M.stack.theater));
  $('#stackNote').textContent = M.stack.theater ? ', and in theater mode' : '';
  for (const pg of Object.keys(colsOut)) { const n = M.pages[pg].cols; $(`#cols-${pg}`).value = n || 1; colsOut[pg].textContent = n > 1 ? String(n) : 'Auto'; }
  save();
}
// after any move: read every list back into the model, apply the rules (via the same fixers as loading), re-render
function readAll() {
  const m = { layout: { ...M.layout, main: ids(lists['#main']), sidebar: ids(lists['#side']), hidden: ids(lists['#hidden']) },
    pieces: Object.fromEntries(Object.keys(PIECES).map((g) => [g, { order: ids(blockPieces(g)), hidden: ids(lists['#hid-' + g]) }])),
    stack: { ...M.stack, order: ids(lists['#stackMain']), hidden: ids(lists['#stackHidden']) },
    home: { shown: ids(lists['#homeMain']), hidden: ids(lists['#homeHidden']) },
    topbar: { left: ids(lists['#tbLeft']), center: ids(lists['#tbCenter']), right: ids(lists['#tbRight']), hidden: ids(lists['#tbHidden']) },
    pages: Object.fromEntries(Object.keys(PAGE_DEF).map((pg) => [pg, { ...M.pages[pg],
      ...Object.fromEntries([...pageZones(pg), 'hidden'].map((z) => [z, ids(lists[`#pg-${pg}-${z}`])])) }])) };
  M = modelFrom(storageOf(m));
}
function commit(moved) {
  readAll(); renderAll();
  if (moved) { moved.classList.remove('settle'); void moved.offsetWidth; moved.classList.add('settle'); }
}

// ---------------------------------------------------------------- dragging, hiding, restoring, keyboard moves
const NO_HIDE = (el) => el.dataset.id === 'player' || el.classList.contains('anchor');
for (const el of allLists()) {
  const holdsPieces = el.dataset.group === 'blocks';
  Sortable.create(el, {
    group: el.dataset.group, animation: 180, easing: 'cubic-bezier(.2,.7,.2,1)', ghostClass: 'splice', chosenClass: 'lifted-item',
    // block lists ignore drags that start on a piece (the piece's own row handles those)
    filter: holdsPieces ? '.x, .px, .piece' : '.x, .px, .anchor', preventOnFilter: false,
    onMove: (e) => {
      const id = e.dragged.dataset.id, to = e.to;
      if (NO_HIDE(e.dragged) && isTray(to)) return false;
      if (e.related?.classList.contains('anchor') && e.willInsertAfter) return false; // nothing goes after the videos grid
      if (to.dataset.group === 'pg-channel') return (id === 'banner') === (to.id.endsWith('-header') || isTray(to));
      return true;
    },
    onStart: () => document.body.classList.add('dragging'),
    onEnd: (e) => { document.body.classList.remove('dragging'); commit(e.item); }
  });
}
const nameOf = (it) => (it.getAttribute('aria-label') || '').split(':')[0];
function hideItem(it) {
  if (!it || NO_HIDE(it)) return;
  const tray = trayOf(it.parentElement.dataset.group); if (!tray) return;
  tray.append(it); commit(); flashMsg(`Hidden: ${nameOf(it)}`);
}
function restoreItem(it) {
  const g = it.parentElement.dataset.group, id = it.dataset.id;
  let to;
  if (g === 'blocks') to = lists['#side'];
  else if (g === 'stack') to = lists['#stackMain'];
  else if (g === 'home') {
    to = lists['#homeMain'];
    if (id !== 'recommended' && homeBlocks.recommended.parentElement === to) { homeBlocks.recommended.before(it); commit(it); it.focus(); return; }
  } else if (g === 'tb') to = lists[{ left: '#tbLeft', center: '#tbCenter', right: '#tbRight' }[['left', 'center', 'right'].find((z) => D.topbarLayout[z].includes(id)) || 'right']];
  else if (g.startsWith('p-')) to = blockPieces(g.slice(2));
  else if (g.startsWith('pg-')) to = lists[`#pg-${g.slice(3)}-${id === 'banner' ? 'header' : 'inline'}`];
  if (!to) return;
  to.append(it); commit(it); it.focus(); flashMsg(`Shown: ${nameOf(it)}`);
}
document.addEventListener('click', (e) => {
  const x = e.target.closest('.x, .px');
  if (x) { e.preventDefault(); e.stopPropagation(); hideItem(x.closest('.block, .piece')); return; }
  const chip = e.target.closest('.tray > .block, .tray > .piece');
  if (chip) restoreItem(chip);
});
// keyboard: Alt+arrows move within a row or column, Alt+Shift+arrows move to the next one, Delete hides, Enter restores
document.addEventListener('keydown', (e) => {
  const it = e.target;
  if (!it.matches?.('.block, .piece') || !it.parentElement?.dataset.group) return;
  const lst = it.parentElement;
  if (isTray(lst)) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); restoreItem(it); } return; }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    const next = it.nextElementSibling || it.previousElementSibling;
    hideItem(it); (next?.matches('.block, .piece:not(.anchor)') ? next : null)?.focus();
    return;
  }
  if (!e.altKey || !/^Arrow/.test(e.key)) return;
  e.preventDefault();
  const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
  if (e.shiftKey) {
    const peers = allLists().filter((l) => l.dataset.group === lst.dataset.group && !isTray(l) && l.offsetParent);
    const to = peers[(peers.indexOf(lst) + (back ? -1 : 1) + peers.length) % peers.length];
    if (to && to !== lst) to.append(it);
  } else if (back && it.previousElementSibling) it.previousElementSibling.before(it);
  else if (!back && it.nextElementSibling && !it.nextElementSibling.classList.contains('anchor')) it.nextElementSibling.after(it);
  commit(it); it.focus();
  flashMsg(`Moved: ${nameOf(it)}`);
});

// ---------------------------------------------------------------- saving + undo
let profiles = [], active = '', loaded = {}, ready = false, saveTimer = 0;
const cur = () => profiles.find((p) => p.id === active);
function save() {
  if (!ready) return;
  snapshot();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 300);
}
// writes only when an edit is pending, and only the layout keys (settings belong to the Settings panel)
function flush() {
  if (!saveTimer || !ready) return;
  clearTimeout(saveTimer); saveTimer = 0;
  const data = structuredClone(storageOf(M));
  Object.assign(cur(), data);
  chrome.storage.sync.set({ ...data, ...eytProfilesPatch(profiles, [active]), activeProfile: active, layoutV: 2 }, () => {
    const err = chrome.runtime?.lastError;
    flashMsg(err ? 'Not saved: ' + err.message : 'Saved', err ? 'err' : 'rec');
    if (Array.isArray(loaded.profiles)) { chrome.storage.sync.remove('profiles'); delete loaded.profiles; } // first format of profiles
  });
}
let undoStack = [], redoStack = [], lastSnap = null, lastPush = 0, lastSlider = '', sliding = '';
function snapshot() {
  const now = JSON.stringify(M);
  if (now === lastSnap) return;
  if (lastSnap !== null) {
    const sameDrag = sliding && sliding === lastSlider && Date.now() - lastPush < 1000; // one slider drag is one step
    if (!sameDrag || !undoStack.length) undoStack.push(lastSnap);
    if (undoStack.length > 80) undoStack.shift();
    redoStack = [];
    lastPush = Date.now();
  }
  lastSlider = sliding; sliding = '';
  lastSnap = now;
  renderUndo();
}
const restoreSnap = (json) => { M = JSON.parse(json); lastSnap = json; renderAll(); };
const undo = () => { snapshot(); if (!undoStack.length) return; redoStack.push(lastSnap); restoreSnap(undoStack.pop()); renderUndo(); flashMsg('Undone'); };
const redo = () => { if (!redoStack.length) return; undoStack.push(lastSnap); restoreSnap(redoStack.pop()); renderUndo(); flashMsg('Redone'); };
function renderUndo() { $('#undo').disabled = !undoStack.length; $('#redo').disabled = !redoStack.length; }
$('#undo').onclick = undo;
$('#redo').onclick = redo;
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
});
let flashT;
function flashMsg(msg, kind) {
  const t = $('#tally');
  $('#toast').textContent = msg;
  t.classList.remove('rec', 'err'); void t.offsetWidth;
  if (kind) t.classList.add(kind);
  clearTimeout(flashT);
  flashT = setTimeout(() => t.classList.remove('err'), 2600);
}

// ---------------------------------------------------------------- view controls
const update = (patch) => { Object.assign(M.layout, patch); renderAll(); };
$('#presets').onclick = (e) => { const p = e.target.closest('button')?.dataset.preset; if (p) { M.layout = structuredClone(PRESETS[p]); renderAll(); flashMsg(`Preset: ${p}`); } };
$('#sidePos').onclick = (e) => { const v = e.target.closest('button')?.dataset.side; if (v) update({ side: v }); };
$('#cardStyle').onclick = (e) => { const v = e.target.closest('button')?.dataset.card; if (v) update({ card: v }); };
$('#sideW').oninput = (e) => { sliding = 'sideW'; update({ width: +e.target.value }); };
$('#cols').oninput = (e) => { sliding = 'cols'; update({ cols: +e.target.value }); };
$('#stackTheater').onclick = () => { M.stack.theater = !M.stack.theater; renderAll(); };
$('#pagesGrid').addEventListener('input', (e) => {
  const r = e.target.closest('input[type=range][data-page]'); if (!r) return;
  sliding = 'cols-' + r.dataset.page;
  M.pages[r.dataset.page].cols = +r.value > 1 ? +r.value : 0;
  renderAll();
});
let view = 'watch';
$('#reset').onclick = () => {
  const d = modelFrom(D);
  if (view === 'watch') { M.layout = structuredClone(PRESETS.experimental); M.pieces = d.pieces; }
  else if (view === 'stack') M.stack = d.stack;
  else if (view === 'home') M.home = d.home;
  else if (view === 'topbar') M.topbar = d.topbar;
  else M.pages = d.pages;
  renderAll(); flashMsg('Page reset');
};
function showView(v) {
  view = VIEWS.includes(v) ? v : 'watch';
  for (const x of VIEWS) document.body.classList.toggle('view-' + x, x === view);
  for (const b of $$('#pageSel button')) b.setAttribute('aria-pressed', String(b.dataset.view === view));
  $('#url').textContent = URLS[view];
  try { history.replaceState(null, '', view === 'watch' ? location.pathname : '#' + view); } catch {}
}
$('#pageSel').onclick = (e) => { const v = e.target.closest('button')?.dataset.view; if (v) showView(v); };
showView(location.hash.slice(1));

// ---------------------------------------------------------------- the studio's own panels: three docks, drag + fold
const local = chrome.storage.local || { get: (d, cb) => cb(d), set: () => {} };
const DOCKS = { left: $('#dockLeft'), bottom: $('#dockBottom'), right: $('#dockRight') };
const PANELS = Object.fromEntries($$('#panelStore .panel').map((p) => [p.dataset.panel, p]));
const WS_DEFAULT = { left: [], right: ['layout', 'hidden'], bottom: ['profile', 'settings'], folded: [] };
let ws = structuredClone(WS_DEFAULT);
function placePanels() {
  const seen = new Set();
  for (const d of ['left', 'right', 'bottom']) for (const id of ws[d] || []) if (PANELS[id] && !seen.has(id)) { seen.add(id); DOCKS[d].append(PANELS[id]); }
  for (const id of Object.keys(PANELS)) if (!seen.has(id)) DOCKS[['left', 'right', 'bottom'].find((d) => WS_DEFAULT[d].includes(id)) || 'right'].append(PANELS[id]);
  for (const [id, p] of Object.entries(PANELS)) {
    const f = (ws.folded || []).includes(id);
    p.classList.toggle('folded', f);
    p.querySelector('.fold').setAttribute('aria-expanded', String(!f));
  }
}
function readPanels() {
  ws = { ...Object.fromEntries(Object.entries(DOCKS).map(([d, el]) => [d, [...el.children].map((p) => p.dataset.panel)])),
    folded: Object.keys(PANELS).filter((id) => PANELS[id].classList.contains('folded')) };
  local.set({ studioWorkspace: ws });
}
for (const el of Object.values(DOCKS)) {
  Sortable.create(el, { group: 'panels', handle: '.grip', animation: 220, easing: 'cubic-bezier(.2,.7,.2,1)', ghostClass: 'panel-ghost', chosenClass: 'lifted',
    onStart: () => document.body.classList.add('moving-panel'),
    onEnd: () => { document.body.classList.remove('moving-panel'); readPanels(); } });
}
for (const p of Object.values(PANELS)) {
  const fold = p.querySelector('.fold');
  fold.onclick = () => { p.classList.toggle('folded'); fold.setAttribute('aria-expanded', String(!p.classList.contains('folded'))); readPanels(); };
  // grip keys: up / down within the dock, left / right to the next dock
  p.querySelector('.grip').addEventListener('keydown', (e) => {
    if (!/^Arrow/.test(e.key)) return;
    e.preventDefault();
    const order = ['left', 'bottom', 'right'], d = order.indexOf(p.parentElement.dataset.dock);
    if (e.key === 'ArrowUp' && p.previousElementSibling) p.previousElementSibling.before(p);
    else if (e.key === 'ArrowDown' && p.nextElementSibling) p.nextElementSibling.after(p);
    else if (e.key === 'ArrowLeft' && d > 0) DOCKS[order[d - 1]].append(p);
    else if (e.key === 'ArrowRight' && d < 2) DOCKS[order[d + 1]].append(p);
    else return;
    readPanels(); p.querySelector('.grip').focus();
    flashMsg(`${p.querySelector('h2').textContent.split(':')[0]} panel: ${p.parentElement.dataset.dock} dock`);
  });
}
$('#resetPanels').onclick = () => { ws = structuredClone(WS_DEFAULT); placePanels(); readPanels(); flashMsg('Panels reset'); };
placePanels();
local.get({ studioWorkspace: null }, (r) => { if (r?.studioWorkspace) { ws = r.studioWorkspace; placePanels(); } });

// light / dark (follows the system until you choose)
const THEME = 'eyt-studio-theme';
try { const t = localStorage.getItem(THEME); if (t) document.documentElement.dataset.theme = t; } catch {}
$('#theme').onclick = () => {
  const r = document.documentElement;
  const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  r.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem(THEME, r.dataset.theme); } catch {}
};

// ---------------------------------------------------------------- profiles
const strs = (a) => Array.isArray(a) && a.every((x) => typeof x === 'string');
const fixSettings = (o) => {
  if (!o || typeof o !== 'object') return undefined;
  const r = {};
  for (const k of EYT_PROFILE_SETTINGS) {
    const d = EYT_DEFAULTS[k], v = o[k];
    if (Array.isArray(d) ? strs(v) : typeof v === typeof d && (typeof v !== 'number' || Number.isFinite(v))) r[k] = structuredClone(v);
  }
  return Object.keys(r).length ? r : undefined;
};
const fixAuto = (a) => a && typeof a === 'object' ? { music: !!a.music, channels: strs(a.channels) ? a.channels.map((c) => c.trim()).filter(Boolean).slice(0, 50) : [] } : undefined;
const cleanName = (n) => (typeof n === 'string' ? n : '').trim().replace(/\s+/g, ' ').slice(0, 30);
const uniqueName = (n) => {
  const taken = (x) => profiles.some((p) => p.name.toLowerCase() === x.toLowerCase());
  if (!taken(n)) return n;
  for (let i = 2; ; i++) { const c = `${n.slice(0, 25)} (${i})`; if (!taken(c)) return c; }
};
function renderProfiles() {
  $('#profSel').replaceChildren(...profiles.map((p) => h('option', { value: p.id, selected: p.id === active }, p.name)));
  $('#profDel').disabled = profiles.length < 2;
  $('#profNew').disabled = profiles.length >= EYT_PROFILE_MAX;
  $('#profNew').title = profiles.length >= EYT_PROFILE_MAX ? `Up to ${EYT_PROFILE_MAX} profiles` : 'Save the current layouts as a new profile';
  const p = cur();
  $('#profName2').textContent = p.name;
  $('#profSettings').checked = !!p.settings;
  $('#profMusic').checked = !!p.auto?.music;
  $('#profChannels').value = (p.auto?.channels || []).join('\n');
}
function loadAll(s) {
  loaded = s;
  ({ profiles, active } = eytProfilesFrom(s));
  ready = false;
  M = modelFrom(s);
  renderAll(); renderProfiles();
  undoStack = []; redoStack = []; lastSnap = null; // undo doesn't cross profiles
  ready = true;
  snapshot();
  eytBuildForm($('#form'), s);
}
function switchTo(id, msg) {
  flush();
  eytGetAll((s) => eytSwitchProfile(s, id, () => eytGetAll((now) => { loadAll(now); flashMsg(msg || `Profile: ${cur().name}`, 'rec'); })));
}
$('#profSel').onchange = (e) => switchTo(e.target.value);
let profMode = '';
const openProfForm = (mode) => {
  profMode = mode;
  $('#profGroup').classList.add('editing');
  $('#profForm').hidden = false;
  const inp = $('#profName');
  inp.value = mode === 'rename' ? cur().name : '';
  inp.removeAttribute('aria-invalid');
  inp.focus(); inp.select();
};
const closeProfForm = () => { $('#profGroup').classList.remove('editing'); $('#profForm').hidden = true; $('#profSel').focus(); };
$('#profNew').onclick = () => openProfForm('new');
$('#profRen').onclick = () => openProfForm('rename');
$('#profCancel').onclick = closeProfForm;
$('#profForm').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeProfForm(); });
$('#profForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const inp = $('#profName'), name = cleanName(inp.value);
  const clash = profiles.some((p) => p.name.toLowerCase() === name.toLowerCase() && !(profMode === 'rename' && p.id === active));
  if (!name || clash) { inp.setAttribute('aria-invalid', 'true'); flashMsg(clash ? 'That name is taken' : 'Name the profile', 'err'); return; }
  closeProfForm();
  if (profMode === 'rename') { cur().name = name; renderProfiles(); chrome.storage.sync.set(eytProfilesPatch(profiles, [active]), () => flashMsg('Renamed', 'rec')); return; }
  // a new profile starts as a copy of the current layouts (not the settings)
  flush();
  const id = eytNewId();
  profiles.push({ id, name, ...structuredClone(storageOf(M)) });
  chrome.storage.sync.set(eytProfilesPatch(profiles, [active, id]), () => switchTo(id, `Created ${name}`));
});
$('#profDel').onclick = () => {
  if (profiles.length < 2 || !confirm(`Delete the profile "${cur().name}"?`)) return;
  const del = active, to = profiles.find((p) => p.id !== del).id;
  flush();
  eytGetAll((s) => {
    const patch = eytSwitchPatch(s, to);
    patch.profileIndex = patch.profileIndex.filter((e) => e.id !== del);
    delete patch[EYT_PROFILE_ITEM + del];
    chrome.storage.sync.set(patch, () => chrome.storage.sync.remove(EYT_PROFILE_ITEM + del, () => eytGetAll((now) => { loadAll(now); flashMsg('Profile deleted', 'rec'); })));
  });
};
$('#profSettings').onchange = (e) => {
  flush();
  const p = cur(), on = e.target.checked;
  eytGetAll((s) => {
    const patch = {};
    if (on) { p.settings = eytPick(s, EYT_PROFILE_SETTINGS); if (!s.sharedSettings) patch.sharedSettings = p.settings; } else delete p.settings;
    chrome.storage.sync.set({ ...patch, ...eytProfilesPatch(profiles, [p.id]) }, () => flashMsg(on ? 'Settings now kept with this profile' : 'Settings shared again', 'rec'));
  });
};
const saveAuto = () => {
  const p = cur();
  p.auto = { music: $('#profMusic').checked, channels: $('#profChannels').value.split('\n').map((c) => c.trim()).filter(Boolean).slice(0, 50) };
  if (!p.auto.music && !p.auto.channels.length) delete p.auto;
  flush();
  chrome.storage.sync.set(eytProfilesPatch(profiles, [p.id]), () => flashMsg('Saved', 'rec'));
};
$('#profMusic').onchange = saveAuto;
$('#profChannels').onchange = saveAuto;
$('#profExport').onclick = () => {
  flush();
  eytGetAll((s) => {
    const { profiles: all, active: a } = eytProfilesFrom(s);
    const out = all.map(({ id, ...p }) => {
      if (id === a) { Object.assign(p, eytPick(s, EYT_LAYOUT_KEYS)); if (p.settings) p.settings = eytPick(s, EYT_PROFILE_SETTINGS); }
      return p;
    });
    const json = JSON.stringify({ format: 'eliteyt-profiles', version: 2, exported: new Date().toISOString(), profiles: out }, null, 2);
    const a2 = h('a', { href: URL.createObjectURL(new Blob([json], { type: 'application/json' })), download: `eliteyt-profiles-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a2); a2.click(); a2.remove();
    setTimeout(() => URL.revokeObjectURL(a2.href), 10e3);
    flashMsg(`Exported ${out.length} profile${out.length > 1 ? 's' : ''}`, 'rec');
  });
};
$('#profImport').onclick = () => $('#profFile').click();
$('#profFile').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  let data;
  try { data = JSON.parse(await f.text()); } catch { flashMsg('That file is not valid JSON', 'err'); return; }
  const raws = Array.isArray(data?.profiles) ? data.profiles : typeof data?.name === 'string' ? [data] : null;
  if (!raws) { flashMsg('Not an EliteYT profile file', 'err'); return; }
  flush();
  const added = []; let skipped = 0;
  const pick = (raw, k, fix) => (raw[k] && typeof raw[k] === 'object' ? fix(raw[k]) : undefined);
  for (const raw of raws) {
    const name = cleanName(raw?.name);
    if (!name || profiles.length >= EYT_PROFILE_MAX) { skipped++; continue; }
    const p = { id: eytNewId(), name: uniqueName(name),
      // a watch layout only counts if it names real blocks
      layout: raw.layout && strs(raw.layout.main) && raw.layout.main.length && raw.layout.main.every((x) => x in NAMES) ? fixLayout(raw.layout) : undefined,
      homeLayout: pick(raw, 'homeLayout', fixHome), stackLayout: pick(raw, 'stackLayout', fixStack), pageLayouts: pick(raw, 'pageLayouts', fixPages),
      pieces: pick(raw, 'pieces', fixPieces), topbarLayout: pick(raw, 'topbarLayout', fixTopbar), settings: fixSettings(raw.settings), auto: fixAuto(raw.auto) };
    for (const k in p) if (p[k] === undefined) delete p[k];
    profiles.push(p); added.push(p.id);
  }
  if (!added.length) { flashMsg(skipped ? `Nothing imported (limit is ${EYT_PROFILE_MAX} profiles)` : 'No profiles in that file', 'err'); return; }
  chrome.storage.sync.set(eytProfilesPatch(profiles, added), () => {
    renderProfiles();
    flashMsg(`Imported ${added.length} profile${added.length > 1 ? 's' : ''}${skipped ? `, skipped ${skipped}` : ''}`, 'rec');
  });
};
// another page (YouTube tab, toolbar menu, keyboard shortcut) switched profiles, or a setting changed elsewhere
chrome.storage.onChanged?.addListener((ch, area) => {
  if (area !== 'sync' || !ready) return;
  if (ch.activeProfile && ch.activeProfile.newValue !== active) { eytGetAll(loadAll); return; }
  const settingChanged = Object.keys(ch).some((k) => k in EYT_DEFAULTS && !EYT_LAYOUT_KEYS.includes(k));
  if (settingChanged && !$('#form').contains(document.activeElement)) eytGetAll((s) => eytBuildForm($('#form'), s));
});

eytGetAll(loadAll);
