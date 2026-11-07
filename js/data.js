/* FalconAero — airport digital twin data model.
   Stylised Dubai International (OMDB/DXB) layout, fleet, airlines and scenario generator.
   All flight data is synthetic, calibrated to public figures (see docs/DATA_SOURCES.md). */
window.FA = window.FA || {};
window.FA.views = window.FA.views || {};

(function (FA) {
  'use strict';

  /* ---------- seeded RNG (reproducible demos) ---------- */
  function rng(seed) {
    let a = seed >>> 0;
    const f = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.normal = (mu, sd) => {
      const u = Math.max(1e-9, f()), v = f();
      return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    return f;
  }

  const fmt = (m) => {
    m = ((Math.round(m) % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  };

  /* ---------- aircraft types (ICAO Annex 14 code letter, wake category) ---------- */
  const TYPES = {
    A388: { name: 'Airbus A380-800', code: 'F', wake: 'J', pax: 489, turn: 120, burn: 7200, taxiBurn: 28 },
    B77W: { name: 'Boeing 777-300ER', code: 'E', wake: 'H', pax: 354, turn: 90, burn: 5600, taxiBurn: 21 },
    B789: { name: 'Boeing 787-9', code: 'E', wake: 'H', pax: 290, turn: 80, burn: 4300, taxiBurn: 16 },
    A359: { name: 'Airbus A350-900', code: 'E', wake: 'H', pax: 300, turn: 80, burn: 4200, taxiBurn: 16 },
    A333: { name: 'Airbus A330-300', code: 'E', wake: 'H', pax: 290, turn: 75, burn: 4800, taxiBurn: 18 },
    B38M: { name: 'Boeing 737 MAX 8', code: 'C', wake: 'M', pax: 168, turn: 45, burn: 2200, taxiBurn: 11 },
    A321: { name: 'Airbus A321neo', code: 'C', wake: 'M', pax: 190, turn: 45, burn: 2300, taxiBurn: 11 },
    A20N: { name: 'Airbus A320neo', code: 'C', wake: 'M', pax: 165, turn: 40, burn: 2000, taxiBurn: 10 }
  };
  const CODE_RANK = { C: 1, D: 2, E: 3, F: 4 };

  /* ---------- airlines (share of DXB movements, approx.) ---------- */
  const AIRLINES = [
    { iata: 'EK', icao: 'UAE', name: 'Emirates', color: '#e2b04a', share: 0.46, fleet: ['A388', 'B77W', 'B77W'], home: ['A', 'B', 'C'], conn: [0.45, 0.75] },
    { iata: 'FZ', icao: 'FDB', name: 'flydubai', color: '#4fc3f7', share: 0.24, fleet: ['B38M'], home: ['F'], conn: [0.15, 0.35] },
    { iata: 'QR', icao: 'QTR', name: 'Qatar Airways', color: '#b388ff', share: 0.04, fleet: ['A359', 'B789'], home: ['D'], conn: [0.05, 0.1] },
    { iata: 'SV', icao: 'SVA', name: 'Saudia', color: '#66bb6a', share: 0.04, fleet: ['A333', 'A20N'], home: ['D'], conn: [0.05, 0.1] },
    { iata: 'AI', icao: 'AIC', name: 'Air India', color: '#ff8a65', share: 0.05, fleet: ['A20N', 'B789'], home: ['D'], conn: [0.05, 0.1] },
    { iata: '6E', icao: 'IGO', name: 'IndiGo', color: '#5c6bc0', share: 0.06, fleet: ['A321', 'A20N'], home: ['D'], conn: [0.02, 0.06] },
    { iata: 'BA', icao: 'BAW', name: 'British Airways', color: '#90a4ae', share: 0.03, fleet: ['B77W', 'A388'], home: ['D'], conn: [0.05, 0.12] },
    { iata: 'TK', icao: 'THY', name: 'Turkish Airlines', color: '#ef5350', share: 0.04, fleet: ['A333', 'A321'], home: ['D'], conn: [0.05, 0.1] },
    { iata: 'PK', icao: 'PIA', name: 'PIA', color: '#26a69a', share: 0.04, fleet: ['B77W', 'A20N'], home: ['D'], conn: [0.02, 0.06] }
  ];
  const AIRLINE = Object.fromEntries(AIRLINES.map((a) => [a.iata, a]));

  const ORIGINS = {
    long: ['LHR', 'JFK', 'SYD', 'MEL', 'SIN', 'HKG', 'ICN', 'NRT', 'CDG', 'FRA', 'MUC', 'MAN', 'GRU', 'JNB', 'BKK', 'KUL', 'PEK', 'LAX', 'AKL', 'IAH'],
    short: ['BOM', 'DEL', 'COK', 'KHI', 'LHE', 'RUH', 'JED', 'DOH', 'MCT', 'BAH', 'KWI', 'AMM', 'CAI', 'IST', 'TBS', 'KTM', 'CMB', 'DAC', 'HYD', 'BLR']
  };

  /* ---------- UAE network: airports usable as alternates ---------- */
  const NETWORK = [
    { icao: 'OMDB', iata: 'DXB', name: 'Dubai International', lat: 25.2532, lon: 55.3657, stands: 180, codeF: 40, cap: 68, rwy: '12L/30R · 12R/30L' },
    { icao: 'OMDW', iata: 'DWC', name: 'Al Maktoum Intl (DWC)', lat: 24.8964, lon: 55.1614, stands: 64, codeF: 10, cap: 40, rwy: '12/30', dist: 42 },
    { icao: 'OMAA', iata: 'AUH', name: 'Zayed Intl (Abu Dhabi)', lat: 24.4330, lon: 54.6511, stands: 95, codeF: 12, cap: 50, rwy: '13L/31R · 13R/31L', dist: 115 },
    { icao: 'OMSJ', iata: 'SHJ', name: 'Sharjah Intl', lat: 25.3286, lon: 55.5172, stands: 50, codeF: 2, cap: 30, rwy: '12/30', dist: 17 },
    { icao: 'OMRK', iata: 'RKT', name: 'Ras Al Khaimah Intl', lat: 25.6135, lon: 55.9388, stands: 18, codeF: 1, cap: 18, rwy: '16/34', dist: 70 },
    { icao: 'OMFJ', iata: 'FJR', name: 'Fujairah Intl', lat: 25.1122, lon: 56.3240, stands: 12, codeF: 1, cap: 14, rwy: '11/29', dist: 98 },
    { icao: 'OMAL', iata: 'AAN', name: 'Al Ain Intl', lat: 24.2617, lon: 55.6092, stands: 14, codeF: 1, cap: 14, rwy: '01/19', dist: 120 }
  ];

  /* ---------- airport geometry (SVG viewBox 0 0 1200 700) ---------- */
  const G = {
    W: 1200, H: 700,
    rwyN: { y: 110, x1: 110, x2: 1090, name: '12L/30R', role: 'Arrivals' },
    rwyS: { y: 625, x1: 110, x2: 1090, name: '12R/30L', role: 'Departures' },
    twyN: 165, twyS: 572,
    connectors: [205, 515, 850],
    lanes: { L1: 212, L2: 375, L3: 528 },
    exitsN: [330, 520, 700, 860],
    holdS: { x: 150, y: 600 },
    holdStacks: [{ x: 70, y: 52, name: 'Stack WEST' }, { x: 1135, y: 52, name: 'Stack EAST' }]
  };

  /* Piers / stand groups. side: 'top' | 'bot'; laneTop/laneBot = apron lane serving that side */
  const PIERS = [
    { id: 'C', label: 'Concourse C', x1: 240, x2: 480, y: 290, top: 6, bot: 6, lanes: ['L1', 'L2'], code: (i) => (i < 10 ? 'E' : 'E'), airlines: ['EK'], contact: true, terminal: 'T3' },
    { id: 'B', label: 'Concourse B', x1: 550, x2: 820, y: 290, top: 7, bot: 7, lanes: ['L1', 'L2'], code: (i) => (i < 6 ? 'F' : 'E'), airlines: ['EK'], contact: true, terminal: 'T3' },
    { id: 'A', label: 'Concourse A', x1: 885, x2: 1075, y: 290, top: 5, bot: 5, lanes: ['L1', 'L2'], code: () => 'F', airlines: ['EK'], contact: true, terminal: 'T3' },
    { id: 'D', label: 'Concourse D (T1)', x1: 240, x2: 480, y: 452, top: 6, bot: 6, lanes: ['L2', 'L3'], code: (i) => (i < 6 ? 'E' : 'C'), airlines: ['QR', 'SV', 'AI', '6E', 'BA', 'TK', 'PK'], contact: true, terminal: 'T1' },
    { id: 'F', label: 'Terminal 2', x1: 550, x2: 820, y: 452, top: 5, bot: 5, lanes: ['L2', 'L3'], code: () => 'C', airlines: ['FZ'], contact: true, terminal: 'T2' },
    { id: 'R', label: 'Remote Apron', x1: 885, x2: 1075, y: 452, top: 6, bot: 6, lanes: ['L2', 'L3'], code: (i) => (i < 3 ? 'F' : i < 9 ? 'E' : 'C'), airlines: [], contact: false, terminal: 'Remote' }
  ];

  function buildStands() {
    const stands = [];
    PIERS.forEach((p) => {
      let idx = 0;
      ['top', 'bot'].forEach((side, si) => {
        const n = side === 'top' ? p.top : p.bot;
        const span = (p.x2 - p.x1) / n;
        for (let k = 0; k < n; k++) {
          const x = p.x1 + span * (k + 0.5);
          const y = side === 'top' ? p.y - 38 : p.y + 38;
          const laneKey = p.lanes[si];
          stands.push({
            id: p.id + (idx + 1), pier: p.id, idx, side, x, y,
            lane: G.lanes[laneKey], laneKey,
            code: p.code(idx), contact: p.contact, airlines: p.airlines, terminal: p.terminal,
            outOfService: false
          });
          idx++;
        }
      });
    });
    return stands;
  }

  /* ---------- separation (ICAO Doc 4444 distance minima → time at ~140 kt) ---------- */
  const SEP_NM = { J: { J: 4, H: 6, M: 7 }, H: { J: 4, H: 4, M: 5 }, M: { J: 3, H: 3, M: 3 } };
  const NM_SEC = 26; // ~1 NM at 140 kt final approach

  /* ---------- scenario catalogue ---------- */
  const SCENARIOS = {
    normal: {
      id: 'normal', name: 'Normal Operations', icon: '☀', short: 'CAT I · VMC',
      desc: 'Clear morning, both runways in segregated mode.',
      wx: { vis: 9999, rvr: null, start: null, end: null }, lvp: false, events: []
    },
    fog: {
      id: 'fog', name: 'Dense Radiation Fog', icon: '🌫', short: 'CAT III · LVP',
      desc: 'Radiation fog forms at 05:35. RVR falls to 175–300 m. Low Visibility Procedures (LVP) active until ~07:20.',
      wx: { vis: 150, rvr: 225, start: 335, end: 440 }, lvp: true, events: []
    },
    sand: {
      id: 'sand', name: 'Shamal Sandstorm', icon: '🌪', short: 'Dust · X-wind 28 kt',
      desc: 'Shamal winds raise dust, visibility 1,200 m, strong crosswind. Reduced arrival rate and taxi speeds.',
      wx: { vis: 1200, rvr: 1100, start: 330, end: 450 }, lvp: false, degraded: true, events: []
    },
    runway: {
      id: 'runway', name: 'Runway 12L/30R Closure', icon: '⛔', short: 'Single-runway ops',
      desc: 'Disabled aircraft on 12L/30R 05:50–06:40. All traffic in mixed mode on 12R/30L.',
      wx: { vis: 9999, rvr: null, start: null, end: null }, lvp: false,
      events: [{ type: 'rwyClosure', rwy: 'N', start: 350, end: 400 }]
    },
    storm: {
      id: 'storm', name: 'Perfect Storm (Demo)', icon: '⚠', short: 'Fog + Emergencies + Stand outage',
      desc: 'Dense fog with LVP, a medical emergency, a low-fuel MAYDAY and an A-pier jet-bridge failure (A3–A5 unserviceable).',
      wx: { vis: 150, rvr: 200, start: 330, end: 445 }, lvp: true,
      events: [{ type: 'standOutage', stands: ['A3', 'A4', 'A5'], start: 300, end: 480 }, { type: 'emergency', kind: 'fuel' }, { type: 'emergency', kind: 'medical' }]
    }
  };

  /* ---------- flight generator ---------- */
  function pickAirline(r) {
    let x = r(), acc = 0;
    for (const a of AIRLINES) { acc += a.share; if (x <= acc) return a; }
    return AIRLINES[0];
  }

  function makeFlight(r, kind, used) {
    const al = pickAirline(r);
    const type = r.pick(al.fleet);
    const t = TYPES[type];
    let num;
    do { num = al.iata === 'EK' || al.iata === 'FZ' ? r.int(1, 999) : r.int(100, 999); } while (used.has(al.iata + num));
    used.add(al.iata + num);
    const long = t.code !== 'C';
    const port = r.pick(long ? ORIGINS.long : ORIGINS.short);
    return {
      id: al.iata + String(num).padStart(al.iata === 'EK' || al.iata === 'FZ' ? 3 : 3, '0'),
      airline: al.iata, type, kind, port,
      code: t.code, wake: t.wake,
      pax: Math.round(t.pax * (0.72 + r() * 0.24))
    };
  }

  /**
   * Build a scenario instance: arrivals (inbound), departures (aircraft already on stand),
   * and the original (pre-disruption) stand plan.
   */
  function generate(scenarioId, seed, opts) {
    opts = opts || {};
    const sc = SCENARIOS[scenarioId] || SCENARIOS.normal;
    const r = rng(seed || 2026);
    const stands = buildStands();
    const used = new Set();
    const T0 = 300, T1 = 480; // 05:00 → 08:00 local
    const arrivals = [], departures = [];

    // Departures: aircraft already on stands at 05:00 leaving during the window.
    const depCount = opts.depCount || 54;
    for (let i = 0; i < depCount; i++) {
      const f = makeFlight(r, 'dep', used);
      f.std = T0 + 6 + Math.round(Math.pow(i / depCount, 1.25) * 150 + r() * 5);
      departures.push(f);
    }
    // Arrivals: morning bank, ~38/h nominal, denser 05:30-07:00 (Dubai hub bank).
    const arrCount = opts.arrCount || 80;
    for (let i = 0; i < arrCount; i++) {
      const f = makeFlight(r, 'arr', used);
      const u = i / arrCount;
      f.eta = Math.round(T0 + 12 + u * 170 + r.normal(0, 2.2));
      const ty = TYPES[f.type];
      f.fuelMin = Math.round(Math.max(28, (ty.code === 'C' ? 42 : 58) + r.normal(0, 11)));
      const al = AIRLINE[f.airline];
      f.connPax = Math.round(f.pax * (al.conn[0] + r() * (al.conn[1] - al.conn[0])));
      f.priority = 'normal';
      arrivals.push(f);
    }
    arrivals.sort((a, b) => a.eta - b.eta);
    departures.sort((a, b) => a.std - b.std);

    // Emergencies / special priorities.
    const special = (kind) => {
      const cands = arrivals.filter((f) => f.priority === 'normal' && f.eta > 345 && f.eta < 395);
      const f = r.pick(cands);
      if (!f) return;
      if (kind === 'fuel') { f.priority = 'mayday'; f.fuelMin = 14; f.note = 'MAYDAY FUEL — minimum fuel declared'; }
      if (kind === 'medical') { f.priority = 'medical'; f.note = 'PAN-PAN — passenger medical emergency, ambulance requested'; }
      if (kind === 'state') { f.priority = 'state'; f.note = 'State flight — protocol stand required'; }
    };
    (sc.events || []).filter((e) => e.type === 'emergency').forEach((e) => special(e.kind));
    // A state flight is present in every scenario for realism.
    special('state');

    // Original stand plan (what the AODB/RMS had before the disruption).
    assignOriginal(stands, arrivals, departures, r);

    // Stand outages
    (sc.events || []).filter((e) => e.type === 'standOutage').forEach((e) => {
      e.stands.forEach((id) => { const s = stands.find((x) => x.id === id); if (s) { s.outOfService = true; s.outage = { start: e.start, end: e.end }; } });
    });

    return {
      scenario: sc, seed, T0, T1, stands, arrivals, departures,
      events: sc.events || []
    };
  }

  function compatible(stand, flight) {
    return CODE_RANK[stand.code] >= CODE_RANK[flight.code];
  }

  /* Pre-disruption plan: departures sit on stands; arrivals planned by airline preference (nominal times). */
  function assignOriginal(stands, arrivals, departures, r) {
    const free = new Map(stands.map((s) => [s.id, 0]));
    const prefScore = (s, f) => (s.airlines.includes(f.airline) ? 0 : s.contact ? 3 : 6) + (CODE_RANK[s.code] - CODE_RANK[f.code]) * 0.6;
    // departures occupy stands from T0
    const order = stands.slice().sort(() => r() - 0.5);
    departures.forEach((d) => {
      const cand = order.filter((s) => compatible(s, d) && free.get(s.id) === 0 && s.contact)
        .sort((a, b) => prefScore(a, d) - prefScore(b, d))[0] ||
        order.find((s) => compatible(s, d) && free.get(s.id) === 0);
      if (cand) { d.stand = cand.id; d.origStand = cand.id; free.set(cand.id, d.std - 2); }
    });
    // arrivals: nominal on-block = eta + 9, stand free buffer 10 min
    arrivals.forEach((a) => {
      const onb = a.eta + 9;
      const cands = stands.filter((s) => compatible(s, a) && s.contact && free.get(s.id) + 10 <= onb)
        .sort((x, y) => prefScore(x, a) - prefScore(y, a) || free.get(x.id) - free.get(y.id));
      const s = cands[0] || stands.filter((s2) => compatible(s2, a) && free.get(s2.id) + 10 <= onb)
        .sort((x, y) => prefScore(x, a) - prefScore(y, a))[0];
      if (s) { a.origStand = s.id; free.set(s.id, onb + TYPES[a.type].turn); }
      else { a.origStand = null; }
    });
  }

  FA.data = {
    rng, fmt, TYPES, CODE_RANK, AIRLINES, AIRLINE, NETWORK, G, PIERS, SEP_NM, NM_SEC,
    SCENARIOS, buildStands, generate, compatible
  };
})(window.FA);
