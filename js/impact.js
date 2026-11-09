/* FalconAero — Impact & Roadmap view: live Monte-Carlo benchmark, annualised value, 90-day pilot, business model, alignment, data sources. */
(function (FA) {
  'use strict';
  FA.views = FA.views || {};

  const CSS = `
  .im-prog { height:6px; background:rgba(255,255,255,.06); border-radius:4px; overflow:hidden; margin:8px 0; }
  .im-prog i { display:block; height:100%; width:0; background:linear-gradient(90deg,#26c6da,#e2b04a); transition:width .15s; }
  .im-cards { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
  .im-card { background:rgba(0,0,0,.2); border:1px solid #1e3150; border-radius:10px; padding:10px 12px; }
  .im-card .l { font-size:10.5px; color:#8ea3c4; text-transform:uppercase; letter-spacing:.06em; }
  .im-card .v { font-family:'JetBrains Mono',monospace; font-size:24px; font-weight:800; margin:2px 0; }
  .im-card .s { font-size:11px; color:#8ea3c4; font-family:'JetBrains Mono',monospace; }
  .im-inputs { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; margin-bottom:10px; }
  .im-inputs label { font-size:11px; color:#8ea3c4; display:flex; flex-direction:column; gap:4px; }
  .im-inputs input { background:rgba(0,0,0,.3); border:1px solid #2a4268; border-radius:8px; color:#e6eefb; padding:6px 8px; font:inherit; font-family:'JetBrains Mono',monospace; }
  .im-phases { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-top:10px; }
  .im-phase { border:1px solid #1e3150; border-radius:10px; padding:10px 12px; background:rgba(0,0,0,.18); }
  .im-phase h3 { display:flex; justify-content:space-between; align-items:center; }
  .im-phase ul { margin:4px 0 8px; padding-left:16px; font-size:12px; display:flex; flex-direction:column; gap:3px; }
  .im-phase .k { font-size:10.5px; color:#8ea3c4; text-transform:uppercase; letter-spacing:.06em; margin-top:6px; }
  .im-bmc { display:grid; grid-template-columns:repeat(5,1fr); grid-template-rows:auto auto auto; gap:8px; }
  .im-bmc > div { background:rgba(0,0,0,.2); border:1px solid #1e3150; border-radius:10px; padding:9px 10px; font-size:11.5px; }
  .im-bmc h4 { margin:0 0 5px; font-size:10.5px; text-transform:uppercase; letter-spacing:.07em; color:#e2b04a; }
  .im-bmc ul { margin:0; padding-left:14px; display:flex; flex-direction:column; gap:2px; }
  .im-bmc .kp { grid-column:1; grid-row:1 / span 2; } .im-bmc .ka { grid-column:2; grid-row:1; } .im-bmc .kr { grid-column:2; grid-row:2; }
  .im-bmc .vp { grid-column:3; grid-row:1 / span 2; border-color:#26c6da; } .im-bmc .cr { grid-column:4; grid-row:1; } .im-bmc .ch { grid-column:4; grid-row:2; }
  .im-bmc .cs { grid-column:5; grid-row:1 / span 2; } .im-bmc .co { grid-column:1 / span 2; grid-row:3; } .im-bmc .rs { grid-column:3 / span 3; grid-row:3; }
  .im-align { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
  .im-align .card b { display:block; margin-bottom:3px; }
  .im-src { display:flex; flex-direction:column; gap:8px; }
  .im-src .card { display:grid; grid-template-columns:1fr auto; gap:4px 12px; }
  .im-badge { font-size:10px; font-weight:700; padding:2px 7px; border-radius:5px; align-self:start; }
  .im-badge.used { background:rgba(102,187,106,.15); color:#66bb6a; border:1px solid rgba(102,187,106,.4); }
  .im-badge.live { background:rgba(38,198,218,.15); color:#26c6da; border:1px solid rgba(38,198,218,.4); }
  .im-badge.plan { background:rgba(226,176,74,.12); color:#e2b04a; border:1px solid rgba(226,176,74,.4); }
  @media (max-width:1180px){ .im-cards,.im-inputs,.im-phases,.im-align{ grid-template-columns:1fr 1fr; } .im-bmc{ grid-template-columns:1fr; } .im-bmc > div{ grid-column:auto !important; grid-row:auto !important; } }
  `;

  const SCENARIOS = ['fog', 'storm', 'sand', 'runway'];
  const SEEDS = [2026, 2127, 2228, 2329, 2430, 2531, 2632, 2733];
  const OPT = ['balanced', 'mindelay', 'safety'];
  const METRICS = [
    { key: 'avgDelayAll', label: 'Avg delay per flight', unit: 'min', d: 1, hint: 'incl. diversions (180 min each)' },
    { key: 'paxDelayHrs', label: 'Passenger-delay hours', unit: 'h', d: 0, hint: 'per disrupted 3-h window' },
    { key: 'diversions', label: 'Diversions', unit: '', d: 1, hint: 'mean per event' },
    { key: 'fuelCritical', label: 'Minimum-fuel events', unit: '', d: 1, hint: 'aircraft holding to bingo fuel' },
    { key: 'standConflicts', label: 'Stand conflicts', unit: '', d: 1, hint: 'aircraft held waiting for a gate' },
    { key: 'co2t', label: 'CO₂ emitted', unit: 't', d: 0, hint: 'holding + queues + diversions' },
    { key: 'missedConn', label: 'Missed connections', unit: 'pax', d: 0, hint: 'transfer passengers' },
    { key: 'emergDelay', label: 'Emergency landing delay', unit: 'min', d: 1, hint: 'MAYDAY / PAN after ETA' },
    { key: 'taxiConflicts', label: 'Taxi conflicts', unit: '', d: 1, hint: 'head-on / crossing / spacing on the taxiway network' },
    { key: 'throughput', label: 'Arrivals landed by 08:00', unit: '', d: 1, hint: 'runway throughput in the disrupted window', higher: true },
    { key: 'contactPct', label: 'Contact-stand utilisation', unit: '%', d: 0, hint: 'arrivals at a gate with jet bridge', higher: true }
  ];
  const getV = (k, key) => (key === 'co2t' ? k.co2 / 1000 : key === 'totalDelay' ? k.avgDelayAll * (k.landed + k.diversions) : k[key]);

  let root = null, running = false, chartMetric = 'avgDelayAll';
  const esc = (s) => FA.ui.esc(s);
  const num = (v, d) => FA.ui.num(v, d);

  /* =========================================================
     1. Benchmark (Monte Carlo, computed in-browser)
     ========================================================= */
  function runOne(scn, seed) {
    const inst = FA.data.generate(scn, seed);
    const t0 = performance.now();
    const base = FA.engine.buildPlan(inst, 'baseline');
    const tb = performance.now() - t0;
    const opts = {};
    let tOpt = 0;
    OPT.forEach((id) => { const t1 = performance.now(); opts[id] = FA.engine.buildPlan(inst, id); tOpt += performance.now() - t1; });
    const recId = OPT.slice().sort((a, b) => opts[b].kpi.scores.overall - opts[a].kpi.scores.overall)[0];
    const pick = (k) => {
      const o = {};
      METRICS.forEach((m) => { o[m.key] = getV(k, m.key); });
      o.totalDelay = getV(k, 'totalDelay'); o.fuel = k.fuel; o.score = k.scores.overall; o.taxiOver = k.taxiOver;
      return o;
    };
    return { scenario: scn, seed, recId, base: pick(base.kpi), rec: pick(opts[recId].kpi), bal: pick(opts.balanced.kpi), msBase: tb, msOpt: tOpt / OPT.length };
  }

  function aggregate(runs) {
    const mean = (arr, f) => arr.reduce((s, r) => s + f(r), 0) / Math.max(1, arr.length);
    const keys = METRICS.map((m) => m.key).concat(['totalDelay', 'fuel', 'score', 'taxiOver']);
    const agg = (subset) => {
      const o = { base: {}, rec: {}, bal: {} };
      keys.forEach((k) => { ['base', 'rec', 'bal'].forEach((p) => { o[p][k] = mean(subset, (r) => r[p][k]); }); });
      return o;
    };
    const per = {};
    SCENARIOS.forEach((s) => { per[s] = agg(runs.filter((r) => r.scenario === s)); });
    const recCount = {};
    runs.forEach((r) => { recCount[r.recId] = (recCount[r.recId] || 0) + 1; });
    return {
      runs, n: runs.length, seeds: SEEDS.slice(), scenarios: SCENARIOS.slice(), all: agg(runs), per, recCount,
      msOpt: mean(runs, (r) => r.msOpt), msBase: mean(runs, (r) => r.msBase), at: new Date().toISOString()
    };
  }

  function runBenchmark() {
    if (running) return;
    running = true;
    const jobs = [];
    SCENARIOS.forEach((s) => SEEDS.forEach((seed) => jobs.push([s, seed])));
    const runs = [];
    const bar = root && root.querySelector('#imProg i');
    const lbl = root && root.querySelector('#imProgLbl');
    const btn = root && root.querySelector('#imRun');
    if (btn) btn.disabled = true;
    let i = 0;
    const step = () => {
      const tEnd = performance.now() + 40;
      while (i < jobs.length && performance.now() < tEnd) { runs.push(runOne(jobs[i][0], jobs[i][1])); i++; }
      if (bar) bar.style.width = ((100 * i) / jobs.length).toFixed(1) + '%';
      if (lbl) lbl.textContent = 'Simulating ' + i + ' / ' + jobs.length + ' disruption events (' + (jobs[Math.min(i, jobs.length - 1)][0]) + ')…';
      if (i < jobs.length) { setTimeout(step, 0); return; }
      running = false;
      if (btn) btn.disabled = false;
      FA.benchmark = aggregate(runs);
      FA.bus.emit('benchmark', FA.benchmark);
      renderBench(); renderValue();
    };
    setTimeout(step, 30);
  }

  function renderBench() {
    const el = root && root.querySelector('#imBench');
    if (!el) return;
    const B = FA.benchmark;
    const lbl = root.querySelector('#imProgLbl');
    if (!B) { el.innerHTML = ''; return; }
    if (lbl) lbl.textContent = B.n + ' disruption events simulated · ' + B.scenarios.length + ' scenarios × ' + B.seeds.length + ' seeds · ' + new Date(B.at).toLocaleTimeString();
    const A = B.all;
    const cards = METRICS.map((m) => {
      const b = A.base[m.key], r = A.rec[m.key];
      const p = b ? Math.round((100 * (r - b)) / b) : 0;
      const good = m.higher ? r >= b : r <= b;
      const big = Math.abs(b) < 1e-6 ? (r < 1e-6 ? '±0' : '+' + num(r, m.d)) : (p > 0 ? '+' : '') + p + '%';
      return '<div class="im-card"><div class="l">' + esc(m.label) + '</div><div class="v ' + (good ? 'good' : 'bad') + '">' + big + '</div><div class="s">' + num(b, m.d) + ' → ' + num(r, m.d) + ' ' + esc(m.unit) + '</div><div class="src">' + esc(m.hint) + '</div></div>';
    }).join('');
    const recMix = Object.entries(B.recCount).map(([k, v]) => esc(FA.engine.PLAN_CFGS[k].short) + ' ' + v + '×').join(' · ');
    const m = METRICS.find((x) => x.key === chartMetric) || METRICS[0];
    const names = { fog: 'Dense fog (LVP)', storm: 'Perfect storm', sand: 'Shamal sandstorm', runway: 'Runway closure' };
    const data = SCENARIOS.map((s) => ({ label: names[s], values: [B.per[s].base[m.key], B.per[s].bal[m.key], B.per[s].rec[m.key]] }));
    const seg = METRICS.map((x) => '<button data-k="' + x.key + '"' + (x.key === m.key ? ' class="on"' : '') + '>' + esc(x.label.replace('Passenger-delay hours', 'Pax-delay h').replace('Avg delay per flight', 'Avg delay').replace('Emergency landing delay', 'Emergency delay').replace('Minimum-fuel events', 'Min-fuel')) + '</button>').join('');
    el.innerHTML =
      '<div class="im-cards">' + cards + '</div>' +
      '<div class="grid-2" style="margin:12px 0 0">' +
      '<div><div class="panel-h" style="margin-top:4px"><span>By scenario — ' + esc(m.label) + (m.unit ? ' (' + esc(m.unit) + ')' : '') + '</span></div><div class="seg" id="imMetric" style="flex-wrap:wrap;margin-bottom:8px">' + seg + '</div>' +
      FA.charts.bars(data, ['Current practice', 'FalconAero Balanced', 'FalconAero (AI-recommended)'], { w: 620, h: 250, labels: true, colors: ['#ef5350', '#26c6da', '#e2b04a'] }) + '</div>' +
      '<div><div class="panel-h" style="margin-top:4px"><span>Method & speed</span></div>' +
      '<div class="im-cards" style="grid-template-columns:1fr 1fr;margin-bottom:10px"><div class="im-card"><div class="l">Plan computation</div><div class="v cy">' + num(B.msOpt, 0) + ' ms</div><div class="s">per complete recovery plan (runway + stands + diversions + departures)</div></div>' +
      '<div class="im-card"><div class="l">AI choice of plan</div><div class="v gold" style="font-size:16px;line-height:1.5">' + recMix + '</div><div class="s">the recommended strategy adapts to each disruption</div></div></div>' +
      '<ul class="small muted" style="margin:0;padding-left:16px;display:flex;flex-direction:column;gap:4px">' +
      '<li><b>Same seeds, same traffic</b> for both arms: each event replays an identical stylised DXB morning bank (~80 arrivals, ~54 departures, 05:00–08:00) under current practice (FCFS, nearest-field late diversion, fixed stand plan) and under FalconAero.</li>' +
      '<li>Separation from ICAO Doc 4444 wake minima, LVP spacing, stand Code letters per ICAO Annex 14; fuel endurance, pax and transfer loads are synthetic but calibrated to public fleet data.</li>' +
      '<li><b>Every number on this page is computed live in your browser</b> — press re-run to reproduce. Absolute values describe the simulation, not certified DXB statistics; the pilot (below) exists to measure them on real data.</li></ul></div></div>';
    el.querySelectorAll('#imMetric button').forEach((b) => b.addEventListener('click', () => { chartMetric = b.dataset.k; renderBench(); }));
  }

  /* =========================================================
     2. Annualised value
     ========================================================= */
  function defaultFogDays() {
    try {
      const c = FA.fogModel && FA.fogModel.climatology && FA.fogModel.climatology.OMDB;
      if (c && Array.isArray(c.fogDaysByMonth)) {
        const s = c.fogDaysByMonth.reduce((a, v) => a + (+v || 0), 0);
        if (s > 0) return { v: Math.round(s), src: 'from 10 years of OMDB METAR (fog model climatology)' };
      }
    } catch (e) { /* ignore */ }
    return { v: 25, src: 'assumption — to calibrate with NCM / GCAA data' };
  }
  const inputs = { fogDays: null, hours: 3, eurMin: 100, fuelUsd: 0.75, co2k: 3.16 };

  function renderValue() {
    const el = root && root.querySelector('#imValue');
    if (!el) return;
    const fd = defaultFogDays();
    if (inputs.fogDays == null) inputs.fogDays = fd.v;
    const B = FA.benchmark;
    const field = (k, label, step, note) => '<label>' + esc(label) + '<input type="number" step="' + step + '" data-k="' + k + '" value="' + inputs[k] + '"/><span class="src">' + esc(note) + '</span></label>';
    let out = '<div class="im-inputs">' +
      field('fogDays', 'Fog / LVP days per year (DXB)', 1, fd.src) +
      field('hours', 'Disrupted hours per event', 0.5, 'assumption; simulated window = 3 h') +
      field('eurMin', 'Cost of 1 min of delay (€)', 5, 'EUROCONTROL standard input ≈ €100/min (reference value)') +
      field('fuelUsd', 'Jet fuel price (US$/kg)', 0.05, 'assumption') +
      field('co2k', 'kg CO₂ per kg fuel', 0.01, 'ICAO standard factor 3.16') + '</div>';
    if (!B) { el.innerHTML = out + '<p class="muted small">Run the benchmark to estimate annual value.</p>'; bindInputs(el); return; }
    const A = B.all;
    const scale = inputs.fogDays * (inputs.hours / 3);
    const dDelayMin = Math.max(0, A.base.totalDelay - A.rec.totalDelay) * scale;
    const dFuelKg = Math.max(0, A.base.fuel - A.rec.fuel) * scale;
    const dCo2t = (dFuelKg * inputs.co2k) / 1000;
    const dDiv = Math.max(0, A.base.diversions - A.rec.diversions) * scale;
    const dMissed = Math.max(0, A.base.missedConn - A.rec.missedConn) * scale;
    const EUR_AED = 4.0, USD_AED = 3.6725;
    const delayAed = dDelayMin * inputs.eurMin * EUR_AED;
    const fuelAed = dFuelKg * inputs.fuelUsd * USD_AED;
    const fmtM = (v) => (v >= 1e6 ? 'AED ' + (v / 1e6).toFixed(1) + ' M' : 'AED ' + num(v / 1e3, 0) + ' k');
    out += '<div class="im-cards">' +
      '<div class="im-card"><div class="l">Aircraft-delay minutes avoided / yr</div><div class="v good">' + num(dDelayMin) + '</div><div class="s">≈ ' + fmtM(delayAed) + ' (delay cost)</div></div>' +
      '<div class="im-card"><div class="l">Fuel saved / yr</div><div class="v good">' + num(dFuelKg / 1000, 0) + ' t</div><div class="s">≈ ' + fmtM(fuelAed) + '</div></div>' +
      '<div class="im-card"><div class="l">CO₂ avoided / yr</div><div class="v good">' + num(dCo2t, 0) + ' t</div><div class="s">supports UAE Net Zero 2050</div></div>' +
      '<div class="im-card"><div class="l">Diversions avoided / yr</div><div class="v good">' + num(dDiv, 0) + '</div><div class="s">+ ' + num(dMissed, 0) + ' missed connections protected</div></div></div>' +
      '<p class="src" style="margin-top:8px">Method: mean per-event benchmark delta × (fog days × hours ÷ 3). Covers one airport and only the morning arrival bank modelled; EUR→AED 4.0 (approx.), USD→AED 3.6725 (peg). Sensitivity: halving the delay-cost input still leaves ' + fmtM(delayAed / 2 + fuelAed) + ' per year. All inputs are editable — these are planning estimates, not audited figures.</p>';
    el.innerHTML = out;
    bindInputs(el);
  }
  function bindInputs(el) {
    el.querySelectorAll('.im-inputs input').forEach((inp) => inp.addEventListener('change', () => { const v = parseFloat(inp.value); if (!isNaN(v) && v >= 0) { inputs[inp.dataset.k] = v; renderValue(); } }));
  }

  /* =========================================================
     3. 90-day pilot
     ========================================================= */
  const WS = [
    { n: 'MoU & governance (GCAA Innovation Team, sponsor)', a: 1, b: 14, c: '#e2b04a', o: 'GCAA Innovation' },
    { n: 'Data-sharing agreement: AODB / A-CDM / METAR / RVR', a: 5, b: 35, c: '#90a4ae', o: 'IT / Cyber + Airport AOC' },
    { n: 'Read-only digital twin (shadow mode)', a: 10, b: 30, c: '#26c6da', o: 'FalconAero' },
    { n: 'Baseline KPIs measured on live ops', a: 15, b: 30, c: '#4fc3f7', o: 'ANSP ops + FalconAero' },
    { n: 'Advisory mode — recommendations shown in parallel', a: 31, b: 60, c: '#26c6da', o: 'ANSP ops' },
    { n: 'Controller feedback, acceptance & NASA-TLX workload', a: 31, b: 60, c: '#b388ff', o: 'ANSP ops + FalconAero' },
    { n: 'Model recalibration on local data', a: 40, b: 60, c: '#4fc3f7', o: 'FalconAero' },
    { n: 'Safety case & hazard log (GCAA SMS)', a: 45, b: 75, c: '#ef5350', o: 'GCAA Safety + ANSP' },
    { n: 'Live human-in-the-loop advisory: stand allocation', a: 61, b: 85, c: '#66bb6a', o: 'Airport AOC' },
    { n: 'Evaluation & go / no-go to scale', a: 80, b: 90, c: '#e2b04a', o: 'GCAA leadership' }
  ];
  const MS = [{ d: 14, t: 'M1 MoU signed' }, { d: 30, t: 'M2 Shadow twin live' }, { d: 60, t: 'M3 ≥70% acceptance' }, { d: 75, t: 'M4 Safety case' }, { d: 90, t: 'M5 Go / no-go' }];

  function gantt() {
    const Wd = 980, L = 330, rowH = 24, T = 30, Hh = T + WS.length * rowH + 30;
    const X = (d) => L + ((Wd - L - 14) * (d - 1)) / 89;
    let g = '';
    [[1, 30, 'Days 1–30 · Shadow mode & data'], [31, 60, 'Days 31–60 · Advisory mode'], [61, 90, 'Days 61–90 · Validated pilot']].forEach((p, i) => {
      g += '<rect x="' + X(p[0]) + '" y="0" width="' + (X(p[1]) - X(p[0])) + '" height="' + (Hh - 18) + '" fill="' + (i % 2 ? 'rgba(255,255,255,.02)' : 'rgba(38,198,218,.04)') + '"/>';
      g += '<text x="' + (X(p[0]) + 6) + '" y="16" fill="#e2b04a" font-size="11.5" font-weight="700">' + p[2] + '</text>';
    });
    for (let d = 1; d <= 90; d += 7) g += '<text x="' + X(d) + '" y="' + (Hh - 4) + '" fill="#5f7598" font-size="9.5" text-anchor="middle">D' + d + '</text>';
    WS.forEach((w, i) => {
      const y = T + i * rowH;
      g += '<text x="' + (L - 8) + '" y="' + (y + 15) + '" fill="#c8d6ee" font-size="11" text-anchor="end">' + esc(w.n) + '</text>';
      g += '<rect x="' + X(w.a) + '" y="' + (y + 4) + '" width="' + Math.max(6, X(w.b) - X(w.a)) + '" height="' + (rowH - 9) + '" rx="4" fill="' + w.c + '" fill-opacity=".85"><title>' + esc(w.n + ' — D' + w.a + '–D' + w.b + ' · owner: ' + w.o) + '</title></rect>';
      g += '<text x="' + (X(w.a) + 5) + '" y="' + (y + 15) + '" fill="#06101e" font-size="9.5" font-weight="700">' + esc(w.o) + '</text>';
    });
    MS.forEach((m) => {
      g += '<line x1="' + X(m.d) + '" x2="' + X(m.d) + '" y1="22" y2="' + (Hh - 18) + '" stroke="#e2b04a" stroke-dasharray="3 3"/><polygon points="' + X(m.d) + ',22 ' + (X(m.d) + 5) + ',27 ' + X(m.d) + ',32 ' + (X(m.d) - 5) + ',27" fill="#e2b04a"><title>' + esc(m.t) + '</title></polygon>';
    });
    return FA.charts.svg(Wd, Hh, g);
  }

  const PHASES = [
    { t: 'Days 1–30 · Shadow mode & data', chip: 'no operational use', items: ['MoU with GCAA Innovation Team + one low-risk testbed airport (e.g. Sharjah or RAK), then DXB with dans', 'Data-sharing agreement: AODB, A-CDM milestones, METAR/RVR, stand master data', 'Deploy read-only digital twin on GCAA-approved cloud/on-prem', 'Measure baseline KPIs during real low-visibility events'], owners: 'GCAA Innovation · Airport AOC · IT/Cyber · FalconAero', kpis: 'Data completeness ≥ 95% · twin replay error < 5 min', exit: 'Twin reproduces ≥ 2 real events; cyber review passed' },
    { t: 'Days 31–60 · Advisory mode', chip: 'parallel display', items: ['Controllers & AOC see recommendations next to current tools — no operational use', 'Log accept / modify / reject with reasons (feeds model governance)', 'Measure fog-nowcast accuracy against observed RVR', 'Workload & trust: NASA-TLX + structured interviews'], owners: 'ANSP ops (dans / ADAC) · Airport AOC · FalconAero', kpis: 'Acceptance ≥ 70% · nowcast AUC ≥ 0.85 · no workload increase', exit: 'Supervisor panel rates advice useful & safe' },
    { t: 'Days 61–90 · Validated pilot', chip: 'human-in-the-loop', items: ['Live advisory on stand allocation first (lowest safety risk), runway sequencing stays advisory', 'Safety case & hazard log under GCAA SMS; AI never issues clearances', 'Measure stand conflicts, taxi holds, diversions vs baseline', 'Go / no-go to scale to DXB + DWC + network view'], owners: 'Airport AOC · GCAA Safety · GCAA leadership', kpis: '−30% stand conflicts · −20% holding · 0 safety occurrences attributable', exit: 'Leadership go-decision; scale plan & budget' }
  ];
  const RISKS = [
    ['Access to operational data (AODB, A-CDM, RVR)', 'Med', 'High', 'Start in shadow mode with read-only feeds; synthetic twin + open data until agreements signed; GCAA sponsor', 'GCAA Innovation'],
    ['Cyber-security of ops-network integration', 'Low', 'High', 'One-way data diode / read-only API, on-prem option, UAE IA standard controls, pen-test before advisory mode', 'IT / Cyber'],
    ['Controller trust & automation bias', 'Med', 'High', 'Explanations for every decision, alternatives shown, accept/modify/reject logged, training, no auto-execution', 'ANSP ops'],
    ['Regulatory acceptance / certification', 'Med', 'Med', 'Decision-support only (no clearances), GCAA SMS safety case, phased scope (stands → sequencing)', 'GCAA Safety'],
    ['Integration with existing A-CDM / AODB vendors', 'Med', 'Med', 'Standards-based interfaces (AIDX, ACRIS, SWIM); adapter layer; vendor-neutral', 'FalconAero'],
    ['Model drift / rare events', 'Med', 'Med', 'Monthly recalibration, calibration monitoring, fallback to current procedures, robustness stress-test per plan', 'FalconAero']
  ];

  /* =========================================================
     4–6. Business model, alignment, data sources
     ========================================================= */
  function bmc() {
    const box = (cls, h, items) => '<div class="' + cls + '"><h4>' + h + '</h4><ul>' + items.map((i) => '<li>' + esc(i) + '</li>').join('') + '</ul></div>';
    return '<div class="im-bmc">' +
      box('kp', 'Key partners', ['GCAA (sponsor, regulator, Innovation Team)', 'dans · Abu Dhabi Airports / ADAC', 'Dubai Airports · Sharjah Airport Authority · RAK', 'National Center of Meteorology (NCM)', 'Emirates · Etihad · flydubai · Air Arabia OCCs', 'UAE universities (validation, talent)']) +
      box('ka', 'Key activities', ['Digital-twin & optimisation R&D', 'Integration with AODB / A-CDM / AMAN', 'Safety case & model governance', 'Controller training']) +
      box('kr', 'Key resources', ['Unified recovery engine + fog nowcast IP', 'Historical ops & weather data', 'Aviation-ops + AI team']) +
      box('vp', 'Value propositions', ['One decision in < 1 s covering runway, stands, taxi, departures & diversions', 'Fewer diversions, holds & stand conflicts in fog', 'Explainable, auditable, human-in-the-loop AI', 'Innovation Sandbox: test ideas on the twin before live trials', 'Lower fuel & CO₂']) +
      box('cr', 'Customer relationships', ['Co-designed pilots', 'Dedicated ops-success team', 'Shared KPI dashboards with regulator']) +
      box('ch', 'Channels', ['GCAA-led national rollout', 'ACI / CANSO events, Airport Show Dubai', 'A-CDM / AODB vendor partnerships']) +
      box('cs', 'Customer segments', ['ANSPs (dans, ADAC/ANS)', 'Airport operators (UAE → GCC → MENA)', 'Airline operations control centres', 'Civil aviation regulators (sandbox licence)']) +
      box('co', 'Cost structure', ['Engineering & data science', 'Secure hosting (UAE-resident cloud / on-prem)', 'Certification & safety assurance', 'Integration projects']) +
      box('rs', 'Revenue streams', ['SaaS subscription per airport (tiered by movements)', 'Per-movement pricing for disruption days', 'Innovation Sandbox licence for regulators & innovation teams', 'Integration & training services']) +
      '</div>';
  }
  function pricing() {
    return '<table class="t" style="margin-top:12px"><thead><tr><th>Tier (indicative)</th><th>For</th><th>Includes</th><th>Indicative price</th></tr></thead><tbody>' +
      '<tr><td>Innovation Sandbox</td><td>Regulators, innovation teams, universities</td><td style="font-family:Inter">Digital twin, scenario & idea testing, KPI evidence reports</td><td>AED 120k / yr</td></tr>' +
      '<tr><td>Airport</td><td>Single airport / AOC</td><td style="font-family:Inter">Stand & taxi recovery, fog nowcast, explainability, audit log</td><td>AED 45k / month</td></tr>' +
      '<tr><td>Network</td><td>ANSP + multi-airport</td><td style="font-family:Inter">Runway sequencing, national diversion coordination, ATFM</td><td>Custom</td></tr>' +
      '</tbody></table><p class="src" style="margin-top:6px">Prices are indicative assumptions for discussion, not quotes. Market: the GCC has roughly 40+ commercial airports (approximate) and fast-growing hubs; integration via industry standards — IATA AIDX, ACI ACRIS, ICAO SWIM, A-CDM milestones — avoids replacing existing systems.</p>';
  }
  function alignment() {
    const items = [
      ['UAE National Strategy for Artificial Intelligence 2031', 'AI in priority sectors incl. transport & logistics; government AI adoption.'],
      ['UAE Charter for the Development & Use of AI (2024)', 'Human oversight, safety, transparency, accountability — built into HITL approval & audit chain.'],
      ['UAE Digital Government Strategy', 'Data-driven, proactive, integrated government services across entities.'],
      ['UAE Net Zero 2050', 'Less airborne holding, queueing and diversions → measurable fuel & CO₂ reduction.'],
      ['We the UAE 2031', 'Global competitiveness of UAE aviation hubs and logistics.'],
      ['ICAO GANP / ASBU & A-CDM', 'Collaborative decision-making, ATFM, surface management — FalconAero speaks these standards.']
    ];
    return '<div class="im-align">' + items.map((i) => '<div class="card"><b>' + esc(i[0]) + '</b><span class="muted small">' + esc(i[1]) + '</span></div>').join('') + '</div>';
  }
  function dataSources() {
    const rows = [];
    const add = (title, pub, url, use, badge, extra) => rows.push({ title, pub, url, use, badge, extra });
    add('OMDB (Dubai Intl) METAR history', 'Iowa Environmental Mesonet (archive of WMO METAR)', 'https://mesonet.agron.iastate.edu/request/download.phtml', 'Training & validating the fog-nowcast model; fog climatology', 'used');
    add('Live METAR — 7 UAE airports', 'NOAA Aviation Weather Center', 'https://aviationweather.gov/data/api/', 'Live weather panel & network fog probability', 'live');
    add('Live ADS-B traffic over the UAE', 'OpenSky Network', 'https://opensky-network.org', 'Real-time traffic layer on the network map', 'live');
    add('Weather model fallback', 'Open-Meteo', 'https://open-meteo.com', 'Fallback when METAR is unreachable', 'live');
    const OD = FA.openData;
    const ds = OD && Array.isArray(OD.datasets) ? OD.datasets : null;
    let h = '<div class="im-src">';
    const card = (r) => '<div class="card"><div><b>' + esc(r.title) + '</b> <span class="muted small">— ' + esc(r.pub || '') + '</span>' +
      (r.use ? '<div class="small muted">Used for: ' + esc(r.use) + '</div>' : '') + (r.extra || '') +
      (r.url ? '<div class="src"><a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.url) + '</a></div>' : '') + '</div>' +
      '<span class="im-badge ' + r.badge + '">' + (r.badge === 'used' ? 'USED' : r.badge === 'live' ? 'LIVE API' : 'PLANNED') + '</span></div>';
    rows.forEach((r) => { h += card(r); });
    if (ds && ds.length) {
      ds.forEach((d) => {
        if (!d) return;
        const figs = Array.isArray(d.figures) ? d.figures.filter(Boolean).slice(0, 4).map((f) => '<span class="tag">' + esc(f.label || '') + (f.value != null ? ': <b style="color:#e6eefb">' + esc(f.value) + '</b>' : '') + '</span>').join('') : '';
        const meta = [d.format, d.coverage, d.updated || d.lastUpdated].filter(Boolean).map(esc).join(' · ');
        h += card({ title: d.title || 'Dataset', pub: [d.publisher, d.portal].filter(Boolean).join(' · '), url: d.url, use: d.used_for || d.usedFor, badge: d.status === 'planned' ? 'plan' : 'used', extra: (meta ? '<div class="src">' + meta + '</div>' : '') + (figs ? '<div style="margin-top:4px">' + figs + '</div>' : '') });
      });
    } else {
      [['Bayanat — official UAE open data portal', 'FCSC', 'https://bayanat.ae'], ['Data.Dubai', 'Digital Dubai Authority', 'https://data.dubai/en'], ['Abu Dhabi Open Data Platform', 'ADDA / SCAD', 'https://data.abudhabi']].forEach((p) => {
        h += card({ title: p[0], pub: p[1], url: p[2], use: 'Air-transport statistics (movements, passengers) to calibrate demand — integration in progress', badge: 'plan' });
      });
    }
    h += '</div><p class="src" style="margin-top:8px">Where operational data is not public (stand-level occupancy, fuel on board, AODB milestones), FalconAero uses calibrated synthetic data and states it; the 90-day pilot replaces these with GCAA/airport feeds under a data-sharing agreement.</p>';
    return h;
  }

  function renderStatic() {
    root.querySelector('#imGantt').innerHTML = gantt() +
      '<div class="im-phases">' + PHASES.map((p) => '<div class="im-phase"><h3>' + esc(p.t) + '<span class="chip gold">' + esc(p.chip) + '</span></h3><ul>' + p.items.map((i) => '<li>' + esc(i) + '</li>').join('') + '</ul>' +
        '<div class="k">Owners</div><div class="small">' + esc(p.owners) + '</div><div class="k">KPIs</div><div class="small cy">' + esc(p.kpis) + '</div><div class="k">Exit criteria</div><div class="small">' + esc(p.exit) + '</div></div>').join('') + '</div>';
    root.querySelector('#imRisk').innerHTML = '<table class="t"><thead><tr><th>Risk</th><th>Likelihood</th><th>Impact</th><th>Mitigation</th><th>Owner</th></tr></thead><tbody>' +
      RISKS.map((r) => '<tr><td>' + esc(r[0]) + '</td><td class="' + (r[1] === 'Low' ? 'good' : 'warn') + '">' + r[1] + '</td><td class="' + (r[2] === 'High' ? 'bad' : 'warn') + '">' + r[2] + '</td><td style="font-family:Inter;color:#c8d6ee">' + esc(r[3]) + '</td><td style="font-family:Inter">' + esc(r[4]) + '</td></tr>').join('') + '</tbody></table>';
    root.querySelector('#imBmc').innerHTML = bmc() + pricing();
    root.querySelector('#imAlign').innerHTML = alignment();
    root.querySelector('#imData').innerHTML = dataSources();
  }

  FA.views.impact = {
    init() {
      if (!document.getElementById('fa-impact-css')) { const s = document.createElement('style'); s.id = 'fa-impact-css'; s.textContent = CSS; document.head.appendChild(s); }
    },
    mount(r) {
      root = r;
      root.innerHTML =
        '<div class="page-head"><div><h1>Impact & Roadmap</h1><p class="muted">Measured value, a 90-day path to a validated pilot with GCAA, and how FalconAero becomes a sustainable UAE-built product.</p></div>' +
        '<div class="head-actions"><button class="btn" id="imRun">⟳ Re-run benchmark</button></div></div>' +
        '<div class="panel"><div class="panel-h"><span>Benchmark — current practice vs FalconAero (Monte Carlo, live)</span><span class="chip cy">computed in your browser</span></div>' +
        '<div class="small muted" id="imProgLbl">Preparing benchmark…</div><div class="im-prog" id="imProg"><i></i></div><div id="imBench"></div></div>' +
        '<div class="panel"><div class="panel-h"><span>Annualised value estimate — DXB</span><span class="chip gold">editable assumptions</span></div><div id="imValue"></div></div>' +
        '<div class="panel"><div class="panel-h"><span>90-day pilot plan with GCAA</span><span class="chip">shadow → advisory → validated pilot</span></div><div id="imGantt" style="overflow-x:auto"></div></div>' +
        '<div class="panel"><div class="panel-h"><span>Risk register</span></div><div id="imRisk"></div></div>' +
        '<div class="panel"><div class="panel-h"><span>Business model canvas & commercialisation</span></div><div id="imBmc"></div></div>' +
        '<div class="grid-2"><div class="panel"><div class="panel-h"><span>Strategic alignment</span></div><div id="imAlign"></div></div>' +
        '<div class="panel"><div class="panel-h"><span>Data sources</span></div><div id="imData"></div></div></div>';
      root.querySelector('#imRun').addEventListener('click', runBenchmark);
      renderStatic();
      renderValue();
    },
    show() {
      if (!root) return;
      root.querySelector('#imData').innerHTML = dataSources();
      if (!FA.benchmark && !running) runBenchmark(); else { renderBench(); renderValue(); }
    },
    run: runBenchmark,
    _runOne: runOne,
    _aggregate: aggregate
  };
})(window.FA);
