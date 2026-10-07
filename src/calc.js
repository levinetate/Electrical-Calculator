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

  // -------------------------------------------------- Ampacity & protection

  // Allowable ampacity, not more than three current-carrying conductors in
  // raceway, 30 °C ambient (NEC Table 310.16). [60 °C, 75 °C, 90 °C]
  const AMPACITY = {
    '14': { cu: [15, 20, 25] },
    '12': { cu: [20, 25, 30], al: [15, 20, 25] },
    '10': { cu: [30, 35, 40], al: [25, 30, 35] },
    '8': { cu: [40, 50, 55], al: [35, 40, 45] },
    '6': { cu: [55, 65, 75], al: [40, 50, 55] },
    '4': { cu: [70, 85, 95], al: [55, 65, 75] },
    '3': { cu: [85, 100, 115], al: [65, 75, 85] },
    '2': { cu: [95, 115, 130], al: [75, 90, 100] },
    '1': { cu: [110, 130, 145], al: [85, 100, 115] },
    '1/0': { cu: [125, 150, 170], al: [100, 120, 135] },
    '2/0': { cu: [145, 175, 195], al: [115, 135, 150] },
    '3/0': { cu: [165, 200, 225], al: [130, 155, 175] },
    '4/0': { cu: [195, 230, 260], al: [150, 180, 205] },
    '250': { cu: [215, 255, 290], al: [170, 205, 230] },
    '300': { cu: [240, 285, 320], al: [195, 230, 260] },
    '350': { cu: [260, 310, 350], al: [210, 250, 280] },
    '400': { cu: [280, 335, 380], al: [225, 270, 305] },
    '500': { cu: [320, 380, 430], al: [260, 310, 350] },
  };
  const TEMP_COLUMN = { 60: 0, 75: 1, 90: 2 };

  // Conductor sizes smallest to largest. Iterate this rather than
  // Object.keys(), which would put integer-like keys such as '1' and '250' first.
  const SIZE_ORDER = WIRE_TABLE.map((r) => r.size);

  // Small-conductor overcurrent limits (NEC 240.4(D)).
  const SMALL_CONDUCTOR_MAX_OCPD = {
    cu: { '14': 15, '12': 20, '10': 30 },
    al: { '12': 15, '10': 25 },
  };

  // Standard ampere ratings for fuses and inverse-time breakers (NEC 240.6(A)).
  const STANDARD_OCPD = [
    15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175,
    200, 225, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1200, 1600,
    2000, 2500, 3000, 4000, 5000, 6000,
  ];

  /** Smallest standard OCPD rating at or above `amps`, or null if beyond the table. */
  function nextStandardOCPD(amps) {
    return STANDARD_OCPD.find((r) => r >= amps - 1e-9) ?? null;
  }

  /** Largest standard OCPD rating at or below `amps`, or null if below 15 A. */
  function prevStandardOCPD(amps) {
    let best = null;
    for (const r of STANDARD_OCPD) if (r <= amps + 1e-9) best = r;
    return best;
  }

  function ampacity(size, material, tempC) {
    const row = AMPACITY[size];
    const col = TEMP_COLUMN[tempC];
    if (col === undefined) throw new Error('Temperature rating must be 60, 75 or 90 °C.');
    return row && row[material] ? row[material][col] : null;
  }

  /** Smallest conductor whose ampacity is at least `amps`, or null. */
  function conductorForAmpacity(amps, material, tempC) {
    for (const size of SIZE_ORDER) {
      const a = ampacity(size, material, tempC);
      if (a !== null && a >= amps) return size;
    }
    return null;
  }

  /**
   * Largest OCPD a conductor may be protected by: 240.4(D) for small sizes,
   * otherwise its ampacity, or the next standard size up when that rating is
   * 800 A or less (240.4(B)).
   */
  function maxOCPDForConductor(size, material, tempC) {
    const a = ampacity(size, material, tempC);
    if (a === null) return null;
    const small = SMALL_CONDUCTOR_MAX_OCPD[material][size];
    const next = nextStandardOCPD(a);
    const allowed = next !== null && next <= 800 ? next : prevStandardOCPD(a);
    return small !== undefined ? Math.min(small, allowed) : allowed;
  }

  /**
   * Branch circuit / feeder sizing: OCPD at 125 % of continuous plus 100 % of
   * non-continuous load (210.20(A), 215.3), conductor sized for that load
   * (210.19(A), 215.2(A)) and protected by the chosen OCPD.
   * @param {object} o
   * @param {number} o.continuous      amps running 3 h or more
   * @param {number} [o.nonContinuous=0]
   * @param {'cu'|'al'} o.material
   * @param {60|75} o.terminalTemp     lowest termination rating
   */
  function branchCircuit({ continuous, nonContinuous = 0, material, terminalTemp }) {
    if (!isNum(continuous) || continuous < 0) throw new Error('Continuous load must be zero or more.');
    if (!isNum(nonContinuous) || nonContinuous < 0) throw new Error('Non-continuous load must be zero or more.');
    if (continuous + nonContinuous <= 0) throw new Error('Enter a load greater than zero.');
    const load = continuous + nonContinuous;
    const required = continuous * 1.25 + nonContinuous;
    const breaker = nextStandardOCPD(required);
    if (breaker === null) throw new Error('Load is beyond standard breaker ratings.');

    let conductor = null;
    for (const size of SIZE_ORDER) {
      const a = ampacity(size, material, terminalTemp);
      if (a === null || a < required) continue;
      if (maxOCPDForConductor(size, material, terminalTemp) >= breaker) { conductor = size; break; }
    }
    return {
      load,
      required,
      breaker,
      conductor,
      conductorAmpacity: conductor ? ampacity(conductor, material, terminalTemp) : null,
    };
  }

  // ----------------------------------------------------------- Motor circuits

  // Full-load current, induction motors (NEC Table 430.250, three-phase;
  // Table 430.248, single-phase). Columns are keyed by voltage.
  const MOTOR_FLA = {
    three: {
      voltages: [200, 208, 230, 460, 575],
      rows: [
        ['1/2', 0.5, [2.5, 2.4, 2.2, 1.1, 0.9]],
        ['3/4', 0.75, [3.7, 3.5, 3.2, 1.6, 1.3]],
        ['1', 1, [4.8, 4.6, 4.2, 2.1, 1.7]],
        ['1-1/2', 1.5, [6.9, 6.6, 6.0, 3.0, 2.4]],
        ['2', 2, [7.8, 7.5, 6.8, 3.4, 2.7]],
        ['3', 3, [11.0, 10.6, 9.6, 4.8, 3.9]],
        ['5', 5, [17.5, 16.7, 15.2, 7.6, 6.1]],
        ['7-1/2', 7.5, [25.3, 24.2, 22, 11, 9]],
        ['10', 10, [32.2, 30.8, 28, 14, 11]],
        ['15', 15, [48.3, 46.2, 42, 21, 17]],
        ['20', 20, [62.1, 59.4, 54, 27, 22]],
        ['25', 25, [78.2, 74.8, 68, 34, 27]],
        ['30', 30, [92, 88, 80, 40, 32]],
        ['40', 40, [120, 114, 104, 52, 41]],
        ['50', 50, [150, 143, 130, 65, 52]],
        ['60', 60, [177, 169, 154, 77, 62]],
        ['75', 75, [221, 211, 192, 96, 77]],
        ['100', 100, [285, 273, 248, 124, 99]],
        ['125', 125, [359, 343, 312, 156, 125]],
        ['150', 150, [414, 396, 360, 180, 144]],
        ['200', 200, [552, 528, 480, 240, 192]],
      ],
    },
    single: {
      voltages: [115, 200, 208, 230],
      rows: [
        ['1/6', 1 / 6, [4.4, 2.5, 2.4, 2.2]],
        ['1/4', 0.25, [5.8, 3.3, 3.2, 2.9]],
        ['1/3', 1 / 3, [7.2, 4.1, 4.0, 3.6]],
        ['1/2', 0.5, [9.8, 5.6, 5.4, 4.9]],
        ['3/4', 0.75, [13.8, 7.9, 7.6, 6.9]],
        ['1', 1, [16, 9.2, 8.8, 8]],
        ['1-1/2', 1.5, [20, 11.5, 11, 10]],
        ['2', 2, [24, 13.8, 13.2, 12]],
        ['3', 3, [34, 19.6, 18.7, 17]],
        ['5', 5, [56, 32.2, 30.8, 28]],
        ['7-1/2', 7.5, [80, 46, 44, 40]],
        ['10', 10, [100, 57.5, 55, 50]],
      ],
    },
  };

  function motorFLA({ phase, voltage, hp }) {
    const t = MOTOR_FLA[phase];
    if (!t) throw new Error('Motor phase must be single or three.');
    const col = t.voltages.indexOf(voltage);
    if (col < 0) throw new Error(`No table column for ${voltage} V.`);
    const row = t.rows.find((r) => r[0] === hp);
    if (!row) throw new Error(`No table row for ${hp} hp.`);
    return row[2][col];
  }

  /**
   * Motor branch circuit per NEC Article 430 using table FLC.
   * Conductors at 125 % FLC (430.22). Maximum short-circuit/ground-fault
   * protection per Table 430.52, rounded up to the next standard size as
   * permitted by 430.52(C)(1) Exception 1.
   */
  function motorCircuit({ phase, voltage, hp, material, terminalTemp }) {
    const fla = motorFLA({ phase, voltage, hp });
    const minAmpacity = fla * 1.25;
    const conductor = conductorForAmpacity(minAmpacity, material, terminalTemp);
    const ocpd = (pct) => nextStandardOCPD((fla * pct) / 100);
    return {
      fla,
      minAmpacity,
      conductor,
      conductorAmpacity: conductor ? ampacity(conductor, material, terminalTemp) : null,
      breaker: ocpd(250),
      dualElementFuse: ocpd(175),
      nonTimeDelayFuse: ocpd(300),
      // Overload sizing (430.32) uses nameplate current; FLC shown as a guide.
      overload115: fla * 1.15,
      overload125: fla * 1.25,
    };
  }

  // ------------------------------------------------------------ Conduit fill

  // Approximate area of THHN / THWN-2 conductors, in² (NEC Chapter 9 Table 5).
  const THHN_AREA = {
    '14': 0.0097, '12': 0.0133, '10': 0.0211, '8': 0.0366, '6': 0.0507,
    '4': 0.0824, '3': 0.0973, '2': 0.1158, '1': 0.1562, '1/0': 0.1855,
    '2/0': 0.2223, '3/0': 0.2679, '4/0': 0.3237, '250': 0.397, '300': 0.4608,
    '350': 0.5242, '400': 0.5863, '500': 0.7073,
  };

  const TRADE_SIZES = ['1/2', '3/4', '1', '1-1/4', '1-1/2', '2', '2-1/2', '3', '3-1/2', '4'];

  // Total internal area of conduit, in² (NEC Chapter 9 Table 4).
  const CONDUIT_AREA = {
    emt: {
      label: 'EMT',
      sizes: { '1/2': 0.304, '3/4': 0.533, '1': 0.864, '1-1/4': 1.496, '1-1/2': 2.036, '2': 3.356, '2-1/2': 5.858, '3': 8.846, '3-1/2': 11.545, '4': 14.753 },
    },
    pvc40: {
      label: 'PVC Schedule 40',
      sizes: { '1/2': 0.285, '3/4': 0.508, '1': 0.832, '1-1/4': 1.453, '1-1/2': 1.986, '2': 3.291, '2-1/2': 4.695, '3': 7.268, '3-1/2': 9.737, '4': 12.554 },
    },
    rmc: {
      label: 'Rigid metal (RMC)',
      sizes: { '1/2': 0.314, '3/4': 0.549, '1': 0.887, '1-1/4': 1.526, '1-1/2': 2.071, '2': 3.408, '2-1/2': 4.866, '3': 7.499, '3-1/2': 10.01, '4': 12.882 },
    },
  };

  /** Maximum fill percentage by number of conductors (Chapter 9 Table 1). */
  function maxFillPercent(count) {
    if (count <= 0) return 0;
    if (count === 1) return 53;
    if (count === 2) return 31;
    return 40;
  }

  /**
   * @param {object} o
   * @param {string} o.type   key of CONDUIT_AREA
   * @param {string} o.size   trade size
   * @param {{size:string, qty:number}[]} o.wires
   */
  function conduitFill({ type, size, wires }) {
    const conduit = CONDUIT_AREA[type];
    if (!conduit) throw new Error(`Unknown conduit type: ${type}`);
    const area = conduit.sizes[size];
    if (!isNum(area)) throw new Error(`Unknown trade size: ${size}`);
    let count = 0;
    let wireArea = 0;
    for (const w of wires) {
      const a = THHN_AREA[w.size];
      if (!isNum(a)) throw new Error(`Unknown conductor size: ${w.size}`);
      if (!Number.isInteger(w.qty) || w.qty < 0) throw new Error('Quantities must be whole numbers.');
      count += w.qty;
      wireArea += a * w.qty;
    }
    if (count === 0) throw new Error('Add at least one conductor.');
    const allowedPercent = maxFillPercent(count);
    const fillPercent = (wireArea / area) * 100;
    return { count, wireArea, conduitArea: area, fillPercent, allowedPercent, ok: fillPercent <= allowedPercent };
  }

  /** Smallest trade size of `type` that holds `wires` within the fill limit, or null. */
  function smallestConduit(type, wires) {
    for (const size of TRADE_SIZES) {
      if (conduitFill({ type, size, wires }).ok) return size;
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
    AMPACITY,
    STANDARD_OCPD,
    nextStandardOCPD,
    ampacity,
    conductorForAmpacity,
    maxOCPDForConductor,
    branchCircuit,
    MOTOR_FLA,
    motorFLA,
    motorCircuit,
    SIZE_ORDER,
    THHN_AREA,
    TRADE_SIZES,
    CONDUIT_AREA,
    maxFillPercent,
    conduitFill,
    smallestConduit,
    seriesResistance,
    parallelResistance,
    COLORS,
    resistorFromBands,
    energyCost,
    formatSI,
    parseSI,
  };
});
