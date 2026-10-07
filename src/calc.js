/*
 * Electrical calculation core. Pure functions with no DOM access, so they can
 * be unit-tested in Node and reused by the browser UI (exposed as
 * window.ElecCalc).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ElecCalc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SQRT3 = Math.sqrt(3);

  function isNum(x) {
    return typeof x === 'number' && Number.isFinite(x);
  }

  // ---------------------------------------------------------------- Ohm's law

  /**
   * Solve V = I·R and P = V·I from any two known quantities.
   * @param {{V?:number, I?:number, R?:number, P?:number}} known
   * @returns {{V:number, I:number, R:number, P:number}}
   */
  function ohmsLaw(known) {
    const keys = ['V', 'I', 'R', 'P'].filter((k) => isNum(known[k]));
    if (keys.length !== 2) {
      throw new Error('Enter exactly two values.');
    }
    let { V, I, R, P } = known;
    const has = (a, b) => keys.includes(a) && keys.includes(b);

    if (has('V', 'I')) {
      if (I === 0) throw new Error('Current cannot be zero.');
      R = V / I; P = V * I;
    } else if (has('V', 'R')) {
      if (R === 0) throw new Error('Resistance cannot be zero.');
      I = V / R; P = (V * V) / R;
    } else if (has('V', 'P')) {
      if (V === 0) throw new Error('Voltage cannot be zero.');
      I = P / V; R = (V * V) / P;
    } else if (has('I', 'R')) {
      V = I * R; P = I * I * R;
    } else if (has('I', 'P')) {
      if (I === 0) throw new Error('Current cannot be zero.');
      V = P / I; R = P / (I * I);
    } else {
      // R and P
      if (R <= 0 || P < 0) throw new Error('Resistance and power must be positive.');
      V = Math.sqrt(P * R); I = Math.sqrt(P / R);
    }
    return { V, I, R, P };
  }

  // -------------------------------------------------------------- AC power

  /**
   * Convert between current and real power for AC circuits.
   * @param {object} o
   * @param {'single'|'three'|'dc'} o.phase
   * @param {number} o.voltage  line-to-line voltage for three-phase
   * @param {number} [o.current] amps (provide this or powerW)
   * @param {number} [o.powerW]  real power in watts
   * @param {number} [o.pf=1]    power factor, 0 < pf <= 1
   * @returns {{current:number, realW:number, apparentVA:number, reactiveVAR:number, pf:number}}
   */
  function acPower({ phase, voltage, current, powerW, pf = 1 }) {
    if (!isNum(voltage) || voltage <= 0) throw new Error('Voltage must be greater than zero.');
    if (phase === 'dc') pf = 1;
    if (!isNum(pf) || pf <= 0 || pf > 1) throw new Error('Power factor must be between 0 and 1.');
    const k = phase === 'three' ? SQRT3 : 1;

    let apparentVA;
    if (isNum(current)) {
      apparentVA = k * voltage * current;
    } else if (isNum(powerW)) {
      apparentVA = powerW / pf;
      current = apparentVA / (k * voltage);
    } else {
      throw new Error('Enter either current or power.');
    }
    const realW = apparentVA * pf;
    const reactiveVAR = Math.sqrt(Math.max(apparentVA * apparentVA - realW * realW, 0));
    return { current, realW, apparentVA, reactiveVAR, pf };
  }

  // --------------------------------------------------------- Voltage drop

  // DC resistance of uncoated conductors at 75 °C, ohms per 1000 ft
  // (NEC Chapter 9, Table 8).
  const WIRE_TABLE = [
    { size: '18', cu: 7.77, al: 12.8 },
    { size: '16', cu: 4.89, al: 8.05 },
    { size: '14', cu: 3.07, al: 5.06 },
    { size: '12', cu: 1.93, al: 3.18 },
    { size: '10', cu: 1.21, al: 2.0 },
    { size: '8', cu: 0.764, al: 1.26 },
    { size: '6', cu: 0.491, al: 0.808 },
    { size: '4', cu: 0.308, al: 0.508 },
    { size: '3', cu: 0.245, al: 0.403 },
    { size: '2', cu: 0.194, al: 0.319 },
    { size: '1', cu: 0.154, al: 0.253 },
    { size: '1/0', cu: 0.122, al: 0.201 },
    { size: '2/0', cu: 0.0967, al: 0.159 },
    { size: '3/0', cu: 0.0766, al: 0.126 },
    { size: '4/0', cu: 0.0608, al: 0.1 },
    { size: '250', cu: 0.0515, al: 0.0847 },
    { size: '300', cu: 0.0429, al: 0.0707 },
    { size: '350', cu: 0.0367, al: 0.0605 },
    { size: '400', cu: 0.0321, al: 0.0529 },
    { size: '500', cu: 0.0258, al: 0.0424 },
  ];

  const FEET_PER_METER = 3.28084;

  function wireLabel(size) {
    return /^\d{3}$/.test(size) ? `${size} kcmil` : `${size} AWG`;
  }

  /**
   * Voltage drop over a run of wire (one-way length).
   * @param {object} o
   * @param {'single'|'three'|'dc'} o.phase
   * @param {'cu'|'al'} o.material
   * @param {string} o.size       a WIRE_TABLE size
   * @param {number} o.length     one-way length
   * @param {'ft'|'m'} [o.unit='ft']
   * @param {number} o.current    amps
   * @param {number} o.voltage    source voltage
   */
  function voltageDrop({ phase, material, size, length, unit = 'ft', current, voltage }) {
    const row = WIRE_TABLE.find((r) => r.size === size);
    if (!row) throw new Error(`Unknown wire size: ${size}`);
    if (!isNum(length) || length < 0) throw new Error('Length must be zero or more.');
    if (!isNum(current) || current < 0) throw new Error('Current must be zero or more.');
    if (!isNum(voltage) || voltage <= 0) throw new Error('Voltage must be greater than zero.');

    const feet = unit === 'm' ? length * FEET_PER_METER : length;
    const ohmsPerKft = row[material];
    if (!isNum(ohmsPerKft)) throw new Error(`Unknown material: ${material}`);
    const k = phase === 'three' ? SQRT3 : 2;
    const drop = (k * feet * ohmsPerKft * current) / 1000;
    const percent = (drop / voltage) * 100;
    return { drop, percent, loadVoltage: voltage - drop, ohmsPerKft };
  }

  /**
   * Smallest conductor in WIRE_TABLE whose drop stays at or below maxPercent.
   * Note: this checks voltage drop only, not ampacity.
   * @returns {string|null} wire size, or null if none qualifies
   */
  function minWireForDrop(opts, maxPercent = 3) {
    for (const row of WIRE_TABLE) {
      const { percent } = voltageDrop({ ...opts, size: row.size });
      if (percent <= maxPercent) return row.size;
    }
    return null;
  }

  // ------------------------------------------------------ Resistor networks

  function seriesResistance(values) {
    const rs = values.filter(isNum);
    if (rs.length === 0) throw new Error('Enter at least one resistor.');
    return rs.reduce((a, b) => a + b, 0);
  }

  function parallelResistance(values) {
    const rs = values.filter(isNum);
    if (rs.length === 0) throw new Error('Enter at least one resistor.');
    if (rs.some((r) => r === 0)) return 0;
    if (rs.some((r) => r < 0)) throw new Error('Resistances must be positive.');
    return 1 / rs.reduce((a, r) => a + 1 / r, 0);
  }

  // ----------------------------------------------------- Resistor color code

  const COLORS = [
    { name: 'black', hex: '#1b1b1b', digit: 0, mult: 1 },
    { name: 'brown', hex: '#7a4a24', digit: 1, mult: 10, tol: 1 },
    { name: 'red', hex: '#c8282d', digit: 2, mult: 100, tol: 2 },
    { name: 'orange', hex: '#e8781e', digit: 3, mult: 1e3 },
    { name: 'yellow', hex: '#f2cf1d', digit: 4, mult: 1e4 },
    { name: 'green', hex: '#2f8f46', digit: 5, mult: 1e5, tol: 0.5 },
    { name: 'blue', hex: '#2d5fc4', digit: 6, mult: 1e6, tol: 0.25 },
    { name: 'violet', hex: '#7b3fb0', digit: 7, mult: 1e7, tol: 0.1 },
    { name: 'grey', hex: '#8a8a8a', digit: 8, mult: 1e8, tol: 0.05 },
    { name: 'white', hex: '#f4f4f4', digit: 9, mult: 1e9 },
    { name: 'gold', hex: '#c9a43b', mult: 0.1, tol: 5 },
    { name: 'silver', hex: '#b9bec4', mult: 0.01, tol: 10 },
  ];

  function color(name) {
    const c = COLORS.find((x) => x.name === name);
    if (!c) throw new Error(`Unknown color: ${name}`);
    return c;
  }

  /**
   * Decode a 4- or 5-band resistor.
   * @param {string[]} bands color names: digits..., multiplier, tolerance
   * @returns {{ohms:number, tolerance:number, min:number, max:number}}
   */
  function resistorFromBands(bands) {
    if (bands.length !== 4 && bands.length !== 5) {
      throw new Error('Resistors have 4 or 5 bands.');
    }
    const digitBands = bands.slice(0, bands.length - 2);
    let base = 0;
    for (const name of digitBands) {
      const c = color(name);
      if (!isNum(c.digit)) throw new Error(`${name} is not a digit band.`);
      base = base * 10 + c.digit;
    }
    const mult = color(bands[bands.length - 2]).mult;
    const tolerance = color(bands[bands.length - 1]).tol;
    if (!isNum(tolerance)) throw new Error(`${bands[bands.length - 1]} is not a tolerance band.`);
    // Round to dodge float noise such as 4.7 * 0.1.
    const ohms = Number((base * mult).toPrecision(12));
    return {
      ohms,
      tolerance,
      min: ohms * (1 - tolerance / 100),
      max: ohms * (1 + tolerance / 100),
    };
  }

  // ------------------------------------------------------------ Energy cost

  /**
   * @param {object} o
   * @param {number} o.watts
   * @param {number} o.hoursPerDay
   * @param {number} o.ratePerKwh  currency per kWh
   * @param {number} [o.quantity=1]
   */
  function energyCost({ watts, hoursPerDay, ratePerKwh, quantity = 1 }) {
    for (const [k, v] of Object.entries({ watts, hoursPerDay, ratePerKwh, quantity })) {
      if (!isNum(v) || v < 0) throw new Error(`${k} must be zero or more.`);
    }
    if (hoursPerDay > 24) throw new Error('Hours per day cannot exceed 24.');
    const kwhPerDay = (watts * quantity * hoursPerDay) / 1000;
    return {
      kwhPerDay,
      kwhPerMonth: kwhPerDay * 30,
      kwhPerYear: kwhPerDay * 365,
      costPerDay: kwhPerDay * ratePerKwh,
      costPerMonth: kwhPerDay * 30 * ratePerKwh,
      costPerYear: kwhPerDay * 365 * ratePerKwh,
    };
  }

  // ------------------------------------------------------------ Formatting

  const PREFIXES = [
    [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''],
    [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'],
  ];

  /** Format with an SI prefix and up to `digits` significant figures. */
  function formatSI(value, unit = '', digits = 4) {
    if (!isNum(value)) return '—';
    if (value === 0) return `0 ${unit}`.trim();
    const abs = Math.abs(value);
    let [scale, prefix] = PREFIXES[PREFIXES.length - 1];
    for (const p of PREFIXES) {
      if (abs >= p[0] * 0.9999999) { [scale, prefix] = p; break; }
    }
    const n = Number((value / scale).toPrecision(digits));
    return `${n} ${prefix}${unit}`.trim();
  }

  /** Parse "4.7k", "2M2", "330m", "1.5 µ" etc. into a number. */
  function parseSI(text) {
    if (typeof text === 'number') return text;
    if (text == null) return NaN;
    const s = String(text).trim().replace(/\s+/g, '').replace(/Ω|ohms?$/i, '');
    if (s === '') return NaN;
    const mult = { G: 1e9, M: 1e6, k: 1e3, K: 1e3, m: 1e-3, u: 1e-6, 'µ': 1e-6, n: 1e-9, p: 1e-12 };
    // "4k7" style (prefix as decimal point)
    let m = s.match(/^(\d+)([GMkKmuµnpR])(\d+)$/);
    if (m) return Number(`${m[1]}.${m[3]}`) * (m[2] === 'R' ? 1 : mult[m[2]]);
    m = s.match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)([GMkKmuµnp]?)$/);
    if (!m) return NaN;
    return Number(m[1]) * (m[2] ? mult[m[2]] : 1);
  }

  return {
    ohmsLaw,
    acPower,
    WIRE_TABLE,
    wireLabel,
    voltageDrop,
    minWireForDrop,
    seriesResistance,
    parallelResistance,
    COLORS,
    resistorFromBands,
    energyCost,
    formatSI,
    parseSI,
  };
});
