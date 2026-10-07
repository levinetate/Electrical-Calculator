# Electrical Calculator

Field calculator for electricians, built for an electrical contracting business (service, diagnostics, repairs). All sizing follows **NEC 2023**; 2026 change summaries show no changes to Tables 250.66, 250.102(C)(1) or 250.122.

**Goal of this project:** ship it as an iOS app (and Android later). The web app lives in `www/` and is wrapped with **Capacitor 8** into the native iOS project in `ios/`. The same `www/` folder also deploys as an installable, offline PWA.

## Files
- `www/index.html` — the whole app: markup, CSS and JS in one file (~200 KB). No build step, no framework.
- `www/fonts/` — bundled woff2 fonts (Barlow, Barlow Condensed, JetBrains Mono, from @fontsource; OFL). No network fonts: the app must work fully offline.
- `www/manifest.webmanifest` — PWA name ("Elec Calc"), colors, icons, shortcuts.
- `www/sw.js` — PWA offline cache. **Bump `VERSION` (currently `elec-calc-v15`) every time anything in `www/` changes**, and add any new asset to its `SHELL` list.
- `www/icons/` — PWA icons (192/512, maskable, apple-touch, favicon).
- `ios/` — Capacitor-generated Xcode project (Swift Package Manager, no CocoaPods). App icon: `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (1024×1024, opaque). Home-screen name `CFBundleDisplayName` = "Elec Calc" in `ios/App/App/Info.plist`.
- `capacitor.config.ts` — appId `com.levine.electricalcalculator`, appName "Electrical Calculator", webDir `www`.
- `package.json` — `npm run sync` (copy www → iOS), `npm run ios` (sync + open Xcode, Mac only), `npm run serve` (local web server).
- `README.md` — iOS build steps and PWA hosting/install steps.

**After any change in `www/`, run `npx cap sync ios`** so `ios/App/App/public` matches (that folder is gitignored and regenerated).

## How the page is organized
- One `<section class="panel" id="p-xxx">` per calculator. A grouped `<select id="tool">` menu switches panels; a hidden `<nav>` of buttons (`data-p="p-xxx"`) does the actual show/hide. Add new calculators to **both**.
- `#xxx` in the URL opens that panel (e.g. `index.html#vd`).
- Every calculator has one function that reads its inputs and writes results. `all()` calls every one of them and runs on any `input` event.
- Results use `plate(label, value, unit, highlight)` for the result tiles and a `<pre class="calc">` block that shows the worked math with code references. Keep showing the math — that's the point of the app.

| Panel | Function | Covers |
|---|---|---|
| p-gec, p-bj, p-egc, p-rod | gec, bj, egc, rod | Tables 250.66, 250.102(C)(1), 250.122; rod resistance (Dwight) |
| p-par | par2 | Parallel feeds: ampacity, GEC, MBJ, SSBJ, neutral, EGC per raceway |
| p-gen | genLoad, genOut, genGround | Generator kW from load, 445.13 conductors, 250.30/250.34/250.35 grounding |
| p-mot | motorCalc | 430.250 FLC, branch circuits, 430.24 feeder, 430.62, 430.28 & 240.21(B) taps |
| p-ld | loadCalc | Dwelling (standard + 220.82), multifamily (Part III + 220.84), commercial; generator for the load |
| p-xf | xfCalc, bbCalc | Transformers 450.3(B), 240.21(C) secondary taps, SDS grounding, buck-boost |
| p-sb | sbCalc | MCC buckets, MCC feeder, MSB feeder schedule, service, GFP/240.87/110.26 flags |
| p-vd | vdTab (+ vdCheck used everywhere) | Voltage drop, K-factor method, 250.122(B) EGC upsizing |
| p-ev | evCalc | Article 625, EMS, 220.87 existing-service check |
| p-pv | pvCalc | 690.7 cold Voc, 690.8/690.9 DC circuits, AC output, 705.11/705.12 (120% rule) |
| p-cf | cfCalc | Chapter 9 conduit fill, optional derated ampacity |
| p-bx | bxCalc, pbCalc | 314.16 box fill, 314.28 pull boxes |
| p-wc | wcCalc, panelCalc | Wire/phase colors, panel circuit numbers 1–100 by phase |
| p-cc | ccCalc, spCalc, mcCalc | Construction calculator (ft-in to 1/16″, area/volume), equal spacing, metric↔SAE (length, area, volume, weight, temp, torque, pressure, mm²↔AWG, wrenches) |
| p-pie, p-wa | pieCalc, waCalc, clCalc | Ohm's law PIE wheel (tappable), watts↔amps, circuit load builder |

