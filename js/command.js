/* FalconAero — Operations Control dashboard (single screen).
   Professional ops-console presentation: flat panels, status colours only, standard terminology. */
(function (FA) {
  'use strict';
  const D = FA.data, E = FA.engine, C = FA.charts, U = FA.ui;
  const $ = (s) => document.querySelector(s);
  const OPT = ['balanced', 'mindelay', 'safety'];
  let phase = 'idle';            // idle | computing | choose | active
  let pick = null;
  let disp = {};
  let lastMin = -1, lastFog = -99;

  const SCN = [['normal', 'Normal'], ['fog', 'Fog / LVP'], ['sand', 'Sandstorm'], ['runway', 'Runway closure'], ['storm', 'Combined event']];
  const shownPlanId = () => (FA.map.override === 'baseline' ? 'baseline' : FA.state.active);
  const shownPlan = () => FA.state.plans[shownPlanId()];
  const ICON = {
    play: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor"/></svg>'
  };
  const fmtT = D.fmt;

  /* ---------------- map hosting ---------------- */
  function hostMap(toCmd) {
    const box = document.querySelector('.map-box');
    if (!box) return;
    if (toCmd) { if (box.parentElement !== $('#cmdMapSlot')) $('#cmdMapSlot').appendChild(box); }
    else {
      const wrap = document.querySelector('#view-ops .map-wrap'), bar = document.querySelector('#view-ops .sim-bar');
      if (wrap && box.parentElement !== wrap) wrap.insertBefore(box, bar);
    }
  }

  /* ---------------- header ---------------- */
  function renderScn() {
    const S = FA.state;
    $('#cmdScn').innerHTML = SCN.map(([id, nm]) => '<button data-id="' + id + '" class="' + (S.scenarioId === id ? 'on' : '') + '">' + nm + '</button>').join('');
    document.querySelectorAll('#cmdScn button').forEach((b) => b.onclick = () => { const play = FA.state.playing; FA.app.loadScenario(b.dataset.id); if (play) FA.app.play(true); });
  }

  function renderStatus(t) {
    const S = FA.state, c = E.conditions(S.inst, t), p = [];
    const badge = (cls, txt) => '<span class="bdg ' + cls + '"><i></i>' + txt + '</span>';
    if (c.lvp) p.push(badge('warn', 'LVP · CAT III · RVR ' + c.rvr + ' m'));
    else if (c.degraded) p.push(badge('warn', 'Reduced visibility · ' + c.vis + ' m'));
    if (c.rwyNClosed) p.push(badge('crit', 'RWY 12L/30R closed'));
    const blocked = (FA.map.lastAircraft || []).filter((a) => a.status === 'waiting' && a.conflict).length;
    if (blocked) p.push(badge('crit', blocked + ' aircraft awaiting stand'));
    if (shownPlanId() !== 'baseline') p.push(badge('info', 'Recovery plan active'));
    if (!p.length) p.push(badge('ok', 'Normal operations'));
    $('#cmdStatus').innerHTML = p.join('');
  }

  function renderHqLive() {
    const L = FA.live, el = $('#hqLive');
    if (!el) return;
    if (!L || !L.metar) { el.innerHTML = '<i class="off"></i>Simulation data'; return; }
    const om = L.metar.OMDB;
    const tm = om && om.time ? new Date(om.time).toISOString().slice(11, 16) + 'Z' : '';
    el.innerHTML = '<i></i>Live: ' + (L.kind === 'metar' ? 'METAR ' + tm : 'weather') + (L.adsb ? ' · ' + L.adsb.length + ' aircraft' : '');
    el.title = (L.source || '') + (L.cached ? ' (cached)' : '');
  }

  /* ---------------- recovery control ---------------- */
  function renderRec() {
    const S = FA.state, k = S.plans.baseline.kpi, b = $('#cmdGo'), meta = $('#cmdRecMeta'), act = $('#cmdRecActive');
    const issues = k.conflicts + k.diversions > 0 || k.avgDelayAll > 10;
    b.disabled = false; b.className = 'd-btn';
    act.hidden = true;
    if (phase === 'active') {
      const p = S.plans[S.active];
      act.hidden = false;
      act.innerHTML = '<span class="dot ok"></span><b>' + U.esc(p.cfg.short) + ' plan active</b><small>Approved ' + fmtT(S.approved.at) + ' by duty supervisor</small>';
      b.textContent = 'Reset to baseline'; b.classList.add('ghost', 'sm');
      meta.innerHTML = '<span class="tx-ok">In execution</span>';
    } else if (phase === 'choose') {
      b.textContent = 'Approve ' + S.plans[pick].cfg.short + ' plan'; b.classList.add('ok');
      meta.innerHTML = '<span class="tx-info">Awaiting approval</span>';
    } else if (phase === 'computing') {
      b.textContent = 'Computing…'; b.disabled = true; b.classList.add('primary');
      meta.textContent = '';
    } else {
      b.textContent = 'Generate recovery options'; b.classList.add('primary');
      meta.innerHTML = issues ? '<span class="tx-crit">Action required</span>' : '<span class="tx-muted">Monitoring</span>';
    }
    $('#cmdCmp').hidden = phase !== 'active';
  }

  function onGo() {
    const S = FA.state;
    if (phase === 'idle') return recover();
    if (phase === 'choose') return approve();
    if (phase === 'active') { const t = S.t, play = S.playing; FA.app.loadScenario(S.scenarioId, S.seed, { t }); if (play) FA.app.play(true); }
  }

  function recover() {
    const S = FA.state;
    phase = 'computing'; renderRec();
    const steps = ['Data fusion: METAR, AODB, A-CDM, stand status', 'Visibility and capacity forecast', 'Arrival sequencing (' + S.inst.arrivals.length + ' flights)', 'Runway configuration', 'Stand allocation and towing', 'Taxi route deconfliction', 'Diversion options across UAE network', 'Robustness test and scoring'];
    const ov = $('#cmdOverlay');
    ov.hidden = false;
    ov.innerHTML = '<div class="d-modal"><div class="d-mh">Computing recovery options</div><div class="d-prog"><i id="cmdProg"></i></div><ul class="d-steps">' + steps.map((s) => '<li>' + s + '</li>').join('') + '</ul></div>';
    const els = ov.querySelectorAll('.d-steps li'), bar = $('#cmdProg');
    els.forEach((e, i) => setTimeout(() => { e.classList.add('done'); bar.style.width = ((100 * (i + 1)) / els.length) + '%'; }, 110 + i * 130));
    setTimeout(() => FA.app.generate(), 200 + steps.length * 130);
  }

  function chooser() {
    const S = FA.state;
    pick = pick || S.rec;
    const ms = OPT.reduce((a, id) => a + S.plans[id].ms, 0);
    const row = (id, base) => {
      const p = S.plans[id], k = p.kpi;
      return '<tr class="' + (base ? 'base' : (id === pick ? 'sel' : '')) + '" data-id="' + (base ? '' : id) + '"><td>' + (base ? '' : '<span class="radio' + (id === pick ? ' on' : '') + '"></span>') + '</td><td class="nm">' + (base ? 'Current practice' : U.esc(p.cfg.short)) + (id === S.rec && !base ? ' <span class="tag rec">Recommended</span>' : '') + '</td><td>' + k.scores.overall.toFixed(1) + '</td><td>' + k.avgDelayAll.toFixed(1) + ' min</td><td>' + k.diversions + '</td><td>' + k.conflicts + '</td><td>' + Math.round(k.co2 / 1000) + ' t</td><td>' + k.throughput + '</td></tr>';
    };
    const ov = $('#cmdOverlay');
    ov.hidden = false;
    ov.innerHTML = '<div class="d-modal wide"><div class="d-mh">Recovery options<span class="d-meta">3 options · computed in ' + Math.round(ms) + ' ms · stress-tested</span></div>' +
      '<table class="d-table opt"><thead><tr><th></th><th>Option</th><th>Score</th><th>Avg delay</th><th>Diversions</th><th>Conflicts</th><th>CO₂</th><th>Landed by 08:00</th></tr></thead><tbody>' +
      OPT.map((id) => row(id, false)).join('') + row('baseline', true) + '</tbody></table>' +
      '<div class="d-mf"><span class="tx-muted">Decision support only. Instructions are issued by ATC.</span><span><button class="d-btn ghost" id="cmdCancel">Reject</button> <button class="d-btn ok" id="cmdApprove">Approve ' + U.esc(S.plans[pick].cfg.short) + ' plan</button></span></div></div>';
    ov.querySelectorAll('tr[data-id]').forEach((r) => { if (r.dataset.id) r.onclick = () => { pick = r.dataset.id; chooser(); renderRec(); }; });
    $('#cmdApprove').onclick = approve;
    $('#cmdCancel').onclick = () => FA.app.reject('supervisor rejected options');
  }
  function approve() { FA.app.approve(pick || FA.state.rec, 'Duty supervisor'); }

  /* ---------------- KPIs ---------------- */
  const KPI = [
    { k: 'avgDelayAll', l: 'Average delay', u: 'min', dp: 1, low: true, bad: (v) => v > 10 },
    { k: 'diversions', l: 'Diversions', u: '', dp: 0, low: true, bad: (v) => v > 0 },
    { k: 'conflicts', l: 'Conflicts', u: '', dp: 0, low: true, bad: (v) => v > 0 },
    { k: 'minFuelMargin', l: 'Min. fuel margin', u: 'min', dp: 0, low: false, bad: (v) => v < 5 },
    { k: 'co2', l: 'CO₂ (disruption)', u: 't', dp: 0, low: true, f: (v) => v / 1000, bad: (v) => v > 250 },
    { k: 'missedConn', l: 'Missed connections', u: 'pax', dp: 0, low: true, bad: (v) => v > 20 }
  ];
  function fmt(v, x) { return x.dp ? v.toFixed(x.dp) : Math.round(v).toLocaleString('en-US'); }
  function renderKpis() {
    const S = FA.state, pid = shownPlanId(), k = S.plans[pid].kpi, kb = S.plans.baseline.kpi, plan = pid !== 'baseline';
    if (!$('#cmdKpis').children.length) $('#cmdKpis').innerHTML = KPI.map((x) => '<div class="kp" data-k="' + x.k + '"><div class="kp-l">' + x.l + '</div><div class="kp-v"><span class="n">—</span><span class="u">' + x.u + '</span></div><div class="kp-s"></div></div>').join('');
    KPI.forEach((x) => {
      const el = document.querySelector('.kp[data-k="' + x.k + '"]');
      const val = x.f ? x.f(k[x.k]) : k[x.k], base = x.f ? x.f(kb[x.k]) : kb[x.k];
      el.classList.remove('st-crit', 'st-ok');
      let sub;
      if (plan) {
        const better = x.low ? val < base : val > base, same = Math.abs(val - base) < 1e-9;
        const pc = base ? Math.round((100 * (val - base)) / Math.abs(base)) : 0;
        if (!same) el.classList.add(better ? 'st-ok' : 'st-crit');
        sub = 'Baseline ' + fmt(base, x) + ' · <span class="' + (same ? 'tx-muted' : better ? 'tx-ok' : 'tx-crit') + '">' + (same ? 'no change' : (pc > 0 ? '+' : '−') + Math.abs(pc) + '%') + '</span>';
      } else {
        if (x.bad(val)) el.classList.add('st-crit');
        sub = '<span class="tx-muted">Projected, no action</span>';
      }
      el.querySelector('.kp-s').innerHTML = sub;
      tween(el.querySelector('.n'), x, disp[x.k] != null ? disp[x.k] : val, val);
      disp[x.k] = val;
    });
  }
  function tween(el, x, from, to) {
    const t0 = performance.now(), dur = 600;
    const step = (now) => { const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(from + (to - from) * e, x); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  /* ---------------- airfield counters ---------------- */
  function renderLive() {
    const ac = FA.map.lastAircraft || [];
    const n = (f) => ac.filter(f).length;
    const items = [
      ['Airborne', n((a) => ['air', 'final', 'holding', 'diverting', 'takeoff'].includes(a.status)), ''],
      ['Holding', n((a) => a.status === 'holding'), 'warn'],
      ['Taxiing', n((a) => /taxi|queue|tow|rollout|hold-short/.test(a.status)), ''],
      ['On stand', n((a) => a.status === 'parked'), ''],
      ['Awaiting stand', n((a) => a.status === 'waiting' && a.conflict), 'crit']
    ];
    $('#cmdLive').innerHTML = items.filter((i, j) => j < 4 || i[1] > 0).map(([l, v, c]) => '<span class="' + (v && c ? c : '') + '"><b>' + v + '</b>' + l + '</span>').join('');
  }

  /* ---------------- visibility & fog forecast ---------------- */
  function renderFog(t) {
    const S = FA.state, inst = S.inst, c = E.conditions(inst, t), o = FA.weather.obsAt(inst, t), nc = FA.weather.nowcast(inst, t);
    const pts = [];
    for (let k = 0; k <= 180; k += 10) pts.push([t + k, FA.weather.nowcast(inst, Math.min(530, t + k)).p * 100]);
    const cat = c.lvp ? ['CAT III', 'crit'] : o.visM < 800 ? ['CAT II', 'warn'] : o.visM < 5000 ? ['CAT I', 'warn'] : ['VMC', 'ok'];
    const p = Math.round(nc.p * 100), pc = p >= 60 ? 'crit' : p >= 30 ? 'warn' : 'ok';
    const L = FA.live && FA.live.metar && FA.live.metar.OMDB;
    $('#cmdFog').innerHTML = '<div class="d-ph"><span>Visibility forecast</span><span class="tag ' + cat[1] + '">' + cat[0] + '</span></div><div class="d-pb">' +
      '<div class="fog-top"><div><div class="big">' + (c.rvr ? c.rvr + '<small>m RVR</small>' : (o.visM >= 9999 ? '10<small>km+ vis</small>' : o.visM + '<small>m vis</small>')) + '</div><div class="sub">' + o.tempC.toFixed(0) + '/' + o.dewC.toFixed(0) + ' °C · ' + (o.windKt < 3 ? 'calm' : o.windKt + ' kt') + '</div></div>' +
      '<div class="fog-p"><div class="lbl">Fog probability, 60 min</div><div class="val tx-' + pc + '">' + p + '%</div><div class="mbar"><i class="bg-' + pc + '" style="width:' + p + '%"></i></div></div></div>' +
      C.line([{ color: '#5b8def', points: pts, area: true }], { w: 280, h: 58, L: 16, yMax: 100, xMin: t, xMax: t + 180, xTicks: 3, xFmt: fmtT, yFmt: () => '', noLegend: true, hlines: [{ y: 30, color: '#b58a1c' }] }) +
      (L ? '<div class="metar-line" title="' + U.esc(L.raw || '') + '">OMDB live · ' + (L.tempC != null ? Math.round(L.tempC) + '/' + Math.round(L.dewC) + ' °C · ' : '') + 'vis ' + (L.visM == null ? '—' : L.visM >= 9999 ? '10 km+' : Math.round(L.visM) + ' m') + (L.fogP != null ? ' · fog ' + Math.round(L.fogP * 100) + '%' : '') + '</div>' : '') +
      '</div>';
  }

  /* ---------------- resources ---------------- */
  function renderRes(t) {
    const S = FA.state, inst = S.inst, plan = shownPlan(), c = E.conditions(inst, t);
    const win = (a) => a >= t - 30 && a < t + 30;
    const mixed = c.rwyNClosed || (plan.mixedWins || []).some((w) => t >= w[0] && t < w[1]);
    const nLand = plan.seq.filter((s) => s.rwy === 'N' && win(s.land)).length;
    const sMov = plan.seq.filter((s) => s.rwy === 'S' && win(s.land)).length + plan.deps.filter((d) => win(d.ttot)).length;
    const capN = c.rwyNClosed ? 0 : 60 / E.arrSep(inst, { wake: 'H' }, { wake: 'H' }, t, 0, false);
    const capS = mixed ? (c.lvp ? 26 : 36) : 60 / E.depInterval(inst, t, plan.mixedWins);
    let occ = 0, avail = 0;
    plan.tl.forEach((ivs) => { const cur = ivs.find((iv) => t >= iv.start && t < iv.end); if (cur && cur.kind === 'outage') return; avail++; if (cur) occ++; });
    const moving = (FA.map.lastAircraft || []).filter((a) => /taxi|rollout|hold-short|queue|tow|waiting/.test(a.status)).length;
    const capT = c.lvp ? 12 : 18;
    const row = (n, mode, mcls, u, detail) => {
      const pc = Math.round(Math.min(1.5, u) * 100), cls = mode === 'CLOSED' ? 'crit' : u >= 0.95 ? 'crit' : u >= 0.75 ? 'warn' : 'ok';
      return '<tr><td class="nm">' + n + '</td><td><span class="tag ' + mcls + '">' + mode + '</span></td><td class="bar"><div class="mbar"><i class="bg-' + cls + '" style="width:' + (mode === 'CLOSED' ? 100 : Math.min(100, pc)) + '%"></i></div></td><td class="num tx-' + cls + '">' + (mode === 'CLOSED' ? '—' : pc + '%') + '</td><td class="num tx-muted">' + detail + '</td></tr>';
    };
    $('#cmdRes').innerHTML = '<div class="d-ph"><span>Runways and resources</span><span class="d-meta">±30 min</span></div><div class="d-pb"><table class="d-table res">' +
      row('RWY 12L/30R', c.rwyNClosed ? 'CLOSED' : 'ARR', c.rwyNClosed ? 'crit' : 'neutral', capN ? nLand / capN : 0, nLand + '/' + Math.round(capN)) +
      row('RWY 12R/30L', mixed ? 'MIXED' : 'DEP', mixed ? 'info' : 'neutral', sMov / capS, sMov + '/' + Math.round(capS)) +
      row('Stands', 'GATES', 'neutral', occ / Math.max(1, avail), occ + '/' + avail) +
      row('Taxiways', 'MOVE', 'neutral', moving / capT, moving + ' a/c') + '</table></div>';
  }

  /* ---------------- baseline vs plan ---------------- */
  function renderEval() {
    const S = FA.state, el = $('#cmdEval');
    const ai = S.plans[S.active !== 'baseline' ? S.active : S.rec], b = S.plans.baseline;
    const M = [
      ['Avg delay (min)', (k) => k.avgDelayAll, 1, true], ['Conflicts', (k) => k.conflicts, 0, true], ['Taxi conflicts', (k) => k.taxiConflicts, 0, true],
      ['Diversions', (k) => k.diversions, 0, true], ['CO₂ (t)', (k) => k.co2 / 1000, 0, true], ['Landed by 08:00', (k) => k.throughput, 0, false]
    ];
    el.innerHTML = '<div class="d-ph"><span>Baseline vs ' + U.esc(ai.cfg.short) + '</span><span class="d-meta">' + (S.approved ? 'approved plan' : 'projection') + '</span></div><div class="d-pb"><table class="d-table ev"><thead><tr><th>Metric</th><th>Baseline</th><th>Plan</th><th>Δ</th></tr></thead><tbody>' +
      M.map(([l, f, dp, low]) => {
        const vb = f(b.kpi), va = f(ai.kpi), d = va - vb, better = low ? d < 0 : d > 0;
        const pc = vb ? Math.round((100 * d) / Math.abs(vb)) : null;
        return '<tr><td class="nm">' + l + '</td><td class="num">' + (dp ? vb.toFixed(dp) : Math.round(vb)) + '</td><td class="num">' + (dp ? va.toFixed(dp) : Math.round(va)) + '</td><td class="num ' + (Math.abs(d) < 1e-9 ? 'tx-muted' : better ? 'tx-ok' : 'tx-crit') + '">' + (Math.abs(d) < 1e-9 ? '—' : pc != null ? (pc > 0 ? '+' : '−') + Math.abs(pc) + '%' : (d > 0 ? '+' : '') + Math.round(d)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ---------------- UAE network ---------------- */
  const UAE = [[51.6, 24.1], [52.0, 24.0], [52.6, 24.2], [53.4, 24.1], [54.1, 24.15], [54.4, 24.3], [54.6, 24.45], [55.0, 24.9], [55.35, 25.32], [55.55, 25.52], [55.85, 25.72], [56.05, 26.05], [56.15, 25.85], [56.27, 25.62], [56.36, 25.15], [56.37, 24.97], [56.1, 24.75], [55.85, 24.6], [55.95, 24.3], [55.8, 24.05], [55.5, 23.95], [55.6, 23.6], [55.2, 22.7], [54.0, 22.6], [52.6, 22.9], [51.6, 24.1]];
  function renderNet() {
    const S = FA.state, plan = shownPlan(), net = E.networkState(S.inst);
    const W = 320, H = 150, P = (lon, lat) => [((lon - 51.4) / (56.6 - 51.4)) * W, ((26.2 - lat) / (26.2 - 22.5)) * H];
    let g = '<polygon points="' + UAE.map((p) => P(p[0], p[1]).join(',')).join(' ') + '" fill="#161d27" stroke="#2c3746"/>';
    const live = FA.live && FA.live.adsb;
    if (live) live.forEach((p) => { if (p.lat < 22.5 || p.lat > 26.2 || p.lon < 51.4 || p.lon > 56.6) return; const [x, y] = P(p.lon, p.lat); g += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="1.4" fill="#8b98a9"/>'; });
    const [x0, y0] = P(D.NETWORK[0].lon, D.NETWORK[0].lat), base = plan.cfg.mode === 'baseline', load = {};
    plan.divs.forEach((d) => { load[d.alt] = (load[d.alt] || 0) + 1; });
    Object.keys(load).forEach((icao) => {
      const a = D.NETWORK.find((n) => n.icao === icao), [x1, y1] = P(a.lon, a.lat);
      g += '<path d="M' + x0 + ' ' + y0 + ' Q' + (x0 + x1) / 2 + ' ' + (Math.min(y0, y1) - 22) + ' ' + x1 + ' ' + y1 + '" fill="none" stroke="' + (base ? '#e5484d' : '#5b8def') + '" stroke-width="1.6" stroke-dasharray="4 3"/>';
    });
    D.NETWORK.forEach((a) => {
      const [x, y] = P(a.lon, a.lat), w = net[a.icao];
      g += '<circle cx="' + x + '" cy="' + y + '" r="' + (a.icao === 'OMDB' ? 5 : 4) + '" fill="' + (w.lvp ? '#d9a21b' : '#2ea56b') + '" stroke="#0b0f14" stroke-width="1.5"/><text x="' + (x + 7) + '" y="' + (y + 3.5) + '" fill="#c3ccd8" font-size="9.5" font-weight="600" font-family="Inter, sans-serif">' + a.iata + (load[a.icao] ? ' +' + load[a.icao] : '') + '</text>';
    });
    $('#cmdNet').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' + g + '</svg><div class="net-leg"><span><i class="bg-ok"></i>VMC</span><span><i class="bg-warn"></i>LVP</span>' + (live ? '<span><i style="background:#8b98a9"></i>' + live.length + ' live aircraft</span>' : '') + '</div>';
    $('#cmdNetChip').innerHTML = '<span class="d-meta">' + plan.divs.length + ' diversion' + (plan.divs.length === 1 ? '' : 's') + '</span>';
  }

  /* ---------------- event log ---------------- */
  function events(plan) {
    const S = FA.state, inst = S.inst, sc = inst.scenario, ev = [];
    const add = (t, tag, tx, sev) => ev.push({ t, tag, tx, sev });
    if (sc.lvp && sc.wx.start != null) {
      let a = sc.wx.start - 60;
      while (a < sc.wx.start && FA.weather.nowcast(inst, a).p < 0.3) a += 2;
      if (a < sc.wx.start) add(a, 'WX', 'Fog forecast ' + Math.round(FA.weather.nowcast(inst, a).p * 100) + '% within 60 min', 'warn');
      add(sc.wx.start, 'WX', 'LVP in force, CAT III', 'warn');
      add(sc.wx.end, 'WX', 'LVP cancelled', 'ok');
    } else if (sc.degraded) { add(sc.wx.start, 'WX', 'Visibility ' + sc.wx.vis + ' m, dust', 'warn'); add(sc.wx.end, 'WX', 'Visibility restored', 'ok'); }
    inst.events.forEach((e) => {
      if (e.type === 'rwyClosure') { add(e.start, 'RWY', '12L/30R closed', 'crit'); add(e.end, 'RWY', '12L/30R reopened', 'ok'); }
      if (e.type === 'standOutage') add(e.start + 0.5, 'STAND', e.stands.join(', ') + ' out of service', 'crit');
    });
    plan.seq.filter((s) => s.f.priority === 'mayday' || s.f.priority === 'medical').forEach((s) => {
      add(s.f.eta - 12, 'EMER', s.id + (s.f.priority === 'mayday' ? ' MAYDAY, minimum fuel' : ' PAN-PAN, medical'), 'crit');
      const dl = Math.round(s.land - s.f.eta);
      add(s.land, 'EMER', s.id + ' landed' + (dl > 0 ? ', +' + dl + ' min' : ', no delay'), dl > 3 ? 'crit' : 'ok');
    });
    if (plan.cfg.mode === 'baseline') {
      plan.alloc.filter((a) => a.wait > 3).forEach((a) => add(plan.seqById.get(a.id).land + a.taxiIn, 'STAND', a.id + ' holding for stand, ' + Math.round(a.wait) + ' min', 'crit'));
      plan.divs.forEach((d) => add(d.when, 'DIV', d.id + ' diverting to ' + d.alt + ' at minimum fuel' + (d.altLvp ? ' (LVP at alternate)' : ''), 'crit'));
      (plan.taxiConflicts || []).slice(0, 12).forEach((c) => add(c.t, 'TAXI', c.a + ' / ' + c.b + ' ' + c.type + ' conflict', 'crit'));
    } else {
      if (S.approved) add(S.approved.at, 'PLAN', U.esc(plan.cfg.short) + ' plan approved', 'ok');
      const atfm = plan.seq.filter((s) => s.atfm > 1).length;
      if (atfm && sc.wx.start != null) add(sc.wx.start - 40, 'ATFM', atfm + ' departures held at origin', 'info');
      (plan.mixedWins || []).forEach((w) => add(w[0], 'RWY', '12R/30L mixed-mode operations', 'info'));
      plan.tows.forEach((tw) => add(tw.at, 'TOW', tw.id + ' towed ' + tw.from + ' to ' + tw.to, 'info'));
      plan.divs.forEach((d) => add(d.f.eta - 25, 'DIV', d.id + ' diverted to ' + d.alt + ' (pre-planned)', 'info'));
      plan.alloc.filter((a) => a.remote).slice(0, 8).forEach((a) => add(a.onBlock, 'STAND', a.id + ' to remote stand ' + a.stand, 'info'));
      plan.seq.filter((s) => s.pos < s.fcfsPos - 1 && s.f.priority === 'normal').slice(0, 6).forEach((s) => add(s.land - 6, 'SEQ', s.id + ' advanced ' + (s.fcfsPos - s.pos) + ' positions', 'info'));
    }
    (S.replans || []).forEach((r) => add(r.t + 0.01, 'PLAN', r.reason + (plan.cfg.mode === 'baseline' ? '' : ': re-planned, ' + r.changes.length + ' changes'), plan.cfg.mode === 'baseline' ? 'crit' : 'info'));
    return ev.sort((a, b) => b.t - a.t);
  }
  function renderFeed(t) {
    const plan = shownPlan();
    const all = events(plan), list = all.filter((e) => e.t <= t);
    $('#cmdFeedMeta').textContent = list.length + ' entries';
    $('#cmdFeed').innerHTML = list.length ? list.slice(0, 14).map((e) => '<div class="lg sev-' + e.sev + '"><span class="tm">' + fmtT(e.t) + '</span><span class="tg">' + e.tag + '</span><span class="tx">' + e.tx + '</span></div>').join('') : '<div class="empty">No events</div>';
  }

  /* ---------------- arrival sequence ---------------- */
  function renderSeq(t) {
    const S = FA.state, plan = shownPlan(), ac = new Map((FA.map.lastAircraft || []).map((a) => [a.id, a]));
    const rows = plan.seq.filter((s) => s.land >= t - 1.5).sort((a, b) => a.land - b.land).slice(0, 16);
    const divs = plan.divs.filter((d) => Math.abs(d.f.eta - t) < 25);
    let h = '<table class="d-table seq"><thead><tr><th>#</th><th>Flight</th><th>Type</th><th>ETA</th><th>Land</th><th>Δ</th><th>RWY</th><th>Stand</th><th>Status</th></tr></thead><tbody>';
    divs.forEach((d) => { h += '<tr data-id="' + d.id + '"><td>—</td><td class="fl">' + d.id + '</td><td>' + d.f.type + '</td><td>' + fmtT(d.f.eta) + '</td><td>—</td><td>—</td><td>—</td><td>—</td><td><span class="st div">DIV ' + d.alt + '</span></td></tr>'; });
    rows.forEach((s) => {
      const a = plan.allocById.get(s.id), x = ac.get(s.id);
      const dl = Math.round(s.land - s.f.eta + (a ? a.wait : 0));
      const em = s.f.priority === 'mayday' || s.f.priority === 'medical';
      let st = '<span class="st">SCHED</span>';
      if (x) {
        if (x.status === 'holding') st = '<span class="st warn">HOLD</span>';
        else if (x.status === 'final') st = '<span class="st info">FINAL</span>';
        else if (x.status === 'air') st = '<span class="st">INBOUND</span>';
        else if (/taxi|rollout|hold-short/.test(x.status)) st = '<span class="st ok">TAXI</span>';
      } else if (s.atfm > 1) st = '<span class="st info">ATFM +' + Math.round(s.atfm) + '</span>';
      if (em) st = '<span class="st crit">' + (s.f.priority === 'mayday' ? 'MAYDAY' : 'MEDEVAC') + '</span>';
      h += '<tr class="' + (em ? 'em' : '') + (S.selected === s.id ? ' sel' : '') + '" data-id="' + s.id + '"><td>' + (s.pos + 1) + '</td><td class="fl">' + s.id + '</td><td>' + s.f.type + '</td><td>' + fmtT(s.f.eta) + '</td><td>' + fmtT(s.land) + '</td><td class="' + (dl > 15 ? 'tx-crit' : dl > 4 ? 'tx-warn' : 'tx-muted') + '">' + (dl > 0 ? '+' + dl : '0') + '</td><td>' + (s.rwy === 'S' ? '12R' : '12L') + '</td><td class="' + (a && a.wait > 3 ? 'tx-crit' : '') + '">' + (a ? a.stand : '—') + '</td><td>' + st + '</td></tr>';
    });
    $('#cmdSeq').innerHTML = h + '</tbody></table>';
    const avg = rows.length ? rows.reduce((q, s) => q + Math.max(0, s.land - s.f.eta), 0) / rows.length : 0;
    $('#cmdSeqChip').textContent = 'Next ' + rows.length + ' · avg delay ' + avg.toFixed(0) + ' min';
    document.querySelectorAll('#cmdSeq tr[data-id]').forEach((r) => r.onclick = () => FA.app.select(r.dataset.id));
  }

  /* ---------------- timeline ---------------- */
  function renderTl(t) {
    const S = FA.state, plan = shownPlan(), sc = S.inst.scenario, W = 1000, H = 42, T0 = 300, T1 = 510;
    const X = (v) => ((Math.max(T0, Math.min(T1, v)) - T0) / (T1 - T0)) * W;
    let g = '<rect x="0" y="0" width="' + W + '" height="' + (H - 12) + '" fill="#111720"/>';
    if (sc.wx.start != null) g += '<rect x="' + X(sc.wx.start) + '" y="0" width="' + (X(sc.wx.end) - X(sc.wx.start)) + '" height="' + (H - 12) + '" fill="rgba(217,162,27,.13)"/>';
    S.inst.events.filter((e) => e.type === 'rwyClosure').forEach((e) => { g += '<rect x="' + X(e.start) + '" y="0" width="' + (X(e.end) - X(e.start)) + '" height="' + (H - 12) + '" fill="rgba(229,72,77,.15)"/>'; });
    plan.seq.forEach((s, i) => {
      const y = 5 + (i % 5) * 5, col = s.hold > 20 ? '#e5484d' : s.hold > 8 ? '#d9a21b' : '#5b8def';
      if (s.land - s.f.eta > 1) g += '<line x1="' + X(s.f.eta + (s.atfm || 0)) + '" x2="' + X(s.land) + '" y1="' + y + '" y2="' + y + '" stroke="' + col + '" stroke-width="1.4" opacity=".75"/>';
      g += '<rect x="' + (X(s.land) - 1) + '" y="' + (y - 1.5) + '" width="2" height="3" fill="' + col + '"/>';
    });
    for (let m = 300; m <= 510; m += 30) g += '<line x1="' + X(m) + '" x2="' + X(m) + '" y1="' + (H - 12) + '" y2="' + (H - 9) + '" stroke="#3a4555"/><text x="' + X(m) + '" y="' + (H - 1) + '" fill="#6b7788" font-size="9" text-anchor="middle" font-family="Inter, sans-serif">' + fmtT(m) + '</text>';
    g += '<line x1="' + X(t) + '" x2="' + X(t) + '" y1="0" y2="' + (H - 12) + '" stroke="#e6ebf1" stroke-width="1.5"/>';
    $('#cmdTl').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' + g + '</svg>';
    $('#cmdClock').textContent = fmtT(t);
  }

  /* ---------------- flight / replan popovers ---------------- */
  function kv(k, v, cls) { return '<div class="kv"><span>' + k + '</span><b class="' + (cls || '') + '">' + v + '</b></div>'; }
  function renderCard() {
    const S = FA.state, id = S.selected, card = $('#cmdCard');
    if (!id || S.view !== 'command') { card.hidden = true; return; }
    const plan = shownPlan(), base = S.plans.baseline;
    const sq = plan.seqById.get(id), al = plan.allocById.get(id), dv = plan.divById.get(id), dp = plan.depById.get(id);
    const f = (sq || dv || dp || {}).f;
    if (!f) { card.hidden = true; return; }
    let body = '', why = '', vs = '';
    if (dp) {
      body = kv('Off-block', fmtT(dp.offBlock)) + kv('Take-off', fmtT(dp.ttot)) + kv('Stand', dp.towedTo ? dp.stand + ' → ' + dp.towedTo : dp.stand);
      why = dp.towedTo ? 'Towed to a remote stand to release the contact gate.' : plan.cfg.mode === 'opt' ? 'Held at gate (engines off) until its runway slot.' : 'Pushes back and queues ' + Math.round(dp.queue) + ' min at the holding point.';
    } else if (dv) {
      body = kv('Diversion', dv.alt, 'tx-crit') + kv('ETA OMDB', fmtT(f.eta));
      why = dv.reactive ? 'Held until minimum fuel, then diverted.' : 'Diversion decided 25 min before arrival to protect fuel margins.';
    } else {
      const dl = Math.round(sq.land - f.eta + (al ? al.wait : 0));
      body = kv('ETA / landing', fmtT(f.eta) + ' / ' + fmtT(sq.land)) + kv('Delay', (dl > 0 ? '+' : '') + dl + ' min', dl > 15 ? 'tx-crit' : dl > 4 ? 'tx-warn' : 'tx-ok') + kv('Runway', sq.rwy === 'S' ? '12R/30L' : '12L/30R') + kv('Stand', al ? al.stand + (al.remote ? ' (remote)' : '') : '—');
      if (f.priority === 'mayday' || f.priority === 'medical') why = 'Emergency priority: first available landing slot and contact stand.';
      else if (al && al.towed) why = 'Contact stand released by towing ' + al.towed + '.';
      else if (sq.atfm) why = Math.round(sq.atfm) + ' min absorbed as ground delay at ' + f.port + ' (ATFM).';
      else if (sq.pos < sq.fcfsPos) why = 'Sequence advanced ' + (sq.fcfsPos - sq.pos) + ' positions (fuel and wake pairing).';
      else if (al && al.remote) why = 'Remote stand assigned; bus operations notified.';
      else why = al && al.wait > 1 ? 'Waits ' + Math.round(al.wait) + ' min for its stand.' : 'Compatible stand available on arrival.';
      if (plan.cfg.mode === 'opt') {
        const bs = base.seqById.get(id), ba = base.allocById.get(id), bd = base.divById.get(id);
        if (bd) vs = 'Baseline: diverted to ' + bd.alt + '.';
        else if (bs) { const bdl = Math.round(bs.land - f.eta + (ba ? ba.wait : 0)); if (Math.abs(bdl - dl) >= 3) vs = 'Baseline: ' + (bdl > 0 ? '+' : '') + bdl + ' min' + (ba && ba.wait > 3 ? ', held for stand' : '') + '.'; }
      }
    }
    card.className = 'd-pop';
    card.hidden = false;
    card.innerHTML = '<div class="pop-h"><span><b>' + f.id + '</b> ' + f.type + ' · ' + (dp ? 'to ' : 'from ') + f.port + (f.priority !== 'normal' ? ' <span class="tag crit">' + f.priority.toUpperCase() + '</span>' : '') + '</span><button id="cmdCardX" aria-label="Close">×</button></div><div class="pop-b">' + body + '<div class="why">' + why + '</div>' + (vs ? '<div class="vs">' + vs + '</div>' : '') + '</div>';
    $('#cmdCardX').onclick = () => FA.app.select(null);
  }

  let rpTimer = null;
  function replanCard(rp) {
    const card = $('#cmdCard');
    clearTimeout(rpTimer);
    let body;
    if (rp.planId === 'baseline') body = rp.stranded > 0 ? '<div class="vs">Baseline: ' + rp.stranded + ' aircraft without a stand. Generate recovery options.</div>' : '<div class="why">No arriving aircraft affected.</div>';
    else if (!rp.changes.length) body = '<div class="why">Current plan remains valid. No reassignments required.</div>';
    else body = '<table class="d-table chg"><thead><tr><th>Flight</th><th>From</th><th>To</th><th>Alternatives</th></tr></thead><tbody>' + rp.changes.slice(0, 6).map((c) => '<tr><td class="fl">' + c.id + '</td><td>' + c.from + '</td><td><b>' + c.to.replace('↗', 'DIV ') + '</b></td><td class="tx-muted">' + (c.alts.join(', ') || '—') + '</td></tr>').join('') + '</tbody></table>' + (rp.changes.length > 6 ? '<div class="tx-muted" style="font-size:11px;margin-top:4px">+' + (rp.changes.length - 6) + ' more</div>' : '');
    card.className = 'd-pop wide';
    card.hidden = false;
    card.innerHTML = '<div class="pop-h"><span><b>' + U.esc(rp.reason) + '</b></span><button id="cmdCardX" aria-label="Close">×</button></div><div class="pop-b"><div class="kv"><span>Re-planning time</span><b>' + Math.round(rp.ms) + ' ms</b></div><div class="kv"><span>Reassignments</span><b>' + rp.changes.length + '</b></div>' + body + '</div>';
    $('#cmdCardX').onclick = () => { card.hidden = true; };
    rpTimer = setTimeout(() => { if (card.classList.contains('wide')) card.hidden = true; }, 10000);
  }

  /* ---------------- refresh cycle ---------------- */
  function onTick(t) {
    if (FA.state.view !== 'command') return;
    renderLive(); renderStatus(t);
    const m = Math.floor(t);
    if (m !== lastMin) { lastMin = m; renderFeed(t); renderTl(t); renderRes(t); renderSeq(t); }
    if (Math.abs(t - lastFog) >= 2) { lastFog = t; renderFog(t); }
  }
  function full() {
    const t = FA.state.t;
    lastMin = -1; lastFog = -99;
    renderScn(); renderRec(); renderKpis(); renderNet(); renderCard(); renderEval();
    FA.map.render(t);
    onTick(t);
  }

  FA.views.command = {
    init() {
      $('#cmdGo').onclick = onGo;
      $('#cmdPlay').innerHTML = ICON.play;
      $('#cmdPlay').onclick = () => FA.app.play();
      FA.bus.on('play', (on) => { $('#cmdPlay').innerHTML = on ? ICON.pause : ICON.play; });
      document.querySelectorAll('#cmdSpeed button').forEach((b) => b.onclick = () => {
        FA.state.speed = +b.dataset.s;
        document.querySelectorAll('#cmdSpeed button').forEach((x) => x.classList.toggle('on', x === b));
      });
      $('#cmdTl').addEventListener('click', (e) => { const r = e.currentTarget.getBoundingClientRect(); FA.app.setTime(300 + ((e.clientX - r.left) / r.width) * 210); });
      document.querySelectorAll('#cmdCmp button').forEach((b) => b.onclick = () => {
        FA.map.override = b.dataset.m === 'baseline' ? 'baseline' : null;
        document.querySelectorAll('#cmdCmp button').forEach((x) => x.classList.toggle('on', x === b));
        full();
      });
      FA.bus.on('tick', onTick);
      FA.bus.on('scenario', () => {
        phase = 'idle'; pick = null; FA.map.override = null;
        document.querySelectorAll('#cmdCmp button').forEach((x) => x.classList.toggle('on', x.dataset.m === 'ai'));
        $('#cmdOverlay').hidden = true;
        if (FA.state.view === 'command') full();
      });
      FA.bus.on('generated', () => {
        const S = FA.state;
        if (S.approved) return;
        if (!S.generated) { phase = 'idle'; $('#cmdOverlay').hidden = true; renderRec(); return; }
        phase = 'choose'; pick = S.rec; renderRec();
        if (S.view === 'command') chooser();
      });
      FA.bus.on('approved', () => {
        phase = 'active'; FA.map.override = null;
        document.querySelectorAll('#cmdCmp button').forEach((x) => x.classList.toggle('on', x.dataset.m === 'ai'));
        $('#cmdOverlay').hidden = true;
        if (FA.state.view === 'command') full();
      });
      FA.bus.on('select', () => { renderCard(); renderSeq(FA.state.t); });
      FA.bus.on('live', () => { renderHqLive(); renderNet(); lastFog = -99; if (FA.state.view === 'command') renderFog(FA.state.t); });
      FA.bus.on('replan', (rp) => { if (FA.state.view === 'command') { full(); replanCard(rp); } });
      FA.bus.on('view', (v) => { if (v !== 'command') hostMap(false); });
      renderHqLive();
    },
    show() { hostMap(true); if (phase === 'choose') chooser(); full(); },
    recover, approve,
    toggleCompare(mode) { const b = document.querySelector('#cmdCmp button[data-m="' + mode + '"]'); if (b) b.click(); },
    get phase() { return phase; }
  };
})(window.FA);
