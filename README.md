# BashaLanka — Starter

Minimal scaffold for the BashaLanka Sinhala learning app.

## Run locally
Use any static server (hash routing works):
- Python: `python3 -m http.server 8080`
- Node: `npx serve .`

Then open: `http://localhost:8080/#/home`

## Structure
- `index.html` — shell
- `styles.css` — base styles + tokens
- `app.js` — minimal router + Home / lesson stub
- `data/course.index.json` — Section 1 preview
- `assets/` — logo + PWA icons
- `manifest.webmanifest` — PWA manifest
- `sw.js` — service worker (no caching yet)

## Next steps
- Implement lesson renderer at `#/lesson/:id`
- Add schema + real lessons in `data/`
- Cache shell & data in `sw.js` for offline

## Section assets
- Each course section lives in its own folder inside this directory.
- Create a folder named `section-N` with a `units.json` file and any
- supporting art or overrides to add a new section to the learn page.
