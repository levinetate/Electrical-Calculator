const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/calc.js');

const close = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test("Ohm's law solves every pair", () => {
  const want = { V: 12, I: 2, R: 6, P: 24 };
  const pairs = [['V', 'I'], ['V', 'R'], ['V', 'P'], ['I', 'R'], ['I', 'P'], ['R', 'P']];
  for (const [a, b] of pairs) {
    const got = C.ohmsLaw({ [a]: want[a], [b]: want[b] });
    for (const k of Object.keys(want)) close(got[k], want[k]);
  }
});

test("Ohm's law rejects wrong input count and zero divisors", () => {
  assert.throws(() => C.ohmsLaw({ V: 1 }));
  assert.throws(() => C.ohmsLaw({ V: 1, I: 1, R: 1 }));
  assert.throws(() => C.ohmsLaw({ V: 1, I: 0 }));
});

test('AC power single and three phase', () => {
  const s = C.acPower({ phase: 'single', voltage: 240, current: 10, pf: 0.8 });
  close(s.apparentVA, 2400);
  close(s.realW, 1920);
  close(s.reactiveVAR, 1440);

  const t = C.acPower({ phase: 'three', voltage: 480, powerW: 10000, pf: 0.9 });
  close(t.current, 10000 / 0.9 / (Math.sqrt(3) * 480));

  const d = C.acPower({ phase: 'dc', voltage: 12, current: 5, pf: 0.5 });
  close(d.realW, 60);
});

test('voltage drop matches hand calculation', () => {
  // 12 AWG Cu, 100 ft, 16 A, 120 V single-phase: 2*100*1.93*16/1000 = 6.176 V
  const r = C.voltageDrop({ phase: 'single', material: 'cu', size: '12', length: 100, current: 16, voltage: 120 });
  close(r.drop, 6.176);
  close(r.percent, 6.176 / 1.2);

  const m = C.voltageDrop({ phase: 'three', material: 'al', size: '4/0', length: 30, unit: 'm', current: 100, voltage: 480 });
  close(m.drop, (Math.sqrt(3) * 30 * 3.28084 * 0.1 * 100) / 1000);
});

test('minimum wire for 3% drop', () => {
  const opts = { phase: 'single', material: 'cu', length: 100, current: 16, voltage: 120 };
  // 3% of 120 = 3.6 V → need R/kft <= 3.6*1000/(2*100*16) = 1.125 → 8 AWG (0.764)
  assert.equal(C.minWireForDrop(opts, 3), '8');
  assert.equal(C.minWireForDrop({ ...opts, length: 1e6 }, 3), null);
});

test('series and parallel resistance', () => {
  assert.equal(C.seriesResistance([100, 220, 330]), 650);
  close(C.parallelResistance([100, 100]), 50);
  close(C.parallelResistance([1000, 2000, 2000]), 500);
  assert.equal(C.parallelResistance([100, 0]), 0);
});

test('resistor color code', () => {
  assert.deepEqual(
    C.resistorFromBands(['yellow', 'violet', 'red', 'gold']),
    { ohms: 4700, tolerance: 5, min: 4465, max: 4935 },
  );
  assert.equal(C.resistorFromBands(['brown', 'black', 'black', 'red', 'brown']).ohms, 10000);
  assert.equal(C.resistorFromBands(['yellow', 'violet', 'gold', 'gold']).ohms, 4.7);
  assert.throws(() => C.resistorFromBands(['gold', 'black', 'red', 'gold']));
});

test('energy cost', () => {
  const r = C.energyCost({ watts: 100, hoursPerDay: 10, ratePerKwh: 0.15 });
  close(r.kwhPerDay, 1);
  close(r.costPerYear, 54.75);
});

