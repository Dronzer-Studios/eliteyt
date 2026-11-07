// Background: the toolbar button opens the Layout Studio; right-clicking it offers the profile switcher.
// Chrome runs this as a service worker (helpers via importScripts); Firefox as an event page with the helpers listed
// before it in manifest.json "background.scripts".
if (typeof EYT_DEFAULTS === 'undefined' && typeof importScripts === 'function') importScripts('defaults.js', 'profiles.js');

const openStudio = () => chrome.runtime.openOptionsPage(); // focuses the studio tab when it is already open
chrome.action.onClicked.addListener(openStudio);

// right-click menu on the toolbar button: open the studio, switch layout profile
let building = Promise.resolve();
function buildMenu() {
  building = building.then(() => new Promise((done) => eytGetAll((s) => {
    const { profiles, active } = eytProfilesFrom(s);
    const items = [{ id: 'studio', title: 'Open Layout Studio', contexts: ['action'] }];
    if (profiles.length > 1) {
      items.push({ id: 'profiles', title: 'Layout profile', contexts: ['action'] });
      for (const p of profiles) items.push({ id: 'profile:' + p.id, parentId: 'profiles', title: p.name, type: 'radio', checked: p.id === active, contexts: ['action'] });
    }
    chrome.contextMenus.removeAll(() => {
      for (const it of items) chrome.contextMenus.create(it);
      globalThis.eytBackground.menu = items; // what the menu shows (tests)
      done();
    });
  })));
  return building;
}
function onMenu(info) {
  if (info.menuItemId === 'studio') return openStudio();
  const id = /^profile:(.+)$/.exec(String(info.menuItemId))?.[1];
  if (id) eytGetAll((s) => eytSwitchProfile(s, id));
}
chrome.contextMenus.onClicked.addListener(onMenu);
chrome.runtime.onInstalled.addListener(buildMenu);
chrome.runtime.onStartup.addListener(buildMenu);
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'sync' && (ch.activeProfile || ch.profileIndex)) buildMenu(); });
// for tests: the same paths a click takes
globalThis.eytBackground = { openStudio, onMenu, buildMenu };
