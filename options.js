const PRESETS = {
  experimental: { side: 'right', width: 400, cols: 3, card: 'grid',
    main: ['player', 'recommendations'], sidebar: ['title', 'description', 'channel', 'actions', 'merch', 'comments'], hidden: ['chat'] },
  classic: { side: 'right', width: 400, cols: 1, card: 'list',
    main: ['player', 'title', 'channel', 'actions', 'description', 'comments'], sidebar: ['chat', 'merch', 'recommendations'], hidden: [] },
  focus: { side: 'right', width: 380, cols: 3, card: 'grid',
    main: ['player', 'title', 'channel', 'actions', 'description'], sidebar: ['comments'], hidden: ['merch', 'recommendations', 'chat'] }
};
const NAMES = { player: 'Player', title: 'Title', description: 'Description', channel: 'Channel', actions: 'Actions', merch: 'Merch shelf', comments: 'Comments', recommendations: 'Recommendations', chat: 'Live chat' };
// home page sections; 'recommended' is YouTube's endless feed, so it always stays last
const HOME_DEFAULT = { shown: ['hero', 'continue', 'subs', 'recommended'], hidden: [] };
const HOME_NAMES = { hero: 'Carousel', continue: 'Continue watching', subs: 'From your subscriptions', recommended: 'Recommended' };
const THUMBS = [['#5b6b7a', '#2e3a46'], ['#9a6b3f', '#4a2f1c'], ['#4c6b4f', '#22362a'], ['#7a5a8a', '#38264a'], ['#a35a4f', '#4a221e'], ['#4f7a8a', '#1f3a44']];
const RECS = [['Cleaning fungus out of old lenses', 'Bench & Lens', '214K views'], ['Pushing Tri-X two stops', 'Grain Lab', '88K views'],
  ['Why rangefinders came back', 'Optic Notes', '1.1M views'], ['Home C-41 in a sink', 'Grain Lab', '302K views'],
  ['Light seals in 10 minutes', 'Bench & Lens', '57K views'], ['Scanning negatives with a phone', 'Frame Rate', '640K views']];

const $ = (s) => document.querySelector(s);
const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) k in e && k !== 'style' ? (e[k] = v) : e.setAttribute(k, v);
  e.append(...kids);
  return e;
};
const lists = { main: $('#main'), sidebar: $('#side'), hidden: $('#hidden') };
const blocks = {};
for (const el of $('#tpl').content.children) {
  const b = el.cloneNode(true);
  b.tabIndex = 0;
  b.prepend(h('span', { className: 'tag' }, b.dataset.id),
    h('button', { type: 'button', className: 'x', 'aria-label': `Hide ${NAMES[b.dataset.id]}`, title: 'Hide' }, '✕'));
  blocks[b.dataset.id] = b;
}
const grid = blocks.recommendations.querySelector('.grid');
RECS.forEach(([t, c, v], i) => {
  const [a, z] = THUMBS[i];
  grid.append(h('div', { className: 'card' },
    h('div', { className: 'th', style: `background:linear-gradient(135deg,${a},${z})` }, h('em', {}, `${12 + i * 3}:0${i}`)),
    h('div', { className: 'info' }, h('span', { className: 'av s' }),
      h('div', {}, h('b', {}, t), h('small', {}, c), h('small', {}, v)))));
});

// home page mock: same block chrome (tag + hide button) as the watch page
const homeLists = { shown: $('#homeMain'), hidden: $('#homeHidden') };
const homeBlocks = {};
for (const el of $('#tplHome').content.children) {
  const b = el.cloneNode(true);
  b.tabIndex = 0;
  b.prepend(h('span', { className: 'tag' }, b.dataset.id),
    h('button', { type: 'button', className: 'x', 'aria-label': `Hide ${HOME_NAMES[b.dataset.id]}`, title: 'Hide' }, '✕'));
  homeBlocks[b.dataset.id] = b;
}
for (const [id, pct] of [['continue', [72, 35, 88, 20]], ['subs', [0, 0, 0, 0]]]) {
  homeBlocks[id].querySelector('.strip').append(...pct.map((p, i) => {
    const [a, z] = THUMBS[(i + (id === 'subs' ? 2 : 0)) % THUMBS.length];
    return h('div', { style: `background:linear-gradient(135deg,${a},${z});--p:${p}%` }, id === 'subs' && i < 2 ? h('em', {}, 'New') : '');
  }));
}
homeBlocks.recommended.querySelector('.grid').append(...[...grid.children].map((c) => c.cloneNode(true)));
homeBlocks.recommended.style.setProperty('--cols', 4);


