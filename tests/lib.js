// Shared by the test suites: where the extension is, where screenshots go.
const path = require('path'), os = require('os'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'eyt-shots-'));
fs.mkdirSync(SHOTS, { recursive: true });
module.exports = { ROOT, SHOTS };
