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

let state, home;
// persist to chrome.storage.sync (debounced: sync storage allows ~120 writes/min)
let saveTimer = 0, ready = false;
const save = () => {
  if (!ready) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { tweaks: t, ...layout } = state;
    chrome.storage.sync.set({
      layout, defaultSpeed: t.speed, musicSeparate: t.musicSeparate, musicSpeed: t.musicSpeed,
      exempt: t.exempt, volume: t.volume, autoQuality: t.autoQuality, noAmbient: t.noAmbient,
      pauseBlur: t.pauseBlur, pauseTitle: t.pauseTitle, homeLayout: home
    }, () => flash('Saved'));
  }, 300);
};

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
  const { tweaks: _t, ...lay } = state;
  const match = Object.entries(PRESETS).find(([, p]) => JSON.stringify(p) === JSON.stringify(lay))?.[0];
  renderTweaks();
  for (const b of document.querySelectorAll('#presets button')) b.setAttribute('aria-pressed', b.dataset.preset === match);
  save();
}
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
let view = 'watch';
function showView(v) {
  view = v;
  document.body.classList.toggle('view-home', v === 'home');
  for (const b of document.querySelectorAll('#pageSel button')) b.setAttribute('aria-pressed', b.dataset.view === v);
  try { history.replaceState(null, '', v === 'home' ? '#home' : location.pathname); } catch {}
}
$('#pageSel').onclick = (e) => e.target.dataset.view && showView(e.target.dataset.view);
showView(location.hash === '#home' ? 'home' : 'watch');
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
  if (d && !d.closest('#hidden')) {
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
  if (b.dataset.id === 'player') return; lists.hidden.append(b); readLists(); render();
});
lists.hidden.addEventListener('click', (e) => {
  const b = e.target.closest('.block'); if (!b || e.target.closest('.x')) return;
  lists.sidebar.append(b); readLists(); render();
});
$('#presets').onclick = (e) => { const p = e.target.dataset.preset; if (p) { state = { ...structuredClone(PRESETS[p]), tweaks: state.tweaks }; render(); } };
$('#sidePos').onclick = (e) => e.target.dataset.side && update({ side: e.target.dataset.side });
$('#cardStyle').onclick = (e) => e.target.dataset.card && update({ card: e.target.dataset.card });
$('#sideW').oninput = (e) => update({ width: +e.target.value });
$('#cols').oninput = (e) => update({ cols: +e.target.value });
$('#reset').onclick = () => {
  if (view === 'home') { home = structuredClone(HOME_DEFAULT); renderHome(); save(); }
  else { state = { ...structuredClone(PRESETS.experimental), tweaks: state.tweaks }; render(); }
  flash('Layout reset');
};

let tt;
const flash = (msg) => { $('#toast').textContent = msg; clearTimeout(tt); tt = setTimeout(() => { $('#toast').textContent = ''; }, 2000); };

const SKIP = ['autoQuality', 'noAmbient', 'pauseBlur', 'pauseTitle', 'musicSeparate', 'defaultSpeed', 'musicSpeed', 'volume', 'exempt'];
chrome.storage.sync.get(EYT_DEFAULTS, (s) => {
  const all = Object.keys(NAMES), L = s.layout;
  const ok = L && all.every((id) => [...L.main, ...L.sidebar, ...L.hidden].includes(id));
  state = { ...(ok ? L : structuredClone(PRESETS.experimental)),
    tweaks: { speed: s.defaultSpeed, musicSeparate: s.musicSeparate, musicSpeed: s.musicSpeed, exempt: s.exempt,
      volume: s.volume, autoQuality: s.autoQuality, noAmbient: s.noAmbient,
      pauseBlur: s.pauseBlur !== false, pauseTitle: s.pauseTitle !== false } };
  const HL = s.homeLayout, hAll = [...(HL?.shown || []), ...(HL?.hidden || [])];
  home = Array.isArray(HL?.shown) && Object.keys(HOME_NAMES).every((id) => hAll.includes(id))
    ? { shown: [...HL.shown], hidden: [...HL.hidden] } : structuredClone(HOME_DEFAULT);
  renderHome();
  render();
  ready = true;
  eytBuildForm($('#form'), s, SKIP);
});