// ---- narrow-window / theater mock: its own copies of the blocks (a node can only sit in one list)
const STACK_DEFAULT = structuredClone(EYT_DEFAULTS.stackLayout);
const PAGES_DEFAULT = structuredClone(EYT_DEFAULTS.pageLayouts);
const stackLists = { order: $('#stackMain'), hidden: $('#stackHidden') };
const stackBlocks = {};
for (const [id, b] of Object.entries(blocks)) {
  const c = b.cloneNode(true);
  c.querySelectorAll('[data-pg="tweaks"], [data-pg="description"], .tabs').forEach((e) => e.remove());
  for (const e of [c, ...c.querySelectorAll('[id], [aria-controls]')]) { e.removeAttribute('id'); e.removeAttribute('aria-controls'); }
  stackBlocks[id] = c;
}
// ---- other pages: sections that can be hidden, and grid columns
const PAGE_SECTIONS = {
  subs: { title: 'Subscriptions', cols: true, items: [['shorts', 'Shorts'], ['watched', 'Videos you have already watched'],
    ['upcoming', 'Upcoming premieres and streams'], ['live', 'Live streams']] },
  search: { title: 'Search results', items: [['shorts', 'Shorts'], ['shelves', '"For you", "People also watched" and similar shelves'],
    ['channels', 'Channel results'], ['playlists', 'Playlists and mixes']] },
  channel: { title: 'Channel pages', cols: true, items: [['banner', 'Banner'], ['trailer', 'Channel trailer'], ['shorts', 'Shorts shelf']] }
};

let state, home, stack, pages, profiles = [], active = '', loaded = {};
const layoutOf = () => { const { tweaks: _t, ...L } = state; return structuredClone(L); };
const cur = () => profiles.find((p) => p.id === active);

// ---- saving: debounced (sync storage allows ~120 writes/min); every edit also lands in the active profile
let saveTimer = 0, ready = false;
const save = () => {
  if (!ready) return;
  snapshot();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 300);
};
// writes only when an edit is pending: a blind write would put back settings the popup changed meanwhile
function flush() {
  if (!saveTimer || !ready) return;
  clearTimeout(saveTimer); saveTimer = 0;
  const t = state.tweaks, layout = layoutOf();
  Object.assign(cur(), { layout, homeLayout: structuredClone(home), stackLayout: structuredClone(stack), pageLayouts: structuredClone(pages) });
  chrome.storage.sync.set({
    layout, homeLayout: home, stackLayout: stack, pageLayouts: pages,
    defaultSpeed: t.speed, musicSeparate: t.musicSeparate, musicSpeed: t.musicSpeed,
    exempt: t.exempt, volume: t.volume, autoQuality: t.autoQuality, noAmbient: t.noAmbient,
    pauseBlur: t.pauseBlur, pauseTitle: t.pauseTitle, ...eytProfilesPatch(profiles, [active]), activeProfile: active,
    layoutV: 2 // studio layouts are already current: the bridge's one-time migration must not rearrange them
  }, () => {
    flash(chrome.runtime?.lastError ? 'Not saved: ' + chrome.runtime.lastError.message : 'Saved');
    if (Array.isArray(loaded.profiles)) { chrome.storage.sync.remove('profiles'); delete loaded.profiles; } // first format of profiles
  });
}

