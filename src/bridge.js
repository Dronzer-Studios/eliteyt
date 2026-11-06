// Isolated world: chrome.storage <-> page. The MAIN-world scripts read settings synchronously from localStorage at
// document_start and write back via an event. Profiles are resolved here, where chrome.storage is available.
// localStorage is shared by every YouTube tab, so it only ever gets the saved settings; this tab's automatic
// profile (if any) travels in the event alone.
const push = (saved, live = saved) => {
  try { localStorage.setItem('eliteyt', JSON.stringify(saved)); } catch {}
  document.dispatchEvent(new CustomEvent('eliteyt:settings', { detail: JSON.stringify(live) }));
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

// What this tab gets: the stored settings, or, while the video matches a profile's automatic rule, that profile's
// layouts (and settings) on top. Auto profiles apply to this tab only; storage and other tabs are untouched.
let stored = null, ctx = null;
function effective(withAuto = true) {
  const { profiles, active } = eytProfilesFrom(stored);
  const out = {};
  for (const k in stored) if (!k.startsWith(EYT_PROFILE_ITEM) && k !== 'profiles' && k !== 'sharedSettings' && k !== 'profileIndex') out[k] = stored[k];
  out.profileList = profiles.map(({ id, name }) => ({ id, name }));
  out.activeProfile = active;
  out.autoProfile = '';
  const auto = withAuto && eytAutoProfile(profiles, ctx);
  if (auto && auto.id !== active) Object.assign(out, eytProfileValues(auto), { autoProfile: auto.name });
  return out;
}
// layoutV is not in EYT_DEFAULTS, so eytGetAll asks for it explicitly or migrate() rewrites the layout on every load;
// Firefox fires onChanged even for identical values, which loops load → set → load forever.
const load = () => eytGetAll((s) => { stored = migrate(s); push(effective(false), effective()); });
load();
chrome.storage.onChanged.addListener(load);
document.addEventListener('eliteyt:set', (e) => {
  try { chrome.storage.sync.set(JSON.parse(e.detail)); } catch {}
});
// the page reports what is playing ({ channel, music } on a watch page, {} elsewhere) for automatic profiles
document.addEventListener('eliteyt:context', (e) => {
  let c; try { c = JSON.parse(e.detail) || {}; } catch { return; }
  if (JSON.stringify(c) === JSON.stringify(ctx)) return;
  ctx = c;
  if (stored) push(effective(false), effective());
});
// manual switch from the page (Tweaks panel, keyboard): { id } or { step: +1 / -1 }
document.addEventListener('eliteyt:profile', (e) => {
  let req; try { req = JSON.parse(e.detail) || {}; } catch { return; }
  eytGetAll((s) => {
    const { profiles, active } = eytProfilesFrom(s);
    let id = req.id;
    if (req.step) {
      const i = profiles.findIndex((p) => p.id === active);
      id = profiles[(i + req.step + profiles.length * 2) % profiles.length].id;
    }
    if (id && id !== active) eytSwitchProfile(s, id);
  });
});
