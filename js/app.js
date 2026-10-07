/* UI for the building power plan. Draws SVG diagrams and wires controls to PowerModel. */
(function () {
  'use strict';

  const M = window.PowerModel;
  const D = window.PlanData;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (s, el) => (el || document).querySelector(s);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const rs = (n) => '\u20b9' + Math.round(n).toLocaleString('en-IN');
  const lakh = (n) => '\u20b9' + (n / 100000).toFixed(1) + ' lakh';
  const lakhRange = (lo, hi) => '\u20b9' + (lo / 100000).toFixed(1) + '-' + (hi / 100000).toFixed(1) + ' lakh';
  const f1 = (n) => (Math.abs(n) < 0.05 ? '0.0' : n.toFixed(1));
  const hhmm = (h) => {
    const hh = Math.floor(h) % 24;
    const mm = Math.round((h - Math.floor(h)) * 60);
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  };
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, str, attrs) {
    const t = el('text', Object.assign({ x, y }, attrs || {}), parent);
    t.textContent = str;
    return t;
  }
  function lines(parent, x, y, arr, attrs, lh) {
    arr.forEach((s, i) => txt(parent, x, y + i * (lh || 15), s, attrs));
  }
  function html(tag, attrs, children) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    for (const c of children || []) e.appendChild(c);
    return e;
  }

  function seg(container, options, value, onChange) {
    container.innerHTML = '';
    container.setAttribute('role', 'group');
    for (const o of options) {
      const b = html('button', { type: 'button', text: o.label, 'aria-pressed': String(o.v === value) });
      if (o.title) b.title = o.title;
      b.addEventListener('click', () => {
        for (const x of container.children) x.setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-pressed', 'true');
        onChange(o.v);
      });
      container.appendChild(b);
    }
  }
  function chips(container, options, state, onChange) {
    container.innerHTML = '';
    for (const o of options) {
      const b = html('button', { type: 'button', class: 'chip', text: o.label, 'aria-pressed': String(!!state[o.v]) });
      b.addEventListener('click', () => {
        state[o.v] = !state[o.v];
        b.setAttribute('aria-pressed', String(state[o.v]));
        onChange();
      });
      container.appendChild(b);
    }
  }
  function table(container, head, rows, opts) {
    const o = opts || {};
    const t = html('table');
    const thead = html('thead');
    const hr = html('tr');
    head.forEach((h, i) => {
      const th = html('th', { text: h });
      if (o.numCols && o.numCols.includes(i)) th.className = 'num';
      if (o.onSort) {
        th.classList.add('sortable');
        th.addEventListener('click', () => o.onSort(i));
      }
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    t.appendChild(thead);
    const tb = html('tbody');
    rows.forEach((r, ri) => {
      const tr = html('tr');
      if (o.pick && o.pick(ri)) tr.className = 'pick';
      r.forEach((c, i) => {
        const td = html('td');
        if (c instanceof Node) td.appendChild(c);
        else td.innerHTML = c;
        if (o.numCols && o.numCols.includes(i)) td.className = 'num';
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    container.innerHTML = '';
    container.appendChild(t);
  }

  const HOME_IDS = ['F1', 'F2', 'F3', 'F4', 'PH'];
  const LABEL = { G: 'Ground', F1: 'Floor 1', F2: 'Floor 2', F3: 'Floor 3', F4: 'Floor 4', PH: 'Penthouse' };
  const occAll = () => ({ F1: true, F2: true, F3: true, F4: true, PH: true });
  const meterOf = (arch, id) => {
    if (S.meterMode === 'one') return 'M2';
    if (id === 'G') return M.DEFAULTS.pumpsOnMeter2 ? 'M2' : 'M1';
    return M.ARCHS[arch].m2Grid.includes(id) ? 'M2' : 'M1';
  };
  const METER_NAME = { M1: 'Meter 1', M2: 'Meter 2' };
  const meterLabel = (mtr) => (S.meterMode === 'one' ? 'Meter (combined)' : METER_NAME[mtr]);
  const ARCH_LABEL = { A: 'A: inverter only', B: 'B: inverter + Floors 3-4', C: 'C: inverter + Floors 2-4' };
  const ARCH_SHORT = { A: 'A: no floors', B: 'B: Floors 3-4', C: 'C: Floors 2-4' };
  const SUBSIDY_LABEL = { 'dcr-sub': 'Made-in-India + subsidy', 'dcr-nosub': 'Made-in-India, no subsidy', nondcr: 'Imported cells' };
  const METERING_LABEL = { MB: 'Two meters per floor', MA: 'One dual meter per floor' };
  const PHASE_COLOR = { R: '--warn', Y: '--solar', B: '--m1' };
  const countOf = (id, word) => M.homeCircuits(id).filter((c) => c.side === 'grid' && !c.optional && c.name.startsWith(word)).length;
  function applianceSummary(id) {
    if (id === 'G') return { grid: ['Borewell + transfer pumps,', 'outdoor sockets'], backup: ['Lift, common lights,', 'CCTV, watchman room'] };
    const ac = countOf(id, 'Air conditioner');
    const gy = countOf(id, 'Geyser');
    return {
      grid: [`${ac} air conditioners, ${gy} geyser${gy > 1 ? 's' : ''},`, 'kitchen, fridge, washing machine'],
      backup: ['Fans, lights, TV,', 'router, work socket'],
    };
  }

  const S = {
    meterMode: localStorage.getItem('meterMode') === 'one' ? 'one' : 'two',
    layers: { grid: true, backup: true, solar: true, earth: false },
    floor: 'F2',
    sld: { arch: 'C', view: 'normal' },
    sim: { season: 'summer', outage: 'none', mode: 'B1', pv: 14, occ: occAll(), extras: { pump: false, ev: false }, t: 48, timer: null },
    ph: { load: 'limit', occ: occAll(), lift: true, pump: false },
    b: { arch: 'C', pv: 14, billing: 'pooled', fee: 800, rate: 10, subsidy: 'dcr-sub', metering: 'MB', phase: 'PB2', occ: occAll(), extras: { bldc: true, pump: false, ev: false } },
    sort: { col: 7, dir: 1 },
    showAll: false,
    home: { id: 'F2', view: 'normal' },
  };

  /* ---------------- Theme ---------------- */
  function setThemeLabel() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    $('#themeBtn').textContent = dark ? 'Light' : 'Dark';
  }
  $('#themeBtn').addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    setThemeLabel();
    renderAll();
  });
  setThemeLabel();

  /* ---------------- Intro facts ---------------- */
  function renderFacts() {
    const a = M.annual({ arch: 'C' });
    const n = M.annual({ arch: 'C', pvKwp: 0 });
    const ev = M.dailySim({ season: 'summer' }).steps.filter((s) => s.h >= 19 && s.h < 23);
    const evening = ev.reduce((x, s) => x + s.backupLoad, 0) / ev.length;
    const facts = [
      ['2', 'TGSPDCL meters; both stay under 800 units every month'],
      [Math.round(a.solarUnits).toLocaleString('en-IN'), 'solar units a year from ' + M.DEFAULTS.pvKwp + ' kW of panels'],
      [lakh(n.bill1 + n.bill2 - a.bill1 - a.bill2), 'cut from the two bills each year'],
      [M.backupHours(evening, 85).toFixed(1) + ' h', 'battery backup at a summer evening load, starting at 85 %'],
    ];
    const box = $('#facts');
    box.innerHTML = '';
    for (const [v, k] of facts) box.appendChild(html('div', { class: 'fact' }, [html('div', { class: 'v', text: v }), html('div', { class: 'k', text: k })]));
  }

  /* ---------------- Building elevation ---------------- */
  const FLOOR_GEOM = {
    PH: { x: 150, y: 134, w: 205, h: 76 },
    F4: { x: 70, y: 210, w: 285, h: 76 },
    F3: { x: 70, y: 286, w: 285, h: 76 },
    F2: { x: 70, y: 362, w: 285, h: 76 },
    F1: { x: 70, y: 438, w: 285, h: 76 },
    G: { x: 70, y: 514, w: 285, h: 86 },
  };

  function renderBuilding() {
    const svg = $('#buildingSvg');
    svg.innerHTML = '';
    const arch = S.b.arch;
    const g = el('g', {}, svg);
    // Sky band for roof solar
    el('line', { x1: 20, y1: 600, x2: 540, y2: 600, stroke: css('--line-strong'), 'stroke-width': 2 }, g);
    // Lift shaft
    el('rect', { x: 398, y: 134, width: 46, height: 466, class: 'box-soft' }, g);
    txt(g, 430, 370, 'Lift', { 'text-anchor': 'middle', 'font-size': 12, transform: 'rotate(-90 430 370)' });
    // Duct (risers)
    el('rect', { x: 358, y: 134, width: 36, height: 466, fill: 'none', stroke: css('--line'), 'stroke-dasharray': '3 3' }, g);
    txt(g, 376, 128, 'Duct', { 'text-anchor': 'middle', 'font-size': 10, class: 'muted' });

    // Solar on raised structure
    const pv = el('g', { class: 'layer-solar' + (S.layers.solar ? '' : ' layer-off') }, g);
    for (let i = 0; i < 7; i++) {
      const x = 92 + i * 46;
      el('rect', { x, y: 84, width: 42, height: 22, fill: css('--solar-fill'), stroke: css('--solar'), 'stroke-width': 1.2, transform: `skewX(-12)` }, pv);
    }
    for (const x of [86, 200, 320]) el('line', { x1: x, y1: 106, x2: x, y2: x < 150 ? 210 : 134, stroke: css('--muted'), 'stroke-width': 1.2 }, pv);
    txt(pv, 75, 70, '14 kW of solar on a raised frame, 3 strings of 8 panels', { 'font-size': 12, class: 't-strong' });

    // Floors
    const order = ['PH', 'F4', 'F3', 'F2', 'F1', 'G'];
    for (const id of order) {
      const f = FLOOR_GEOM[id];
      const grp = el('g', { class: 'hit' + (S.floor === id ? ' selected' : ''), tabindex: 0, role: 'button', 'aria-label': LABEL[id] }, g);
      el('rect', { x: f.x, y: f.y, width: f.w, height: f.h, class: 'box' }, grp);
      txt(grp, f.x + 12, f.y + 22, LABEL[id] + (id === 'G' ? ' (common)' : ''), { class: 't-strong', 'font-size': 13 });
      const mtr = meterOf(arch, id);
      const occ = id === 'G' || S.b.occ[id];
      const sub = id === 'G' ? 'Parking, watchman room' : occ ? 'Grid board + backup board' : 'Vacant';
      txt(grp, f.x + 12, f.y + 40, sub, { 'font-size': 11 });
      // Tags
      const tag = (x, label, color) => {
        el('rect', { x, y: f.y + f.h - 24, width: 54, height: 17, rx: 3, fill: 'none', stroke: color }, grp);
        txt(grp, x + 27, f.y + f.h - 12, label, { 'text-anchor': 'middle', 'font-size': 10, fill: color, class: 't-mono' });
      };
      tag(f.x + 12, meterLabel(mtr), mtr === 'M1' ? css('--m1') : css('--m2'));
      tag(f.x + 72, 'Backup', css('--backup'));
      grp.addEventListener('click', () => { S.floor = id; renderBuilding(); });
      grp.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); S.floor = id; renderBuilding(); } });
    }
    // Ground details
    el('rect', { x: 282, y: 528, width: 68, height: 64, fill: 'none', stroke: css('--accent'), 'stroke-width': 1.5 }, g);
    txt(g, 316, 546, 'Electrical', { 'text-anchor': 'middle', 'font-size': 10 });
    txt(g, 316, 558, 'room', { 'text-anchor': 'middle', 'font-size': 10 });
    el('rect', { x: 290, y: 564, width: 18, height: 22, fill: css('--backup'), opacity: 0.85 }, g);
    txt(g, 330, 576, 'Backup', { 'text-anchor': 'middle', 'font-size': 9 });
    txt(g, 330, 586, 'board', { 'text-anchor': 'middle', 'font-size': 9 });
    // TGSPDCL meters on outside wall
    el('rect', { x: 450, y: 548, width: 64, height: 44, class: 'box' }, g);
    if (S.meterMode === 'one') {
      txt(g, 482, 574, 'Meter', { 'text-anchor': 'middle', 'font-size': 10, fill: css('--m2') });
      txt(g, 482, 587, '(combined)', { 'text-anchor': 'middle', 'font-size': 8, fill: css('--m2') });
    } else {
      txt(g, 482, 564, 'Meter 1', { 'text-anchor': 'middle', 'font-size': 10, fill: css('--m1') });
      txt(g, 482, 580, 'Meter 2', { 'text-anchor': 'middle', 'font-size': 10, fill: css('--m2') });
    }

    // Risers
    const rise = el('g', {}, g);
    const yOf = (id) => FLOOR_GEOM[id].y + FLOOR_GEOM[id].h / 2;
    const gridLayer = el('g', { class: S.layers.grid ? '' : 'layer-off' }, rise);
    const m1Floors = order.filter((id) => id !== 'G' && meterOf(arch, id) === 'M1');
    const m2Floors = order.filter((id) => id !== 'G' && meterOf(arch, id) === 'M2');
    const riser = (x, floors, cls) => {
      if (!floors.length) return;
      const top = Math.min(...floors.map(yOf));
      el('path', { d: `M ${x} 560 L ${x} ${top}`, class: 'wire ' + cls }, gridLayer);
      for (const id of floors) el('path', { d: `M ${x} ${yOf(id)} L ${FLOOR_GEOM[id].x + FLOOR_GEOM[id].w - 2} ${yOf(id)}`, class: 'wire ' + cls }, gridLayer);
    };
    riser(364, m1Floors, 'm1');
    riser(372, m2Floors, 'm2');
    const bkLayer = el('g', { class: S.layers.backup ? '' : 'layer-off' }, rise);
    el('path', { d: `M 382 560 L 382 ${yOf('PH') + 8}`, class: 'wire bk' }, bkLayer);
    for (const id of order.filter((x) => x !== 'G')) el('path', { d: `M 382 ${yOf(id) + 8} L ${FLOOR_GEOM[id].x + FLOOR_GEOM[id].w - 2} ${yOf(id) + 8}`, class: 'wire bk' }, bkLayer);
    el('path', { d: 'M 382 560 L 382 572 L 410 572 L 410 150', class: 'wire bk' }, bkLayer);
    const pvLayer = el('g', { class: S.layers.solar ? '' : 'layer-off' }, rise);
    el('path', { d: 'M 348 106 L 348 556', class: 'wire pv' }, pvLayer);
    // Earth pits
    const eLayer = el('g', { class: S.layers.earth ? '' : 'layer-off' }, g);
    const pits = [44, 66, 110, 132, 262, 284, 320, 410, 432];
    for (const x of pits) {
      el('line', { x1: x, y1: 600, x2: x, y2: 628, class: 'wire earth' }, eLayer);
      el('circle', { cx: x, cy: 632, r: 5, fill: css('--earth') }, eLayer);
    }
    for (const [x, k] of [[55, 'Lightning'], [121, 'Building'], [273, 'Solar'], [320, 'Neutral'], [421, 'Lift']]) {
      txt(eLayer, x, 652, k, { 'text-anchor': 'middle', 'font-size': 9 });
    }
    el('path', { d: 'M 150 134 L 58 134 L 58 600', class: 'wire earth' }, eLayer);
    txt(eLayer, 456, 640, 'Neutral = inverter', { 'font-size': 9 });
    txt(eLayer, 456, 652, 'neutral earth', { 'font-size': 9 });

    renderFloorInfo();
  }

  function renderFloorInfo() {
    const id = S.floor;
    const box = $('#floorInfo');
    const arch = S.b.arch;
    const mdl = M.monthly(boOpts());
    const bill = M.billing(mdl);
    const avg = (fn) => mdl.rows.reduce((s, r) => s + fn(r), 0) / 12;
    const fl = (r) => r.floors.find((x) => x.id === id);
    const grid = avg((r) => fl(r).grid);
    const backup = avg((r) => fl(r).backup);
    const mtr = meterOf(arch, id);
    const panel = S.meterMode === 'one' ? 'the single combined Main Panel (one TGSPDCL meter)' : mtr === 'M1' ? 'the grid main panel (TGSPDCL Meter 1)' : 'the solar main panel (TGSPDCL Meter 2)';
    box.innerHTML = '';
    box.appendChild(html('h3', { text: LABEL[id] + (id === 'G' ? ' (common)' : '') }));
    const rows = [];
    if (id === 'G') {
      rows.push(['Grid side', `Pumps, via Ground grid meter, from ${panel}`]);
      rows.push(['Backup side', 'Lift, parking, staircase and exterior lights, CCTV, watchman room, via Ground backup meter (3-phase, no limit)']);
      rows.push(['Electrical room', 'Both TGSPDCL meters outside; grid main panel, solar main panel, PuREPower on a plinth, bypass switch, backup main board, 12 private meters']);
      rows.push(['Average use', `${Math.round(grid)} grid + ${Math.round(backup)} backup units a month`]);
      rows.push(['Who pays', 'Split equally by the 5 homes; a vacant home\u2019s share falls on the owner']);
    } else {
      const h = M.HOMES.find((x) => x.id === id);
      const ac = countOf(id, 'Air conditioner');
      const gy = countOf(id, 'Geyser');
      const via = id === 'F2' && arch !== 'A' ? ' through the Floor 2 transfer switch' : '';
      rows.push(['Grid side', `${ac} air conditioners, ${gy} geyser${gy > 1 ? 's' : ''}, induction cooktop, microwave, kitchen sockets, fridge, washing machine, iron sockets: one circuit each, ${M.gridConnectedKw(id).toFixed(1)} kW if all ran at once (expected peak about ${h.kw} kW). Off in a power cut. Grid meter, fed from ${panel}${via}`]);
      rows.push(['Backup side', `Fans, lights, TV, router, 3 A work socket (not a universal socket). Backup meter with ${h.limit} kW limit and a 3 A breaker per phase. Fed from the backup main board (inverter).`]);
      rows.push(['Backup board phases', 'Rooms split over R, Y and B. The work-socket phase rotates with the floor, so an empty floor takes the same load off all three phases.']);
      rows.push(['Average use', S.b.occ[id] ? `${Math.round(grid)} grid + ${Math.round(backup)} backup units a month` : 'Vacant: about 16 units a month standby']);
      rows.push(['Pays (current Bills settings)', S.b.occ[id] ? rs(bill.perHome[id]) + ' a month, average' : 'Nothing; owner covers it']);
    }
    const dl = html('dl', { style: 'display:grid;grid-template-columns:max-content 1fr;gap:8px 16px;margin:12px 0 0;font-size:.92rem' });
    for (const [k, v] of rows) {
      dl.appendChild(html('dt', { class: 'muted', text: k }));
      dl.appendChild(html('dd', { style: 'margin:0;color:var(--ink)', text: v }));
    }
    box.appendChild(dl);
    box.appendChild(html('p', { class: 'small muted', style: 'margin-top:14px', text: 'Grid and backup boards never share a wire, neutral, switch or conduit. The backup board and its switch plates use a different colour.' }));
  }

  function renderLayerChips() {
    chips($('#layerChips'), [
      { v: 'grid', label: 'Grid risers' },
      { v: 'backup', label: 'Backup riser' },
      { v: 'solar', label: 'Solar cable' },
      { v: 'earth', label: 'Earth pits' },
    ], S.layers, renderBuilding);
  }

  /* ---------------- Single-line diagram ---------------- */
  function renderSld() {
    const svg = $('#sldSvg');
    svg.innerHTML = '';
    const oneMeter = S.meterMode === 'one';
    const arch = S.sld.arch;
    const view = S.sld.view;
    const cut = view === 'cut';
    const day1 = view === 'day1';
    const W = (cls) => (cut && cls !== 'bk' && cls !== 'pv' ? 'wire dead' : 'wire ' + cls);
    const wire = (d, cls, extra) => el('path', { d, class: W(cls) + (extra ? ' ' + extra : '') }, svg);
    const box = (x, y, w, h, title, sub, color) => {
      const g = el('g', {}, svg);
      el('rect', { x, y, width: w, height: h, rx: 5, class: 'box', style: color ? `stroke:${color};stroke-width:1.6` : '' }, g);
      txt(g, x + w / 2, y + (sub ? h / 2 - 3 : h / 2 + 5), title, { 'text-anchor': 'middle', 'font-size': 13, class: 't-strong' });
      if (sub) txt(g, x + w / 2, y + h / 2 + 14, sub, { 'text-anchor': 'middle', 'font-size': 11 });
      return g;
    };
    const dot = (x, y, c) => el('circle', { cx: x, cy: y, r: 3.6, fill: c, class: 'dot' }, svg);
    const m1c = cut ? css('--dead') : css('--m1');
    const m2c = cut ? css('--dead') : css('--m2');
    const bkc = css('--backup');
    const warnc = cut ? css('--dead') : css('--warn');
    const sanc = M.sanctioned(Object.assign({}, M.DEFAULTS, { arch }));
    const combinedKw = oneMeter ? M.annualOneMeter({}).kw : 0;

    // Feeders: both meters are always installed, so the bus-tie switch (not rewiring) is what
    // changes if TGSPDCL only grants one connection.
    wire('M 130 295 L 150 295 L 150 118 L 170 118', 'm1');
    wire('M 290 118 L 330 118', 'm1');
    wire('M 150 295 L 150 448 L 170 448', 'm2');
    wire('M 290 448 L 330 448', 'm2');
    // Floor rows
    const rows = ['PH', 'F4', 'F3', 'F2', 'F1', 'G'];
    const rowY = (i) => 40 + i * 86;
    const gy = (id) => rowY(rows.indexOf(id)) + 17;
    const by = (id) => rowY(rows.indexOf(id)) + 51;
    const m1Rows = rows.filter((id) => meterOf(arch, id) === 'M1');
    const m2Rows = rows.filter((id) => meterOf(arch, id) === 'M2');
    const transfer = arch !== 'A' && !oneMeter;
    if (m1Rows.length) {
      const top = Math.min(...m1Rows.map(gy));
      const bot = Math.max(...m1Rows.map(gy));
      wire(`M 450 118 L 840 118`, 'm1');
      wire(`M 840 ${Math.min(top, 118)} L 840 ${Math.max(bot, 118)}`, 'm1');
      for (const id of m1Rows) {
        if (transfer && id === 'F2') continue;
        wire(`M 840 ${gy(id)} L 940 ${gy(id)}`, 'm1');
        dot(840, gy(id), m1c);
      }
    }
    if (m2Rows.length) {
      const top = Math.min(...m2Rows.map(gy));
      const bot = Math.max(...m2Rows.map(gy));
      wire(`M 450 432 L 862 432`, 'm2');
      wire(`M 862 ${Math.min(top, 432)} L 862 ${Math.max(bot, 432)}`, 'm2');
      for (const id of m2Rows) {
        if (transfer && id === 'F2') continue;
        wire(`M 862 ${gy(id)} L 940 ${gy(id)}`, 'm2');
        dot(862, gy(id), m2c);
      }
    }
    if (transfer) {
      // Floor 2 transfer switch: solid leg = position in use, dashed leg = the other meter.
      const y2 = gy('F2');
      const onM2 = meterOf(arch, 'F2') === 'M2';
      wire(`M 840 ${y2 - 10} L 874 ${y2 - 10} L 884 ${y2}`, 'm1', onM2 ? 'dash' : '');
      wire(`M 862 ${y2} L 884 ${y2}`, 'm2', onM2 ? '' : 'dash');
      wire(`M 884 ${y2} L 940 ${y2}`, onM2 ? 'm2' : 'm1');
      dot(840, y2 - 10, m1c);
      dot(862, y2, m2c);
      el('rect', { x: 879, y: y2 - 6, width: 10, height: 12, rx: 2, class: 'box', style: `stroke:${onM2 ? m2c : m1c};stroke-width:1.6` }, svg);
      txt(svg, 884, y2 + 19, 'transfer switch', { 'font-size': 9, 'text-anchor': 'middle', class: 'muted halo' });
    }
    // Bus-tie breaker: ties the two panel busbars. Trapped-key interlock, not a changeover.
    // It can close only after one meter breaker is locked off and that meter is removed.
    {
      const tieMid = 280;
      wire(`M 390 146 L 390 ${tieMid - 14}`, 'm1', oneMeter ? '' : 'dash');
      wire(`M 390 ${tieMid + 14} L 390 420`, 'm2', oneMeter ? '' : 'dash');
      el('rect', { x: 384, y: tieMid - 14, width: 12, height: 28, rx: 2, class: 'box', style: `stroke:${oneMeter ? m2c : css('--line-strong')};stroke-width:1.6` }, svg);
      txt(svg, 404, tieMid - 10, 'Bus-tie breaker', { 'font-size': 9.5, class: 't-strong halo' });
      txt(svg, 404, tieMid + 4, oneMeter ? 'CLOSED: one meter' : 'open, key-locked', { 'font-size': 9, class: (oneMeter ? '' : 'muted') + ' halo', fill: oneMeter ? warnc : null });
    }
    // Inverter chain
    wire('M 390 476 L 390 540', 'm2');
    wire('M 450 562 L 480 562', 'm2');
    if (day1) {
      el('path', { d: 'M 450 466 L 700 466 L 700 540', class: 'wire m2' }, svg);
      el('path', { d: 'M 620 562 L 650 562', class: 'wire dead' }, svg);
    } else {
      el('path', { d: 'M 450 466 L 700 466 L 700 540', class: cut ? 'wire dead' : 'wire m2 dash' }, svg);
      el('path', { d: 'M 620 562 L 650 562', class: 'wire bk' }, svg);
    }
    const busCls = day1 ? 'm2' : 'bk';
    el('path', { d: 'M 750 562 L 780 562', class: 'wire ' + busCls }, svg);
    el('path', { d: `M 880 562 L 904 562 L 904 ${by('PH')}`, class: 'wire ' + busCls }, svg);
    for (const id of rows) { el('path', { d: `M 904 ${by(id)} L 940 ${by(id)}`, class: 'wire ' + busCls }, svg); dot(904, by(id), day1 ? css('--m2') : bkc); }
    // Solar
    el('path', { d: 'M 550 386 L 550 520', class: 'wire pv' }, svg);
    // Car charger: after Meter 2, on the solar main panel bus, before the inverter.
    el('path', { d: 'M 600 432 L 600 468', class: cut ? 'wire dead' : 'wire m2' }, svg);
    // TGSPDCL
    box(20, 260, 110, 70, 'TGSPDCL', '3-phase supply', cut ? css('--dead') : null);
    box(170, 90, 120, 56, oneMeter ? 'Meter 1 (idle)' : 'Meter 1', oneMeter ? 'tied in via bus-tie switch' : Math.round(sanc.kw1) + ' kW, net meter (grid only)', m1c);
    box(330, 90, 120, 56, 'Grid main panel', 'Meter 1 side', m1c);
    box(170, 420, 120, 56, oneMeter ? 'Meter (combined)' : 'Meter 2', Math.round(oneMeter ? combinedKw : sanc.kw2) + ' kW, net meter' + (oneMeter ? ', every floor + solar' : ' + solar'), m2c);
    box(330, 420, 120, 56, oneMeter ? 'Main panel (combined)' : 'Solar main panel', oneMeter ? 'carries every floor + inverter' : 'Meter 2 side', m2c);
    box(330, 540, 120, 44, 'Solar isolator', 'lockable, 2.44 m', m2c);
    box(480, 330, 140, 56, 'Solar ' + M.DEFAULTS.pvKwp + ' kW', '3 strings of 8 panels', css('--solar'));
    const inv = box(480, 520, 140, 84, 'PuREPower 20.0', day1 ? 'not fitted yet' : cut ? 'on battery' : '20 kVA, 20 kWh', day1 ? css('--dead') : bkc);
    if (!day1) txt(inv, 550, 594, 'switches in 10 ms', { 'text-anchor': 'middle', 'font-size': 10, class: 'muted' });
    box(650, 540, 100, 44, 'Bypass', day1 ? 'position II' : 'position I', day1 ? css('--m2') : bkc);
    box(780, 540, 100, 44, 'Backup board', 'main, locked', day1 ? css('--m2') : bkc);
    box(530, 468, 140, 36, 'Car charger', cut ? 'off in a power cut' : 'after meter, before inverter', cut ? css('--dead') : m2c);
    txt(svg, 712, 456, 'bypass line', { 'font-size': 10, class: 'muted' });
    // Floors
    rows.forEach((id, i) => {
      const y = rowY(i);
      const gm = meterOf(arch, id);
      const gc = cut ? css('--dead') : gm === 'M1' ? css('--m1') : css('--m2');
      el('rect', { x: 940, y: y + 6, width: 40, height: 22, rx: 3, class: 'box', style: `stroke:${gc}` }, svg);
      txt(svg, 960, y + 21, 'kWh', { 'text-anchor': 'middle', 'font-size': 10, class: 't-mono' });
      el('rect', { x: 940, y: y + 40, width: 40, height: 22, rx: 3, class: 'box', style: `stroke:${day1 ? css('--m2') : bkc}` }, svg);
      txt(svg, 960, y + 55, 'kWh', { 'text-anchor': 'middle', 'font-size': 10, class: 't-mono' });
      el('path', { d: `M 980 ${y + 17} L 996 ${y + 17}`, class: cut ? 'wire dead' : 'wire ' + (gm === 'M1' ? 'm1' : 'm2') }, svg);
      el('path', { d: `M 980 ${y + 51} L 996 ${y + 51}`, class: 'wire ' + (day1 ? 'm2' : 'bk') }, svg);
      // Floor emergency cut-off: two 4-pole switches, one padlock hasp.
      el('rect', { x: 985, y: y + 11, width: 7, height: 12, rx: 1.5, fill: 'none', stroke: warnc, 'stroke-width': 1.4 }, svg);
      el('rect', { x: 985, y: y + 45, width: 7, height: 12, rx: 1.5, fill: 'none', stroke: warnc, 'stroke-width': 1.4 }, svg);
      el('path', { d: `M 992 ${y + 17} L 992 ${y + 51}`, stroke: warnc, 'stroke-width': 1, 'stroke-dasharray': '2 2' }, svg);
      el('rect', { x: 996, y, width: 118, height: 70, rx: 5, class: 'box' }, svg);
      txt(svg, 1006, y + 20, LABEL[id], { 'font-size': 13, class: 't-strong' });
      txt(svg, 1006, y + 38, (id === 'G' ? 'Pumps, ' : 'Grid board, ') + meterLabel(gm), { 'font-size': 11, fill: gc });
      txt(svg, 1006, y + 56, id === 'G' ? 'Lift + common' : 'Backup board', { 'font-size': 11, fill: day1 ? css('--m2') : bkc });
      const ap = applianceSummary(id);
      el('path', { d: `M 1114 ${y + 17} L 1128 ${y + 17}`, class: cut ? 'wire dead' : 'wire ' + (gm === 'M1' ? 'm1' : 'm2') }, svg);
      el('path', { d: `M 1114 ${y + 51} L 1128 ${y + 51}`, class: 'wire ' + (day1 ? 'm2' : 'bk') }, svg);
      lines(svg, 1134, y + 14, ap.grid, { 'font-size': 10.5, fill: gc }, 13);
      lines(svg, 1134, y + 48, ap.backup, { 'font-size': 10.5, fill: day1 ? css('--m2') : bkc }, 13);
    });
    txt(svg, 940, 30, 'Private meters', { 'font-size': 11, class: 'muted' });
    txt(svg, 983, 30, 'Cut-off', { 'font-size': 9, class: 'muted' });
    txt(svg, 1134, 30, cut ? 'Appliances (grey = off)' : 'Appliances on each line', { 'font-size': 11, class: 'muted' });

    const notes = {
      normal: oneMeter
        ? 'Normal: the PuREPower passes grid power through to the backup bus and adds solar. Every floor uses solar first, through the single combined Main Panel.'
        : 'Normal: the PuREPower passes grid power through to the backup bus and adds solar. Floors on Meter 2 use solar first, through the Solar Main Panel.',
      cut: 'Power cut: everything grey is dead, including all heavy loads. The backup bus (green) runs from the battery and solar within 10 ms. The inverter stops exporting within 2 s.',
      day1: oneMeter
        ? 'Day 1: the inverter is not fitted yet. The bypass switch sits on position II, so the backup bus runs straight from the combined meter and every private meter already bills.'
        : 'Day 1: the inverter is not fitted yet. The bypass switch sits on position II, so the backup bus runs straight from Meter 2 and every private meter already bills.',
    };
    const archNote = oneMeter
      ? ' With only one TGSPDCL connection, the bus-tie breaker is closed after the unused meter is removed. A trapped key stops both meters being paralleled. Every floor has two red isolators, grid and backup, on one padlock hasp.'
      : ' ' + M.ARCHS[arch].note + ' Pumps sit on Meter 2 by default (pump transfer switch, position II) so both meters stay clear of 800 units. Floor 1 transfer is position I by default. Floor 2 transfer is position II (Layout C). The car charger is on the solar main panel, after Meter 2 and before the inverter. Each floor has two red isolators on one padlock hasp.';
    $('#sldNote').textContent = notes[view] + archNote;
    $('#sldArchControl').style.display = oneMeter ? 'none' : '';
  }

  /* ---------------- Inside a home ---------------- */
  function renderHome() {
    const svg = $('#homeSvg');
    svg.innerHTML = '';
    const id = S.home.id;
    const cut = S.home.view === 'cut';
    const arch = S.b.arch;
    const mtr = meterOf(arch, id);
    const home = M.HOMES.find((h) => h.id === id);
    const list = M.homeCircuits(id);
    const gridList = list.filter((c) => c.side === 'grid');
    const backupList = list.filter((c) => c.side === 'backup');
    const gridColor = cut ? css('--dead') : css(mtr === 'M1' ? '--m1' : '--m2');
    const gridCls = cut ? 'dead' : mtr === 'M1' ? 'm1' : 'm2';
    const bkColor = css('--backup');
    const rowY = (i) => 76 + i * 40;
    const box = (x, y, w, h, title, sub, color) => {
      el('rect', { x, y, width: w, height: h, rx: 5, class: 'box', style: `stroke:${color};stroke-width:1.6` }, svg);
      txt(svg, x + 12, y + 21, title, { 'font-size': 13, class: 't-strong' });
      lines(svg, x + 12, y + 38, sub, { 'font-size': 11 }, 14);
    };
    const side = (o) => {
      txt(svg, o.x, 28, o.header, { 'font-size': 14, class: 't-strong', fill: o.color });
      box(o.x, 50, 160, 54, o.src[0], o.src.slice(1), o.color);
      el('path', { d: `M ${o.x + 80} 104 L ${o.x + 80} 130`, class: 'wire ' + o.cls }, svg);
      box(o.x, 130, 160, 54, o.meter[0], o.meter.slice(1), o.color);
      el('path', { d: `M ${o.x + 80} 184 L ${o.x + 80} 210`, class: 'wire ' + o.cls }, svg);
      box(o.x, 210, 160, 70, o.prot[0], o.prot.slice(1), o.color);
      const top = rowY(0) - 17;
      const bot = Math.max(rowY(o.rows.length - 1) + 17, 245);
      el('path', { d: `M ${o.x + 160} 245 L ${o.busX} 245`, class: 'wire ' + o.cls }, svg);
      el('path', { d: `M ${o.busX} ${top} L ${o.busX} ${bot}`, class: 'wire ' + o.cls, style: 'stroke-width:5' }, svg);
      txt(svg, o.busX, top - 8, o.busLabel, { 'font-size': 10, 'text-anchor': 'middle', class: 'muted' });
      o.rows.forEach((c, i) => {
        const y = rowY(i);
        const bx = o.busX + 30;
        el('path', { d: `M ${o.busX} ${y} L ${bx} ${y}`, class: 'wire ' + o.cls + (c.optional ? ' dash' : '') }, svg);
        txt(svg, o.busX + 15, y - 5, c.breaker, { 'font-size': 9, 'text-anchor': 'middle', class: 't-mono muted' });
        const stroke = c.optional ? css('--line-strong') : o.color;
        el('rect', { x: bx, y: y - 17, width: o.rowW, height: 34, rx: 4, class: 'box', style: `stroke:${stroke}${c.optional ? ';stroke-dasharray:4 3' : ''}` }, svg);
        txt(svg, bx + 10, y - 3, c.name, { 'font-size': 12, class: c.optional ? 'muted' : 't-strong' });
        txt(svg, bx + 10, y + 12, `${c.kw} kW, ${c.wire} wire`, { 'font-size': 10.5, class: 'muted' });
        const pc = cut && o.cls === 'dead' ? css('--dead') : css(PHASE_COLOR[c.phase]);
        el('rect', { x: bx + o.rowW - 32, y: y - 10, width: 22, height: 20, rx: 3, fill: 'none', stroke: pc }, svg);
        txt(svg, bx + o.rowW - 21, y + 4, c.phase, { 'font-size': 11, 'text-anchor': 'middle', class: 't-mono', fill: pc });
      });
    };
    const fromPanel = S.meterMode === 'one' ? ['From the combined Main Panel', 'one TGSPDCL meter'] : mtr === 'M1' ? ['From Meter 1', 'grid main panel'] : ['From Meter 2', 'solar main panel'];
    if (id === 'F2' && arch !== 'A' && S.meterMode !== 'one') fromPanel.push('via transfer switch');
    side({
      x: 20, busX: 210, rowW: 410, cls: gridCls, color: gridColor, rows: gridList, busLabel: 'Grid board',
      header: cut ? 'Grid line: off in a power cut' : `Grid line (${meterLabel(mtr)}): no backup`,
      src: fromPanel,
      meter: ['Grid meter', '3-phase, private'],
      prot: ['Main switch 40 A', 'earth-leakage 30 mA,', 'surge + voltage relay'],
    });
    side({
      x: 680, busX: 870, rowW: 292, cls: 'bk', color: bkColor, rows: backupList, busLabel: 'Backup board',
      header: cut ? 'Backup line: on, from battery + solar' : 'Backup line (inverter): stays on',
      src: ['Backup main board', 'inverter output'],
      meter: ['Backup meter', `${home.limit} kW limit relay`],
      prot: ['Main switch', 'earth-leakage 25 A,', '30 mA'],
    });
    const ph = { R: 0, Y: 0, B: 0 };
    for (const c of gridList) if (!c.optional) ph[c.phase] += c.kw;
    lines(svg, 20, 318, [
      'If every appliance ran at once:',
      `${M.gridConnectedKw(id).toFixed(1)} kW`,
      `R ${ph.R.toFixed(1)}  Y ${ph.Y.toFixed(1)}  B ${ph.B.toFixed(1)} kW`,
      '',
      'Expected peak (summer evening',
      `or winter morning): about ${home.kw} kW`,
    ], { 'font-size': 11 }, 16);
    lines(svg, 680, 300, [
      `Backup use is limited to ${home.limit} kW. Above that the`,
      'backup meter cuts the home\u2019s backup for 1-2 minutes.',
      '',
      'Phases shown are for this floor. Grid circuits rotate',
      'one phase per floor, so each meter stays balanced when',
      'everyone runs air conditioners.',
      '',
      'Dashed = spare circuit, wired now, used later.',
      'Backup sockets are 3 A, not universal 6/16 A sockets.',
    ], { 'font-size': 11, class: 'muted' }, 16);

    const bkKw = backupList.filter((c) => !c.optional).reduce((s, c) => s + c.kw, 0);
    const stats = [
      [M.gridConnectedKw(id).toFixed(1) + ' kW', 'grid board, all appliances on'],
      ['about ' + home.kw + ' kW', 'expected grid peak'],
      [bkKw.toFixed(2) + ' kW', `backup board (limit ${home.limit} kW)`],
      [meterLabel(mtr), 'grid side billed through'],
    ];
    const st = $('#homeStats');
    st.innerHTML = '';
    for (const [v, k] of stats) st.appendChild(html('div', { class: 'stat' }, [html('span', { class: 'v', text: v }), html('span', { class: 'k', text: k })]));
  }

  function renderLoadCheck() {
    const base = { pumpOnBackup: S.b.extras.pump, ev: S.b.extras.ev, pvKwp: S.b.pv };
    const kw = (v) => v.toFixed(1) + ' kW';
    const flag = (v) => (v > M.LT_LIMIT_KW ? `<span style="color:var(--warn);font-weight:600">${kw(v)}, over</span>` : kw(v));
    const res = {};
    const rows = ['A', 'B', 'C'].map((a) => {
      const c = M.connectedLoad(Object.assign({ arch: a }, base));
      const p = M.sanctioned(Object.assign({}, M.DEFAULTS, base, { arch: a }));
      res[a] = { c, p };
      return [ARCH_LABEL[a], flag(c.m1), flag(c.m2), kw(p.kw1), kw(p.kw2), c.fits ? 'Yes' : '<strong style="color:var(--warn)">No</strong>'];
    });
    table($('#loadCheck'), ['What Meter 2 feeds', 'Meter 1, every appliance counted', 'Meter 2, every appliance counted', 'Meter 1, expected peak', 'Meter 2, expected peak', 'Both under 56 kW, every appliance counted'], rows, {
      numCols: [1, 2, 3, 4],
      pick: (i) => ['A', 'B', 'C'][i] === S.b.arch,
    });
    const bills = (a) => {
      const r = M.annual(boOpts({ arch: a }));
      return r.bill1 + r.bill2;
    };
    const diff = bills('B') - bills('C');
    const note = [
      `Layout C is suitable if TGSPDCL sanctions Meter 2 on expected peak (about ${Math.round(res.C.p.kw2)} kW).`,
      `If TGSPDCL counts every appliance, Meter 2 in Layout C needs about ${Math.round(res.C.c.m2)} kW, over the limit.`,
      `Then set the Floor 2 transfer switch to Meter 1, and the pump switch to Meter 1 as well. With pumps left on Meter 2, Layout B is about ${Math.round(res.B.c.m1)} and ${Math.round(res.B.c.m2)} kW and has almost no margin under 56 kW. Bills rise by about ${rs(diff)} a year.`,
      `Layout A fails when every appliance is counted (Meter 1 about ${Math.round(res.A.c.m1)} kW).`,
    ];
    const invChk = M.inverterLoadCheck(base);
    note.push(`Backup bus worst case is ${kw(invChk.backupKw)} against a ${kw(invChk.limit)} design ceiling (${kw(invChk.slack)} of slack under ${invChk.nameplate} kVA). The car charger is not on that bus.`);
    if (S.b.extras.ev) {
      note.push(`The charger is on the solar main panel, after Meter 2 and before the inverter, so its units are offset by monthly net metering. A 7.4 kW charger at 240 units a month can push a summer month over 800 units. Keep May-July charging under about 170 units, or the fixed charge jumps. It does not load the inverter.`);
    }
    if (S.meterMode === 'one') {
      const combConn = M.connectedLoad(base);
      const combPeak = M.annualOneMeter(base).kw;
      note.push(`This table assumes two meters; you're viewing the one-meter contingency, where layout doesn't apply. Combined on one connection: expected peak about ${Math.round(combPeak)} kW, connected load about ${Math.round(combConn.m1 + combConn.m2)} kW, both over the ${M.LT_LIMIT_KW} kW LT limit (see Contingency below).`);
    }
    $('#loadNote').textContent = note.join(' ');
  }

  function setupHome() {
    seg($('#homePick'), HOME_IDS.map((v) => ({ v, label: LABEL[v] })), S.home.id, (v) => { S.home.id = v; renderHome(); });
    seg($('#homeView'), [{ v: 'normal', label: 'Normal' }, { v: 'cut', label: 'Power cut' }], S.home.view, (v) => { S.home.view = v; renderHome(); });
  }

  /* ---------------- Energy flow simulator ---------------- */
  const OUTAGES = {
    none: null,
    evening: { start: 19, end: 23 },
    night: { start: 1, end: 7 },
    long: { start: 18, end: 24 },
    day: { start: 10, end: 16 },
  };
  let simCache = null;
  function runSim() {
    simCache = M.dailySim({
      season: S.sim.season,
      outage: OUTAGES[S.sim.outage],
      mode: S.sim.mode,
      pvKwp: S.sim.pv,
      arch: 'C',
      occupancy: S.sim.occ,
      pumpOnBackup: S.sim.extras.pump,
      ev: S.sim.extras.ev,
    });
  }

  const FN = {
    pv: { x: 20, y: 22, w: 160, h: 66, title: 'Solar', color: '--solar' },
    bat: { x: 20, y: 290, w: 160, h: 66, title: 'Battery', color: '--battery' },
    inv: { x: 272, y: 150, w: 170, h: 80, title: 'PuREPower', color: '--backup' },
    bus: { x: 272, y: 290, w: 170, h: 66, title: 'Backup bus', color: '--backup' },
    grid: { x: 572, y: 22, w: 170, h: 66, title: 'TGSPDCL grid', color: '--m2' },
    h2: { x: 572, y: 150, w: 170, h: 66, title: 'Floors 2-4 heavy', color: '--m2' },
    m1: { x: 572, y: 290, w: 170, h: 66, title: 'Meter 1 heavy', color: '--m1' },
  };
  /* One-meter contingency: Meter 1's node disappears and the heavy-load node carries every floor. */
  function flowNodes() {
    if (S.meterMode !== 'one') return FN;
    const { m1, h2, grid, ...rest } = FN;
    return Object.assign({}, rest, {
      grid: Object.assign({}, grid, { title: 'TGSPDCL (combined meter)' }),
      h2: Object.assign({}, h2, { title: 'All floors, heavy (grid)' }),
    });
  }

  function renderFlow() {
    const svg = $('#flowSvg');
    svg.innerHTML = '';
    if (!simCache) runSim();
    const s = simCache.steps[S.sim.t];
    const oneMeter = S.meterMode === 'one';
    const width = (kw) => (kw > 0.02 ? 2 + Math.min(14, 3.2 * Math.sqrt(kw)) : 1.5);
    const edge = (d, kw, colorVar, reverse, label, lx, ly) => {
      const live = kw > 0.02;
      el('path', { d, class: 'flow-line' + (live && !reduceMotion ? ' live' : '') + (reverse ? ' rev' : ''), stroke: live ? css(colorVar) : css('--line-strong'), 'stroke-width': width(kw), opacity: live ? 0.95 : 0.6 }, svg);
      if (label) txt(svg, lx, ly, live ? f1(kw) + ' kW' : '0', { 'font-size': 12, class: 't-mono halo', 'text-anchor': 'middle', fill: live ? css(colorVar) : css('--muted') });
    };
    const junction = { x: 500, y: 120 };
    // Edges
    edge(`M 180 55 C 240 55 250 170 272 180`, s.pv, '--solar', false, true, 232, 92);
    const batKw = s.charge > 0.02 ? s.charge : s.discharge;
    edge(`M 180 323 C 240 323 250 220 272 205`, batKw, '--battery', s.discharge > 0.02, true, 214, 284);
    edge(`M 357 230 L 357 290`, s.backupLoad, '--backup', false, true, 392, 266);
    const invGrid = s.exp > 0.02 ? s.exp : s.gridToBus + (s.charge > 0.02 && s.pv < 0.05 ? s.charge : 0);
    const exporting = s.exp > 0.02;
    edge(`M 442 175 C 470 160 480 130 ${junction.x} ${junction.y}`, invGrid, exporting ? '--solar' : '--m2', !exporting, true, 470, 186);
    const m2 = s.m2;
    const combinedHeavy = s.heavy1 + s.heavy2;
    const combinedGrid = s.m1 + s.m2;
    const heavyShow = oneMeter ? combinedHeavy : s.heavy2;
    const gridShow = oneMeter ? combinedGrid : m2;
    edge(`M ${junction.x} ${junction.y} C 530 120 545 183 572 183`, heavyShow, '--m2', false, true, 538, 168);
    edge(`M ${junction.x} ${junction.y} C 520 80 545 55 572 55`, Math.abs(gridShow), gridShow < 0 ? '--solar' : '--m2', gridShow >= 0, true, 526, 66);
    if (!oneMeter) edge(`M 742 55 C 768 55 768 323 742 323`, s.m1, '--m1', false, true, 728, 256);
    el('circle', { cx: junction.x, cy: junction.y, r: 6, fill: css('--m2') }, svg);
    txt(svg, junction.x - 10, junction.y - 12, oneMeter ? 'Main panel' : 'Solar main panel', { 'font-size': 10, 'text-anchor': 'end', class: 'muted halo' });
    // Nodes
    const nodes = flowNodes();
    for (const k of Object.keys(nodes)) {
      const n = nodes[k];
      const g = el('g', {}, svg);
      const dead = !s.gridOn && (k === 'grid' || k === 'h2' || k === 'm1');
      el('rect', { x: n.x, y: n.y, width: n.w, height: n.h, rx: 6, class: 'box', style: `stroke:${dead ? css('--dead') : css(n.color)};stroke-width:1.8` }, g);
      txt(g, n.x + 12, n.y + 22, n.title, { 'font-size': 13, class: 't-strong' });
      let sub = '';
      let sub2 = '';
      if (k === 'pv') { sub = f1(s.pv) + ' kW now'; sub2 = S.sim.pv + ' kW on the roof'; }
      if (k === 'bat') sub = Math.round(s.socPct) + ' % charged';
      if (k === 'inv') { sub = s.gridOn ? (s.discharge > 0.02 ? 'battery helping' : 'grid pass-through') : 'island mode'; sub2 = s.gridOn ? 'on grid' : 'on battery + solar'; }
      if (k === 'bus') { sub = f1(s.backupLoad) + ' kW'; sub2 = 'homes, lift, lights'; }
      if (k === 'grid') { sub = !s.gridOn ? 'power cut' : gridShow < -0.02 ? (oneMeter ? 'exports' : 'Meter 2 exports') : (oneMeter ? 'imports' : 'Meter 2 imports'); sub2 = s.gridOn ? f1(Math.abs(gridShow)) + ' kW' : ''; }
      if (k === 'h2') { sub = dead ? 'off in power cut' : f1(heavyShow) + ' kW'; sub2 = oneMeter ? 'Every floor, pumps, charger' : 'Floors 2-4, pumps, charger'; }
      if (k === 'm1') { sub = dead ? 'off in power cut' : f1(s.m1) + ' kW'; sub2 = 'Floor 1, Penthouse'; }
      txt(g, n.x + 12, n.y + 41, sub, { 'font-size': 12, class: 't-mono' });
      if (sub2 && k !== 'bat') txt(g, n.x + 12, n.y + 57, sub2, { 'font-size': 11, class: 'muted' });
      if (k === 'bat') {
        el('rect', { x: n.x + 12, y: n.y + 50, width: 136, height: 7, rx: 2, fill: css('--line') }, g);
        el('rect', { x: n.x + 12, y: n.y + 50, width: 1.36 * s.socPct, height: 7, rx: 2, fill: css('--battery') }, g);
      }
    }
    if (!s.gridOn) {
      el('rect', { x: 560, y: 4, width: 192, height: 360, rx: 8, fill: css('--dead'), opacity: 0.08 }, svg);
    }
    const h = simCache.steps[S.sim.t].h;
    $('#timeLabel').textContent = 'Time ' + hhmm(h) + (s.gridOn ? '' : ' (power cut)');
    const ro = $('#flowReadout');
    ro.innerHTML = '';
    const items = [
      [f1(s.pv) + ' kW', 'solar'],
      [f1(s.backupLoad) + ' kW', 'backup bus'],
      [(gridShow >= 0 ? '+' : '') + f1(gridShow) + ' kW', (oneMeter ? 'Combined meter' : 'Meter 2') + ' (+ import, - export)'],
      [Math.round(s.socPct) + ' %', 'battery'],
    ];
    for (const [v, k] of items) ro.appendChild(html('div', {}, [html('div', { class: 'v', text: v }), html('div', { class: 'k', text: k })]));
    drawDayChart();
  }

  function drawDayChart() {
    const svg = $('#dayChart');
    svg.innerHTML = '';
    const st = simCache.steps;
    const oneMeter = S.meterMode === 'one';
    const cm = (s) => s.m1 + s.m2; // combined connection flow, one-meter mode
    const m2Series = (s) => (oneMeter ? cm(s) : s.m2);
    const L = 40;
    const R = 520;
    const T = 14;
    const B = 262;
    const maxKw = Math.max(4, ...st.map((s) => Math.max(s.pv, s.backupLoad, m2Series(s), oneMeter ? 0 : s.m1)));
    const minKw = Math.min(0, ...st.map((s) => m2Series(s)));
    const top = Math.ceil(maxKw / 2) * 2;
    const bot = Math.floor(minKw / 2) * 2;
    const x = (h) => L + ((R - L) * h) / 24;
    const y = (kw) => T + ((B - T) * (top - kw)) / (top - bot);
    const ys = (p) => T + ((B - T) * (100 - p)) / 100;
    // Outage band
    const o = OUTAGES[S.sim.outage];
    if (o) el('rect', { x: x(o.start), y: T, width: x(o.end) - x(o.start), height: B - T, fill: css('--dead'), opacity: 0.15 }, svg);
    // Grid lines
    for (let k = bot; k <= top; k += 2) {
      el('line', { x1: L, x2: R, y1: y(k), y2: y(k), stroke: css('--line'), 'stroke-width': k === 0 ? 1.4 : 0.8 }, svg);
      txt(svg, L - 6, y(k) + 4, String(k), { 'font-size': 10, 'text-anchor': 'end', class: 't-mono' });
    }
    for (let h = 0; h <= 24; h += 6) txt(svg, x(h), B + 18, hhmm(h % 24 === 0 && h ? 0 : h).slice(0, 5), { 'font-size': 10, 'text-anchor': 'middle', class: 't-mono' });
    for (const p of [0, 50, 100]) txt(svg, R + 6, ys(p) + 4, p + '%', { 'font-size': 10, class: 't-mono', fill: css('--battery') });
    txt(svg, 8, T + 4, 'kW', { 'font-size': 10, class: 'muted' });
    const path = (fn) => st.map((s, i) => (i ? 'L' : 'M') + ' ' + x(s.h + 0.125).toFixed(1) + ' ' + fn(s).toFixed(1)).join(' ');
    // Solar area
    el('path', { d: path((s) => y(s.pv)) + ` L ${x(24)} ${y(0)} L ${x(0)} ${y(0)} Z`, fill: css('--solar-fill'), opacity: 0.35 }, svg);
    el('path', { d: path((s) => y(s.pv)), fill: 'none', stroke: css('--solar'), 'stroke-width': 2 }, svg);
    el('path', { d: path((s) => y(s.backupLoad)), fill: 'none', stroke: css('--backup'), 'stroke-width': 2 }, svg);
    el('path', { d: path((s) => y(m2Series(s))), fill: 'none', stroke: css('--m2'), 'stroke-width': 2 }, svg);
    if (!oneMeter) el('path', { d: path((s) => y(s.m1)), fill: 'none', stroke: css('--m1'), 'stroke-width': 1.6, 'stroke-dasharray': '5 4' }, svg);
    el('path', { d: path((s) => ys(s.socPct)), fill: 'none', stroke: css('--battery'), 'stroke-width': 2 }, svg);
    // Cursor
    const cx = x(st[S.sim.t].h + 0.125);
    el('line', { x1: cx, x2: cx, y1: T, y2: B, stroke: css('--ink'), 'stroke-width': 1, opacity: 0.6 }, svg);
    const lg = $('#dayLegend');
    lg.innerHTML = '';
    const legendItems = [['--solar', 'Solar'], ['--backup', 'Backup bus'], ['--m2', oneMeter ? 'Combined meter (below 0 = export)' : 'Meter 2 (below 0 = export)']];
    if (!oneMeter) legendItems.push(['--m1', 'Meter 1', true]);
    legendItems.push(['--battery', 'Battery % (right axis)']);
    for (const [c, t, dash] of legendItems) {
      lg.appendChild(html('span', { html: `<i class="${dash ? 'dash' : ''}" style="border-color:var(${c})"></i>${t}` }));
    }
    // Totals
    const t = simCache.totals;
    const combinedNet = t.m2Import - t.export + t.m1;
    const tot = $('#dayTotals');
    tot.innerHTML = '';
    const stats = oneMeter ? [
      [f1(t.solar), 'solar units'],
      [f1(t.backup), 'backup units'],
      [f1(combinedNet), 'Combined meter net units'],
      [Math.round(t.minSocPct) + ' %', 'lowest battery', t.minSocPct < 30 ? 'bad' : 'good'],
    ] : [
      [f1(t.solar), 'solar units'],
      [f1(t.backup), 'backup units'],
      [f1(t.m2Import - t.export), 'Meter 2 net units'],
      [f1(t.m1), 'Meter 1 units'],
      [Math.round(t.minSocPct) + ' %', 'lowest battery', t.minSocPct < 30 ? 'bad' : 'good'],
    ];
    for (const [v, k, cls] of stats) tot.appendChild(html('div', { class: 'stat' + (cls ? ' ' + cls : '') }, [html('span', { class: 'v', text: v }), html('span', { class: 'k', text: k })]));
    const notes = [];
    if (oneMeter) notes.push(`The combined connection imported ${f1(t.m2Import + t.m1)} and exported ${f1(t.export)} units (net ${f1(combinedNet)}). Net metering only counts the month, so the battery does not need to cycle.`);
    else notes.push(`Meter 2 imported ${f1(t.m2Import)} and exported ${f1(t.export)} units. Net metering only counts the month, so the battery does not need to cycle.`);
    if (t.curtailed > 0.1) notes.push(`${f1(t.curtailed)} units of solar were wasted because export stops during a power cut.`);
    if (t.unserved > 0.01) notes.push(`${f1(t.unserved)} units of backup load could not be served: the battery ran out.`);
    if (t.gridCharge > 0.1) notes.push(`After the cut the grid recharged ${f1(t.gridCharge)} units at a capped 2.5 kW, so recharge plus the backup bus stays under 17.5 kW.`);
    $('#dayNote').textContent = notes.join(' ');
  }

  function setupSim() {
    seg($('#simSeason'), [{ v: 'summer', label: 'Summer' }, { v: 'monsoon', label: 'Monsoon' }, { v: 'winter', label: 'Winter' }], S.sim.season, (v) => { S.sim.season = v; runSim(); renderFlow(); });
    seg($('#simOutage'), [{ v: 'none', label: 'None' }, { v: 'evening', label: '19-23' }, { v: 'night', label: '01-07' }, { v: 'long', label: '18-24' }, { v: 'day', label: '10-16' }], S.sim.outage, (v) => { S.sim.outage = v; runSim(); renderFlow(); });
    seg($('#simMode'), [{ v: 'B1', label: 'Backup first' }, { v: 'B2', label: 'Balanced' }], S.sim.mode, (v) => { S.sim.mode = v; runSim(); renderFlow(); });
    seg($('#simPv'), [6.5, 10, 12, 14].map((v) => ({ v, label: v + ' kW' })), S.sim.pv, (v) => { S.sim.pv = v; runSim(); renderFlow(); });
    chips($('#simOcc'), HOME_IDS.map((v) => ({ v, label: LABEL[v] })), S.sim.occ, () => { runSim(); renderFlow(); });
    chips($('#simExtras'), [{ v: 'pump', label: 'Pump on backup' }, { v: 'ev', label: 'Car charger' }], S.sim.extras, () => { runSim(); renderFlow(); });
    const slider = $('#timeSlider');
    slider.value = S.sim.t;
    slider.addEventListener('input', () => { S.sim.t = Number(slider.value); renderFlow(); });
    $('#playBtn').addEventListener('click', () => {
      if (S.sim.timer) {
        clearInterval(S.sim.timer);
        S.sim.timer = null;
        $('#playBtn').textContent = 'Play day';
        return;
      }
      $('#playBtn').textContent = 'Pause';
      S.sim.timer = setInterval(() => {
        S.sim.t = (S.sim.t + 1) % 96;
        slider.value = S.sim.t;
        renderFlow();
      }, reduceMotion ? 600 : 220);
    });
  }

  /* ---------------- Phase balance ---------------- */
  function renderPhases() {
    const box = $('#phaseCards');
    box.innerHTML = '';
    const homeKw = {};
    let evening = null;
    if (S.ph.load === 'typical') {
      const sim = M.dailySim({ season: 'summer', occupancy: S.ph.occ });
      evening = sim.steps.find((s) => Math.abs(s.h - 21) < 0.01);
    }
    for (const h of M.HOMES) {
      const occ = S.ph.occ[h.id];
      if (!occ) homeKw[h.id] = 0;
      else if (S.ph.load === 'limit') homeKw[h.id] = h.limit;
      else if (S.ph.load === 'typical') homeKw[h.id] = evening.homeKw[h.id];
      else homeKw[h.id] = 0.3;
    }
    const results = {};
    for (const strategy of ['PB1', 'PB2']) {
      const r = M.phaseLoads({ strategy, homeKw, liftRunning: S.ph.lift, pumpOnBackup: S.ph.pump });
      results[strategy] = r;
      const over = r.max > r.perPhaseLimit;
      const card = html('div', { class: 'panel panel-pad phase-card' });
      const title = strategy === 'PB1' ? 'One phase per home' : 'Three phases in every home';
      card.appendChild(html('h3', {}, [html('span', { text: title }), html('span', { class: 'small', style: `color:${over ? 'var(--warn)' : 'var(--backup)'}`, text: over ? 'over the per-phase limit' : 'within limits' })]));
      const scale = 8.5;
      for (const p of ['R', 'Y', 'B']) {
        const v = r[p];
        const row = html('div', { class: 'bar-row' });
        row.appendChild(html('span', { class: 'bar-label', text: p }));
        const track = html('div', { class: 'bar-track' });
        track.appendChild(html('div', { class: 'bar-fill' + (v > r.perPhaseLimit ? ' over' : ''), style: `width:${Math.min(100, (v / scale) * 100)}%` }));
        track.appendChild(html('div', { class: 'bar-limit', style: `left:${(r.perPhaseLimit / scale) * 100}%`, title: `${r.perPhaseLimit.toFixed(1)} kW per phase` }));
        row.appendChild(track);
        row.appendChild(html('span', { class: 'bar-label', style: 'text-align:right', text: v.toFixed(2) + ' kW' }));
        card.appendChild(row);
      }
      const tScale = 24;
      const row = html('div', { class: 'bar-row' });
      row.appendChild(html('span', { class: 'bar-label', text: 'All' }));
      const track = html('div', { class: 'bar-track' });
      track.appendChild(html('div', { class: 'bar-fill' + (r.total > r.totalLimit ? ' over' : ''), style: `width:${Math.min(100, (r.total / tScale) * 100)}%;background:var(--m2)` }));
      track.appendChild(html('div', { class: 'bar-limit', style: `left:${(r.totalLimit / tScale) * 100}%`, title: `${r.totalLimit} kW total` }));
      row.appendChild(track);
      row.appendChild(html('span', { class: 'bar-label', style: 'text-align:right', text: r.total.toFixed(1) + ' kW' }));
      card.appendChild(row);
      card.appendChild(html('p', { class: 'small muted', style: 'margin-top:10px', text: `Imbalance ${Math.round(r.imbalance * 100)} %. Dashed lines: ${r.perPhaseLimit.toFixed(1)} kW per phase, ${r.totalLimit} kW in total.` }));
      box.appendChild(card);
    }
    const a = results.PB1;
    const b = results.PB2;
    const audit = M.vacancyAudit(S.ph.pump);
    $('#phaseNote').textContent = `Design ceiling is ${M.DESIGN_MAX_KW} kW total, ${ (M.DESIGN_MAX_KW / 3).toFixed(2) } kW per phase, not the 20 kVA nameplate. With this load, one phase per home peaks at ${a.max.toFixed(2)} kW (imbalance ${Math.round(a.imbalance * 100)} %). Three phases in every home peaks at ${b.max.toFixed(2)} kW (imbalance ${Math.round(b.imbalance * 100)} %). Checked all ${audit.masks} ways the five homes can be empty or occupied: the busiest phase is still the all-homes case, and every mask stays inside the ceiling${audit.allFit ? '' : ' except the pump-on-backup case, which needs the lift interlock'}. A 3 A breaker per phase, and a work socket that rotates with the floor, stops residents piling one phase.`;
  }
  function setupPhases() {
    seg($('#phLoad'), [{ v: 'limit', label: 'Every home at its limit' }, { v: 'typical', label: 'Typical 21:00 summer' }, { v: 'light', label: 'Light (0.3 kW)' }], S.ph.load, (v) => { S.ph.load = v; renderPhases(); });
    chips($('#phOcc'), HOME_IDS.map((v) => ({ v, label: LABEL[v] })), S.ph.occ, renderPhases);
    seg($('#phLift'), [{ v: true, label: 'Running' }, { v: false, label: 'Idle' }], S.ph.lift, (v) => { S.ph.lift = v; renderPhases(); });
    seg($('#phPump'), [{ v: false, label: 'No' }, { v: true, label: 'Yes' }], S.ph.pump, (v) => { S.ph.pump = v; renderPhases(); });
  }

  /* ---------------- Bills ---------------- */
  function boOpts(over) {
    const b = S.b;
    return Object.assign({
      arch: b.arch, pvKwp: b.pv, billing: b.billing, solarFee: b.fee, fixedRate: b.rate, subsidy: b.subsidy,
      metering: b.metering, phase: b.phase, occupancy: b.occ, bldc: b.extras.bldc, pumpOnBackup: b.extras.pump, ev: b.extras.ev,
    }, over || {});
  }

  /* Mirrors M.annual()'s shape, but on monthlyOneMeter()'s merged connection (one-meter contingency). */
  function annualFor(o) {
    if (S.meterMode !== 'one') return M.annual(o);
    const m = M.monthlyOneMeter(o);
    const sum = (fn) => m.rows.reduce((s, r) => s + fn(r), 0);
    const b = M.billing(m);
    return {
      model: m, billing: b, m1Units: 0,
      m2GrossUnits: sum((r) => r.m2Gross), m2NetUnits: sum((r) => Math.max(0, r.m2Net)),
      surplusUnits: sum((r) => Math.max(0, -r.m2Net)), solarUnits: sum((r) => r.solar),
      bill1: 0, bill2: sum((r) => r.bill2.total), bill2NoSolar: sum((r) => r.bill2NoSolar.total),
      maxM1: 0, maxM2Net: Math.max(...m.rows.map((r) => r.m2Net)),
      monthsOver800: m.rows.filter((r) => r.m2Net > 800).length,
      monthsSurplus: m.rows.filter((r) => r.m2Net < 0).length,
    };
  }

  function renderBills() {
    const o = boOpts();
    const oneMeter = S.meterMode === 'one';
    const a = annualFor(o);
    const n = annualFor(boOpts({ pvKwp: 0 }));
    const c = M.capex(o);
    const saving = n.bill1 + n.bill2 - (a.bill1 + a.bill2);
    const bl = a.billing;
    const stats = [
      [rs(a.bill1 + a.bill2), oneMeter ? 'combined bill a year' : 'both bills a year'],
      [rs(saving), 'saved by solar a year', 'good'],
      [o.billing === 'fixed' ? rs(o.fixedRate) : '\u20b9' + bl.avgRate.toFixed(2), o.billing === 'fixed' ? 'fixed rate per unit' : 'average rate per unit'],
      [rs(bl.owner), 'owner receives a year', bl.owner < 0 ? 'bad' : ''],
      [lakhRange(c.lo, c.hi), 'system cost'],
      [(c.lo / saving).toFixed(1) + '-' + (c.hi / saving).toFixed(1) + ' years', 'payback'],
      [String(a.monthsOver800), 'months over 800 units', a.monthsOver800 ? 'bad' : 'good'],
    ];
    const box = $('#billStats');
    box.innerHTML = '';
    for (const [v, k, cls] of stats) box.appendChild(html('div', { class: 'stat' + (cls ? ' ' + cls : '') }, [html('span', { class: 'v', text: v }), html('span', { class: 'k', text: k })]));
    $('#bArchControl').style.display = oneMeter ? 'none' : '';
    $('#billChartHeading').textContent = oneMeter ? 'Combined TGSPDCL bill, month by month' : 'Both TGSPDCL bills, month by month';
    $('#billLegend').innerHTML = oneMeter
      ? `<span><i style="border-color:var(--m2)"></i>Combined bill (net metered)</span><span><i class="dash" style="border-color:var(--muted)"></i>Combined bill without solar</span>`
      : `<span><i style="border-color:var(--m1)"></i>Meter 1 bill</span><span><i style="border-color:var(--m2)"></i>Meter 2 bill (net metered)</span><span><i class="dash" style="border-color:var(--muted)"></i>Both bills without solar</span>`;

    // Chart
    const svg = $('#billChart');
    svg.innerHTML = '';
    const rows = a.model.rows;
    const nrows = n.model.rows;
    const L = 52;
    const R = 628;
    const T = 12;
    const B = 266;
    const max = Math.max(...nrows.map((r) => r.bill1.total + r.bill2.total)) * 1.08;
    const step = max > 30000 ? 10000 : 5000;
    const top = Math.ceil(max / step) * step;
    const y = (v) => B - ((B - T) * v) / top;
    const bw = (R - L) / 12;
    for (let v = 0; v <= top; v += step) {
      el('line', { x1: L, x2: R, y1: y(v), y2: y(v), stroke: css('--line'), 'stroke-width': v ? 0.8 : 1.4 }, svg);
      txt(svg, L - 6, y(v) + 4, (v / 1000).toFixed(0) + 'k', { 'font-size': 10, 'text-anchor': 'end', class: 't-mono' });
    }
    rows.forEach((r, i) => {
      const x0 = L + i * bw + bw * 0.18;
      const w = bw * 0.64;
      const b1 = Math.max(0, r.bill1.total);
      const b2 = Math.max(0, r.bill2.total);
      el('rect', { x: x0, y: y(b1), width: w, height: B - y(b1), fill: css('--m1') }, svg);
      el('rect', { x: x0, y: y(b1 + b2), width: w, height: y(b1) - y(b1 + b2), fill: css('--m2') }, svg);
      const nv = nrows[i].bill1.total + nrows[i].bill2.total;
      el('line', { x1: x0 - 3, x2: x0 + w + 3, y1: y(nv), y2: y(nv), stroke: css('--muted'), 'stroke-width': 2, 'stroke-dasharray': '4 3' }, svg);
      txt(svg, x0 + w / 2, B + 16, r.name, { 'font-size': 10, 'text-anchor': 'middle' });
    });

    // Floor table
    const avg = (fn) => rows.reduce((s, r) => s + fn(r), 0) / 12;
    const g = (id, k) => avg((r) => r.floors.find((x) => x.id === id)[k]);
    const trows = [];
    for (const id of ['G', ...HOME_IDS]) {
      const mtr = meterOf(o.arch, id);
      const tag = `<span class="tag ${mtr === 'M1' ? 'm1' : 'm2'}">${meterLabel(mtr)}</span>`;
      if (id === 'G') trows.push(['Ground', tag, Math.round(g(id, 'grid')), Math.round(g(id, 'backup')), 'shared by 5']);
      else if (!S.b.occ[id]) trows.push([LABEL[id], tag, Math.round(g(id, 'grid')), Math.round(g(id, 'backup')), 'vacant']);
      else trows.push([LABEL[id], tag, Math.round(g(id, 'grid')), Math.round(g(id, 'backup')), rs(bl.perHome[id])]);
    }
    table($('#floorTable'), ['Floor', 'Grid meter', 'Grid units', 'Backup units', 'Pays'], trows, { numCols: [2, 3, 4] });

    // Capex table
    const crows = c.items.map((it) => [it.name + (it.base ? ' <span class="muted small">(needed anyway)</span>' : ''), it.lo === it.hi ? rs(it.lo) : rs(it.lo) + ' - ' + rs(it.hi).replace('\u20b9', '')]);
    crows.push(['Contingency 5 % (system)', rs(c.contingency.lo) + ' - ' + rs(c.contingency.hi).replace('\u20b9', '')]);
    if (c.subsidy) crows.push(['PM Surya Ghar subsidy (if granted)', '-' + rs(c.subsidy)]);
    crows.push(['<strong>Solar + backup system</strong>', '<strong>' + lakhRange(c.lo, c.hi) + '</strong>']);
    crows.push(['Needed anyway, built for two meters with a one-meter fallback', lakhRange(c.baseLo, c.baseHi)]);
    table($('#capexTable'), ['Item', '\u20b9'], crows, { numCols: [1] });

    $('#bFeeWrap').style.display = o.billing === 'pooled' ? 'none' : '';
    $('#bFeeLabel').textContent = o.billing === 'fixed' ? 'Fixed rate, \u20b9/unit' : 'Solar fee per home, \u20b9/month';
    $('#bFee').value = o.billing === 'fixed' ? S.b.rate : S.b.fee;
    renderCombos();
    renderFloorInfo();
    renderHome();
    renderLoadCheck();
    drawRateCurve(a);
    renderContingency(o);
  }

  /* Average rate (energy charge only) against monthly units on one connection: shows why a
     meter left without solar behind it climbs the slab fast (2.1). */
  function drawRateCurve(a) {
    const svg = $('#rateCurve');
    svg.innerHTML = '';
    const oneMeter = S.meterMode === 'one';
    const L = 48;
    const R = 620;
    const T = 16;
    const B = 188;
    const maxU = 1800;
    const maxRate = 10;
    const x = (u) => L + ((R - L) * u) / maxU;
    const y = (r) => B - ((B - T) * Math.min(r, maxRate)) / maxRate;
    for (let r = 0; r <= maxRate; r += 2) {
      el('line', { x1: L, x2: R, y1: y(r), y2: y(r), stroke: css('--line'), 'stroke-width': r ? 0.8 : 1.4 }, svg);
      txt(svg, L - 6, y(r) + 4, '\u20b9' + r, { 'font-size': 10, 'text-anchor': 'end', class: 't-mono' });
    }
    for (let u = 0; u <= maxU; u += 300) txt(svg, x(u), B + 16, u.toLocaleString('en-IN'), { 'font-size': 10, 'text-anchor': 'middle', class: 't-mono' });
    txt(svg, (L + R) / 2, B + 32, 'Units on the connection, per month', { 'font-size': 10.5, 'text-anchor': 'middle', class: 'muted' });
    el('line', { x1: x(800), x2: x(800), y1: T, y2: B, stroke: css('--warn'), 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }, svg);
    txt(svg, x(800) + 6, T + 12, '800 units: fixed charge \u20b910 \u2192 \u20b950/kW', { 'font-size': 10, fill: css('--warn') });
    let d = '';
    for (let u = 20; u <= maxU; u += 10) {
      const rate = M.energyCharge(u) / u;
      d += (u === 20 ? 'M' : 'L') + ' ' + x(u).toFixed(1) + ' ' + y(rate).toFixed(1) + ' ';
    }
    el('path', { d, fill: 'none', stroke: css('--accent'), 'stroke-width': 2 }, svg);
    const u1 = Math.max(20, (oneMeter ? a.m2NetUnits : a.m1Units) / 12);
    const r1 = M.energyCharge(u1) / u1;
    el('circle', { cx: x(u1), cy: y(r1), r: 4.5, fill: css(oneMeter ? '--m2' : '--m1') }, svg);
    const near = x(u1) > R - 170;
    txt(svg, x(u1) + (near ? -8 : 8), y(r1) + (r1 > maxRate - 1.2 ? 14 : -8), `${oneMeter ? 'Combined meter today' : 'Meter 1 today'}: ${Math.round(u1)} units/month, \u20b9${r1.toFixed(2)}/unit`, { 'font-size': 10.5, class: 't-mono', fill: css(oneMeter ? '--m2' : '--m1'), 'text-anchor': near ? 'end' : 'start' });
  }

  /* Section 2.10: what changes if TGSPDCL only grants one meter instead of two. */
  function renderContingency(o) {
    const a = M.annual(o);
    const one = M.annualOneMeter(o);
    const conn = M.connectedLoad(o);
    const connTotal = conn.m1 + conn.m2;
    const diff = one.bill - (a.bill1 + a.bill2);
    const stats = [
      [rs(a.bill1 + a.bill2), 'two meters, both bills a year (current plan)'],
      [rs(one.bill), 'one meter, combined bill a year', 'bad'],
      [rs(diff), 'extra a year if forced to one meter', 'bad'],
      [String(one.monthsOver800), 'months over 800 units, one meter', one.monthsOver800 ? 'bad' : 'good'],
      [Math.round(one.kw) + ' kW', `expected peak if combined (vs ${M.LT_LIMIT_KW} kW LT limit)`, one.kw > M.LT_LIMIT_KW ? 'bad' : 'good'],
      [Math.round(connTotal) + ' kW', 'connected load if combined, every appliance counted', connTotal > M.LT_LIMIT_KW ? 'bad' : 'good'],
    ];
    const box = $('#contStats');
    box.innerHTML = '';
    for (const [v, k, cls] of stats) box.appendChild(html('div', { class: 'stat' + (cls ? ' ' + cls : '') }, [html('span', { class: 'v', text: v }), html('span', { class: 'k', text: k })]));
    $('#contNote').innerHTML = `Expected peak on one combined connection is about ${Math.round(one.kw)} kW, already over the assumed ${M.LT_LIMIT_KW} kW low-tension limit; on a connected-load basis it is about ${Math.round(connTotal)} kW, nearly double the limit. That is the real risk of a one-meter outcome: it may force an 11 kV high-tension connection, with its own transformer yard, licensed supervisor and a much longer approval timeline. Ask TGSPDCL to confirm the real LT/HT boundary and whether the inverter is counted at its full AC rating or its actual grid-charge limit before accepting a one-meter answer, and keep asking for the second connection: it is worth about ${rs(diff)} a year on its own, purely from losing the second slab-resetting connection.`;
  }


  function setupBills() {
    seg($('#bArch'), Object.values(M.ARCHS).map((x) => ({ v: x.id, label: ARCH_LABEL[x.id], title: x.name })), S.b.arch, (v) => { S.b.arch = v; renderBills(); renderBuilding(); });
    seg($('#bPv'), [6.5, 10, 12, 14].map((v) => ({ v, label: v + ' kW' })), S.b.pv, (v) => { S.b.pv = v; renderBills(); });
    seg($('#bBilling'), [{ v: 'pooled', label: 'Pooled' }, { v: 'pooledFee', label: 'Pooled + fee' }, { v: 'fixed', label: 'Fixed rate' }], S.b.billing, (v) => { S.b.billing = v; renderBills(); });
    $('#bFee').addEventListener('input', (e) => {
      const v = Math.max(0, Number(e.target.value) || 0);
      if (S.b.billing === 'fixed') S.b.rate = v;
      else S.b.fee = v;
      renderBills();
    });
    seg($('#bSubsidy'), [{ v: 'dcr-sub', label: SUBSIDY_LABEL['dcr-sub'] }, { v: 'dcr-nosub', label: SUBSIDY_LABEL['dcr-nosub'] }, { v: 'nondcr', label: 'Imported cells, bought by Dec 2026' }], S.b.subsidy, (v) => { S.b.subsidy = v; renderBills(); });
    seg($('#bMetering'), [{ v: 'MB', label: METERING_LABEL.MB }, { v: 'MA', label: METERING_LABEL.MA }], S.b.metering, (v) => { S.b.metering = v; renderBills(); });
    seg($('#bPhase'), [{ v: 'PB2', label: 'Three phases per home' }, { v: 'PB1', label: 'One phase per home' }], S.b.phase, (v) => { S.b.phase = v; renderBills(); });
    chips($('#bOcc'), HOME_IDS.map((v) => ({ v, label: LABEL[v] })), S.b.occ, () => { renderBills(); renderBuilding(); });
    chips($('#bExtras'), [{ v: 'bldc', label: 'Energy-saving fans' }, { v: 'pump', label: 'Pump on backup' }, { v: 'ev', label: 'Car charger' }], S.b.extras, renderBills);
  }

  /* ---------------- Combinations ---------------- */
  let comboCache = null;
  let comboKey = '';
  function renderCombos() {
    const key = S.b.phase;
    if (!comboCache || comboKey !== key) {
      comboCache = M.combos({ phase: S.b.phase });
      comboKey = key;
    }
    const list = comboCache.slice();
    const keys = [(x) => x.arch, (x) => x.pvKwp, (x) => x.subsidy, (x) => x.metering, (x) => x.bills, (x) => x.saving, (x) => x.capexLo, (x) => x.payback, (x) => x.surplusUnits, (x) => x.monthsOver800, (x) => x.ltFits];
    const kf = keys[S.sort.col];
    list.sort((p, q) => (kf(p) > kf(q) ? 1 : kf(p) < kf(q) ? -1 : 0) * S.sort.dir);
    const shown = S.showAll ? list : list.slice(0, 12);
    const rows = shown.map((x) => [
      ARCH_SHORT[x.arch], x.pvKwp + ' kW', SUBSIDY_LABEL[x.subsidy], x.metering === 'MB' ? 'Two meters' : 'Dual meter',
      rs(x.bills), rs(x.saving), lakhRange(x.capexLo, x.capexHi),
      x.payback.toFixed(1) + ' years', Math.round(x.surplusUnits).toLocaleString('en-IN'), String(x.monthsOver800),
      x.ltFits ? 'Yes' : `No (Meter ${x.m1Conn > M.LT_LIMIT_KW ? 1 : 2}: ${Math.round(Math.max(x.m1Conn, x.m2Conn))} kW)`,
    ]);
    table($('#comboTable'), ['Meter 2 feeds', 'Solar', 'Panels', 'Floor meters', 'Bills a year', 'Saved a year', 'System cost', 'Payback', 'Units sold', 'Months over 800', 'Under 56 kW, every appliance counted'], rows, {
      numCols: [4, 5, 6, 7, 8, 9],
      pick: (i) => shown[i].arch === S.b.arch && shown[i].pvKwp === S.b.pv && shown[i].subsidy === S.b.subsidy && shown[i].metering === S.b.metering,
      onSort: (i) => {
        if (S.sort.col === i) S.sort.dir *= -1;
        else { S.sort.col = i; S.sort.dir = 1; }
        renderCombos();
      },
    });
    $('#comboMore').textContent = S.showAll ? 'Show top 12' : 'Show all ' + list.length;
    $('#comboNote').textContent = S.meterMode === 'one'
      ? 'You\u2019re viewing the one-meter contingency: this table still compares two-meter layouts, since the layout choice disappears once there\u2019s a single connection. See Bills above for the combined one-meter numbers, or Contingency below for the full explanation.'
      : '';
  }
  $('#comboMore').addEventListener('click', () => { S.showAll = !S.showAll; renderCombos(); });

  function renderFuture() {
    const rows = [
      ['Car charger, daytime', 'Solar main panel circuit 7, after Meter 2, before the inverter. 32 A breaker, Type B earth-leakage device, 6 sq mm to parking', 'Units are offset by monthly net metering. Not on the inverter. A 240-unit month in May-July can cross 800 units; keep those months under about 170 units.'],
      ['More solar', 'Three trackers, strings of 8 already used for 14 kW', 'Inverter solar input is 20 kW. More than about 16 kW on this meter mostly becomes winter surplus. A later small inverter on Meter 1 is the next step if roof remains.'],
      ['Solar on Meter 1', 'Space and conduit for a second inverter (TGSPDCL offered a second net meter)', 'Only if roof space remains'],
      ['Floor-transfer switches', 'Floor 1 and Floor 2 switches fitted now as standard; a spare 4-pole circuit on the grid main panel for a third (Penthouse)', 'Moves a floor between meters when homes are empty or TGSPDCL\u2019s counting rule calls for it (needs TGSPDCL approval)'],
      ['Pump on backup', 'Contactor space in the Ground backup board', 'Interlock: lift idle and battery over 50 %'],
      ['Time-of-day tariff for homes', 'Nothing', 'Switch the battery to Balanced mode (uses the battery in the evening)'],
      ['More battery', 'Ask PuREnergy whether modules can be added', 'Longer power cuts'],
      ['Automatic billing', 'Data port on every private meter and a meter-reading box', 'Monthly bill sheet straight from meter data'],
    ];
    table($('#futureTable'), ['Add later', 'Leave now', 'Effect'], rows);
  }

  /* ---------------- Engineering drawings: protection schedule, phase balance, real parts ---------------- */
  function gridPhaseTotals() {
    const ph = { R: 0, Y: 0, B: 0 };
    for (const id of HOME_IDS) {
      for (const c of M.homeCircuits(id)) if (c.side === 'grid' && !c.optional) ph[c.phase] += c.kw;
    }
    for (const c of M.COMMON_GRID) if (!c.optional) ph[c.phase] += c.kw;
    return ph;
  }

  function renderEngineering() {
    // Panel and protection schedule: every board, same source as the electrician sheet.
    const box = $('#engBoards');
    box.innerHTML = '';
    for (const b of D.BOARDS) {
      const ways = b.circuits
        ? b.ways.concat(M.homeCircuits('F1').filter((c) => c.side === b.circuits).map((c, i) => [
          String(i + 1), `${c.breaker}, phase ${c.phase}, ${c.wire}`, `${c.name}, ${c.kw} kW`,
        ]))
        : b.ways;
      const wrap = html('div');
      wrap.appendChild(html('h4', { text: b.name }));
      wrap.appendChild(html('p', { class: 'small muted', style: 'margin-bottom:8px', text: `${b.where}. Fed from ${b.fedFrom}.` }));
      const tw = html('div', { class: 'table-wrap first-nowrap' });
      table(tw, ['Way', 'Protection', 'Feeds / note'], ways);
      wrap.appendChild(tw);
      box.appendChild(wrap);
    }

    // Load balance: connected kW by phase, grid side, every floor combined.
    const ph = gridPhaseTotals();
    const total = ph.R + ph.Y + ph.B;
    const maxv = Math.max(ph.R, ph.Y, ph.B, 1);
    const card = $('#engPhaseGrid');
    card.innerHTML = '';
    card.appendChild(html('h4', { text: 'Grid side, every appliance counted (connected load)' }));
    for (const p of ['R', 'Y', 'B']) {
      const row = html('div', { class: 'bar-row' });
      row.appendChild(html('span', { class: 'bar-label', text: p }));
      const track = html('div', { class: 'bar-track' });
      track.appendChild(html('div', { class: 'bar-fill', style: `width:${(ph[p] / maxv) * 100}%` }));
      row.appendChild(track);
      row.appendChild(html('span', { class: 'bar-label', style: 'text-align:right', text: ph[p].toFixed(1) + ' kW' }));
      card.appendChild(row);
    }
    const imbalance = total ? (maxv - Math.min(ph.R, ph.Y, ph.B)) / (total / 3) : 0;
    card.appendChild(html('p', { class: 'small muted', style: 'margin-top:10px', text: `Total ${total.toFixed(1)} kW across R, Y, B; imbalance ${Math.round(imbalance * 100)} %.` }));

    // Suggested real parts.
    const pbox = $('#engParts');
    pbox.innerHTML = '';
    for (const g of D.PARTS) {
      const w = html('div');
      w.appendChild(html('h4', { text: g.group }));
      const t = html('div', { class: 'table-wrap first-nowrap' });
      table(t, ['Where used', 'Spec', 'Suggested product', 'Standard', 'Indicative price'], g.items);
      w.appendChild(t);
      pbox.appendChild(w);
    }
  }

  /* ---------------- Electrician and contractor sheets ---------------- */
  function glossary() {
    const w = html('div');
    w.appendChild(html('h3', { text: 'Names on this page and what shops call them' }));
    const t = html('div', { class: 'table-wrap' });
    table(t, ['Name on this page', 'Shop or drawing name'], D.GLOSSARY);
    w.appendChild(t);
    return w;
  }

  function renderSheets() {
    const elec = $('#elecSheet');
    elec.innerHTML = '';
    elec.appendChild(glossary());
    for (const b of D.BOARDS) {
      const ways = b.circuits
        ? b.ways.concat(M.homeCircuits('F1').filter((c) => c.side === b.circuits).map((c, i) => [
          String(i + 1), `Single-pole circuit breaker ${c.breaker}, phase ${c.phase}, ${c.wire} wire`, `${c.name}, ${c.kw} kW`,
        ]))
        : b.ways;
      const wrap = html('div');
      wrap.appendChild(html('h3', { text: b.name }));
      wrap.appendChild(html('p', { class: 'small muted', style: 'margin-bottom:8px', text: `${b.where}. Fed from ${b.fedFrom}.` }));
      const tw = html('div', { class: 'table-wrap first-nowrap' });
      table(tw, ['Circuit', 'Device', 'Feeds / note'], ways);
      wrap.appendChild(tw);
      elec.appendChild(wrap);
    }
    const phaseWrap = html('div', { class: 'cols-2' });
    const p1 = html('div');
    p1.appendChild(html('h3', { text: 'Phase allocation, backup side' }));
    const t1 = html('div', { class: 'table-wrap' });
    table(t1, ['Phase', 'Each home', 'Ground backup board'], [
      ['R', 'Bedroom fans and lights', 'Parking lights'],
      ['Y', 'Living, dining, utility', 'Staircase, lobby, CCTV, router'],
      ['B', 'TV, work socket, router, bathroom lights', 'Exterior lights, watchman room'],
      ['R, Y, B', '-', 'Lift (3-phase)'],
    ]);
    p1.appendChild(t1);
    const p2 = html('div');
    p2.appendChild(html('h3', { text: 'Phase rotation, grid side' }));
    const t2 = html('div', { class: 'table-wrap' });
    const rot = (n) => ['R', 'Y', 'B'].map((p) => 'RYB'[('RYB'.indexOf(p) + n) % 3]);
    table(t2, ['Home', 'Circuits marked R go on', 'Marked Y go on', 'Marked B go on'], HOME_IDS.map((id) => [LABEL[id] + (id === 'PH' ? ' (own list)' : ''), ...rot(M.PHASE_ROTATION[id])]));
    p2.appendChild(t2);
    p2.appendChild(html('p', { class: 'small muted', style: 'margin-top:8px', text: 'Keeps each meter balanced when everyone runs air conditioners at the same time.' }));
    phaseWrap.appendChild(p1);
    phaseWrap.appendChild(p2);
    elec.appendChild(phaseWrap);
    const cw = html('div');
    cw.appendChild(html('h3', { text: 'Cable schedule' }));
    const ct = html('div', { class: 'table-wrap' });
    table(ct, ['Run', 'Cable', 'Length', 'Note'], D.CABLES);
    cw.appendChild(ct);
    elec.appendChild(cw);
    const ew = html('div', { class: 'cols-2' });
    const e1 = html('div');
    e1.appendChild(html('h3', { text: 'Earth pits' }));
    const et = html('div', { class: 'table-wrap' });
    table(et, ['Pits', 'For', 'Connects'], D.EARTH);
    e1.appendChild(et);
    e1.appendChild(html('p', { class: 'small muted', style: 'margin-top:8px', text: 'Bond all pits to one main earth bar through test links. Each pit 5 ohm or less, the bonded system 1 ohm or less.' }));
    const e2 = html('div');
    e2.appendChild(html('h3', { text: 'Electrical room' }));
    const ul = html('ul', { class: 'plain' });
    for (const r of D.ROOM) ul.appendChild(html('li', { text: r }));
    e2.appendChild(ul);
    ew.appendChild(e1);
    ew.appendChild(e2);
    elec.appendChild(ew);
    const tw2 = html('div');
    tw2.appendChild(html('h3', { text: 'Commissioning tests' }));
    const ol = html('ol', { class: 'tests' });
    for (const t of D.TESTS) ol.appendChild(html('li', { text: t }));
    tw2.appendChild(ol);
    elec.appendChild(tw2);

    const con = $('#conSheet');
    con.innerHTML = '';
    con.appendChild(glossary());
    const who = html('div');
    who.appendChild(html('h3', { text: 'Who does what' }));
    const wt = html('div', { class: 'table-wrap' });
    table(wt, ['Party', 'Scope'], [
      ['Owner', 'Approvals, electrical room and shafts, energy-saving fans, rent agreements with the billing clause'],
      ['Electrical contractor', 'All panels, private meters, risers, floor boards, earthing, lift interface, tests'],
      ['PuREnergy', 'PuREPower supply and setup: grid export, zero export until the net meter is fitted, backup-first battery setting, signal contacts; solar if in their quote'],
      ['Lift vendor', 'Lift drive that does not feed power back, automatic rescue device, phase-sequence relay, interface inputs'],
      ['TGSPDCL', 'Two net-meter connections, export/net-metering commissioning on Meter 2, inspection'],
    ]);
    who.appendChild(wt);
    con.appendChild(who);
    const seq = html('div');
    seq.appendChild(html('h3', { text: 'Order of work' }));
    const sol = html('ol', { class: 'tests' });
    for (const t of [
      'Civil: electrical room with a 300 mm plinth, shafts, earth pits.',
      'Day-1 electrical: all boards, both TGSPDCL connections, 12 private meters, bypass switch on position II. The building works without the inverter.',
      'Lift installed and tested on grid; record the phase sequence.',
      'PuREPower and solar installed; zero export set; bypass moved to position I.',
      'Net-meter application (install within 180 days of approval); export enabled only after the net meter is fitted.',
      'Commissioning tests; first month of readings; rebalance phases with the selectors if needed.',
    ]) sol.appendChild(html('li', { text: t }));
    seq.appendChild(sol);
    con.appendChild(seq);
    for (const g of D.BOM) {
      const w = html('div');
      w.appendChild(html('h3', { text: 'Bill of materials: ' + g.group }));
      const bt = html('div', { class: 'table-wrap' });
      table(bt, ['Item', 'Quantity', 'Budget (\u20b9)'], g.items, { numCols: [2] });
      w.appendChild(bt);
      con.appendChild(w);
    }
    const lift = html('div');
    lift.appendChild(html('h3', { text: 'Lift: reverse-current and protection checklist' }));
    const lt = html('div', { class: 'table-wrap' });
    table(lt, ['Item', 'Who', 'Why'], D.LIFT_PROTECTION);
    lift.appendChild(lt);
    con.appendChild(lift);
    const open = html('div');
    open.appendChild(html('h3', { text: 'Still to confirm in writing' }));
    const oul = html('ul', { class: 'plain' });
    for (const t of [
      'PuREnergy, before the backup boards are energised: per-phase current limit; pass-through rating; whether 150 percent for 10 seconds exists; grid-charge setting locked at 2.5 kW; whether the neutral opens in a cut and where the neutral-earth link is; three solar trackers and maximum string voltage; export sensor on the Meter 2 incomer; signal contacts; what the quote includes; battery chemistry.',
      'TGSPDCL: whether the sanctioned load is counted per appliance or as expected peak (decides Layout C or B); the low-tension limit (assumed 56 kW); the one-time service-line charge per kW (the state regulator\u2019s Regulation 1 of 2026 lists about \u20b910,000 per kW for connections above 20 kW); the floor split and the Floor 1 and Floor 2 transfer switches, and whether moving one needs a fresh connection application each time; private metering conditions; rate paid for surplus units; subsidy on Meter 2; the \u20b950 per kW fixed charge in months above 800 units.',
      'Lift vendor: drive that does not feed power back, type of earth-leakage device, input for the park signal.',
      'Owner: longest power cut in the area; usable unshaded roof for 24 panels (3 strings of 8). Do not add a shaded string.',
      'Net metering is the rule (TGERC rooftop regulation, 15 Nov 2025): export and import net inside the month; only a month-end surplus is paid at the lowest discovered solar tariff. The rupee figure used here for that tariff is a planning number, not a guess about the rule.',
    ]) oul.appendChild(html('li', { text: t }));
    open.appendChild(oul);
    con.appendChild(open);
  }

  function printSection(cls) {
    document.body.classList.add(cls);
    const done = () => {
      document.body.classList.remove(cls);
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  }
  $('#printElec').addEventListener('click', () => printSection('print-only-electrician'));
  $('#printCon').addEventListener('click', () => printSection('print-only-contractor'));
  $('#printSld').addEventListener('click', () => printSection('print-only-wiring'));
  $('#printEng').addEventListener('click', () => printSection('print-only-engineering'));
  // Paper is white: print in the light palette whatever the screen theme.
  let screenTheme = null;
  window.addEventListener('beforeprint', () => {
    screenTheme = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', 'light');
  });
  window.addEventListener('afterprint', () => {
    if (screenTheme) document.documentElement.setAttribute('data-theme', screenTheme);
  });

  /* ---------------- Nav highlight ---------------- */
  const links = Array.from(document.querySelectorAll('.nav a'));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        for (const a of links) a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id);
      }
    }
  }, { rootMargin: '-40% 0px -55% 0px' });
  document.querySelectorAll('section.section').forEach((s) => io.observe(s));

  /* ---------------- Boot ---------------- */
  function renderAll() {
    renderFacts();
    renderBuilding();
    renderSld();
    renderFlow();
    renderPhases();
    renderBills();
  }

  /* Global switch: redraws every diagram, flow simulation and calculation as either the planned
     two-meter building or the one-meter contingency (2.10), without separate per-section toggles. */
  function setupMeterMode() {
    const note = () => {
      $('#scenarioNote').textContent = S.meterMode === 'one'
        ? 'Showing the one-meter contingency: bus-tie breaker closed after the unused meter is removed. One TGSPDCL connection (section 2.10).'
        : 'Showing the plan as designed: two TGSPDCL connections, bus-tie breaker open and key-locked.';
    };
    seg($('#meterModeSeg'), [
      { v: 'two', label: 'Two meters (plan)' },
      { v: 'one', label: 'One meter (contingency)' },
    ], S.meterMode, (v) => {
      S.meterMode = v;
      localStorage.setItem('meterMode', v);
      note();
      renderAll();
    });
    note();
  }
  setupMeterMode();
  renderLayerChips();
  seg($('#sldArch'), Object.values(M.ARCHS).map((x) => ({ v: x.id, label: ARCH_LABEL[x.id], title: x.name })), S.sld.arch, (v) => { S.sld.arch = v; renderSld(); });
  seg($('#sldView'), [{ v: 'normal', label: 'Normal' }, { v: 'cut', label: 'Power cut' }, { v: 'day1', label: 'Day 1, no inverter' }], S.sld.view, (v) => { S.sld.view = v; renderSld(); });
  setupSim();
  setupHome();
  setupPhases();
  setupBills();
  runSim();
  renderFuture();
  renderSheets();
  renderEngineering();
  renderAll();
})();