// ---- undo / redo: snapshots of the four layouts (not the profile list or settings)
let undoStack = [], redoStack = [], lastSnap = null, lastPush = 0, lastSlider = '';
// set by slider input handlers: consecutive input from the same slider (one drag) is one undo step
let sliding = '';
const snapOf = () => JSON.stringify({ layout: layoutOf(), home, stack, pages });
function snapshot() {
  const now = snapOf();
  if (now === lastSnap) return;
  if (lastSnap !== null) {
    // one drag of a slider is one step
    const sameDrag = sliding && sliding === lastSlider && Date.now() - lastPush < 1000;
    if (!sameDrag || !undoStack.length) undoStack.push(lastSnap);
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
    lastPush = Date.now();
  }
  lastSlider = sliding; sliding = '';
  lastSnap = now;
  renderUndo();
}
function restore(json) {
  const x = JSON.parse(json);
  state = { ...x.layout, tweaks: state.tweaks }; home = x.home; stack = x.stack; pages = x.pages;
  lastSnap = json;
  renderAll();
}
const undo = () => { snapshot(); if (!undoStack.length) return; redoStack.push(lastSnap); restore(undoStack.pop()); renderUndo(); flash('Undone'); };
const redo = () => { if (!redoStack.length) return; undoStack.push(lastSnap); restore(redoStack.pop()); renderUndo(); flash('Redone'); };
function renderUndo() { $('#undo').disabled = !undoStack.length; $('#redo').disabled = !redoStack.length; }
$('#undo').onclick = undo;
$('#redo').onclick = redo;
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
});

// ---- watch page
function readLists() {
  for (const k of ['main', 'sidebar', 'hidden']) state[k] = [...lists[k].children].map((b) => b.dataset.id);
}
function render() {
  for (const k of ['main', 'sidebar', 'hidden']) for (const id of state[k]) blocks[id] && lists[k].append(blocks[id]);
  const page = $('#page');
  page.classList.toggle('left', state.side === 'left');
  page.style.setProperty('--side', state.width + 'px');
  blocks.recommendations.style.setProperty('--cols', state.cols);
  blocks.recommendations.classList.toggle('list', state.card === 'list');
  $('#sideW').value = state.width; $('#sideWv').textContent = state.width + 'px';
  $('#cols').value = state.cols; $('#colsv').textContent = state.cols;
  for (const b of document.querySelectorAll('#sidePos button')) b.setAttribute('aria-pressed', b.dataset.side === state.side);
  for (const b of document.querySelectorAll('#cardStyle button')) b.setAttribute('aria-pressed', b.dataset.card === state.card);
  const match = Object.entries(PRESETS).find(([, p]) => JSON.stringify(p) === JSON.stringify(layoutOf()))?.[0];
  renderTweaks();
  for (const b of document.querySelectorAll('#presets button')) b.setAttribute('aria-pressed', b.dataset.preset === match);
  save();
}
// ---- home page
function readHome() {
  for (const k of ['shown', 'hidden']) home[k] = [...homeLists[k].children].map((b) => b.dataset.id);
  // Recommended is YouTube's endless feed: nothing can sit below it
  const i = home.shown.indexOf('recommended');
  if (i >= 0 && i !== home.shown.length - 1) home.shown.push(...home.shown.splice(i, 1));
}
function renderHome() {
  for (const k of ['shown', 'hidden']) for (const id of home[k]) homeBlocks[id] && homeLists[k].append(homeBlocks[id]);
}
const homeChanged = () => { readHome(); renderHome(); save(); };
// ---- narrow windows / theater
function readStack() { for (const k of ['order', 'hidden']) stack[k] = [...stackLists[k].children].map((b) => b.dataset.id); }
function renderStack() {
  for (const k of ['order', 'hidden']) for (const id of stack[k]) stackBlocks[id] && stackLists[k].append(stackBlocks[id]);
  $('#stackTheater').setAttribute('aria-checked', String(!!stack.theater));
}
const stackChanged = () => { readStack(); renderStack(); save(); };
$('#stackTheater').onclick = () => { stack.theater = !stack.theater; renderStack(); save(); };
// ---- other pages
// slider position 1 = "Auto" (YouTube decides), stored as 0
const colsLabel = (n) => (n > 1 ? String(n) : 'Auto');
function renderPages() {
  $('#pagesGrid').replaceChildren(...Object.entries(PAGE_SECTIONS).map(([pg, def]) => {
    const P = pages[pg];
    return h('section', { className: 'pg-card' }, h('h3', {}, def.title),
      def.cols ? h('div', { className: 'pg-row' }, h('label', { htmlFor: `cols-${pg}` }, 'Columns'),
        h('input', { type: 'range', id: `cols-${pg}`, min: 1, max: 8, step: 1, value: P.cols || 1, 'data-page': pg }),
        h('span', { className: 'val' }, colsLabel(P.cols))) : '',
      h('p', { className: 'pg-hint' }, 'Show:'),
      ...def.items.map(([sec, label]) => h('div', { className: 'pg-row' }, h('span', {}, label),
        h('button', { type: 'button', className: 'sw', role: 'switch', 'aria-label': `${def.title}: ${label}`,
          'aria-checked': String(!P.hide.includes(sec)), 'data-page': pg, 'data-sec': sec }))));
  }));
}
$('#pagesGrid').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-sec]'); if (!b) return;
  const P = pages[b.dataset.page], sec = b.dataset.sec;
  P.hide = P.hide.includes(sec) ? P.hide.filter((x) => x !== sec) : [...P.hide, sec];
  renderPages(); save();
  $(`#pagesGrid button[data-page="${b.dataset.page}"][data-sec="${sec}"]`)?.focus();
});
$('#pagesGrid').addEventListener('input', (e) => {
  const r = e.target.closest('input[type=range][data-page]'); if (!r) return;
  sliding = 'cols-' + r.dataset.page;
  pages[r.dataset.page].cols = +r.value > 1 ? +r.value : 0;
  r.nextElementSibling.textContent = colsLabel(+r.value);
  save();
});
const renderAll = () => { renderHome(); renderStack(); renderPages(); render(); };

