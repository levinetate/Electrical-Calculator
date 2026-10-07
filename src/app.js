/* Browser UI wiring for the calculators in calc.js. */
(function () {
  'use strict';
  const C = window.ElecCalc;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const fmt = C.formatSI;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function meter(el, { tag, primary, rows = [], extra = '' }) {
    el.innerHTML =
      `<div class="tag"><span>${esc(tag)}</span><span>READ</span></div>` +
      `<div class="primary">${esc(primary)}</div>` +
      (rows.length ? `<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '') +
      extra;
  }

  function meterError(el, tag, msg) {
    el.innerHTML = `<div class="tag"><span>${esc(tag)}</span><span>—</span></div><div class="primary">– – –</div><div class="err">${esc(msg)}</div>`;
  }

  /** Segmented control: returns getter, calls onChange with the new value. */
  function segmented(id, onChange) {
    const group = document.getElementById(id);
    const buttons = $$('button', group);
    group.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      onChange(b.dataset.v);
    });
    buttons.forEach((b) => { if (!b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', 'false'); });
    return () => buttons.find((b) => b.getAttribute('aria-pressed') === 'true').dataset.v;
  }

  const num = (id) => C.parseSI(document.getElementById(id).value);

  // ------------------------------------------------------------------ Tabs
  const tabs = $$('nav.tabs button');
  function showTab(name) {
    if (!tabs.some((t) => t.dataset.tab === name)) name = 'ohm';
    tabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.dataset.tab).hidden = !on;
    });
    try { localStorage.setItem('elec-tab', name); } catch (_) { /* storage unavailable */ }
  }
  tabs.forEach((t) => t.addEventListener('click', () => {
    showTab(t.dataset.tab);
    if (history.replaceState) history.replaceState(null, '', '#' + t.dataset.tab);
  }));
  $('nav.tabs').addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const i = tabs.indexOf(document.activeElement);
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
    const next = tabs[(i + step + tabs.length) % tabs.length];
    next.focus();
    next.click();
  });
  let initial = location.hash.slice(1);
  if (!initial) { try { initial = localStorage.getItem('elec-tab') || ''; } catch (_) { /* ignore */ } }
  showTab(initial);

  // ------------------------------------------------------------ Ohm's law
  (function () {
    const out = $('#ohm-out');
    const inputs = $$('#ohm input');
    const unit = { V: 'V', I: 'A', R: 'Ω', P: 'W' };
    const label = { V: 'Voltage', I: 'Current', R: 'Resistance', P: 'Power' };
    // The two most recently typed quantities are the knowns.
    let known = inputs.filter((i) => i.value.trim() !== '').map((i) => i.dataset.key);

    function run() {
      const vals = {};
      for (const k of known) vals[k] = C.parseSI($(`#ohm-${k}`).value);
      inputs.forEach((i) => {
        const isKnown = known.includes(i.dataset.key);
        i.classList.toggle('computed', !isKnown);
        i.parentElement.classList.toggle('is-computed', !isKnown);
      });
      if (known.length < 2) {
        meterError(out, "Ohm's law", 'Enter two values to solve.');
        return;
      }
      const bad = known.find((k) => !Number.isFinite(vals[k]));
      if (bad) {
        meterError(out, "Ohm's law", `${label[bad]} is not a number. Try 12, 4.7k or 330m.`);
        return;
      }
      let r;
      try { r = C.ohmsLaw(vals); } catch (e) { meterError(out, "Ohm's law", e.message); return; }
      inputs.forEach((i) => {
        const k = i.dataset.key;
        if (!known.includes(k)) i.value = Number(r[k].toPrecision(6));
      });
      const solved = ['V', 'I', 'R', 'P'].filter((k) => !known.includes(k));
      meter(out, {
        tag: `Solved ${solved.join(' & ')}`,
        primary: solved.map((k) => fmt(r[k], unit[k])).join(' · '),
        rows: ['V', 'I', 'R', 'P'].map((k) => [label[k], fmt(r[k], unit[k], 6)]),
      });
    }

    inputs.forEach((i) => i.addEventListener('input', () => {
      const k = i.dataset.key;
      known = known.filter((x) => x !== k);
      if (i.value.trim() !== '') known.push(k);
      if (known.length > 2) known = known.slice(-2);
      run();
    }));
    $('#ohm-clear').addEventListener('click', () => {
      inputs.forEach((i) => { i.value = ''; });
      known = [];
      run();
      inputs[0].focus();
    });
    run();
  })();

  // ---------------------------------------------------------------- Power
  (function () {
    const out = $('#pw-out');
    const phase = segmented('pw-phase', run);
    const mode = segmented('pw-mode', (m) => {
      $('#pw-val-label').textContent = m === 'current' ? 'Current' : 'Real power';
      $('#pw-val-unit').textContent = m === 'current' ? 'A' : 'W';
      $('#pw-val').value = m === 'current' ? '40' : '25k';
      run();
    });

    function run() {
      const ph = phase();
      $('#pw-pf-field').hidden = ph === 'dc';
      const val = num('pw-val');
      const args = { phase: ph, voltage: num('pw-V'), pf: ph === 'dc' ? 1 : num('pw-pf') };
      if (!Number.isFinite(val) || val < 0) {
        meterError(out, 'Power', 'Enter a positive value. Try 40 or 25k.');
        return;
      }
      if (mode() === 'current') args.current = val; else args.powerW = val;
      let r;
      try { r = C.acPower(args); } catch (e) { meterError(out, 'Power', e.message); return; }
      const rows = [['Current', fmt(r.current, 'A')], ['Real power', fmt(r.realW, 'W')]];
      if (ph !== 'dc') {
        rows.push(['Apparent', fmt(r.apparentVA, 'VA')], ['Reactive', fmt(r.reactiveVAR, 'var')]);
      }
      if (ph !== 'dc') rows.push(['Horsepower', `${(r.realW / 745.7).toFixed(2)} hp`]);
      meter(out, {
        tag: { dc: 'DC', single: '1-phase', three: '3-phase' }[ph],
        primary: mode() === 'current' ? fmt(r.realW, 'W') : fmt(r.current, 'A'),
        rows,
      });
    }
    ['pw-V', 'pw-val', 'pw-pf'].forEach((id) => document.getElementById(id).addEventListener('input', run));
    run();
  })();

  // ---------------------------------------------------------- Voltage drop
  (function () {
    const out = $('#vd-out');
    const sizeSel = $('#vd-size');
    sizeSel.innerHTML = C.WIRE_TABLE.map((r) => `<option value="${r.size}">${C.wireLabel(r.size)}</option>`).join('');
    sizeSel.value = '12';
    const phase = segmented('vd-phase', run);

    function run() {
      const opts = {
        phase: phase(),
        material: $('#vd-mat').value,
        size: sizeSel.value,
        length: num('vd-len'),
        unit: $('#vd-unit').value,
        current: num('vd-I'),
        voltage: num('vd-V'),
      };
      const max = num('vd-max');
      if (!Number.isFinite(max) || max <= 0) { meterError(out, 'Voltage drop', 'Allowed drop must be a positive percent.'); return; }
      let r;
      try { r = C.voltageDrop(opts); } catch (e) { meterError(out, 'Voltage drop', e.message); return; }
      const min = C.minWireForDrop(opts, max);
      const status = r.percent <= max ? ['ok', 'Within limit'] : r.percent <= max * 5 / 3 ? ['warn', 'Over limit'] : ['bad', 'Far over limit'];
      const bar = gauge(r.percent, max, `${r.percent.toFixed(2)}% of ${max}% allowed`);
      meter(out, {
        tag: `${C.wireLabel(opts.size)} ${opts.material === 'cu' ? 'Cu' : 'Al'}`,
        primary: `${r.percent.toFixed(2)} %`,
        rows: [
          ['Drop', fmt(r.drop, 'V')],
          ['At load', fmt(r.loadVoltage, 'V')],
          ['Conductor', `${r.ohmsPerKft} Ω/kft`],
          [`Min. for ≤${max}%`, min ? C.wireLabel(min) : 'Larger than 500 kcmil'],
        ],
        extra: bar + `<div><span class="pill ${status[0]}">${status[1]}</span></div>`,
      });
    }
    ['vd-mat', 'vd-size', 'vd-unit'].forEach((id) => document.getElementById(id).addEventListener('change', run));
    ['vd-len', 'vd-I', 'vd-V', 'vd-max'].forEach((id) => document.getElementById(id).addEventListener('input', run));
    run();
  })();

  // ------------------------------------------------------ Resistor network
  (function () {
    const out = $('#rn-out');
    const list = $('#rn-list');
    let counter = 0;
    const mode = segmented('rn-mode', run);

    function addRow(value = '') {
      counter += 1;
      const row = document.createElement('div');
      row.className = 'r';
      row.innerHTML =
        `<span class="idx"></span>` +
        `<div class="input-unit"><input id="rn-${counter}" inputmode="decimal" autocomplete="off" aria-label="Resistance" value="${esc(value)}"><span class="unit">Ω</span></div>` +
        `<button type="button" class="icon-btn" aria-label="Remove resistor">×</button>`;
      $('input', row).addEventListener('input', run);
      $('button', row).addEventListener('click', () => {
        if (list.children.length > 1) row.remove();
        else $('input', row).value = '';
        run();
      });
      list.appendChild(row);
      return row;
    }

    function run() {
      $$('.r', list).forEach((r, i) => { $('.idx', r).textContent = `R${i + 1}`; });
      const raw = $$('input', list).map((i) => i.value.trim()).filter(Boolean);
      const vals = raw.map(C.parseSI);
      if (vals.some((v) => !Number.isFinite(v))) { meterError(out, 'Network', 'Each resistor must be a number, such as 220, 4.7k or 1M.'); return; }
      if (vals.some((v) => v < 0)) { meterError(out, 'Network', 'Resistances cannot be negative.'); return; }
      const m = mode();
      let total;
      try { total = m === 'series' ? C.seriesResistance(vals) : C.parallelResistance(vals); } catch (e) { meterError(out, 'Network', e.message); return; }
      meter(out, {
        tag: `${vals.length} in ${m}`,
        primary: fmt(total, 'Ω'),
        rows: [
          ['Exact', `${Number(total.toPrecision(10))} Ω`],
          ['Smallest', fmt(Math.min(...vals), 'Ω')],
          ['Largest', fmt(Math.max(...vals), 'Ω')],
        ],
      });
    }

    $('#rn-add').addEventListener('click', () => { $('input', addRow()).focus(); run(); });
    ['1k', '2.2k', '4.7k'].forEach((v) => addRow(v));
    run();
  })();

  // ----------------------------------------------------------- Color code
  (function () {
    const out = $('#cc-out');
    const holder = $('#cc-bands');
    const art = $('#cc-art');
    const digits = C.COLORS.filter((c) => Number.isFinite(c.digit));
    const mults = C.COLORS.filter((c) => Number.isFinite(c.mult));
    const tols = C.COLORS.filter((c) => Number.isFinite(c.tol));
    const presets = { 4: ['yellow', 'violet', 'red', 'gold'], 5: ['brown', 'black', 'black', 'red', 'brown'] };

    function build(n) {
      const labels = n === 4 ? ['1st digit', '2nd digit', 'Multiplier', 'Tolerance'] : ['1st digit', '2nd digit', '3rd digit', 'Multiplier', 'Tolerance'];
      holder.innerHTML = labels.map((lab, i) => {
        const opts = i < n - 2 ? digits : i === n - 2 ? mults : tols;
        const describe = (c) => i < n - 2 ? `${c.digit}` : i === n - 2 ? `×${fmt(c.mult, '', 3)}` : `±${c.tol}%`;
        return `<div class="field"><label for="cc-b${i}">${lab}</label><div class="band-pick"><span class="swatch" id="cc-s${i}"></span>` +
          `<select id="cc-b${i}">${opts.map((c) => `<option value="${c.name}">${c.name[0].toUpperCase() + c.name.slice(1)} · ${describe(c)}</option>`).join('')}</select></div></div>`;
      }).join('');
      presets[n].forEach((name, i) => { $(`#cc-b${i}`).value = name; });
      $$('select', holder).forEach((s) => s.addEventListener('change', run));
      run();
    }

    function draw(bands) {
      const hex = (name) => C.COLORS.find((c) => c.name === name).hex;
      const n = bands.length;
      const xs = n === 4 ? [104, 128, 152, 206] : [98, 120, 142, 164, 210];
      art.innerHTML =
        `<line x1="0" y1="35" x2="320" y2="35" stroke="var(--muted)" stroke-width="4" stroke-linecap="round"/>` +
        `<path d="M70 14 q0 -6 10 -6 h28 q8 0 12 6 h80 q4 -6 12 -6 h28 q10 0 10 6 v42 q0 6 -10 6 h-28 q-8 0 -12 -6 h-80 q-4 6 -12 6 h-28 q-10 0 -10 -6z" fill="#d9c49a" stroke="#a88f5f" stroke-width="1.5"/>` +
        bands.map((b, i) => `<rect x="${xs[i]}" y="${i === 0 || i === n - 1 ? 9 : 14}" width="12" height="${i === 0 || i === n - 1 ? 52 : 42}" fill="${hex(b)}" stroke="rgb(0 0 0 / .25)" stroke-width=".5"/>`).join('');
    }

    function run() {
      const sels = $$('select', holder);
      const bands = sels.map((s) => s.value);
      sels.forEach((s, i) => { $(`#cc-s${i}`).style.background = C.COLORS.find((c) => c.name === s.value).hex; });
      draw(bands);
      let r;
      try { r = C.resistorFromBands(bands); } catch (e) { meterError(out, 'Color code', e.message); return; }
      meter(out, {
        tag: `${bands.length}-band`,
        primary: fmt(r.ohms, 'Ω'),
        rows: [
          ['Tolerance', `±${r.tolerance}%`],
          ['Minimum', fmt(r.min, 'Ω')],
          ['Maximum', fmt(r.max, 'Ω')],
          ['Bands', bands.join(' · ')],
        ],
      });
    }

    segmented('cc-count', (v) => build(Number(v)));
    build(4);
  })();

  function gauge(percent, limit, label) {
    const scale = Math.max(limit * 2, percent * 1.1);
    return `<div class="gauge" role="img" aria-label="${esc(label)}">` +
      `<span style="width:${Math.min(100, (percent / scale) * 100)}%"></span>` +
      `<i style="left:${(limit / scale) * 100}%"></i></div>`;
  }

  const matName = (m) => (m === 'cu' ? 'Cu' : 'Al');
  const fillOptions = (sel, items, selected) => {
    sel.innerHTML = items.map(([v, text]) => `<option value="${esc(v)}">${esc(text)}</option>`).join('');
    if (items.some(([v]) => String(v) === String(selected))) sel.value = selected;
  };

  // -------------------------------------------------------- Breaker & wire
  (function () {
    const out = $('#bk-out');

    function run() {
      const material = $('#bk-mat').value;
      const terminalTemp = Number($('#bk-temp').value);
      const cont = num('bk-cont');
      const non = $('#bk-non').value.trim() === '' ? 0 : num('bk-non');
      let r;
      try { r = C.branchCircuit({ continuous: cont, nonContinuous: non, material, terminalTemp }); } catch (e) { meterError(out, 'Breaker & wire', e.message); return; }
      meter(out, {
        tag: `${terminalTemp} °C ${matName(material)}`,
        primary: `${r.breaker} A`,
        rows: [
          ['Total load', fmt(r.load, 'A')],
          ['Sized at', fmt(r.required, 'A')],
          ['Conductor', r.conductor ? `${C.wireLabel(r.conductor)} ${matName(material)}` : 'Over 500 kcmil'],
          ['Ampacity', r.conductorAmpacity ? `${r.conductorAmpacity} A` : '—'],
        ],
        extra: r.conductor ? '' : '<div class="err">No single conductor up to 500 kcmil fits. Consider parallel sets.</div>',
      });
    }
    ['bk-cont', 'bk-non'].forEach((id) => document.getElementById(id).addEventListener('input', run));
    ['bk-mat', 'bk-temp'].forEach((id) => document.getElementById(id).addEventListener('change', run));
    run();
  })();

  // --------------------------------------------------------- Motor circuit
  (function () {
    const out = $('#mo-out');
    const hpSel = $('#mo-hp');
    const vSel = $('#mo-v');
    const phase = segmented('mo-phase', () => { populate(); run(); });

    function populate() {
      const t = C.MOTOR_FLA[phase()];
      fillOptions(hpSel, t.rows.map((r) => [r[0], `${r[0]} hp`]), hpSel.value || '10');
      fillOptions(vSel, t.voltages.map((v) => [v, `${v} V`]), vSel.value || '460');
      if (!hpSel.value) hpSel.selectedIndex = 0;
      if (!vSel.value) vSel.selectedIndex = vSel.options.length - 1;
    }

    function run() {
      const material = $('#mo-mat').value;
      const terminalTemp = Number($('#mo-temp').value);
      let r;
      try {
        r = C.motorCircuit({ phase: phase(), voltage: Number(vSel.value), hp: hpSel.value, material, terminalTemp });
      } catch (e) { meterError(out, 'Motor', e.message); return; }
      meter(out, {
        tag: `${hpSel.value} hp ${vSel.value} V ${phase() === 'three' ? '3φ' : '1φ'}`,
        primary: `${r.fla} A FLC`,
        rows: [
          ['Min. ampacity', fmt(r.minAmpacity, 'A')],
          ['Conductor', r.conductor ? `${C.wireLabel(r.conductor)} ${matName(material)}` : 'Over 500 kcmil'],
          ['Inverse-time CB', r.breaker ? `${r.breaker} A max` : '—'],
          ['Dual-element fuse', r.dualElementFuse ? `${r.dualElementFuse} A max` : '—'],
          ['Non-time-delay fuse', r.nonTimeDelayFuse ? `${r.nonTimeDelayFuse} A max` : '—'],
          ['Overload SF≥1.15', fmt(r.overload125, 'A')],
          ['Overload, other', fmt(r.overload115, 'A')],
        ],
      });
    }
    [hpSel, vSel, $('#mo-mat'), $('#mo-temp')].forEach((el) => el.addEventListener('change', run));
    populate();
    hpSel.value = '10';
    vSel.value = '460';
    run();
  })();

  // ---------------------------------------------------------- Conduit fill
  (function () {
    const out = $('#cf-out');
    const typeSel = $('#cf-type');
    const sizeSel = $('#cf-size');
    const list = $('#cf-list');
    const wireSizes = C.SIZE_ORDER.filter((s) => C.THHN_AREA[s] !== undefined);
    let counter = 0;

    fillOptions(typeSel, Object.entries(C.CONDUIT_AREA).map(([k, v]) => [k, v.label]), 'emt');
    fillOptions(sizeSel, C.TRADE_SIZES.map((s) => [s, `${s}"`]), '3/4');

    function addRow(qty = 1, size = '12') {
      counter += 1;
      const row = document.createElement('div');
      row.className = 'r wire';
      row.innerHTML =
        `<div class="input-unit"><input id="cf-q${counter}" type="number" min="0" step="1" inputmode="numeric" aria-label="Quantity" value="${qty}"><span class="unit">×</span></div>` +
        `<select id="cf-s${counter}" aria-label="Conductor size">${wireSizes.map((s) => `<option value="${s}">${C.wireLabel(s)} THHN</option>`).join('')}</select>` +
        `<button type="button" class="icon-btn" aria-label="Remove conductor size">×</button>`;
      $('select', row).value = size;
      $('input', row).addEventListener('input', run);
      $('select', row).addEventListener('change', run);
      $('button', row).addEventListener('click', () => {
        if (list.children.length > 1) row.remove();
        else $('input', row).value = '0';
        run();
      });
      list.appendChild(row);
      return row;
    }

    function run() {
      const wires = $$('.r', list).map((r) => ({ qty: Number($('input', r).value || 0), size: $('select', r).value }));
      const type = typeSel.value;
      let r;
      try { r = C.conduitFill({ type, size: sizeSel.value, wires }); } catch (e) { meterError(out, 'Conduit fill', e.message); return; }
      const smallest = C.smallestConduit(type, wires);
      const status = r.ok ? ['ok', 'Within fill limit'] : ['bad', 'Overfilled'];
      meter(out, {
        tag: `${sizeSel.value}" ${C.CONDUIT_AREA[type].label}`,
        primary: `${r.fillPercent.toFixed(1)} %`,
        rows: [
          ['Conductors', String(r.count)],
          ['Allowed fill', `${r.allowedPercent} %`],
          ['Wire area', `${r.wireArea.toFixed(4)} in²`],
          ['Conduit area', `${r.conduitArea.toFixed(3)} in²`],
          ['Smallest that fits', smallest ? `${smallest}"` : 'Over 4"'],
        ],
        extra: gauge(r.fillPercent, r.allowedPercent, `${r.fillPercent.toFixed(1)}% of ${r.allowedPercent}% allowed`) +
          `<div><span class="pill ${status[0]}">${status[1]}</span></div>`,
      });
    }

    [typeSel, sizeSel].forEach((el) => el.addEventListener('change', run));
    $('#cf-add').addEventListener('click', () => { $('input', addRow(1, '12')).focus(); run(); });
    addRow(3, '8');
    addRow(1, '10');
    run();
  })();

  // ---------------------------------------------------------------- Energy
  (function () {
    const out = $('#en-out');
    const money = (v) => (Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
    const kwh = (v) => `${Number(v.toPrecision(4)).toLocaleString()} kWh`;

    function run() {
      let r;
      try {
        r = C.energyCost({ watts: num('en-W'), hoursPerDay: num('en-h'), ratePerKwh: num('en-rate'), quantity: num('en-q') });
      } catch (e) { meterError(out, 'Energy', e.message.replace('ratePerKwh', 'Rate').replace('hoursPerDay', 'Use per day').replace('watts', 'Power').replace('quantity', 'Quantity')); return; }
      meter(out, {
        tag: 'Cost per month',
        primary: money(r.costPerMonth),
        rows: [
          ['Per day', money(r.costPerDay)],
          ['Per year', money(r.costPerYear)],
          ['Energy / day', kwh(r.kwhPerDay)],
          ['Energy / month', kwh(r.kwhPerMonth)],
          ['Energy / year', kwh(r.kwhPerYear)],
        ],
      });
    }
    ['en-W', 'en-q', 'en-h', 'en-rate'].forEach((id) => document.getElementById(id).addEventListener('input', run));
    run();
  })();
})();
