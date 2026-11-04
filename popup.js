chrome.storage.sync.get(EYT_DEFAULTS, (s) => eytBuildForm(document.getElementById('form'), s));
document.getElementById('full').onclick = () => chrome.runtime.openOptionsPage();