// ---- views
let view = 'watch';
const VIEWS = ['watch', 'stack', 'home', 'pages'];
function showView(v) {
  view = VIEWS.includes(v) ? v : 'watch';
  for (const x of VIEWS) document.body.classList.toggle('view-' + x, x === view);
  for (const b of document.querySelectorAll('#pageSel button')) b.setAttribute('aria-pressed', b.dataset.view === view);
  try { history.replaceState(null, '', view === 'watch' ? location.pathname : '#' + view); } catch {}
}
$('#pageSel').onclick = (e) => e.target.dataset.view && showView(e.target.dataset.view);
showView(location.hash.slice(1));

for (const k of ['shown', 'hidden']) {
  Sortable.create(homeLists[k], {
    group: 'home', animation: 150, filter: '.x', preventOnFilter: false,
    onStart: () => document.body.classList.add('dragging'),
    onEnd: () => { document.body.classList.remove('dragging'); homeChanged(); }
  });
}
homeLists.hidden.addEventListener('click', (e) => {
  const b = e.target.closest('.block'); if (!b || e.target.closest('.x')) return;
  // a restored section goes back above Recommended (YouTube's feed), or at the end when that is hidden
  const rec = homeBlocks.recommended;
  b !== rec && rec.parentNode === homeLists.shown ? rec.before(b) : homeLists.shown.append(b);
  homeChanged();
});
for (const k of ['order', 'hidden']) {
  Sortable.create(stackLists[k], {
    group: 'stack', animation: 150, filter: '.x', preventOnFilter: false,
    onMove: (e) => !(e.dragged.dataset.id === 'player' && e.to !== stackLists.order),
    onStart: () => document.body.classList.add('dragging'),
    onEnd: () => { document.body.classList.remove('dragging'); stackChanged(); }
  });
}
stackLists.hidden.addEventListener('click', (e) => {
  const b = e.target.closest('.block'); if (!b || e.target.closest('.x')) return;
  stackLists.order.append(b); stackChanged();
});
const tw = (id) => blocks.comments.querySelector('#' + id);
const fmtX = (n) => (+n).toString() + '×';
function renderTweaks() {
  const t = state.tweaks;
  tw('twSpeed').value = t.speed; tw('twSpeedV').textContent = fmtX(t.speed);
  tw('twSpeedChips').replaceChildren(...[1, 1.25, 1.5, 2, 3].map((v) =>
    h('button', { type: 'button', 'data-v': v, 'aria-pressed': v === t.speed }, fmtX(v))));
  tw('twMusic').setAttribute('aria-checked', t.musicSeparate);
  tw('twMusicSpeed').value = t.musicSpeed; tw('twMusicSpeedV').textContent = fmtX(t.musicSpeed);
  tw('twMusicRow').classList.toggle('tw-dim', !t.musicSeparate);
  tw('twMusicSpeed').classList.toggle('tw-dim', !t.musicSeparate);
  const list = tw('twList'); list.textContent = '';
  for (const name of t.exempt) {
    const chip = document.createElement('span'); chip.textContent = name;
    const x = document.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.dataset.rm = name; x.setAttribute('aria-label', 'Remove ' + name);
    chip.append(x); list.append(chip);
  }
  tw('twVol').value = t.volume; tw('twVolV').textContent = t.volume + '%';
  tw('twQual').setAttribute('aria-checked', t.autoQuality);
  tw('twAmb').setAttribute('aria-checked', t.noAmbient);
  tw('twBlur').setAttribute('aria-checked', t.pauseBlur);
  tw('twTitle').setAttribute('aria-checked', t.pauseTitle);
}
const setT = (patch) => { Object.assign(state.tweaks, patch); render(); };
const twPage = blocks.comments.querySelector('.tw');
twPage.addEventListener('input', (e) => {
  const id = e.target.id;
  if (id === 'twSpeed') setT({ speed: +e.target.value });
  if (id === 'twMusicSpeed') setT({ musicSpeed: +e.target.value });
  if (id === 'twVol') setT({ volume: +e.target.value });
});
twPage.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.v) setT({ speed: +b.dataset.v });
  else if (b.dataset.rm) setT({ exempt: state.tweaks.exempt.filter((n) => n !== b.dataset.rm) });
  else if (b.id === 'twMusic') setT({ musicSeparate: !state.tweaks.musicSeparate });
  else if (b.id === 'twQual') setT({ autoQuality: !state.tweaks.autoQuality });
  else if (b.id === 'twAmb') setT({ noAmbient: !state.tweaks.noAmbient });
  else if (b.id === 'twBlur') setT({ pauseBlur: !state.tweaks.pauseBlur });
  else if (b.id === 'twTitle') setT({ pauseTitle: !state.tweaks.pauseTitle });
});
tw('twForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = tw('twAdd').value.trim();
  if (name && !state.tweaks.exempt.some((n) => n.toLowerCase() === name.toLowerCase())) setT({ exempt: [...state.tweaks.exempt, name] });
  tw('twAdd').value = '';
});
function showPage(p) {
  for (const t of blocks.comments.querySelectorAll('.tabs button')) t.setAttribute('aria-selected', t.dataset.page === p);
  for (const g of blocks.comments.querySelectorAll('.pg')) g.hidden = g.dataset.pg !== p;
}
const update = (patch) => { Object.assign(state, patch); render(); };

