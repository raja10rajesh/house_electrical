/*
 * Power model for the G+4 + penthouse building (Hyderabad).
 * Pure functions, no DOM. Used by the website and by node for the written plan.
 * All energy in kWh (units), power in kW, money in rupees. Estimates, not quotes.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PowerModel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // Units per kWp per month delivered through the PuREPower (Hyderabad, fixed tilt, ~1,400/yr).
  const SOLAR_YIELD = [124, 128, 141, 138, 136, 104, 90, 92, 101, 113, 116, 120];

  const normalise = (arr) => {
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.map((v) => v / avg);
  };
  // AC-driven grid load and fan-driven backup load across the year (average = 1).
  const GRID_SEASON = normalise([0.62, 0.72, 1.0, 1.45, 1.6, 1.2, 0.9, 0.85, 0.9, 0.95, 0.8, 0.65]);
  const FAN_SEASON = normalise([0.85, 0.9, 1.05, 1.2, 1.25, 1.1, 1.0, 1.0, 1.0, 1.0, 0.9, 0.85]);

  const TARIFF = {
    slabsHigh: [[200, 5.1], [100, 7.7], [100, 9.0], [400, 9.5], [Infinity, 10.0]],
    fixedLow: 10, // per kW per month, months at or below 800 units
    fixedHigh: 50, // per kW per month, months above 800 units (VERIFY)
    duty: 0.06,
    surplusRate: 2.75, // monthly surplus export, per unit (VERIFY)
  };

  // Average month. Ground = common: pumps on grid; lift 180 + lights/CCTV 240 + watchman 60 on backup.
  const FLOORS = [
    { id: 'G', label: 'Ground (common)', common: true, grid: 90, backup: 480, kw: 3 },
    { id: 'F1', label: 'Floor 1', grid: 250, backup: 100, backupStd: 140, kw: 8, limit: 1.5 },
    { id: 'F2', label: 'Floor 2', grid: 250, backup: 100, backupStd: 140, kw: 8, limit: 1.5 },
    { id: 'F3', label: 'Floor 3', grid: 250, backup: 100, backupStd: 140, kw: 8, limit: 1.5 },
    { id: 'F4', label: 'Floor 4', grid: 250, backup: 100, backupStd: 140, kw: 8, limit: 1.5 },
    { id: 'PH', label: 'Penthouse', grid: 150, backup: 55, backupStd: 75, kw: 6, limit: 1.0 },
  ];
  const HOMES = FLOORS.filter((f) => !f.common);
  const VACANT = { grid: 12, backup: 4 }; // fridge off, a security light, meter standby

  // Household circuits with rated kW. grid = no backup (goes off in a power cut); backup = inverter line.
  // Grid phases are for Floor 1; other floors rotate them (see PHASE_ROTATION) so each meter stays balanced.
  const circuit = (side, phase, name, kw, breaker, wire, optional) => ({ side, phase, name, kw, breaker, wire, optional: !!optional });
  const HOME_CIRCUITS = {
    full: [
      circuit('grid', 'R', 'Air conditioner, bedroom 1 (1.5 ton)', 1.6, '20 A', '4 sq mm'),
      circuit('grid', 'Y', 'Air conditioner, bedroom 2 (1.5 ton)', 1.6, '20 A', '4 sq mm'),
      circuit('grid', 'B', 'Air conditioner, living room (1.5 ton)', 1.6, '20 A', '4 sq mm'),
      circuit('grid', 'R', 'Geyser, bathroom 1 (25 litre)', 2.0, '16 A', '4 sq mm'),
      circuit('grid', 'Y', 'Geyser, bathroom 2 (25 litre)', 2.0, '16 A', '4 sq mm'),
      circuit('grid', 'R', 'Induction cooktop', 2.0, '16 A', '4 sq mm'),
      circuit('grid', 'Y', 'Microwave / oven', 1.4, '16 A', '4 sq mm'),
      circuit('grid', 'Y', 'Kitchen sockets: mixer, chimney, water purifier', 1.0, '16 A', '4 sq mm'),
      circuit('grid', 'R', 'Fridge', 0.25, '10 A', '2.5 sq mm'),
      circuit('grid', 'B', 'Washing machine', 2.0, '16 A', '4 sq mm'),
      circuit('grid', 'B', 'Iron and power sockets', 1.0, '16 A', '4 sq mm'),
      circuit('grid', 'B', 'Dishwasher (spare circuit)', 1.5, '16 A', '4 sq mm', true),
      circuit('backup', 'R', 'Bedroom fans and lights', 0.25, '3 A', '1.5 sq mm'),
      circuit('backup', 'Y', 'Living, dining, utility fans, lights', 0.2, '3 A', '1.5 sq mm'),
      circuit('backup', 'B', 'TV, router, work socket, bath lights', 0.3, '3 A', '1.5 sq mm'),
      circuit('backup', 'R', 'Spare: fridge, for long power cuts', 0.25, '3 A', '1.5 sq mm', true),
    ],
    penthouse: [
      circuit('grid', 'R', 'Air conditioner, bedroom (1.5 ton)', 1.6, '20 A', '4 sq mm'),
      circuit('grid', 'Y', 'Air conditioner, living room (1.5 ton)', 1.6, '20 A', '4 sq mm'),
      circuit('grid', 'B', 'Geyser, bathroom (25 litre)', 2.0, '16 A', '4 sq mm'),
      circuit('grid', 'R', 'Induction cooktop', 2.0, '16 A', '4 sq mm'),
      circuit('grid', 'Y', 'Microwave / oven', 1.4, '16 A', '4 sq mm'),
      circuit('grid', 'Y', 'Kitchen sockets: mixer, chimney, water purifier', 1.0, '16 A', '4 sq mm'),
      circuit('grid', 'R', 'Fridge', 0.25, '10 A', '2.5 sq mm'),
      circuit('grid', 'B', 'Washing machine', 2.0, '16 A', '4 sq mm'),
      circuit('grid', 'B', 'Iron and power sockets', 1.0, '16 A', '4 sq mm'),
      circuit('backup', 'R', 'Bedroom fans and lights', 0.15, '2 A', '1.5 sq mm'),
      circuit('backup', 'Y', 'Living and dining fans, lights', 0.15, '2 A', '1.5 sq mm'),
      circuit('backup', 'B', 'TV, router, work socket, bath light', 0.3, '2 A', '1.5 sq mm'),
      circuit('backup', 'R', 'Spare: fridge, for long power cuts', 0.25, '2 A', '1.5 sq mm', true),
    ],
  };
  // Borewell pump never goes on backup. The sump-to-overhead-tank transfer pump is the only pump
  // considered for backup, and only with the lift/battery interlock in 2.7 (default: grid, like the borewell pump).
  const COMMON_GRID = [
    circuit('grid', 'R', 'Borewell pump (never on backup)', 1.1, '20 A', '4 sq mm'),
    circuit('grid', 'Y', 'Sump-to-overhead-tank transfer pump (optional backup, see 2.7)', 0.75, '16 A', '4 sq mm'),
    circuit('grid', 'B', 'Outdoor and common sockets', 1.15, '16 A', '4 sq mm'),
  ];
  // Design ceiling for the backup bus. Nameplate is 20 kVA; 17.5 kW leaves slack for heat, power factor and a lift start.
  const DESIGN_MAX_KW = 17.5;
  const PHASE_ROTATION = { F1: 0, F2: 1, F3: 2, F4: 0, PH: 1 };
  const LT_LIMIT_KW = 56; // above this TGSPDCL supplies at high tension (11 kV) - confirm

  const rotatePhase = (p, n) => (p.length === 1 ? 'RYB'[('RYB'.indexOf(p) + n) % 3] : p);
  function homeCircuits(id) {
    if (id === 'G') return COMMON_GRID;
    const list = id === 'PH' ? HOME_CIRCUITS.penthouse : HOME_CIRCUITS.full;
    // Rotate grid and backup the same way. An empty floor then takes the same share off R, Y and B.
    const n = PHASE_ROTATION[id] || 0;
    return list.map((c) => Object.assign({}, c, { phase: rotatePhase(c.phase, n) }));
  }
  const sumKw = (list) => list.reduce((s, c) => s + (c.optional ? 0 : c.kw), 0);
  const gridConnectedKw = (id) => sumKw(homeCircuits(id).filter((c) => c.side === 'grid'));

  // Which floors' grid (heavy) loads sit on Meter 2. The backup bus is always on Meter 2.
  const ARCHS = {
    A: { id: 'A', name: 'By load type', m2Grid: [], note: 'Meter 1 = every floor\'s heavy loads. Meter 2 = inverter only.' },
    B: { id: 'B', name: 'Two floors on Meter 2', m2Grid: ['F3', 'F4'], note: 'Meter 2 = inverter + Floors 3, 4 heavy loads.' },
    C: { id: 'C', name: 'Solar-matched', m2Grid: ['F2', 'F3', 'F4'], note: 'Meter 2 = inverter + Floors 2, 3, 4 heavy loads.' },
  };

  const DEFAULTS = {
    arch: 'C',
    pvKwp: 14, // cliff balance: 24 panels. 12 kWp left both meters about 50 units under the 800-unit line.
    bldc: true,
    pumpOnBackup: false,
    pumpsOnMeter2: true, // common pumps on Meter 2 grid side, not through the inverter. See cliff balance.
    ev: false,
    evUnits: 240,
    evKw: 7.4, // charger sits on Meter 2, before the inverter. 7.4 kW is the socket rating, not an inverter load.
    occupancy: { F1: true, F2: true, F3: true, F4: true, PH: true },
    inverterSelfUse: 80, // units/month: standby + battery upkeep (VERIFY)
    inverterKw: 20, // PuREPower Home 20.0 nameplate, kVA (confirmed). Do not plan the backup bus up to this.
    designMaxKw: DESIGN_MAX_KW, // backup-bus ceiling, kW, with slack under the 20 kVA nameplate
    billing: 'pooled', // pooled | fixed | pooledFee
    fixedRate: 10,
    solarFee: 800, // per home per month, only for pooledFee
    metering: 'MB', // MA = one dual-channel meter per floor, MB = two meters per floor
    subsidy: 'dcr-sub', // dcr-sub | dcr-nosub | nondcr
    phase: 'PB2', // PB1 = one phase per home, PB2 = three-phase per home
  };

  /* ---------- Tariff ---------- */

  function energyCharge(u) {
    if (u <= 0) return 0;
    if (u <= 100) return Math.min(u, 50) * 1.95 + Math.max(0, u - 50) * 3.1;
    if (u <= 200) return Math.min(u, 100) * 3.4 + (u - 100) * 4.8;
    let left = u;
    let cost = 0;
    for (const [size, rate] of TARIFF.slabsHigh) {
      const take = Math.min(left, size);
      cost += take * rate;
      left -= take;
      if (left <= 0) break;
    }
    return cost;
  }

  function customerCharge(u) {
    if (u <= 50) return 40;
    if (u <= 100) return 70;
    if (u <= 200) return 90;
    if (u <= 300) return 100;
    if (u <= 400) return 120;
    if (u <= 800) return 140;
    return 160;
  }

  function meterBill(netUnits, kw) {
    const units = Math.max(0, netUnits);
    const surplus = Math.max(0, -netUnits);
    const energy = energyCharge(units);
    const fixed = kw * (units > 800 ? TARIFF.fixedHigh : TARIFF.fixedLow);
    const customer = customerCharge(units);
    const duty = units * TARIFF.duty;
    const credit = surplus * TARIFF.surplusRate;
    return { units, surplus, energy, fixed, customer, duty, credit, total: energy + fixed + customer + duty - credit };
  }

  /* ---------- Monthly model ---------- */

  const merge = (o) => Object.assign({}, DEFAULTS, o || {}, {
    occupancy: Object.assign({}, DEFAULTS.occupancy, (o && o.occupancy) || {}),
  });

  // A floor-transfer switch lets the owner override which floors' heavy loads sit on Meter 2.
  const resolveArch = (o) => (Array.isArray(o.m2Grid) ? { id: 'custom', name: 'Custom', m2Grid: o.m2Grid } : ARCHS[o.arch]);

  function floorMonth(f, i, o) {
    const occ = f.common || o.occupancy[f.id] !== false;
    let grid;
    let backup;
    if (f.common) {
      grid = f.grid;
      backup = f.backup - 60 + 60 * FAN_SEASON[i]; // watchman fan varies, lift and lights do not
    } else if (occ) {
      grid = f.grid * GRID_SEASON[i];
      backup = (o.bldc ? f.backup : f.backupStd) * FAN_SEASON[i];
    } else {
      grid = VACANT.grid;
      backup = VACANT.backup;
    }
    if (f.common && o.pumpOnBackup) {
      backup += grid;
      grid = 0;
    }
    return { id: f.id, occ, grid, backup };
  }

  function pumpsOnM2(o) {
    return !!(o.pumpsOnMeter2 && !o.pumpOnBackup);
  }

  function sanctioned(o) {
    const arch = resolveArch(o);
    let kw1 = 0;
    let kw2 = o.inverterKw;
    for (const f of FLOORS) {
      if (f.common) {
        if (o.pumpOnBackup) {
          // Running watts sit inside the inverter rating. Not added again.
        } else if (pumpsOnM2(o)) kw2 += f.kw;
        else kw1 += f.kw;
      } else if (arch.m2Grid.includes(f.id)) kw2 += f.kw;
      else kw1 += f.kw;
    }
    // Charger is after Meter 2 and before the inverter, so it adds to Meter 2's ask, not the backup bus.
    if (o.ev) kw2 += o.evKw;
    // Net metering needs sanctioned load >= solar size.
    kw2 = Math.max(kw2, o.pvKwp);
    return { kw1, kw2 };
  }

  /* If TGSPDCL counts every appliance at its rating (connected load) instead of expected maximum demand.
     The backup side is counted as the inverter output. The charger is on Meter 2, before the inverter. */
  function connectedLoad(opts) {
    const o = merge(opts);
    const arch = resolveArch(o);
    let m1 = 0;
    let m2 = o.inverterKw;
    for (const f of FLOORS) {
      const kw = gridConnectedKw(f.id);
      if (f.common) {
        if (o.pumpOnBackup) {
          // not added; the inverter rating already covers the backup bus
        } else if (pumpsOnM2(o)) m2 += kw;
        else m1 += kw;
      } else if (arch.m2Grid.includes(f.id)) m2 += kw;
      else m1 += kw;
    }
    if (o.ev) m2 += o.evKw;
    return { m1, m2, limit: LT_LIMIT_KW, fits: m1 <= LT_LIMIT_KW && m2 <= LT_LIMIT_KW };
  }

  /* Worst-case backup bus against the 17.5 kW design ceiling, not the 20 kVA nameplate.
     The charger is not on this bus. */
  function inverterLoadCheck(opts) {
    const o = merge(opts);
    const homeKw = {};
    for (const h of HOMES) homeKw[h.id] = h.limit;
    const phases = phaseLoads({ strategy: o.phase || 'PB2', homeKw, liftRunning: true, pumpOnBackup: o.pumpOnBackup });
    const limit = o.designMaxKw || DESIGN_MAX_KW;
    return {
      backupKw: phases.total,
      evKw: 0,
      chargerKw: o.ev ? o.evKw : 0,
      total: phases.total,
      limit,
      nameplate: o.inverterKw,
      slack: limit - phases.total,
      fits: phases.total <= limit && phases.max <= limit / 3,
      phases,
    };
  }

  function monthly(opts) {
    const o = merge(opts);
    const arch = resolveArch(o);
    const { kw1, kw2 } = sanctioned(o);
    const rows = MONTHS.map((name, i) => {
      const floors = FLOORS.map((f) => floorMonth(f, i, o));
      const onM2 = (fl) => (fl.id === 'G' ? pumpsOnM2(o) : arch.m2Grid.includes(fl.id));
      const ev = o.ev ? o.evUnits : 0;
      // Charger is on the solar main panel, after Meter 2 and before the inverter. It adds to
      // Meter 2's import, so monthly netting offsets it. It does not ride the backup bus.
      const backupBus = floors.reduce((s, fl) => s + fl.backup, 0) + o.inverterSelfUse;
      const m1 = floors.filter((fl) => !onM2(fl)).reduce((s, fl) => s + fl.grid, 0);
      const m2Gross = backupBus + floors.filter(onM2).reduce((s, fl) => s + fl.grid, 0) + ev;
      const solar = o.pvKwp * SOLAR_YIELD[i];
      const m2Net = m2Gross - solar;
      const bill1 = meterBill(m1, kw1);
      const bill2 = meterBill(m2Net, kw2);
      const bill2NoSolar = meterBill(m2Gross, kw2);
      const metered = floors.reduce((s, fl) => s + fl.grid + fl.backup, 0) + ev;
      return { name, i, floors, backupBus, m1, m2Gross, solar, m2Net, bill1, bill2, bill2NoSolar, metered, ev };
    });
    return { o, kw1, kw2, rows };
  }

  /* Split each month's bills to the floors. Returns per-home monthly averages and owner position. */
  function billing(model) {
    const { o, rows } = model;
    const homeIds = HOMES.map((h) => h.id);
    const perHome = Object.fromEntries(homeIds.map((id) => [id, 0]));
    let owner = 0; // + means owner receives more than he pays TGSPDCL
    let evPay = 0;
    let totalBills = 0;
    let totalNoSolar = 0;
    const rates = [];
    for (const r of rows) {
      const bills = r.bill1.total + r.bill2.total;
      const billsNoSolar = r.bill1.total + r.bill2NoSolar.total;
      totalBills += bills;
      totalNoSolar += billsNoSolar;
      let rate;
      if (o.billing === 'fixed') rate = o.fixedRate;
      else rate = bills / r.metered;
      rates.push(rate);
      const g = r.floors.find((fl) => fl.id === 'G');
      const commonShare = ((g.grid + g.backup) * rate) / homeIds.length;
      let collected = 0;
      for (const fl of r.floors) {
        if (fl.id === 'G' || !fl.occ) continue; // a vacant home's use and common share fall on the owner
        const own = (fl.grid + fl.backup) * rate;
        const fee = o.billing === 'pooledFee' ? o.solarFee : 0;
        perHome[fl.id] += own + commonShare + fee;
        collected += own + commonShare + fee;
      }
      const evBill = r.ev * rate;
      evPay += evBill;
      collected += evBill;
      owner += collected - bills;
    }
    for (const id of homeIds) perHome[id] /= rows.length;
    return {
      perHome,
      avgRate: rates.reduce((a, b) => a + b, 0) / rates.length,
      rates,
      owner,
      evPay,
      totalBills,
      totalNoSolar,
      solarSaving: totalNoSolar - totalBills,
    };
  }

  function annual(opts) {
    const m = monthly(opts);
    const sum = (fn) => m.rows.reduce((s, r) => s + fn(r), 0);
    const b = billing(m);
    return {
      model: m,
      billing: b,
      m1Units: sum((r) => r.m1),
      m2GrossUnits: sum((r) => r.m2Gross),
      m2NetUnits: sum((r) => Math.max(0, r.m2Net)),
      surplusUnits: sum((r) => Math.max(0, -r.m2Net)),
      solarUnits: sum((r) => r.solar),
      bill1: sum((r) => r.bill1.total),
      bill2: sum((r) => r.bill2.total),
      bill2NoSolar: sum((r) => r.bill2NoSolar.total),
      maxM1: Math.max(...m.rows.map((r) => r.m1)),
      maxM2Net: Math.max(...m.rows.map((r) => r.m2Net)),
      monthsOver800: m.rows.filter((r) => r.m1 > 800 || r.m2Net > 800).length,
      monthsSurplus: m.rows.filter((r) => r.m2Net < 0).length,
    };
  }

  /* If TGSPDCL will only grant one connection: Meter 1 and Meter 2 merge into a single net
     meter, sanctioned on the sum of both expected peaks (kw1 + kw2). Losing the second
     slab-resetting connection is the main cost, not the wiring (see 2.10). */
  function annualOneMeter(opts) {
    const m = monthly(opts);
    const kw = m.kw1 + m.kw2;
    const sum = (fn) => m.rows.reduce((s, r) => s + fn(r), 0);
    const netOf = (r) => r.m1 + r.m2Gross - r.solar;
    return {
      kw,
      bill: sum((r) => meterBill(netOf(r), kw).total),
      billNoSolar: sum((r) => meterBill(r.m1 + r.m2Gross, kw).total),
      netUnits: sum((r) => Math.max(0, netOf(r))),
      monthsOver800: m.rows.filter((r) => netOf(r) > 800).length,
    };
  }

  /* Same row shape as monthly(), but Meter 1 + Meter 2 merged into one connection: every row's
     bill1 is zeroed and bill2 carries the combined net/gross bill at the combined sanctioned kW.
     Lets the UI reuse billing()/chart code for the one-meter contingency without a parallel model. */
  const ZERO_BILL = { units: 0, surplus: 0, energy: 0, fixed: 0, customer: 0, duty: 0, credit: 0, total: 0 };
  function monthlyOneMeter(opts) {
    const m = monthly(opts);
    const kw = m.kw1 + m.kw2;
    const rows = m.rows.map((r) => {
      const net = r.m1 + r.m2Gross - r.solar;
      const gross = r.m1 + r.m2Gross;
      return Object.assign({}, r, { m1: 0, bill1: ZERO_BILL, bill2: meterBill(net, kw), bill2NoSolar: meterBill(gross, kw) });
    });
    return { o: m.o, kw1: 0, kw2: kw, rows };
  }

  /* ---------- Capital cost ---------- */

  function capex(opts) {
    const o = merge(opts);
    const kWp = o.pvKwp;
    const items = [];
    // base = needed anyway for a 2-meter building billed by private meters, with or without solar.
    const add = (group, name, lo, hi, base) => items.push({ group, name, lo, hi, base: !!base });
    add('Inverter', 'PuREPower Home 20.0 (vendor quote)', 550000, 550000);
    const module = o.subsidy === 'nondcr' ? [16000, 21000] : [25000, 32000];
    add('Solar', `${kWp} kW of ${o.subsidy === 'nondcr' ? 'imported-cell' : 'Made-in-India'} panels`, kWp * module[0], kWp * module[1]);
    add('Solar', 'Raised galvanised steel frame, 2.1-2.5 m clear', kWp * 8000, kWp * 15000);
    add('Solar', 'Solar cable, connectors, roof junction box, surge protectors, isolators', 10000 + kWp * 3500, 15000 + kWp * 5500);
    add('Solar', 'Solar installation and commissioning', kWp * 3000, kWp * 5000);
    add('Solar', 'Net-meter application, two-way meter, drawings', 15000, 30000);
    // Built for two meters from day one, with the bus-tie switch (below) as the one-meter
    // fallback (2.10) - nothing here is removed if TGSPDCL ends up granting only one connection,
    // so there is no capex saving to model, only the (always-included) cost of the switch itself.
    add('Panels', 'Grid main panel (Meter 1)', 35000, 60000, true);
    add('Panels', 'Solar main panel (Meter 2), with lockable solar isolator and Floor 2 transfer switch', 45000, 75000, true);
    add('Panels', 'Floor 1 transfer switch, fitted as standard (clears an empty-floor surplus)', 40000, 80000, true);
    add('Backup', 'Backup main board with bypass switch, phase selectors, load-shedding switch', 45000, 80000);
    add('Panels', 'Bus-tie breaker 4-pole 160 A, trapped-key interlock, 70 sq mm tie (kept open; closes only after one meter is removed)', 100000, 160000, true);
    add('Panels', 'Pump feeder transfer switch, 4-pole 20 A (default Meter 2, alternate Meter 1)', 8000, 15000, true);
    add('Backup', 'Floor emergency isolators, two 4-pole switches per floor with one padlock hasp', 12 * 2000, 12 * 4000, true);
    if (o.metering === 'MA') {
      add('Metering', '6 dual 3-phase private meters: grid half of the cost', 6 * 4500, 6 * 8000, true);
      add('Metering', '6 dual 3-phase private meters: backup half of the cost', 6 * 3500, 6 * 7000);
    } else {
      add('Metering', '6 grid private meters, 3-phase, with data port', 6 * 4500, 6 * 8000, true);
      if (o.phase === 'PB2') add('Metering', '6 backup private meters, 3-phase, load-limit relay, data port', 6 * 5000, 6 * 9000);
      else add('Metering', '6 backup private meters, single-phase, load-limit relay, data port', 6 * 2000, 6 * 4000);
    }
    add('Metering', 'Meter-reading box and data cabling', 8000, 15000, true);
    if (o.phase === 'PB2') {
      add('Backup', '6 home backup boards, 3-phase (30 mA earth-leakage breaker + circuit breakers)', 6 * 6000, 6 * 10000);
      add('Backup', 'Backup risers, 4-core 2.5/4 sq mm copper, about 135 m', 26000, 44000);
    } else {
      add('Backup', '6 home backup boards, single-phase (breakers with 30 mA earth-leakage)', 6 * 3000, 6 * 5000);
      add('Backup', 'Backup risers, 2-core 2.5/4 sq mm copper, about 135 m', 16000, 25000);
    }
    add('Backup', 'Extra earth pits: solar and inverter (2) + inverter neutral (1-2), chemical', 24000, 48000);
    add('Backup', 'Lift interface: phase-sequence relay, surge protector, interface relays', 8000, 20000);
    if (o.pumpOnBackup) add('Options', 'Overhead-tank pump on backup: contactor, timer, lift/battery interlock', 5000, 10000);
    if (o.ev) add('Options', 'Car charger circuit: solar main panel, after Meter 2, before the inverter. 32 A breaker + Type B earth-leakage device, 6 sq mm to parking', 14000, 22000);
    const sum = (list, k) => list.reduce((s, it) => s + it[k], 0);
    const sys = items.filter((it) => !it.base);
    const base = items.filter((it) => it.base);
    const contingency = { lo: Math.round(sum(sys, 'lo') * 0.05), hi: Math.round(sum(sys, 'hi') * 0.05) };
    const subsidy = o.subsidy === 'dcr-sub' ? 78000 : 0;
    const solar = items.filter((it) => it.group === 'Solar');
    return {
      items,
      lo: sum(sys, 'lo') + contingency.lo - subsidy,
      hi: sum(sys, 'hi') + contingency.hi - subsidy,
      baseLo: sum(base, 'lo'),
      baseHi: sum(base, 'hi'),
      contingency,
      subsidy,
      solarLo: sum(solar, 'lo') - subsidy,
      solarHi: sum(solar, 'hi') - subsidy,
    };
  }

  /* ---------- Phase balance on the backup bus ---------- */

  // PB1: each home on one phase. PB2: each home's UPS board is 3-phase, rooms split across R, Y, B.
  const PB1_MAP = { F1: 'R', F4: 'R', F2: 'Y', PH: 'Y', F3: 'B' };
  const LIFT_RUN_PER_PHASE = 2.2;
  const LIFT_IDLE_PER_PHASE = 0.05;

  function phaseLoads(p) {
    const o = Object.assign({ strategy: 'PB2', homeKw: {}, liftRunning: true, pumpOnBackup: false, sheddingOn: false }, p);
    const ph = { R: 0, Y: 0, B: 0 };
    for (const h of HOMES) {
      const kw = o.homeKw[h.id] || 0;
      if (o.strategy === 'PB1') ph[PB1_MAP[h.id]] += kw;
      else {
        ph.R += kw / 3;
        ph.Y += kw / 3;
        ph.B += kw / 3;
      }
    }
    // Common: parking + CCTV 0.4 kW, watchman + exterior-1 0.4 kW, staircase + exterior-2 0.4 kW.
    const common = o.sheddingOn ? 0.25 : 0.4;
    if (o.strategy === 'PB1') {
      ph.B += 3 * common; // the phase that carries only one home
    } else {
      ph.R += common;
      ph.Y += common;
      ph.B += common;
    }
    const lift = o.liftRunning ? LIFT_RUN_PER_PHASE : LIFT_IDLE_PER_PHASE;
    const pump = o.pumpOnBackup ? 0.33 : 0;
    for (const k of Object.keys(ph)) ph[k] += lift + pump;
    const vals = Object.values(ph);
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const total = vals.reduce((a, b) => a + b, 0);
    const avg = total / 3;
    // Design ceiling 17.5 kW, not the 20 kVA nameplate. Per-phase split is still VERIFY with PuREnergy.
    return { ...ph, total, max, imbalance: avg ? (max - min) / avg : 0, perPhaseLimit: DESIGN_MAX_KW / 3, totalLimit: DESIGN_MAX_KW, nameplateKw: 20 };
  }

  /* Every occupancy mask. With 3-phase backup, an empty floor removes the same load from R, Y and B,
     so the busiest case is always "everyone home", not a random vacant pattern. */
  function vacancyAudit(pumpOnBackup) {
    const ids = HOMES.map((h) => h.id);
    let worst = null;
    let allFit = true;
    for (let mask = 0; mask < 32; mask++) {
      const occupancy = {};
      ids.forEach((id, i) => { occupancy[id] = (mask & (1 << i)) !== 0; });
      const w = worstCase('PB2', occupancy, !!pumpOnBackup);
      const row = {
        occupied: ids.filter((id) => occupancy[id]),
        max: w.max, total: w.total, imbalance: w.imbalance,
        fits: w.max <= w.perPhaseLimit && w.total <= w.totalLimit,
      };
      if (!row.fits) allFit = false;
      if (!worst || w.max > worst.max) worst = row;
    }
    return { worst, allFit, masks: 32 };
  }

  function worstCase(strategy, occupancy, pumpOnBackup) {
    const occ = Object.assign({}, DEFAULTS.occupancy, occupancy || {});
    const homeKw = {};
    for (const h of HOMES) homeKw[h.id] = occ[h.id] ? h.limit : 0;
    return phaseLoads({ strategy, homeKw, liftRunning: true, pumpOnBackup: !!pumpOnBackup });
  }

  /* ---------- 24-hour simulation (15-minute steps) ---------- */

  const SEASONS = {
    summer: { month: 4, label: 'Summer (May)' },
    monsoon: { month: 6, label: 'Monsoon (Jul)' },
    winter: { month: 11, label: 'Winter (Dec)' },
  };

  const HOME_BACKUP_SHAPE = [0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.7, 0.8, 0.6, 0.5, 0.5, 0.5, 0.55, 0.6, 0.55, 0.5, 0.6, 0.8, 1.2, 1.5, 1.5, 1.4, 1.1, 0.8];
  const GRID_SHAPE = {
    summer: [1.6, 1.6, 1.6, 1.5, 1.3, 1.0, 1.2, 1.2, 0.8, 0.5, 0.5, 0.6, 0.7, 0.8, 0.8, 0.7, 0.6, 0.7, 0.9, 1.0, 1.1, 1.2, 1.5, 1.6],
    monsoon: [1.0, 1.0, 1.0, 0.9, 0.8, 0.9, 1.6, 1.6, 1.0, 0.6, 0.6, 0.7, 0.9, 0.8, 0.7, 0.6, 0.6, 0.8, 1.3, 1.5, 1.4, 1.2, 1.1, 1.0],
    winter: [0.3, 0.3, 0.3, 0.3, 0.4, 0.8, 2.0, 2.2, 1.4, 0.6, 0.5, 0.6, 0.9, 0.7, 0.5, 0.5, 0.6, 0.9, 1.5, 1.8, 1.5, 1.0, 0.6, 0.4],
  };
  const LIFT_SHAPE = [0.3, 0.3, 0.3, 0.3, 0.3, 0.4, 0.8, 1.6, 1.8, 1.4, 0.9, 0.8, 0.9, 0.8, 0.7, 0.7, 0.9, 1.3, 1.6, 1.7, 1.4, 1.0, 0.6, 0.4];

  function shapeAt(shape, h) {
    const i = Math.floor(h) % 24;
    const j = (i + 1) % 24;
    const f = h - Math.floor(h);
    return shape[i] * (1 - f) + shape[j] * f;
  }
  const shapeMean = (shape) => shape.reduce((a, b) => a + b, 0) / shape.length;
  const solarShape = (h) => Math.pow(Math.max(0, Math.sin((Math.PI * (h - 6.2)) / 12.6)), 1.25);

  function dailySim(opts) {
    const p = Object.assign({
      season: 'summer', pvKwp: 14, arch: 'C', mode: 'B1', bldc: true, pumpOnBackup: false, pumpsOnMeter2: true, ev: false,
      outage: null, // { start: hour, end: hour }
      occupancy: DEFAULTS.occupancy, battKwh: 20, socStart: 1.0, reserve: 0.85, balancedFloor: 0.5,
      maxCharge: 10, maxDischarge: 15, gridChargeKw: 2.5, eff: 0.96, evKw: 7.4,
    }, opts);
    const occ = Object.assign({}, DEFAULTS.occupancy, p.occupancy);
    const s = SEASONS[p.season];
    const mi = s.month;
    const dt = 0.25;
    const steps = 96;
    const days = DAYS[mi];
    const arch = resolveArch(p);
    const solarDay = (p.pvKwp * SOLAR_YIELD[mi]) / days;
    let solarNorm = 0;
    for (let k = 0; k < steps; k++) solarNorm += solarShape(k * dt + dt / 2) * dt;
    const homeBackupDay = (id) => {
      const h = HOMES.find((x) => x.id === id);
      if (!occ[id]) return VACANT.backup / days;
      return ((p.bldc ? h.backup : h.backupStd) * FAN_SEASON[mi]) / days;
    };
    const homeGridDay = (id) => {
      const h = HOMES.find((x) => x.id === id);
      if (!occ[id]) return VACANT.grid / days;
      return (h.grid * GRID_SEASON[mi]) / days;
    };
    const bMean = shapeMean(HOME_BACKUP_SHAPE);
    const gShape = GRID_SHAPE[p.season];
    const gMean = shapeMean(gShape);
    const lMean = shapeMean(LIFT_SHAPE);
    const minSoc = 0.1 * p.battKwh;
    let soc = p.socStart * p.battKwh;
    const out = [];
    const tot = { solar: 0, backup: 0, heavy: 0, export: 0, m2Import: 0, m1: 0, curtailed: 0, unserved: 0, charge: 0, discharge: 0, gridCharge: 0, minSocPct: 100 };
    for (let k = 0; k < steps; k++) {
      const h = k * dt + dt / 2;
      const gridOn = !(p.outage && h >= p.outage.start && h < p.outage.end);
      const socPct = (soc / p.battKwh) * 100;
      const shed30 = !gridOn && socPct < 30;
      const park20 = !gridOn && socPct < 20;
      // Backup bus pieces (kW)
      const homeKw = {};
      let homes = 0;
      for (const hm of HOMES) {
        const kw = (homeBackupDay(hm.id) / 24) * (shapeAt(HOME_BACKUP_SHAPE, h) / bMean);
        homeKw[hm.id] = kw;
        homes += kw;
      }
      const night = h >= 18.5 || h < 6;
      let lights = (night ? 0.55 : 0) + 0.1;
      if (shed30 && night) lights -= 0.3;
      const watchman = ((60 * FAN_SEASON[mi]) / days / 24) * (shapeAt(HOME_BACKUP_SHAPE, h) / bMean);
      let lift = (180 / days / 24) * (shapeAt(LIFT_SHAPE, h) / lMean);
      if (park20) lift = 0.05;
      const pumpWindow = (h >= 6 && h < 7.5) || (h >= 17.5 && h < 19);
      const pump = p.pumpOnBackup && pumpWindow && (gridOn || socPct > 50) ? 1.0 : 0;
      const selfUse = 0.11;
      // Charger is on the solar main panel, after Meter 2, before the inverter. Noon window so
      // export on that bus offsets it. It is off in a power cut (the panel bus is dead).
      const ev = p.ev && h >= 10 && h < 14 && gridOn ? (p.evKw || 7.4) : 0;
      const backupLoad = homes + lights + watchman + lift + pump + selfUse;
      // Heavy loads (grid side)
      let heavy1 = 0;
      let heavy2 = 0;
      for (const hm of HOMES) {
        const kw = (homeGridDay(hm.id) / 24) * (shapeAt(gShape, h) / gMean);
        if (arch.m2Grid.includes(hm.id)) heavy2 += kw;
        else heavy1 += kw;
      }
      if (!p.pumpOnBackup && pumpWindow) {
        if (p.pumpsOnMeter2) heavy2 += 1.0;
        else heavy1 += 1.0;
      }
      if (gridOn) heavy2 += ev;
      const pv = (solarDay / solarNorm) * solarShape(h);
      let pvToLoad = Math.min(pv, backupLoad);
      let remPv = pv - pvToLoad;
      let deficit = backupLoad - pvToLoad;
      let charge = 0;
      let discharge = 0;
      let gridToBus = 0;
      let gridCharge = 0;
      let exp = 0;
      let curtailed = 0;
      let unserved = 0;
      const room = (p.battKwh - soc) / dt;
      charge = Math.min(remPv, p.maxCharge, room / p.eff);
      remPv -= charge;
      if (gridOn) {
        const discharging = p.mode === 'B2' && night && soc > p.balancedFloor * p.battKwh;
        if (discharging) {
          discharge = Math.min(deficit, p.maxDischarge, (soc - p.balancedFloor * p.battKwh) / dt);
          deficit -= discharge;
        }
        gridToBus = deficit;
        const floorLevel = (p.mode === 'B2' ? p.balancedFloor : p.reserve) * p.battKwh;
        if (soc < floorLevel && charge < 0.01 && !discharging) gridCharge = Math.min(p.gridChargeKw, (p.battKwh - soc) / dt);
        exp = remPv;
      } else {
        discharge = Math.min(deficit, p.maxDischarge, Math.max(0, soc - minSoc) / dt);
        unserved = deficit - discharge;
        curtailed = remPv;
        heavy1 = 0;
        heavy2 = 0;
      }
      soc += (charge * p.eff + gridCharge * p.eff - discharge) * dt;
      soc = Math.max(0, Math.min(p.battKwh, soc));
      // Charger and pumps-on-Meter-2 are already inside heavy2, so they are not added again.
      const m2 = gridOn ? gridToBus + gridCharge + heavy2 - exp : 0;
      const m1 = gridOn ? heavy1 : 0;
      const row = {
        h: k * dt, gridOn, pv, backupLoad, homes, homeKw, lights, lift, pump, watchman,
        heavy1, heavy2, ev, charge: charge + gridCharge, discharge, gridToBus, exp, m2, m1,
        curtailed, unserved, socPct: (soc / p.battKwh) * 100,
      };
      out.push(row);
      tot.solar += pv * dt;
      tot.backup += backupLoad * dt;
      tot.heavy += (heavy1 + heavy2) * dt;
      tot.export += Math.max(0, -m2) * dt;
      tot.m2Import += Math.max(0, m2) * dt;
      tot.m1 += m1 * dt;
      tot.curtailed += curtailed * dt;
      tot.unserved += unserved * dt;
      tot.charge += (charge + gridCharge) * dt;
      tot.discharge += discharge * dt;
      tot.gridCharge += gridCharge * dt;
      tot.minSocPct = Math.min(tot.minSocPct, row.socPct);
    }
    return { steps: out, totals: tot, season: s.label };
  }

  /* Hours the battery alone can carry the backup bus from a given charge level. */
  function backupHours(loadKw, socPct, battKwh) {
    const usable = Math.max(0, (socPct / 100 - 0.1) * (battKwh || 20));
    return loadKw > 0 ? usable / loadKw : Infinity;
  }

  /* ---------- Combination matrix ---------- */

  function combos(base) {
    const list = [];
    for (const arch of Object.keys(ARCHS)) {
      for (const pvKwp of [10, 12, 14]) {
        for (const subsidy of ['dcr-sub', 'dcr-nosub', 'nondcr']) {
          for (const metering of ['MA', 'MB']) {
            const o = Object.assign({}, base, { arch, pvKwp, subsidy, metering });
            const a = annual(o);
            const noPv = annual(Object.assign({}, o, { pvKwp: 0 }));
            const c = capex(o);
            const saving = noPv.bill1 + noPv.bill2 - (a.bill1 + a.bill2);
            const mid = (c.lo + c.hi) / 2;
            const conn = connectedLoad(o);
            list.push({
              arch, pvKwp, subsidy, metering,
              bills: a.bill1 + a.bill2,
              saving,
              capexLo: c.lo,
              capexHi: c.hi,
              payback: mid / saving,
              solarPayback: ((c.solarLo + c.solarHi) / 2) / saving,
              surplusUnits: a.surplusUnits,
              monthsOver800: a.monthsOver800,
              m1Conn: conn.m1,
              m2Conn: conn.m2,
              ltFits: conn.fits,
            });
          }
        }
      }
    }
    return list;
  }

  return {
    MONTHS, SOLAR_YIELD, GRID_SEASON, FAN_SEASON, TARIFF, FLOORS, HOMES, ARCHS, DEFAULTS, SEASONS, PB1_MAP,
    HOME_CIRCUITS, COMMON_GRID, PHASE_ROTATION, LT_LIMIT_KW,
    energyCharge, customerCharge, meterBill, monthly, billing, annual, annualOneMeter, monthlyOneMeter, capex, sanctioned, resolveArch,
    homeCircuits, gridConnectedKw, connectedLoad, inverterLoadCheck, pumpsOnM2,
    phaseLoads, worstCase, vacancyAudit, dailySim, backupHours, combos, DESIGN_MAX_KW,
  };
});
