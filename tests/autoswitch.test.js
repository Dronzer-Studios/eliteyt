// Automatic profiles (#2): a matching video switches only its own tab, and switches back when you leave it.
// Profile switching from YouTube (#4): Alt+Shift+P and the Tweaks panel switch globally.
const path = require('path');
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
  const activeName = async () => { const s = await all(); return s.profileIndex?.find((e) => e.id === s.activeProfile)?.name; };
  const settle = (ms = 800) => studio.waitForTimeout(ms);
  // "Music": classic layout (comments under the video), switches on automatically for music
  await studio.click('#profNew'); await studio.fill('#profName', 'Music'); await studio.click('#profForm [type=submit]'); await settle(1000);
  await studio.click('#presets [data-preset=classic]'); await settle();
  await studio.click('#profPanel summary'); await studio.check('#profMusic'); await settle();
  await studio.selectOption('#profSel', { label: 'Default' }); await settle(1000);
  ok(await activeName() === 'Default', 'set up: Music profile (classic layout, auto for music); Default active');

  const tab = async (v) => {
    const p = watch(await ctx.newPage());
    await p.goto('https://www.youtube.com/watch?v=' + v);
    await p.waitForFunction(() => document.documentElement.classList.contains('eyt-exp'));
    await p.waitForTimeout(1500);
    return p;
  };
  // where the comments panel and recommendations ended up
  const where = (p) => p.evaluate(() => ({
    panel: document.querySelector('.eyt-panel')?.parentElement?.id,
    related: document.querySelector('#related')?.parentElement?.id,
    auto: document.documentElement.dataset.eytAutoProfile,
    shared: JSON.parse(localStorage.getItem('eliteyt')).autoProfile }));
  const music = await tab('music'), normal = await tab('normal');
  let m = await where(music), n = await where(normal);
  ok(m.auto === 'Music' && m.panel === 'primary-inner', `music video: Music profile applied in its tab (comments under the video): ${JSON.stringify(m)}`);
  ok(!n.auto && n.panel === 'secondary-inner', `other tab untouched (comments in the sidebar): ${JSON.stringify(n)}`);
  ok(await activeName() === 'Default', 'automatic switch does not change the saved profile');
  ok(m.shared === '' && n.shared === '', "the tab's auto profile never reaches localStorage (shared by all YouTube tabs)");
  ok(/Profile: Music \(auto\)/.test(await music.evaluate(() => document.querySelector('.eyt-toast')?.textContent || '')), 'toast says the profile switched automatically');

  // leave the music video in the same tab: back to Default
  await music.evaluate(() => window.__nav('normal')); await music.waitForTimeout(1800);
  m = await where(music);
  ok(!m.auto && m.panel === 'secondary-inner', `navigating away switches back: ${JSON.stringify(m)}`);
  await music.evaluate(() => window.__nav('music')); await music.waitForTimeout(1800);
  ok((await where(music)).auto === 'Music', 'and back to Music on the next music video');

  // channel rule: Music also for "Bench & Lens"
  await studio.selectOption('#profSel', { label: 'Music' }); await settle(1000);
  await studio.fill('#profChannels', 'bench & lens'); await studio.click('#profPanel summary'); await settle();
  await studio.selectOption('#profSel', { label: 'Default' }); await settle(1000);
  await normal.reload(); await normal.waitForTimeout(1800);
  ok((await where(normal)).auto === 'Music', 'channel rule matches (case-insensitive)');
  await studio.selectOption('#profSel', { label: 'Music' }); await settle(1000);
  await studio.click('#profPanel summary'); await studio.uncheck('#profMusic'); await studio.fill('#profChannels', ''); await studio.click('#profPanel summary'); await settle();
  await studio.selectOption('#profSel', { label: 'Default' }); await settle(1000);
  await normal.waitForTimeout(800);
  ok(!(await where(normal)).auto && !(await where(music)).auto, 'rules removed: both tabs back to Default live');

  // #4 keyboard: Alt+Shift+P cycles the saved profile everywhere
  await normal.bringToFront();
  await normal.keyboard.press('Alt+Shift+KeyP'); await normal.waitForTimeout(1200);
  ok(await activeName() === 'Music', 'Alt+Shift+P switches to the next profile');
  ok(/Profile: Music/.test(await normal.evaluate(() => document.querySelector('.eyt-toast')?.textContent || '')), 'toast in the tab you pressed it in');
  ok((await where(music)).panel === 'primary-inner' && /Music/.test(await studio.$eval('#profSel option:checked', (o) => o.textContent)), 'other tab and the studio follow');
  await normal.keyboard.press('Alt+Shift+KeyP'); await normal.waitForTimeout(1200);
  ok(await activeName() === 'Default', 'pressing again wraps around to Default');
  await normal.click('body'); await normal.evaluate(() => { const i = document.createElement('input'); i.id = 'q'; document.body.prepend(i); });
  await normal.focus('#q'); await normal.keyboard.press('Alt+Shift+KeyP'); await normal.waitForTimeout(800);
  ok(await activeName() === 'Default', 'ignored while typing in a text field');

  // #4 Tweaks panel
  await normal.click('.eyt-tabs [data-tab=tweaks]'); await normal.waitForTimeout(300);
  const chips = () => normal.$$eval('.eyt-tw [data-profile]', (b) => b.map((x) => x.textContent + (x.getAttribute('aria-pressed') === 'true' ? '*' : '')));
  ok(JSON.stringify(await chips()) === '["Default*","Music"]', 'Tweaks lists the profiles: ' + (await chips()).join(','));
  await normal.screenshot({ path: path.join(SHOTS, 'tweaks-profiles.png'), clip: await normal.$eval('.eyt-panel', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 260) }; }) });
  await normal.click('.eyt-tw [data-profile]:not([aria-pressed="true"])'); await normal.waitForTimeout(1200);
  ok(await activeName() === 'Music' && JSON.stringify(await chips()) === '["Default","Music*"]', 'a Tweaks chip switches the profile');

  // the shortcut can be turned off
  await studio.evaluate(() => new Promise((r) => chrome.storage.sync.set({ profileKeys: false }, r))); await settle(500);
  await normal.click('h1'); await normal.keyboard.press('Alt+Shift+KeyP'); await normal.waitForTimeout(800);
  ok(await activeName() === 'Music', 'shortcut off: Alt+Shift+P does nothing');
  await done(ctx);
})();