for (const k of ['main', 'sidebar', 'hidden']) {
  Sortable.create(lists[k], {
    group: 'blocks', animation: 150, filter: '.x, .tw, .tabs', preventOnFilter: false,
    onMove: (e) => !(e.dragged.dataset.id === 'player' && e.to !== lists.main),
    onStart: () => document.body.classList.add('dragging'),
    onEnd: () => { document.body.classList.remove('dragging'); readLists(); render(); }
  });
}
document.addEventListener('click', (e) => {
  const tab = e.target.closest('.tabs button');
  if (tab) { showPage(tab.dataset.page); return; }
  const d = e.target.closest('.desc-btn');
  if (d && !d.closest('#hidden, #stackMain, #stackHidden')) {
    const panel = blocks.comments;
    if (panel.closest('#hidden')) { lists.sidebar.append(panel); readLists(); render(); }
    showPage('description');
    panel.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    panel.classList.add('flash-panel');
    setTimeout(() => panel.classList.remove('flash-panel'), 700);
    return;
  }
  const x = e.target.closest('.x'); if (!x) return;
  const b = x.closest('.block');
  if (homeLists.shown.contains(b)) { homeLists.hidden.append(b); homeChanged(); return; }
  if (b.dataset.id === 'player') return;
  if (stackLists.order.contains(b)) { stackLists.hidden.append(b); stackChanged(); return; }
  lists.hidden.append(b); readLists(); render();
});
lists.hidden.addEventListener('click', (e) => {
  const b = e.target.closest('.block'); if (!b || e.target.closest('.x')) return;
  lists.sidebar.append(b); readLists(); render();
});
$('#presets').onclick = (e) => { const p = e.target.dataset.preset; if (p) { state = { ...structuredClone(PRESETS[p]), tweaks: state.tweaks }; render(); } };
$('#sidePos').onclick = (e) => e.target.dataset.side && update({ side: e.target.dataset.side });
$('#cardStyle').onclick = (e) => e.target.dataset.card && update({ card: e.target.dataset.card });
$('#sideW').oninput = (e) => { sliding = 'sideW'; update({ width: +e.target.value }); };
$('#cols').oninput = (e) => { sliding = 'cols'; update({ cols: +e.target.value }); };
$('#reset').onclick = () => {
  if (view === 'home') home = structuredClone(HOME_DEFAULT);
  else if (view === 'stack') stack = structuredClone(STACK_DEFAULT);
  else if (view === 'pages') pages = structuredClone(PAGES_DEFAULT);
  else state = { ...structuredClone(PRESETS.experimental), tweaks: state.tweaks };
  renderAll();
  flash('Layout reset');
};

