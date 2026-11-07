// Layout profiles on the real extension pages (studio + popup, real chrome.storage) next to a YouTube fixture tab:
// create / rename / delete, per-profile items, settings carried by a profile (#3), export / import (#1).
const fs = require('fs'), path = require('path');
const { SHOTS, fixture, launchExt, suite } = require('./lib');
const HTML = fixture('watch.html');
const { ok, watch, done } = suite();
(async () => {
  const { ctx, id } = await launchExt();
  await ctx.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith('chrome-extension://')) return r.continue();
    if (u.startsWith('https://www.youtube.com/watch')) return r.fulfill({ contentType: 'text/html', body: HTML });
    return r.fulfill({ status: 404, body: '' });
  });
  const studio = watch(await ctx.newPage());
  await studio.goto(`chrome-extension://${id}/options.html`);
  await studio.waitForSelector('#profSel option', { state: 'attached' });
  const all = () => studio.evaluate(() => new Promise((r) => chrome.storage.sync.get(null, r)));
  const opts = () => studio.$$eval('#profSel option', (o) => o.map((e) => e.textContent + (e.selected ? '*' : '')));
  const byName = (s, n) => { const e = (s.profileIndex || []).find((x) => x.name === n); return e && s['eytProfile:' + e.id]; };
  const mainIds = () => studio.$$eval('#main > .block', (b) => b.map((e) => e.dataset.id));
  const settle = (ms = 700) => studio.waitForTimeout(ms);
  const newProfile = async (name) => { await studio.click('#profNew'); await studio.fill('#profName', name); await studio.click('#profForm [type=submit]'); await settle(900); };

  ok(JSON.stringify(await opts()) === '["Default*"]' && await studio.isDisabled('#profDel'), 'first run: one "Default" profile, Delete disabled');

  await newProfile('  Focus  ');
  ok(JSON.stringify(await opts()) === '["Default","Focus*"]', 'New creates and selects "Focus" (name trimmed)');
  await studio.click('#presets [data-preset=focus]'); await settle();
  let s = await all();
  const focusMain = ['player', 'title', 'channel', 'actions', 'description'];
  ok(s.profileIndex?.length === 2 && byName(s, 'Focus') && byName(s, 'Default'), 'stored as profileIndex + one item per profile');
  ok(JSON.stringify(s.layout.main) === JSON.stringify(focusMain) && JSON.stringify(byName(s, 'Focus').layout.main) === JSON.stringify(focusMain), 'edit lands in the live layout and the Focus item');
  ok(JSON.stringify(byName(s, 'Default').layout?.main) !== JSON.stringify(focusMain), 'Default profile untouched');
  await studio.click('#pageSel [data-view=home]');
  await studio.hover('#homeMain [data-id=continue]'); await studio.click('#homeMain [data-id=continue] .x'); await settle();
  await studio.click('#pageSel [data-view=watch]');

  await studio.click('#profNew'); await studio.fill('#profName', 'default'); await studio.click('#profForm [type=submit]');
  ok(await studio.getAttribute('#profName', 'aria-invalid') === 'true' && (await opts()).length === 2, 'duplicate name (case-insensitive) rejected');
  await studio.keyboard.press('Escape');

  // a YouTube tab follows the active profile
  const yt = watch(await ctx.newPage());
  await yt.goto('https://www.youtube.com/watch?v=abcdefghijk');
  await yt.waitForFunction(() => document.documentElement.classList.contains('eyt-exp'));
  await yt.waitForTimeout(800);
  const ytMain = () => yt.evaluate(() => [...document.querySelector('#primary-inner').children].map((e) => e.id || e.className).filter((i) => i !== 'below'));
  ok(JSON.stringify(await ytMain()) === JSON.stringify(['player', 'title', 'owner', 'actions']), 'YouTube tab uses Focus: ' + (await ytMain()).join(','));

  await studio.selectOption('#profSel', { label: 'Default' }); await settle(1000);
  s = await all();
  ok(byName(s, 'Default') && s.activeProfile === s.profileIndex.find((e) => e.name === 'Default').id && JSON.stringify(await mainIds()) === JSON.stringify(s.layout.main) && s.homeLayout.shown.includes('continue'), 'switch to Default: studio, live layout and home restored');
  await yt.waitForTimeout(800);
  ok((await ytMain()).includes('related'), 'YouTube tab followed the switch: ' + (await ytMain()).join(','));

  // popup quick switcher
  const pop = watch(await ctx.newPage());
  await pop.setViewportSize({ width: 300, height: 600 });
  await pop.goto(`chrome-extension://${id}/popup.html`);
  await pop.waitForSelector('#profRow:not([hidden])');
  ok(JSON.stringify(await pop.$$eval('#prof option', (o) => o.map((e) => e.textContent + (e.selected ? '*' : '')))) === '["Default*","Focus"]', 'popup lists profiles, active selected');
  await pop.selectOption('#prof', { label: 'Focus' }); await settle(1000);
  s = await all();
  ok(JSON.stringify(s.layout.main) === JSON.stringify(focusMain) && !s.homeLayout.shown.includes('continue'), 'popup switch applies Focus (watch + home)');
  ok(JSON.stringify(await opts()) === '["Default","Focus*"]' && JSON.stringify(await mainIds()) === JSON.stringify(focusMain), 'open studio follows the popup switch');

  // rename
  await studio.click('#profRen'); ok(await studio.inputValue('#profName') === 'Focus', 'Rename prefills the name');
  await studio.fill('#profName', 'Deep work'); await studio.click('#profForm [type=submit]'); await settle();
  await studio.reload(); await studio.waitForSelector('#profSel option', { state: 'attached' });
  ok(JSON.stringify(await opts()) === '["Default","Deep work*"]' && JSON.stringify(await mainIds()) === JSON.stringify(focusMain), 'rename persists across reload');

  // #3: this profile carries its own settings
  await studio.click('#profPanel summary');
  await studio.check('#profSettings'); await settle();
  // change speed and SponsorBlock the way the popup / settings form does
  await studio.evaluate(() => new Promise((r) => chrome.storage.sync.set({ defaultSpeed: 2, sbIntro: true, aiFilter: false }, r)));
  await settle(400);
  await studio.selectOption('#profSel', { label: 'Default' }); await settle(1000);
  s = await all();
  ok(s.defaultSpeed === 1 && s.sbIntro === false && s.aiFilter === true, `leaving a settings profile restores the shared settings (speed ${s.defaultSpeed}, intro ${s.sbIntro}, AI filter ${s.aiFilter})`);
  ok(byName(s, 'Deep work').settings?.defaultSpeed === 2 && byName(s, 'Deep work').settings?.sbIntro === true, 'Deep work kept its own settings');
  await studio.evaluate(() => new Promise((r) => chrome.storage.sync.set({ volume: 150 }, r))); // a shared change
  await studio.selectOption('#profSel', { label: 'Deep work' }); await settle(1000);
  s = await all();
  ok(s.defaultSpeed === 2 && s.sbIntro === true && s.aiFilter === false && s.volume === 100, `back to Deep work: its settings again (speed ${s.defaultSpeed}, volume ${s.volume})`);
  await studio.selectOption('#profSel', { label: 'Default' }); await settle(1000);
  s = await all();
  ok(s.volume === 150 && s.defaultSpeed === 1, 'shared change survived the round trip (volume 150)');
  await studio.screenshot({ path: path.join(SHOTS, 'profiles-panel.png'), clip: { x: 0, y: 0, width: 1280, height: 420 } });

  // #1: export
  await studio.selectOption('#profSel', { label: 'Deep work' }); await settle(1000);
  await studio.fill('#profChannels', 'Bench & Lens'); await studio.check('#profMusic'); await studio.click('#profSettings'); await studio.click('#profSettings'); // blur textarea → change
  await settle();
  const [dl] = await Promise.all([studio.waitForEvent('download'), studio.click('#profExport')]);
  const file = path.join(SHOTS, dl.suggestedFilename());
  await dl.saveAs(file);
  const ex = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dw = ex.profiles.find((p) => p.name === 'Deep work');
  ok(ex.format === 'eliteyt-profiles' && ex.version === 1 && ex.profiles.length === 2 && /eliteyt-profiles-\d{4}-\d\d-\d\d\.json/.test(dl.suggestedFilename()), 'export: a dated JSON file with both profiles');
  ok(JSON.stringify(dw.layout.main) === JSON.stringify(focusMain) && dw.settings?.defaultSpeed === 2 && dw.auto?.music === true && dw.auto?.channels?.[0] === 'Bench & Lens' && !('id' in dw), 'export carries layouts, settings and auto rules (no internal ids)');

  // delete, then import it back
  studio.once('dialog', (d) => d.accept());
  await studio.click('#profDel'); await settle(1200);
  ok(JSON.stringify(await opts()) === '["Default*"]' && await studio.isDisabled('#profDel'), 'delete removes it; the last profile cannot be deleted');
  s = await all();
  ok(!Object.keys(s).some((k) => k.startsWith('eytProfile:') && !s.profileIndex.some((e) => 'eytProfile:' + e.id === k)), 'deleted profile item removed from storage');
  await pop.reload(); await pop.waitForTimeout(400);
  ok(await pop.isHidden('#profRow'), 'popup hides the switcher with a single profile');

  await studio.setInputFiles('#profFile', file); await settle();
  ok(JSON.stringify(await opts()) === '["Default*","Default (2)","Deep work"]', 'import restores "Deep work" (and the exported Default as "Default (2)"): ' + (await opts()).join(', '));
  await studio.setInputFiles('#profFile', file); await settle();
  ok(JSON.stringify(await opts()) === '["Default*","Default (2)","Deep work","Default (3)","Deep work (2)"]', 'importing again adds numbered copies: ' + (await opts()).join(', '));
  await studio.selectOption('#profSel', { label: 'Deep work' }); await settle(1000);
  s = await all();
  ok(JSON.stringify(s.layout.main) === JSON.stringify(focusMain) && s.defaultSpeed === 2, 'imported profile works: layout and settings applied');
  const bad = path.join(SHOTS, 'bad.json');
  fs.writeFileSync(bad, JSON.stringify({ profiles: [{ name: 'Evil', layout: { main: ['hacked'] }, settings: { defaultSpeed: 'fast', adBlock: false, __proto__x: 1, unknownKey: 1 } }] }));
  await studio.setInputFiles('#profFile', bad); await settle();
  s = await all();
  const evil = byName(s, 'Evil');
  ok(evil && !evil.layout && evil.settings?.adBlock === false && !('defaultSpeed' in evil.settings) && !('unknownKey' in evil.settings), 'import drops invalid layouts and unknown / mistyped settings');
  fs.writeFileSync(bad, 'not json');
  await studio.setInputFiles('#profFile', bad); await studio.waitForTimeout(200);
  ok(/not valid JSON/.test(await studio.textContent('#toast')), 'a broken file is rejected with a message');

  // limit, and every item under the 8 KB sync limit
  for (let i = 0; i < 20; i++) { if (await studio.isDisabled('#profNew')) break; await newProfile('P' + i); }
  s = await all();
  const sizes = Object.keys(s).filter((k) => k.startsWith('eytProfile:')).map((k) => JSON.stringify(s[k]).length + k.length);
  ok((await opts()).length === 15 && s.profileIndex.length === 15 && await studio.isDisabled('#profNew'), 'capped at 15 profiles');
  ok(Math.max(...sizes) < 8192, `largest profile item ${Math.max(...sizes)} bytes (< 8192)`);
  await studio.setViewportSize({ width: 390, height: 844 });
  const wide = await studio.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && e.offsetParent).slice(0, 5).map((e) => e.tagName + '#' + e.id + '.' + e.className));
  ok(await studio.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll at 390px ' + wide.join(' '));
  await done(ctx);
})();
