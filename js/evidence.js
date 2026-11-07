/* FalconAero — "Data & Evidence" view: official UAE open data (GCAA via Bayanat), METAR fog climatology,
   the fog-impact study, the live data pipeline, and the data gaps we would request from partners. */
(function (FA) {
  'use strict';
  const U = FA.ui, C = FA.charts;
  let root = null;

  const css = `
  .ev-flow{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;align-items:stretch}
  .ev-step{background:rgba(0,0,0,.2);border:1px solid var(--line);border-radius:10px;padding:10px;position:relative}
  .ev-step h4{margin:0 0 6px;font-size:12px;color:#7ff1ff;text-transform:uppercase;letter-spacing:.06em}
  .ev-step ul{margin:0;padding-left:16px;font-size:11.5px;color:var(--muted)}
  .ev-step:not(:last-child)::after{content:'➜';position:absolute;right:-12px;top:42%;color:var(--gold);font-size:14px}
  .ev-insight{border-left:3px solid var(--gold);padding:8px 12px;background:rgba(226,176,74,.06);border-radius:0 8px 8px 0;font-size:13px}
  .ev-big{font-family:var(--mono);font-size:24px;font-weight:800}
  @media (max-width:1180px){.ev-flow{grid-template-columns:1fr 1fr}.ev-step::after{display:none}}`;

  function card(label, value, sub, color) {
    return '<div class="kpi" style="--kc:' + (color || 'var(--cyan)') + '"><div class="l">' + U.esc(label) + '</div><div class="v">' + value + '</div><div class="d src">' + sub + '</div></div>';
  }

  function render() {
    const O = FA.openData;
    if (!root) return;
    if (!O || !O.movements) { root.innerHTML = '<div class="panel">Open data bundle not loaded (js/opendata.js).</div>'; return; }
    const mv = O.movements, px = O.passengers, yrs = mv.years;
    const y23 = yrs.indexOf(2023), p23 = px.years.indexOf(2023);
    const dubai23 = mv.emirates.Dubai ? mv.emirates.Dubai.total[y23] : 0;
    const uaePax23 = Object.values(px.emirates).reduce((a, e) => a + (e.total[p23] || 0), 0);
    const intl25 = O.intlMonthly.filter((r) => r[0] === 2025).reduce((a, r) => a + r[2] + r[3], 0);
    const arrPerHour = dubai23 / 2 / 365 / 24;
    const simRate = FA.state.inst ? FA.state.inst.arrivals.length / ((Math.max(...FA.state.inst.arrivals.map((f) => f.eta)) - Math.min(...FA.state.inst.arrivals.map((f) => f.eta))) / 60) : null;
    const fi = O.fogImpact, fog = O.fog;
    const fogYears = Object.keys(fog.fogDaysPerYear).sort();

    let h = '<div class="page-head"><div><h1>Data & Evidence: built on official UAE open data</h1><p class="muted">FalconAero fuses official GCAA statistics (published on Bayanat), 11 years of real METAR observations and live feeds. Every chart below is drawn from the bundled datasets, nothing is typed in by hand.</p></div><div class="head-actions"><span class="chip cy">' + O.datasets.filter((d) => d.status === 'used').length + ' sources in use</span><span class="chip">licence: CC BY-SA 4.0 · © GCAA</span></div></div>';

    h += '<div class="grid-4">' +
      card('Aircraft movements · Dubai 2023', U.num(dubai23), 'GCAA via Bayanat', '#e2b04a') +
      card('Passengers · UAE 2023', (uaePax23 / 1e6).toFixed(1) + ' M', 'GCAA via Bayanat', '#26c6da') +
      card('International movements · UAE 2025', U.num(intl25), 'GCAA / Sheikh Zayed ANC via Bayanat', '#b388ff') +
      card('Fog days at OMDB (2015–2025)', Object.values(fog.fogDaysPerYear).reduce((a, b) => a + b, 0), 'computed from METAR archive', '#ffb300') + '</div>';

    // Calibration insight
    h += '<div class="panel"><div class="panel-h">How the data calibrates the digital twin</div><div class="ev-insight">GCAA reports <b>' + U.num(dubai23) + '</b> aircraft movements in Dubai in 2023 ≈ <b>' + arrPerHour.toFixed(1) + ' arrivals/hour</b> averaged over 24 h. The simulated morning bank runs at <b>' + (simRate ? simRate.toFixed(1) : '—') + ' arrivals/hour</b>, i.e. a realistic peak-bank load, not an invented one. Passenger loads and transfer shares in the simulation are scaled to GCAA passenger totals (Dubai ' + ((px.emirates.Dubai ? px.emirates.Dubai.total[p23] : 0) / 1e6).toFixed(1) + ' M in 2023).</div></div>';

    // charts row 1
    const emirs = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ras Al Khaimah', 'Fujairah'].filter((e) => mv.emirates[e]);
    const colors = { Dubai: '#e2b04a', 'Abu Dhabi': '#26c6da', Sharjah: '#66bb6a', 'Ras Al Khaimah': '#b388ff', Fujairah: '#ff8a65' };
    const mvChart = C.line(emirs.map((e) => ({ name: e, color: colors[e], points: yrs.map((y, i) => [y, mv.emirates[e].total[i] / 1000]) })), { w: 560, h: 240, xMin: yrs[0], xMax: yrs[yrs.length - 1], xTicks: yrs.length - 1, xFmt: (v) => "'" + String(Math.round(v)).slice(2), yFmt: (v) => Math.round(v) + 'k' });
    const months = O.intlMonthly;
    const mPts = months.map((r) => [r[0] + (r[1] - 0.5) / 12, (r[2] + r[3]) / 1000]);
    const bands = [];
    for (let y = months[0][0]; y <= months[months.length - 1][0]; y++) bands.push({ x0: y - 1 / 12, x1: y + 2 / 12, color: 'rgba(255,179,0,.07)' });
    const intlChart = C.line([{ name: 'International movements / month (k)', color: '#b388ff', points: mPts, area: true }], { w: 560, h: 240, xMin: months[0][0], xMax: months[months.length - 1][0] + 1, xTicks: months[months.length - 1][0] + 1 - months[0][0], xFmt: (v) => String(Math.round(v)), yFmt: (v) => Math.round(v) + 'k', bands, noLegend: true });
    h += '<div class="grid-2"><div class="panel"><div class="panel-h"><span>Aircraft movements per emirate (thousands)</span><span class="src">GCAA · Bayanat · ' + yrs[0] + '–' + yrs[yrs.length - 1] + '</span></div>' + mvChart + '</div>' +
      '<div class="panel"><div class="panel-h"><span>UAE international movements per month</span><span class="src">GCAA · Bayanat · amber = Dec–Feb fog season</span></div>' + intlChart + '<div class="small muted">Winter, the fog season, is also one of the busiest periods of the year, so low-visibility disruption hits when the network has the least slack.</div></div></div>';

    // fog climatology + impact
    const MON = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    const fm = FA.fogModel && FA.fogModel.climatology && FA.fogModel.climatology.OMDB;
    const climBars = C.bars(MON.map((m, i) => ({ label: m, values: [fog.fogDaysByMonth[i]].concat(fm && fm.fogDaysByMonth ? [fm.fogDaysByMonth[i]] : []) })), ['METAR fog days / month'].concat(fm && fm.fogDaysByMonth ? ['Model climatology'] : []), { w: 560, h: 220, labels: true, colors: ['#ffb300', '#26c6da'] });
    const yearBars = C.bars(fogYears.map((y) => ({ label: "'" + y.slice(2), values: [fog.fogDaysPerYear[y]] })), ['Fog days per year at OMDB'], { w: 560, h: 200, labels: true, colors: ['#ffb300'] });
    h += '<div class="grid-2"><div class="panel"><div class="panel-h"><span>When does fog hit Dubai?</span><span class="src">OMDB METAR · Iowa Environmental Mesonet · ' + fog.years[0] + '–' + fog.years[fog.years.length - 1] + '</span></div>' + climBars + yearBars + '<div class="small muted">Fog days vary widely from year to year (' + Math.min(...Object.values(fog.fogDaysPerYear)) + '–' + Math.max(...Object.values(fog.fogDaysPerYear)) + '), so planning on averages fails. Cross-check: FCSC/NCM official dataset "Number of Fog Days by Station and Month" (2017) shows the same pattern, with Abu Dhabi foggier than Dubai.</div></div>';

    h += '<div class="panel"><div class="panel-h"><span>Fog-impact study: official GCAA daily movements × real fog days</span><span class="chip gold">original analysis</span></div>' +
      '<div class="grid-3" style="margin-bottom:8px"><div class="card"><div class="src">OMDB fog days analysed</div><div class="ev-big">' + fi.nFogDays + '</div><div class="src">' + U.esc(fi.period) + '</div></div>' +
      '<div class="card"><div class="src">UAE int\'l arrivals vs matched days</div><div class="ev-big ' + (fi.arrPct < 0 ? 'warn' : '') + '">' + (fi.arrPct > 0 ? '+' : '') + fi.arrPct.toFixed(1) + '%</div><div class="src">departures ' + fi.depPct.toFixed(1) + '%</div></div>' +
      '<div class="card"><div class="src">Worst fog day</div><div class="ev-big bad">' + fi.worst[0].pct + '%</div><div class="src">' + fi.worst[0].d + ' · ' + fi.worst[0].fogHours + ' h of fog</div></div></div>' +
      '<div class="ev-insight"><b>Finding:</b> on a typical fog day the UAE still handles ~99% of its international arrivals. Flights are rarely cancelled; they are <b>delayed, held and diverted</b>. Public reports confirm it: <b>19 diversions</b> at DXB on 20 Nov 2025 and <b>23</b> on 3 Jan 2026. Daily totals hide that cost, which is why FalconAero works at the minute-by-minute decision level (holding, stands, diversions), where the damage happens.</div>' +
      '<table class="t" style="margin-top:10px"><tr><th>Worst fog days</th><th>Fog hours</th><th>Arrivals</th><th>Matched baseline</th><th>Δ</th></tr>' + fi.worst.slice(0, 6).map((w) => '<tr><td>' + w.d + '</td><td>' + w.fogHours + '</td><td>' + U.num(w.arr) + '</td><td>' + U.num(w.arrBase) + '</td><td class="bad">' + w.pct + '%</td></tr>').join('') + '</table>' +
      '<details style="margin-top:8px"><summary class="small muted" style="cursor:pointer">Method</summary><p class="small muted" style="margin-top:6px">' + U.esc(fi.method) + ' Reproduce with <span class="mono">node tools/build_opendata.cjs</span>.</p></details>' +
      '<div class="src" style="margin-top:6px">' + O.events.map((e) => '<a href="' + e.url + '" target="_blank" rel="noopener">' + e.date + ' · ' + U.esc(e.source) + '</a>').join(' · ') + '</div></div></div>';

    // pipeline
    h += '<div class="panel"><div class="panel-h">Data pipeline: from open data to a decision</div><div class="ev-flow">' +
      step('1 · Sources', ['GCAA statistics (Bayanat)', 'METAR history (IEM) + live METAR (NOAA AWC)', 'Live ADS-B (OpenSky)', 'Open-Meteo live weather', 'Pilot: AODB, A-CDM, RVR sensors']) +
      step('2 · Ingestion', ['Bundled official XLSX → JSON (build script)', 'GitHub Action snapshots every 30 min', 'CORS-enabled APIs fetched in-browser', 'Cached for offline demo']) +
      step('3 · Models', ['Fog nowcast (logistic regression, time-split validated)', 'Capacity model (ICAO Doc 4444 spacing, LVP)', 'Unified recovery optimiser']) +
      step('4 · Decision', ['3 ranked plans + explanation', 'Human approve / modify / reject', 'Copilot briefings EN/AR']) +
      step('5 · Learning', ['Hash-chained audit log', 'Override feedback → model review', 'Innovation Sandbox evidence packs']) + '</div></div>';

    // catalogue
    h += '<div class="panel"><div class="panel-h">Data catalogue</div><table class="t"><tr><th>Dataset</th><th>Publisher</th><th>Coverage</th><th>Updated</th><th>Used for</th><th>Status</th></tr>' +
      O.datasets.map((d) => '<tr><td style="font-family:inherit;color:var(--text)"><a href="' + d.url + '" target="_blank" rel="noopener">' + U.esc(d.title) + '</a><div class="src">' + U.esc(d.portal) + ' · ' + U.esc(d.format) + '</div></td><td style="font-family:inherit">' + U.esc(d.publisher) + '</td><td style="font-family:inherit">' + U.esc(d.coverage) + '</td><td>' + U.esc(d.updated) + '</td><td style="font-family:inherit">' + U.esc(d.used_for) + '</td><td><span class="chip ' + (d.status === 'used' ? 'live' : '') + '">' + d.status + '</span></td></tr>').join('') + '</table></div>';

    // gaps
    h += '<div class="panel"><div class="panel-h">Data gaps and what we will request in the 90-day pilot</div><table class="t"><tr><th>Data needed</th><th>Owner</th><th>Why</th><th>Until then</th></tr>' +
      gap('Stand-level AODB / RMS schedule, stand codes & equipment status', 'Dubai Airports / Abu Dhabi Airports', 'Real stand allocation and outage handling', 'Stylised stand layout, synthetic schedule calibrated to GCAA volumes') +
      gap('A-CDM milestones (TOBT, TSAT, EXOT, ELDT)', 'Airport operator + dans / ANSP', 'Departure gate-holding and taxi times', 'Geometry-based taxi times; TSAT logic per EUROCONTROL A-CDM') +
      gap('RVR sensor feeds + NCM fog observations', 'dans / NCM', 'Higher-resolution fog nowcast', 'Hourly METAR history (2015–2025)') +
      gap('Arrival manager (AMAN) ETAs & fuel status', 'ANSP / airlines OCC', 'Fuel-aware sequencing', 'Synthetic fuel endurance distribution') +
      gap('Daily movements after Apr-2023 per airport', 'GCAA', 'Extend fog-impact study per airport', 'UAE-wide daily series 1998–2023') + '</table><div class="small muted" style="margin-top:6px">All requests go through the portals\' Data Request Forms and a GCAA data-sharing MoU. No personal passenger data is needed; FalconAero uses flight-level operational data only (UAE PDPL-aligned).</div></div>';

    root.innerHTML = h;
  }
  function step(t, items) { return '<div class="ev-step"><h4>' + U.esc(t) + '</h4><ul>' + items.map((i) => '<li>' + U.esc(i) + '</li>').join('') + '</ul></div>'; }
  function gap(a, b, c, d) { return '<tr><td style="font-family:inherit;color:var(--text)">' + U.esc(a) + '</td><td style="font-family:inherit">' + U.esc(b) + '</td><td style="font-family:inherit">' + U.esc(c) + '</td><td style="font-family:inherit">' + U.esc(d) + '</td></tr>'; }

  FA.views.data = {
    mount(r) {
      root = r;
      if (!document.getElementById('fa-ev-css')) { const s = document.createElement('style'); s.id = 'fa-ev-css'; s.textContent = css; document.head.appendChild(s); }
    },
    show: render
  };
})(window.FA);
