chrome.storage.sync.get({ ...EYT_DEFAULTS, ...EYT_PROFILE_KEYS }, (s) => {
  eytBuildForm(document.getElementById('form'), s);
  // profile switcher: only worth showing once there is more than one profile
  const { profiles, active } = eytProfilesFrom(s), sel = document.getElementById('prof');
  if (profiles.length < 2) return;
  for (const p of profiles) sel.append(new Option(p.name, p.name, false, p.name === active));
  sel.onchange = () => eytSwitchProfile(profiles, sel.value);
  document.getElementById('profRow').hidden = false;
});
document.getElementById('full').onclick = () => chrome.runtime.openOptionsPage();
