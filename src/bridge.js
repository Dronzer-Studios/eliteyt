// Isolated world: chrome.storage <-> page. The MAIN-world script reads settings
// synchronously from localStorage at document_start and writes back via an event.
const push = (s) => {
  const json = JSON.stringify(s);
  try { localStorage.setItem('eliteyt', json); } catch {}
  document.dispatchEvent(new CustomEvent('eliteyt:settings', { detail: json }));
};
// One-time layout migration (v2): the channel row and the like/share actions go directly under the player.
// Saved layouts override the defaults, so existing users would never see the new arrangement otherwise.
const migrate = (s) => {
  if ((s.layoutV || 0) >= 2 || !s.layout) return s;
  const L = { ...s.layout }, strip = (a) => (a || []).filter((x) => x !== 'channel' && x !== 'actions');
  L.main = strip(L.main); L.sidebar = strip(L.sidebar); L.hidden = strip(L.hidden);
  const at = L.main.indexOf('player');
  L.main.splice(at < 0 ? 0 : at + 1, 0, 'channel', 'actions');
  chrome.storage.sync.set({ layout: L, layoutV: 2 }); // triggers onChanged → push of the migrated settings
  return { ...s, layout: L, layoutV: 2 };
};
const load = () => chrome.storage.sync.get(EYT_DEFAULTS, (s) => push(migrate(s)));
load();
chrome.storage.onChanged.addListener(load);
document.addEventListener('eliteyt:set', (e) => {
  try { chrome.storage.sync.set(JSON.parse(e.detail)); } catch {}
});