// ---- validation (stored values, imported files)
const ALL_IDS = Object.keys(NAMES);
const strs = (a) => Array.isArray(a) && a.every((x) => typeof x === 'string');
const validLayout = (L) => !!L && strs(L.main) && strs(L.sidebar || []) && strs(L.hidden || [])
  && ALL_IDS.every((id) => [...L.main, ...(L.sidebar || []), ...(L.hidden || [])].includes(id)) && L.main.includes('player');
const validHome = (H) => !!H && strs(H.shown) && strs(H.hidden || []) && Object.keys(HOME_NAMES).every((id) => [...H.shown, ...(H.hidden || [])].includes(id));
const validStack = (S) => !!S && strs(S.order) && strs(S.hidden || []) && S.order.includes('player') && ALL_IDS.every((id) => [...S.order, ...(S.hidden || [])].includes(id));
const validPages = (P) => !!P && Object.keys(PAGE_SECTIONS).every((k) => P[k] && strs(P[k].hide));
const fixLayout = (L) => validLayout(L) ? { side: L.side === 'left' ? 'left' : 'right', width: Math.min(Math.max(+L.width || 400, 300), 560),
  cols: Math.min(Math.max(+L.cols || 3, 1), 5), card: L.card === 'list' ? 'list' : 'grid',
  main: [...L.main], sidebar: [...(L.sidebar || [])], hidden: [...(L.hidden || [])] } : undefined;
const fixHome = (H) => validHome(H) ? { shown: [...H.shown], hidden: [...(H.hidden || [])] } : undefined;
const fixStack = (S) => validStack(S) ? { order: [...S.order], hidden: [...(S.hidden || [])], theater: !!S.theater } : undefined;
const fixPages = (P) => validPages(P) ? Object.fromEntries(Object.keys(PAGE_SECTIONS).map((k) =>
  [k, { ...(PAGE_SECTIONS[k].cols ? { cols: +P[k].cols >= 2 ? Math.min(+P[k].cols, 8) : 0 } : {}), hide: P[k].hide.filter((x) => PAGE_SECTIONS[k].items.some(([s]) => s === x)) }])) : undefined;
// settings in an imported profile: only known keys, each of the type its default has
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