test('SI formatting and parsing', () => {
  assert.equal(C.formatSI(4700, 'Ω'), '4.7 kΩ');
  assert.equal(C.formatSI(0.0025, 'A'), '2.5 mA');
  assert.equal(C.formatSI(0, 'V'), '0 V');
  assert.equal(C.formatSI(1000, 'W'), '1 kW');
  assert.equal(C.parseSI('4.7k'), 4700);
  assert.equal(C.parseSI('4k7'), 4700);
  assert.equal(C.parseSI('2M2'), 2200000);
  close(C.parseSI('330m'), 0.33);
  assert.equal(C.parseSI('10 Ω'), 10);
  assert.ok(Number.isNaN(C.parseSI('abc')));
  assert.ok(Number.isNaN(C.parseSI('')));
});

test('standard OCPD ratings and ampacity lookup', () => {
  assert.equal(C.nextStandardOCPD(20), 20);
  assert.equal(C.nextStandardOCPD(20.1), 25);
  assert.equal(C.nextStandardOCPD(7000), null);
  assert.equal(C.ampacity('12', 'cu', 75), 25);
  assert.equal(C.ampacity('14', 'al', 75), null);
  assert.equal(C.conductorForAmpacity(51, 'cu', 75), '6');
});

test('conductor protection limits', () => {
  // 240.4(D): 12 Cu is 25 A at 75 °C but limited to 20 A.
  assert.equal(C.maxOCPDForConductor('12', 'cu', 75), 20);
  // 240.4(B): 1 AWG Cu at 75 °C is 130 A; next standard size is 150 A.
  assert.equal(C.maxOCPDForConductor('1', 'cu', 75), 150);
});

test('branch circuit sizing', () => {
  // 16 A continuous → 20 A required → 20 A breaker, 12 Cu at 60 °C.
  assert.deepEqual(C.branchCircuit({ continuous: 16, material: 'cu', terminalTemp: 60 }),
    { load: 16, required: 20, breaker: 20, conductor: '12', conductorAmpacity: 20 });
  // 24 A non-continuous → 25 A breaker; 12 Cu is limited to 20 A so 10 Cu.
  assert.equal(C.branchCircuit({ continuous: 0, nonContinuous: 24, material: 'cu', terminalTemp: 75 }).conductor, '10');
  // 130 A → 150 A breaker; 1 AWG Cu (130 A) allowed by next-size-up rule.
  const r = C.branchCircuit({ continuous: 0, nonContinuous: 130, material: 'cu', terminalTemp: 75 });
  assert.equal(r.breaker, 150);
  assert.equal(r.conductor, '1');
  assert.throws(() => C.branchCircuit({ continuous: 0, material: 'cu', terminalTemp: 75 }));
});

test('motor circuit from NEC tables', () => {
  assert.equal(C.motorFLA({ phase: 'single', voltage: 230, hp: '1' }), 8);
  const m = C.motorCircuit({ phase: 'three', voltage: 460, hp: '10', material: 'cu', terminalTemp: 75 });
  assert.equal(m.fla, 14);
  close(m.minAmpacity, 17.5);
  assert.equal(m.conductor, '14');
  assert.equal(m.breaker, 35);          // 250 % = 35
  assert.equal(m.dualElementFuse, 25);  // 175 % = 24.5 → 25
  assert.equal(m.nonTimeDelayFuse, 45); // 300 % = 42 → 45
  assert.throws(() => C.motorFLA({ phase: 'three', voltage: 120, hp: '10' }));
});

test('conduit fill', () => {
  assert.equal(C.maxFillPercent(1), 53);
  assert.equal(C.maxFillPercent(2), 31);
  assert.equal(C.maxFillPercent(5), 40);
  const f = C.conduitFill({ type: 'emt', size: '1/2', wires: [{ size: '12', qty: 4 }] });
  close(f.fillPercent, (4 * 0.0133 / 0.304) * 100);
  assert.equal(f.ok, true);
  // Two 6 AWG in 1/2" EMT: 33.4 % > 31 %.
  assert.equal(C.conduitFill({ type: 'emt', size: '1/2', wires: [{ size: '6', qty: 2 }] }).ok, false);
  assert.equal(C.smallestConduit('emt', [{ size: '10', qty: 9 }]), '3/4');
  assert.equal(C.smallestConduit('emt', [{ size: '500', qty: 30 }]), null);
});
