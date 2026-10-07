# Electrical Calculator — installable web app

Upload this whole folder (keep the `icons` folder next to `index.html`). It must be served over **https** for install and offline mode to work.

## Host it (free, pick one)
- **Netlify Drop:** go to app.netlify.com/drop and drag this folder onto the page. You get an https link right away.
- **GitHub Pages:** create a repository, upload these files, then Settings → Pages → deploy from the main branch.
- **Your own website:** upload the folder to any https site, e.g. `yourcompany.com/calc/`.

## Install on a phone
- **iPhone / iPad:** open the link in Safari → Share → **Add to Home Screen**.
- **Android:** open the link in Chrome → ⋮ menu → **Install app** (or Add to Home screen).

Open it once with a signal; after that it works offline.

Long-press the icon on Android for shortcuts to Voltage Drop, Conduit Fill, Motors and Load Calc. Links like `index.html#vd` open a tab directly (`#gec`, `#bj`, `#egc`, `#rod`, `#par`, `#gen`, `#mot`, `#ld`, `#xf`, `#sb`, `#vd`, `#ev`, `#pv`, `#cf`, `#bx`, `#wc`, `#pie`, `#wa`, `#cc`).

## Updating
Replace `index.html`, then change `VERSION` at the top of `sw.js` (e.g. `elec-calc-v15`) so phones pick up the new copy.

## Files
- `index.html` — the calculator
- `manifest.webmanifest` — app name, colors, icons, shortcuts
- `sw.js` — offline cache
- `icons/` — app icons (standard, maskable for Android, Apple touch icon, favicon)
