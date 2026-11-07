// Layout profiles. Shared by the studio, the background script and the content-script bridge (isolated world); needs EYT_DEFAULTS.
//
// Storage (chrome.storage.sync caps one item at 8 KB, so each profile is its own item):
//   profileIndex   [{ id, name }]            order of the profiles
//   eytProfile:<id> { layout, homeLayout, stackLayout, pageLayouts, pieces, topbarLayout, settings?, auto? }
//   activeProfile  id
//   sharedSettings settings in force for profiles that don't carry their own (captured when you leave one)
// The live keys (layout, homeLayout, ... and, for a profile with settings, those settings) always hold the active
// profile's copy: that is what the content scripts read.
const EYT_PROFILE_MAX = 15;
const EYT_LAYOUT_KEYS = ['layout', 'homeLayout', 'stackLayout', 'pageLayouts', 'pieces', 'topbarLayout'];
// what "this profile also sets playback, SponsorBlock, filters and clean-UI settings" covers
const EYT_PROFILE_SETTINGS = ['defaultSpeed', 'musicSeparate', 'musicSpeed', 'maxSpeed', 'volume', 'exempt', 'rememberSpeed',
  'sponsorBlock', 'sbSponsor', 'sbSelfpromo', 'sbInteraction', 'sbIntro', 'sbOutro', 'sbPreview', 'sbFiller', 'sbMusic',
  'adBlock', 'aiFilter', 'lowEffort', 'slopHide', 'slopStrict', 'slopAllow', 'slopBlock',
  'hideShorts', 'hideComments', 'hideRelated', 'hideEndCards', 'hideChat', 'homeNoShorts', 'homeNoAds'];
const EYT_PROFILE_ITEM = 'eytProfile:';

const eytPick = (o, keys) => {
  const r = {};
  for (const k of keys) if (o && o[k] !== undefined) r[k] = structuredClone(o[k]);
  return r;
};
const eytNewId = () => Math.random().toString(36).slice(2, 10);

// { profiles: [{ id, name, ...data }], active: id } from everything in sync storage
function eytProfilesFrom(s) {
  let list = [];
  if (Array.isArray(s.profileIndex)) {
    list = s.profileIndex.filter((e) => e && e.id && typeof e.name === 'string' && e.name)
      .map((e) => ({ ...structuredClone(s[EYT_PROFILE_ITEM + e.id] || {}), id: e.id, name: e.name }));
  } else if (Array.isArray(s.profiles)) { // the first, single-item format of this feature
    list = s.profiles.filter((p) => p && typeof p.name === 'string' && p.name).map((p) => ({ ...structuredClone(p), id: eytNewId() }));
  }
  if (!list.length) list = [{ id: 'default', name: 'Default', ...eytPick(s, EYT_LAYOUT_KEYS) }];
  const active = list.find((p) => p.id === s.activeProfile) || list.find((p) => p.name === s.activeProfile) || list[0];
  return { profiles: list, active: active.id };
}
// storage patch that saves the profile order and the profiles listed in `ids` (default: all)
function eytProfilesPatch(profiles, ids = profiles.map((p) => p.id)) {
  const patch = { profileIndex: profiles.map(({ id, name }) => ({ id, name })) };
  for (const p of profiles) {
    if (!ids.includes(p.id)) continue;
    const { id, name, ...data } = p;
    patch[EYT_PROFILE_ITEM + id] = data;
  }
  return patch;
}
// the live values a profile puts in force
function eytProfileValues(p) {
  const v = {};
  for (const k of EYT_LAYOUT_KEYS) v[k] = structuredClone(p[k] ?? EYT_DEFAULTS[k]);
  if (p.settings) Object.assign(v, eytPick(p.settings, EYT_PROFILE_SETTINGS));
  return v;
}
// Storage patch that switches to profile `id`. Before leaving the current profile its live settings are kept:
// in the profile when it carries its own, otherwise as the shared settings the next settings-less profile gets back.
function eytSwitchPatch(s, id) {
  const { profiles, active } = eytProfilesFrom(s);
  const from = profiles.find((p) => p.id === active), to = profiles.find((p) => p.id === id);
  if (!to) return null;
  const live = eytPick(s, EYT_PROFILE_SETTINGS);
  let shared = s.sharedSettings || null;
  const changed = [];
  if (from) {
    Object.assign(from, eytPick(s, EYT_LAYOUT_KEYS)); // layouts edited outside the studio stay with their profile
    if (from.settings) from.settings = live; else shared = live;
    changed.push(from.id);
  }
  const patch = { ...eytProfilesPatch(profiles, Array.isArray(s.profileIndex) ? changed : undefined),
    ...eytProfileValues(to), activeProfile: id, layoutV: 2 };
  if (!to.settings && shared) Object.assign(patch, eytPick(shared, EYT_PROFILE_SETTINGS));
  if (shared) patch.sharedSettings = shared;
  return patch;
}
function eytSwitchProfile(s, id, cb) {
  const patch = eytSwitchPatch(s, id);
  if (patch) chrome.storage.sync.set(patch, cb); else cb?.();
}
// automatic switching: the first profile whose rule matches the video (channel rules win over the music rule)
function eytAutoProfile(profiles, ctx) {
  const c = (ctx?.channel || '').trim().toLowerCase();
  if (!c) return null;
  return profiles.find((p) => (p.auto?.channels || []).some((n) => n.trim().toLowerCase() === c))
    || (ctx.music && profiles.find((p) => p.auto?.music)) || null;
}
// everything in sync storage, with defaults for what isn't set
const eytGetAll = (cb) => chrome.storage.sync.get(null, (all) => cb({ ...structuredClone(EYT_DEFAULTS), layoutV: 0, ...all }));