## Shared data and helpers (search for these names)
- `SIZES` (AWG/kcmil → circular mils), `AMP["60"|"75"|"90"][cu|al]` (Table 310.16), `OCPD` (Table 250.122 rows), `STD_OCPD` (240.6), `ROWS` (250.66 / 250.102(C)(1)), `FLC3` / `FLC1` (430.250 / 430.248), `INS` / `RW` (Ch. 9 Tables 5 & 4), `TCF` (310.15(B)(1), used by PV).
- `sizeFor(I, T, mat)`, `protSize(minA, ocpd, T, mat)`, `egcFor(ocpd, mat, cond)`, `bondFor(cm, mat)`, `vdCheck(I, L, cond, mat, V, ph, limit, egc)`, `adj(n)` (310.15(C)(1)), `tcf(°C, col)`, `up()` / `down()` (next standard OCPD).

## Derating (optional, owner's preference)
- Derating is an **opt-in switch** in each calculator that sizes conductors (Motors, Generator, Transformers, MSB/MCC, EV, Load calc, Parallel, Conduit fill). Off by default. Don't make it always-on and don't remove it.
- `derUI(k)` builds the switch (ambient °F, rooftop, CCC count, insulation column); `derOf(k)` reads it. `wrapDer(fn,k)` sets the global `DER` while a calculator runs, so `sizeFor()` / `allowOf()` pick sizes from the insulation column × temperature × fill factors, capped at the termination column.
- Upsizing for derating does not upsize the EGC (250.122(B) exempts 310.15 adjustments). PV always applies 690.8(B) correction itself.

## Construction calculator parser
- `ccParse(expr, bare)` returns `{v, d}`: v in inches^d (d=1 length, 2 area, 3 volume, 0 plain number). `7-3/8` with no spaces is a mixed number; `10 - 3/8` with spaces is subtraction. Plain numbers stay unitless in × and ÷ and become inches/feet/mm (per the "Plain numbers mean" setting) only when added to a length or when the whole result is unitless.

## Gotcha: trade-size keys
- Raceway tables (`RW`) use string keys like "1/2", "3/4", "1", "1-1/4". JavaScript lists integer-like keys ("1", "2", "3") first, so always sort trade sizes with `tsz()` before searching for the smallest fit.

## Conventions
- Colors are CSS tokens on `:root` with dark-mode overrides; never hard-code colors in components.
- Must work at phone width (~400 px) with no sideways scroll.
- Every table value was typed from the code book — when changing one, cite the table and double-check it.
- Results are for reference; the footer disclaimer ("verify with the adopted code and the AHJ") stays.
- Test by loading `www/index.html` in a browser (`npm run serve`, or jsdom/Playwright) and reading the `.calc` blocks; there is no test suite yet.

## Status and next steps
- Done: Capacitor iOS project, local fonts, iOS app icon and splash.
- Next (needs the owner's Mac): open with `npm run ios`, set the signing team in Xcode, run on a device, then TestFlight/App Store (Apple Developer Program, $99/yr). App Store listing needs screenshots, a privacy policy URL, and a description.
- Later: Android via `@capacitor/android` (Google Play requires 12 testers × 14 days closed testing for new personal accounts).
- In the native app the service worker doesn't run (Capacitor serves files locally); `sw.js` registration fails silently by design.
