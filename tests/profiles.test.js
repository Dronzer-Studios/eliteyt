const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const { ROOT: EXT, SHOTS } = require('./lib'), HTML = fs.readFileSync(path.join(__dirname, 'fixtures', 'watch.html'), 'utf8');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'eyt-')), {
    headless: true, channel: 'chromium', viewport: { width: 1280, height: 900 }, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  await ctx.route('**/*', (r) => { const u = r.request().url();
    if (u.startsWith('chrome-extension://')) return r.continue();
    if (u.startsWith('https://www.youtube.com/watch')) return r.fulfill({ contentType: 'text/html', body: HTML });
    return r.fulfill({ status: 404, body: '' }); });
  const x = await ctx.newPage(); await x.goto('chrome://extensions');
  const id = await x.evaluate(() => new Promise((r) => chrome.developerPrivate.getExtensionsInfo((l) => r(l.find((e) => e.name === 'EliteYT').id))));
  await x.close();
  const errs = (p) => p.on('pageerror', (e) => { console.log('PAGEERROR', e.message); fails++; });
  const studio = await ctx.newPage(); errs(studio);
  await studio.goto(`chrome-extension://${id}/options.html`);
  await studio.waitForSelector('#profSel option', { state: 'attached' });
  const store = (keys) => studio.evaluate((k) => new Promise((r) => chrome.storage.sync.get(k, r)), keys);
  const opts = () => studio.$$eval('#profSel option', (o) => o.map((e) => e.value + (e.selected ? '*' : '')));
  const mainIds = () => studio.$$eval('#main > .block', (b) => b.map((e) => e.dataset.id));
  const settle = () => studio.waitForTimeout(700);

  ok(JSON.stringify(await opts()) === '["Default*"]' && await studio.isDisabled('#profDel'), 'first run: one "Default" profile, Delete disabled');

  // New profile "Focus" = copy of the current layout, then apply the Focus preset to it
  await studio.click('#profNew'); await studio.fill('#profName', '  Focus  '); await studio.click('#profForm [type=submit]');
  ok(JSON.stringify(await opts()) === '["Default","Focus*"]', 'New creates and selects "Focus"');
  await studio.click('#presets [data-preset=focus]'); await settle();
  let s = await store(['profiles', 'activeProfile', 'layout']);
  const focusMain = ['player', 'title', 'channel', 'actions', 'description'];
  ok(s.activeProfile === 'Focus' && JSON.stringify(s.layout.main) === JSON.stringify(focusMain), 'edit lands in the live layout');
  ok(JSON.stringify(s.profiles.find((p) => p.name === 'Focus').layout.main) === JSON.stringify(focusMain), 'edit saved into the Focus profile');
  ok(JSON.stringify(s.profiles.find((p) => p.name === 'Default').layout.main) !== JSON.stringify(focusMain), 'Default profile untouched');
  // Focus: hide Continue watching on home
  await studio.click('#pageSel [data-view=home]');
  await studio.hover('#homeMain [data-id=continue]'); await studio.click('#homeMain [data-id=continue] .x'); await settle();
  await studio.click('#pageSel [data-view=watch]');
  await studio.screenshot({ path: path.join(SHOTS, 'profiles-bar.png'), clip: { x: 0, y: 0, width: 1280, height: 260 } });

  // duplicate name rejected
  await studio.click('#profNew'); await studio.fill('#profName', 'default'); await studio.click('#profForm [type=submit]');
  ok(await studio.getAttribute('#profName', 'aria-invalid') === 'true' && (await opts()).length === 2, 'duplicate name (case-insensitive) rejected');
  await studio.screenshot({ path: path.join(SHOTS, 'profiles-new-form.png'), clip: { x: 0, y: 0, width: 1280, height: 260 } });
  await studio.keyboard.press('Escape');
  ok(await studio.isVisible('#profSel'), 'Escape closes the name form');

  // open a YouTube tab: it follows the active profile
  const yt = await ctx.newPage(); errs(yt);
  await yt.goto('https://www.youtube.com/watch?v=abcdefghijk');
  await yt.waitForFunction(() => document.documentElement.classList.contains('eyt-exp'));
  await yt.waitForTimeout(800);
  const ytMain = () => yt.evaluate(() => [...document.querySelector('#primary-inner').children].map((e) => e.id || e.className).filter((i) => i !== 'below'));
  ok(JSON.stringify(await ytMain()) === JSON.stringify(['player', 'title', 'owner', 'actions']), 'YouTube tab uses Focus layout: ' + (await ytMain()).join(','));

  // switch back to Default in the studio
  await studio.selectOption('#profSel', 'Default'); await settle();
  s = await store(['activeProfile', 'layout', 'homeLayout']);
  ok(s.activeProfile === 'Default' && JSON.stringify(await mainIds()) === JSON.stringify(s.layout.main) && s.homeLayout.shown.includes('continue'), 'switch to Default: studio + live layout + home restored');
  await yt.waitForTimeout(800);
  const defMain = await ytMain();
  ok(defMain.includes('related'), 'YouTube tab followed the switch live: ' + defMain.join(','));

  // popup quick switcher (real popup page)
  const pop = await ctx.newPage(); errs(pop);
  await pop.setViewportSize({ width: 300, height: 600 });
  await pop.goto(`chrome-extension://${id}/popup.html`);
  await pop.waitForSelector('#profRow:not([hidden])');
  ok(JSON.stringify(await pop.$$eval('#prof option', (o) => o.map((e) => e.value + (e.selected ? '*' : '')))) === '["Default*","Focus"]', 'popup lists profiles with the active one selected');
  await pop.screenshot({ path: path.join(SHOTS, 'profiles-popup.png'), clip: { x: 0, y: 0, width: 300, height: 140 } });
  await pop.selectOption('#prof', 'Focus'); await settle();
  s = await store(['activeProfile', 'layout', 'homeLayout']);
  ok(s.activeProfile === 'Focus' && JSON.stringify(s.layout.main) === JSON.stringify(focusMain) && !s.homeLayout.shown.includes('continue'), 'popup switch applies Focus (watch + home)');
  ok(JSON.stringify(await opts()) === '["Default","Focus*"]' && JSON.stringify(await mainIds()) === JSON.stringify(focusMain), 'open studio follows the popup switch');
  await yt.waitForTimeout(800);
  ok(!(await ytMain()).includes('related'), 'YouTube tab followed the popup switch');

  // rename + persistence
  await studio.click('#profRen'); ok(await studio.inputValue('#profName') === 'Focus', 'Rename prefills the name');
  await studio.fill('#profName', 'Deep work'); await studio.click('#profForm [type=submit]'); await settle();
  await studio.reload(); await studio.waitForSelector('#profSel option', { state: 'attached' });
  ok(JSON.stringify(await opts()) === '["Default","Deep work*"]' && JSON.stringify(await mainIds()) === JSON.stringify(focusMain), 'rename persists across reload');

  // delete
  studio.once('dialog', (d) => d.accept());
  await studio.click('#profDel'); await settle();
  s = await store(['profiles', 'activeProfile', 'layout']);
  ok(JSON.stringify(await opts()) === '["Default*"]' && s.profiles.length === 1 && s.activeProfile === 'Default' && JSON.stringify(s.layout.main) !== JSON.stringify(focusMain), 'delete removes it and switches to Default');
  ok(await studio.isDisabled('#profDel'), 'cannot delete the last profile');
  // popup hides the switcher with one profile
  await pop.reload(); await pop.waitForTimeout(400);
  ok(await pop.isHidden('#profRow'), 'popup hides the switcher with a single profile');

  // limit
  for (let i = 0; i < 20; i++) { if (await studio.isDisabled('#profNew')) break; await studio.click('#profNew'); await studio.fill('#profName', 'P' + i); await studio.click('#profForm [type=submit]'); }
  await settle();
  s = await store(['profiles']);
  ok((await opts()).length === 15 && s.profiles.length === 15 && await studio.isDisabled('#profNew'), `capped at 15 profiles, all saved (${JSON.stringify(s.profiles).length} bytes, sync item limit 8192)`);
  // phone width: no horizontal scroll with the profile controls
  await studio.setViewportSize({ width: 390, height: 844 });
  ok(await studio.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll at 390px');
  await ctx.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
