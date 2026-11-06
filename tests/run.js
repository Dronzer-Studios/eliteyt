// Runs every tests/*.test.js in its own process (each launches Chromium with the unpacked extension).
// YouTube itself is never contacted: each suite serves YouTube-shaped fixture pages through request interception.
// Usage: node tests/run.js [name ...]   e.g. node tests/run.js adblock slop
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const only = process.argv.slice(2);
const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js') && (!only.length || only.some((o) => f.startsWith(o))));
let failed = [];
for (const f of files) {
  console.log(`\n=== ${f}`);
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit', timeout: 180e3 });
  if (r.status !== 0) failed.push(f);
}
console.log(`\n${files.length - failed.length}/${files.length} suites passed${failed.length ? ' — failed: ' + failed.join(', ') : ''}`);
process.exit(failed.length ? 1 : 0);
