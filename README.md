# Electrical Calculator

A dependency-free, browser-based electrical calculator. Open `index.html` in any browser.

## Calculators

| Calculator | What it does |
|---|---|
| **Ohm's Law** | Enter any two of voltage, current, resistance and power; the other two are solved. |
| **AC / DC Power** | Convert between current and real power for DC, single-phase and three-phase systems, with power factor, apparent/reactive power and horsepower. |
| **Voltage Drop** | Drop and percent drop for copper or aluminum conductors (18 AWG – 500 kcmil, NEC Ch. 9 Table 8 at 75 °C), plus the smallest size that meets your allowed drop. |
| **Breaker & Wire** | Breaker size at 125% of continuous plus 100% of non-continuous load, and the smallest copper or aluminum conductor (NEC Table 310.16, 60 °C or 75 °C terminals) that breaker protects, including the 240.4(B) and 240.4(D) rules. |
| **Motor Circuit** | Full-load current from NEC Tables 430.248 / 430.250, conductor at 125% FLC, maximum breaker and fuse sizes per Table 430.52, and overload guide values. |
| **Conduit Fill** | Fill percentage for mixed THHN/THWN-2 conductors in EMT, PVC Schedule 40 or RMC (Chapter 9 Tables 1, 4 and 5), plus the smallest trade size that fits. |
| **Resistor Network** | Total resistance of any number of resistors in series or parallel. |
| **Color Code** | Decode 4- and 5-band resistor color codes with tolerance range and a live preview. |
| **Energy Cost** | Daily, monthly and yearly kWh and running cost of a load. |

Every numeric field accepts SI prefixes: `4.7k`, `4k7`, `2M2`, `330m`, `1.5u`.

## Project layout

```
index.html        UI markup and styles
src/calc.js       Pure calculation functions (usable in Node or the browser)
src/app.js        Browser UI wiring
tests/            Unit tests (node:test)
```

## Tests

```
npm test
```

Requires Node 18+. No dependencies to install.

> Results are for estimation and education. Electrical installations must be designed and verified by a qualified person under your local code. Voltage-drop sizing does not check ampacity, and breaker/wire sizing assumes 30 °C ambient with no more than three current-carrying conductors.
