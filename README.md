# EliteYT

> A Chrome / Helium / Firefox extension that rearranges YouTube around the video: calmer home, comments beside the player, pause screen, SponsorBlock, DeArrow and Return YouTube Dislike built in.

**Site & teaser:** https://dronzer-studios.github.io/eliteyt/

## What it does

- **Watch page:** the sidebar becomes a Comments / Description / Tweaks panel that scrolls on its own; channel, filter chips and likes share one row under the video; recommendations become a grid.
- **On the player:** the title shows with the controls on hover; pausing blurs the frame and shows the title, channel, views, date and description.
- **Home:** carousel (last video, then new uploads from recently watched channels), Continue watching, From your subscriptions, a "New" badge, calm thumbnails (real video frames instead of creator artwork). No left sidebar; Home / Subscriptions / You sit by the avatar.
- **Built in:** SponsorBlock (skips + progress-bar markers), DeArrow (community titles and thumbnails), Return YouTube Dislike.
- **Speed:** `[` `]` `\` keys, speed remembered per channel, separate speed for music, a never-change list.
- **Battery saver (unplugged):** ≥2.5× plays at 480p, ≥1.75× at 720p, 60 fps streams skipped, ambient mode off.

## Quick Start

```sh
git clone https://github.com/Dronzer-Studios/eliteyt
```

**Chrome / Helium:** open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the `eliteyt` folder.

**Firefox (128+):** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and pick `eliteyt/manifest.json`. Battery saver is Chrome-only (Firefox has no Battery API); everything else works the same.

## Usage

Settings live in the toolbar popup; **Open full settings** has the drag-and-drop layout editor and presets. Every feature can be switched off there.

## Architecture

| File | World | Role |
|---|---|---|
| `src/bridge.js` | isolated | `chrome.storage` ↔ page (localStorage mirror + `eliteyt:settings` event) |
| `src/main.js` | main | player API: speed, quality, volume, layout, comments panel, pause screen |
| `src/sponsor.js` | main | SponsorBlock, DeArrow, Return YouTube Dislike, calm thumbnails |
| `src/home.js` | main | home shelves, carousel, top bar |
| `docs/` | — | GitHub Pages site and teaser video |

SponsorBlock and DeArrow are queried by a 4-character SHA-256 prefix of the video ID; Return YouTube Dislike needs the full ID.

## License

[GPL-3.0](LICENSE) © 2026 Dronzer Studios. You may use, study, share and modify EliteYT; derivative works must stay under GPL-3.0 with source available.

Brought to you by [Dronzer Studios](https://github.com/Dronzer-Studios), creators of Thallium 81 & hardware infrastructure. Not affiliated with YouTube or Google.
