// Shared by popup and options page: renders checkbox/number settings into `form`.
const EYT_GROUPS = [
  ['Battery saver', [['battery', 'Enable battery saver'], ['onlyOnBattery', 'Only when unplugged'],
    ['autoQuality', 'Lower quality as speed rises'], ['cap30', 'Block 60fps streams'],
    ['h264', 'Force H.264 (skip VP9/AV1)'], ['noAmbient', 'Ambient mode off']]],
  ['Speed', [['speed', 'Speed shortcuts'], ['rememberSpeed', 'Remember speed per channel'],
    ['musicSeparate', 'Separate speed for music channels'],
    ['#defaultSpeed', 'Default speed', 0.25, 4, 0.25], ['#musicSpeed', 'Music speed', 0.5, 2, 0.05],
    ['#maxSpeed', 'Max speed', 2, 16, 0.25], ['#volume', 'Volume boost %', 100, 300, 10], ['exempt', 'Never change speed for'],
    ['moveAudio', 'Move Stable Volume / Voice boost to Tweaks']]],
  ['Clean UI', [['hideShorts', 'Hide Shorts'], ['hideComments', 'Hide comments'],
    ['hideRelated', 'Hide recommendations'], ['hideEndCards', 'Hide end-screen cards'], ['hideChat', 'Hide live chat']]],
  ['SponsorBlock', [['sponsorBlock', 'Enable SponsorBlock (markers on the progress bar)'], ['sbSponsor', 'Skip sponsors'],
    ['sbSelfpromo', 'Skip self-promotion'], ['sbInteraction', 'Skip like/subscribe reminders'], ['sbIntro', 'Skip intros'],
    ['sbOutro', 'Skip outros / end cards'], ['sbPreview', 'Skip previews / recaps'], ['sbFiller', 'Skip filler tangents'],
    ['sbMusic', 'Skip non-music parts of music videos']]],
  ['DeArrow', [['deArrow', 'Crowd-sourced titles (DeArrow)'], ['daThumbs', 'Crowd-sourced thumbnails'], ['calmThumbs', 'Calm thumbnails: a frame from the video instead of creator artwork']]],
  ['Dislikes', [['ryd', 'Show dislike count (Return YouTube Dislike)']]],
  ['Home', [['homeShelves', 'Shelves: Continue watching, Subscriptions, Recommended'], ['homeClean', 'Clean home grid'], ['#homeCols', 'Home columns', 2, 8, 1],
    ['homeNoShorts', 'Hide Shorts on home'], ['homeNoAds', 'Hide ads, promos and topic shelves on home']]],
  ['Look', [['topbar', 'EliteYT top bar: no left sidebar, Home / Subscriptions / You by the avatar'], ['expLayout', 'Custom watch layout'], ['descToPanel', 'Open description in the comments panel'], ['stats', 'Stats overlay'], ['pauseInfo', "Pause screen: show what you're watching"], ['pauseBlur', 'Pause screen: blur the video'], ['pauseTitle', 'Pause screen: show the title'], ['titleInPlayer', 'Title on the player (hover) instead of the sidebar']]]
];

function eytBuildForm(form, s, skip = []) {
  const set = (patch) => chrome.storage.sync.set(patch);
  form.textContent = '';
  for (const [title, items] of EYT_GROUPS) {
    const visible = items.filter(([k]) => !skip.includes(k.replace('#', '')));
    if (!visible.length) continue;
    const sec = document.createElement('section');
    const h = document.createElement('h2');
    h.textContent = title;
    sec.append(h);
    for (const [raw, text, min, max, step] of visible) {
      const label = document.createElement('label');
      if (raw === 'exempt') {
        label.className = 'stack';
        const ta = document.createElement('textarea');
        Object.assign(ta, { rows: 3, placeholder: 'One channel name per line', value: (s.exempt || []).join('\n') });
        ta.onchange = () => set({ exempt: ta.value.split('\n').map((n) => n.trim()).filter(Boolean) });
        label.append(text, ta);
      } else if (raw.startsWith('#')) {
        const key = raw.slice(1);
        const num = document.createElement('input');
        Object.assign(num, { type: 'number', min, max, step, value: s[key] });
        num.onchange = () => set({ [key]: Math.min(Math.max(+num.value || min, min), max) });
        label.append(text, num);
      } else {
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = !!s[raw];
        box.onchange = () => set({ [raw]: box.checked });
        label.append(box, text);
      }
      sec.append(label);
    }
    form.append(sec);
  }
}

// Layout profiles: named watch + home layouts. `layout` / `homeLayout` always hold the active profile's copy (that is
// what the content scripts read); `profiles` keeps every profile in order. Profiles are not in EYT_DEFAULTS, so the
// bridge never pushes them into the YouTube page. Sync storage caps one item at 8 KB, which bounds the count.
const EYT_PROFILE_MAX = 15;
const EYT_PROFILE_KEYS = { profiles: null, activeProfile: '' };
function eytProfilesFrom(s) {
  const list = Array.isArray(s.profiles) ? s.profiles.filter((p) => p && typeof p.name === 'string' && p.name) : [];
  const profiles = list.length ? list.map((p) => ({ ...p })) : [{ name: 'Default', layout: s.layout, homeLayout: s.homeLayout }];
  const active = profiles.some((p) => p.name === s.activeProfile) ? s.activeProfile : profiles[0].name;
  return { profiles, active };
}
// switch the live layout to a saved profile (popup and studio)
function eytSwitchProfile(profiles, name, cb) {
  const p = profiles.find((x) => x.name === name); if (!p) return;
  chrome.storage.sync.set({ activeProfile: name, profiles, layoutV: 2,
    layout: p.layout || EYT_DEFAULTS.layout, homeLayout: p.homeLayout || EYT_DEFAULTS.homeLayout }, cb);
}