// ---- profiles
function renderProfiles() {
  $('#profSel').replaceChildren(...profiles.map((p) => h('option', { value: p.id, selected: p.id === active }, p.name)));
  $('#profDel').disabled = profiles.length < 2;
  $('#profNew').disabled = profiles.length >= EYT_PROFILE_MAX;
  $('#profNew').title = profiles.length >= EYT_PROFILE_MAX ? `Up to ${EYT_PROFILE_MAX} profiles` : 'Save the current layout as a new profile';
  const p = cur();
  $('#profName2').textContent = p.name;
  $('#profSettings').checked = !!p.settings;
  $('#profMusic').checked = !!p.auto?.music;
  $('#profChannels').value = (p.auto?.channels || []).join('\n');
}
// load everything from storage (first open, and after any profile switch)
function loadAll(s) {
  loaded = s;
  ({ profiles, active } = eytProfilesFrom(s));
  ready = false;
  state = { ...(fixLayout(s.layout) || structuredClone(PRESETS.experimental)),
    tweaks: { speed: s.defaultSpeed, musicSeparate: s.musicSeparate, musicSpeed: s.musicSpeed, exempt: s.exempt,
      volume: s.volume, autoQuality: s.autoQuality, noAmbient: s.noAmbient, pauseBlur: s.pauseBlur !== false, pauseTitle: s.pauseTitle !== false } };
  home = fixHome(s.homeLayout) || structuredClone(HOME_DEFAULT);
  stack = fixStack(s.stackLayout) || structuredClone(STACK_DEFAULT);
  pages = fixPages(s.pageLayouts) || structuredClone(PAGES_DEFAULT);
  renderAll(); renderProfiles();
  undoStack = []; redoStack = []; lastSnap = null; // undo doesn't cross profiles
  ready = true;
  snapshot();
  eytBuildForm($('#form'), s, SKIP);
}
function switchTo(id, msg) {
  flush();
  eytGetAll((s) => eytSwitchProfile(s, id, () => eytGetAll((now) => { loadAll(now); flash(msg || `Profile: ${cur().name}`); })));
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
  if (!name || clash) { inp.setAttribute('aria-invalid', 'true'); flash(clash ? 'A profile with that name exists' : 'Name the profile'); return; }
  closeProfForm();
  if (profMode === 'rename') { cur().name = name; renderProfiles(); chrome.storage.sync.set(eytProfilesPatch(profiles, [active]), () => flash('Renamed')); return; }
  // a new profile starts as a copy of the current layouts (not the settings)
  flush();
  const id = eytNewId();
  profiles.push({ id, name, layout: layoutOf(), homeLayout: structuredClone(home), stackLayout: structuredClone(stack), pageLayouts: structuredClone(pages) });
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
    chrome.storage.sync.set(patch, () => chrome.storage.sync.remove(EYT_PROFILE_ITEM + del, () => eytGetAll((now) => { loadAll(now); flash('Profile deleted'); })));
  });
};
// this profile also carries its own settings (playback, SponsorBlock, filters, clean UI)
$('#profSettings').onchange = (e) => {
  flush();
  const p = cur(), on = e.target.checked;
  eytGetAll((s) => {
    const patch = {};
    if (on) {
      p.settings = eytPick(s, EYT_PROFILE_SETTINGS);
      // the values other profiles go back to: what was in force before this profile took its own
      if (!s.sharedSettings) patch.sharedSettings = p.settings;
    } else delete p.settings;
    chrome.storage.sync.set({ ...patch, ...eytProfilesPatch(profiles, [p.id]) }, () => flash(on ? 'Settings now saved with this profile' : 'Settings shared again'));
  });
};
// automatic switching rules
const saveAuto = () => {
  const p = cur();
  p.auto = { music: $('#profMusic').checked, channels: $('#profChannels').value.split('\n').map((c) => c.trim()).filter(Boolean).slice(0, 50) };
  if (!p.auto.music && !p.auto.channels.length) delete p.auto;
  flush();
  chrome.storage.sync.set(eytProfilesPatch(profiles, [p.id]), () => flash('Saved'));
};
$('#profMusic').onchange = saveAuto;
$('#profChannels').onchange = saveAuto;
// export / import
$('#profExport').onclick = () => {
  flush();
  eytGetAll((s) => {
    const { profiles: list, active: a } = eytProfilesFrom(s);
    const out = list.map(({ id, ...p }) => {
      if (id === a) { Object.assign(p, eytPick(s, EYT_LAYOUT_KEYS)); if (p.settings) p.settings = eytPick(s, EYT_PROFILE_SETTINGS); }
      return p;
    });
    const json = JSON.stringify({ format: 'eliteyt-profiles', version: 1, exported: new Date().toISOString(), profiles: out }, null, 2);
    const a2 = h('a', { href: URL.createObjectURL(new Blob([json], { type: 'application/json' })), download: `eliteyt-profiles-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a2); a2.click(); a2.remove();
    setTimeout(() => URL.revokeObjectURL(a2.href), 10e3);
    flash(`Exported ${out.length} profile${out.length > 1 ? 's' : ''}`);
  });
};
$('#profImport').onclick = () => $('#profFile').click();
$('#profFile').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  let data;
  try { data = JSON.parse(await f.text()); } catch { flash('That file is not valid JSON'); return; }
  const list = Array.isArray(data?.profiles) ? data.profiles : typeof data?.name === 'string' ? [data] : null;
  if (!list) { flash('Not an EliteYT profile file'); return; }
  flush();
  const ids = []; let skipped = 0;
  for (const raw of list) {
    const name = cleanName(raw?.name);
    if (!name || profiles.length >= EYT_PROFILE_MAX) { skipped++; continue; }
    const p = { id: eytNewId(), name: uniqueName(name), layout: fixLayout(raw.layout), homeLayout: fixHome(raw.homeLayout),
      stackLayout: fixStack(raw.stackLayout), pageLayouts: fixPages(raw.pageLayouts), settings: fixSettings(raw.settings), auto: fixAuto(raw.auto) };
    for (const k in p) if (p[k] === undefined) delete p[k];
    profiles.push(p); ids.push(p.id);
  }
  if (!ids.length) { flash(skipped ? `Nothing imported (limit is ${EYT_PROFILE_MAX} profiles)` : 'No profiles in that file'); return; }
  chrome.storage.sync.set(eytProfilesPatch(profiles, ids), () => {
    renderProfiles();
    flash(`Imported ${ids.length} profile${ids.length > 1 ? 's' : ''}${skipped ? `, skipped ${skipped}` : ''}`);
  });
};
// another page (popup, YouTube tab, keyboard shortcut) switched profiles or changed a setting while this one is open
const TWEAK_KEYS = { defaultSpeed: 'speed', musicSeparate: 'musicSeparate', musicSpeed: 'musicSpeed', exempt: 'exempt', volume: 'volume',
  autoQuality: 'autoQuality', noAmbient: 'noAmbient', pauseBlur: 'pauseBlur', pauseTitle: 'pauseTitle' };
chrome.storage.onChanged?.addListener((ch, area) => {
  if (area !== 'sync' || !ready) return;
  if (ch.activeProfile && ch.activeProfile.newValue !== active) { eytGetAll(loadAll); return; }
  let tweaked = false;
  for (const [k, t] of Object.entries(TWEAK_KEYS)) {
    if (!ch[k] || JSON.stringify(ch[k].newValue) === JSON.stringify(state.tweaks[t])) continue;
    state.tweaks[t] = ch[k].newValue ?? EYT_DEFAULTS[k];
    tweaked = true;
  }
  if (tweaked) renderTweaks();
});

let tt;
const flash = (msg) => { $('#toast').textContent = msg; clearTimeout(tt); tt = setTimeout(() => { $('#toast').textContent = ''; }, 2500); };

const SKIP = ['autoQuality', 'noAmbient', 'pauseBlur', 'pauseTitle', 'musicSeparate', 'defaultSpeed', 'musicSpeed', 'volume', 'exempt'];
eytGetAll(loadAll);
