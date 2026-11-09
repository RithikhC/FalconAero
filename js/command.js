/* FalconAero — COMMAND view: one-screen, presentation-grade dashboard.
   Big numbers, live map, live AI event feed, one button. Minimal text by design. */
(function (FA) {
  'use strict';
  const D = FA.data, E = FA.engine, C = FA.charts, U = FA.ui;
  const $ = (s) => document.querySelector(s);
  const OPT = ['balanced', 'mindelay', 'safety'];
  let phase = 'idle';            // idle | computing | choose | active
  let pick = null;               // plan picked in the chooser
  let shown = new Set();         // feed items already animated
  let disp = {};                 // currently displayed KPI numbers (for count-up)
  let lastMin = -1, lastFog = -99;

  const SCN = [['normal', '☀', 'Normal'], ['fog', '🌫', 'Fog'], ['sand', '🌪', 'Sandstorm'], ['runway', '⛔', 'Runway closed'], ['storm', '⚠', 'Perfect Storm']];
  const shownPlanId = () => { const S = FA.state; return FA.map.override === 'baseline' ? 'baseline' : S.active; };
  const shownPlan = () => FA.state.plans[shownPlanId()];

  /* ---------- map hosting (one SVG, moved between Command and Ops) ---------- */
  function hostMap(toCmd) {
    const box = document.querySelector('.map-box');
    if (!box) return;
    if (toCmd) { if (box.parentElement !== $('#cmdMapSlot')) $('#cmdMapSlot').appendChild(box); }
    else {
      const wrap = document.querySelector('#view-ops .map-wrap'), bar = document.querySelector('#view-ops .sim-bar');
      if (wrap && box.parentElement !== wrap) wrap.insertBefore(box, bar);
    }
  }

  /* ---------- top bar ---------- */
  function renderScn() {
    const S = FA.state;
    $('#cmdScn').innerHTML = SCN.map(([id, ic, nm]) => '<button data-id="' + id + '" class="' + (S.scenarioId === id ? 'on' : '') + '" title="' + nm + '"><i>' + ic + '</i><b>' + nm + '</b></button>').join('');
    document.querySelectorAll('#cmdScn button').forEach((b) => b.onclick = () => { const play = FA.state.playing; FA.app.loadScenario(b.dataset.id); if (play) FA.app.play(true); });
  }

  function renderStatus(t) {
    const S = FA.state, c = E.conditions(S.inst, t);
    const p = [];
    if (c.lvp) p.push('<span class="cmd-pill warn">🌫 LVP · CAT III · RVR ' + c.rvr + ' m</span>');
    else if (c.degraded) p.push('<span class="cmd-pill warn">🌪 DUST · VIS ' + c.vis + ' m</span>');
    if (c.rwyNClosed) p.push('<span class="cmd-pill bad">⛔ RWY 12L/30R CLOSED</span>');
    const ac = FA.map.lastAircraft || [];
    const blocked = ac.filter((a) => a.status === 'waiting' && a.conflict).length;
    if (blocked) p.push('<span class="cmd-pill bad">⚠ ' + blocked + ' BLOCKED</span>');
    if (shownPlanId() !== 'baseline') p.push('<span class="cmd-pill ai">● AI PLAN ACTIVE</span>');
    if (!p.length) p.push('<span class="cmd-pill ok">● ALL NOMINAL</span>');
    $('#cmdStatus').innerHTML = p.join('');
  }

  function renderGo() {
    const S = FA.state, b = $('#cmdGo'), k = S.plans.baseline.kpi;
    b.className = 'cmd-go';
    if (phase === 'active') { b.classList.add('active'); b.textContent = '● ' + S.plans[S.active].cfg.short.toUpperCase() + ' ACTIVE'; b.title = 'Click to reset'; }
    else if (phase === 'choose') { b.classList.add('approve'); b.textContent = '✔ APPROVE ' + S.plans[pick].cfg.short.toUpperCase(); }
    else if (phase === 'computing') { b.textContent = '◌ COMPUTING…'; }
    else { b.textContent = '⚡ AI RECOVER'; if (k.conflicts + k.diversions > 0 || k.avgDelayAll > 10) b.classList.add('pulse'); }
    $('#cmdCmp').hidden = phase !== 'active';
  }

  function onGo() {
    const S = FA.state;
    if (phase === 'idle') return recover();
    if (phase === 'choose') return approve();
    if (phase === 'active') { const t = S.t, play = S.playing; FA.app.loadScenario(S.scenarioId, S.seed, { t }); if (play) FA.app.play(true); }
  }

  /* ---------- recover → choose → approve ---------- */
  function recover() {
    const S = FA.state;
    phase = 'computing'; renderGo();
    const steps = ['FUSE DATA', 'FOG NOWCAST', 'SEQUENCE ' + S.inst.arrivals.length, 'RUNWAY MODE', 'STANDS + TOWS', 'DIVERSIONS', 'STRESS TEST', 'SCORE'];
    const ov = $('#cmdOverlay');
    ov.hidden = false;
    ov.innerHTML = '<div><div class="cmd-radar"><div class="cmd-radar-t">AI<br>RECOVERY</div></div><div class="cmd-steps">' + steps.map((s) => '<span>' + s + '</span>').join('') + '</div></div>';
    const els = ov.querySelectorAll('.cmd-steps span');
    els.forEach((e, i) => setTimeout(() => e.classList.add('on'), 120 + i * 140));
    setTimeout(() => { FA.app.generate(); }, 200 + steps.length * 140);
  }

  function chooser() {
    const S = FA.state;
    pick = pick || S.rec;
    const ms = OPT.reduce((a, id) => a + S.plans[id].ms, 0);
    const ov = $('#cmdOverlay');
    ov.hidden = false;
    ov.innerHTML = '<div><div class="cmd-plans">' + OPT.map((id) => {
      const p = S.plans[id], k = p.kpi;
      return '<button class="cmd-plan' + (id === pick ? ' sel' : '') + '" data-id="' + id + '"><div class="n"><span style="color:' + p.cfg.color + '">' + U.esc(p.cfg.short) + '</span>' + (id === S.rec ? '<span class="badge">AI PICK</span>' : '') + '</div><div class="s" style="color:' + p.cfg.color + '">' + Math.round(k.scores.overall) + '</div>' +
        '<div class="m"><span>delay <b>' + k.avgDelayAll.toFixed(0) + '′</b></span><span>div <b>' + k.diversions + '</b></span><span>conflicts <b>' + k.conflicts + '</b></span><span>CO₂ <b>' + Math.round(k.co2 / 1000) + 't</b></span></div></button>';
    }).join('') + '</div><div class="cmd-ms">3 PLANS · ' + Math.round(ms) + ' ms · STRESS-TESTED</div><div style="text-align:center;margin-top:14px"><button class="cmd-go approve" id="cmdApprove">✔ APPROVE ' + U.esc(S.plans[pick].cfg.short.toUpperCase()) + '</button></div></div>';
    ov.querySelectorAll('.cmd-plan').forEach((c) => c.onclick = () => { pick = c.dataset.id; chooser(); renderGo(); });
    $('#cmdApprove').onclick = approve;
  }

  function approve() {
    FA.app.approve(pick || FA.state.rec, 'ATC Supervisor');
  }

  /* ---------- KPIs ---------- */
  const KPI = [
    { k: 'avgDelayAll', l: 'AVG DELAY', u: '′', dp: 1, low: true, c: '#26c6da', bad: (v) => v > 10 },
    { k: 'diversions', l: 'DIVERSIONS', u: '', dp: 0, low: true, c: '#b388ff', bad: (v) => v > 0 },
    { k: 'conflicts', l: 'CONFLICTS', u: '', dp: 0, low: true, c: '#ef5350', bad: (v) => v > 0 },
    { k: 'minFuelMargin', l: 'MIN FUEL', u: '′', dp: 0, low: false, c: '#ffb300', bad: (v) => v < 5 },
    { k: 'co2', l: 'CO₂', u: ' t', dp: 0, low: true, c: '#66bb6a', f: (v) => v / 1000, bad: (v) => v > 250 },
    { k: 'missedConn', l: 'MISSED CONN.', u: '', dp: 0, low: true, c: '#e2b04a', bad: (v) => v > 20 }
  ];
  function renderKpis(flash) {
    const S = FA.state, pid = shownPlanId(), k = S.plans[pid].kpi, kb = S.plans.baseline.kpi, ai = pid !== 'baseline';
    if (!$('#cmdKpis').children.length) $('#cmdKpis').innerHTML = KPI.map((x) => '<div class="ck" style="--kc:' + x.c + '" data-k="' + x.k + '"><div class="l">' + x.l + '</div><div class="v">—</div><div class="d"></div></div>').join('');
    KPI.forEach((x) => {
      const el = document.querySelector('.ck[data-k="' + x.k + '"]');
      const val = x.f ? x.f(k[x.k]) : k[x.k], base = x.f ? x.f(kb[x.k]) : kb[x.k];
      el.classList.remove('bad', 'good');
      if (ai) el.classList.add('good'); else if (x.bad(val)) el.classList.add('bad');
      let d = '';
      if (ai) {
        const pc = base ? Math.round((100 * (val - base)) / Math.abs(base)) : 0;
        const better = x.low ? val < base : val > base;
        d = '<span class="was">' + fmt(base, x) + '</span><span class="' + (better ? 'good' : val === base ? 'dim' : 'bad') + '">' + (val === base ? '=' : (pc > 0 ? '▲' : '▼') + Math.abs(pc) + '%') + '</span>';
      } else d = '<span class="dim">PROJECTED</span>';
      el.querySelector('.d').innerHTML = d;
      tween(el.querySelector('.v'), x, disp[x.k] != null ? disp[x.k] : val, val);
      disp[x.k] = val;
      if (flash && ai) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    });
  }
  function fmt(v, x) { return (x.dp ? v.toFixed(x.dp) : Math.round(v).toLocaleString('en-US')) + x.u; }
  function tween(el, x, from, to) {
    const t0 = performance.now(), dur = 900;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(from + (to - from) * e, x);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- live counters on map ---------- */
  function renderLive() {
    const ac = FA.map.lastAircraft || [];
    const air = ac.filter((a) => ['air', 'final', 'holding', 'diverting', 'takeoff'].includes(a.status)).length;
    const hold = ac.filter((a) => a.status === 'holding').length;
    const taxi = ac.filter((a) => /taxi|queue|tow/.test(a.status)).length;
    const park = ac.filter((a) => a.status === 'parked').length;
    const blk = ac.filter((a) => a.status === 'waiting' && a.conflict).length;
    const hs = ac.filter((a) => a.status === 'hold-short').length;
    $('#cmdLive').innerHTML = '<span>✈ ' + air + ' airborne</span><span class="' + (hold >= 4 ? 'warn' : '') + '">⟳ ' + hold + ' holding</span><span>⇢ ' + taxi + ' taxiing</span><span>🅿 ' + park + ' on stand</span>' + (hs ? '<span style="color:#7ff1ff">⏸ ' + hs + ' hold-short</span>' : '') + (blk ? '<span class="bad">⚠ ' + blk + ' blocked</span>' : '');
  }

  /* ---------- fog card ---------- */
  function renderFog(t) {
    const S = FA.state, inst = S.inst, c = E.conditions(inst, t), o = FA.weather.obsAt(inst, t);
    const nc = FA.weather.nowcast(inst, t);
    const pts = [];
    for (let k = 0; k <= 180; k += 10) pts.push([t + k, FA.weather.nowcast(inst, Math.min(530, t + k)).p * 100]);
    const cat = c.lvp ? ['CAT III', '#ef5350'] : o.visM < 5000 ? ['CAT I', '#ffd54f'] : ['VMC', '#66bb6a'];
    $('#cmdFog').innerHTML = '<div class="cmd-h"><span>AI FOG RADAR</span><span class="chip" style="color:' + cat[1] + ';border-color:' + cat[1] + '88">' + cat[0] + '</span></div>' +
      '<div class="cmd-fog-row">' + C.gauge(nc.p, 'next 60′') + '<div style="flex:1;min-width:0"><div class="cmd-fog-big">' + (c.rvr ? c.rvr + ' m' : o.visM >= 9999 ? '10 km+' : o.visM + ' m') + '</div><div class="cmd-fog-sub">' + (c.rvr ? 'RVR' : 'VISIBILITY') + ' · ' + o.tempC.toFixed(0) + '/' + o.dewC.toFixed(0) + '°C · ' + (o.windKt < 3 ? 'CALM' : o.windKt + ' KT') + '</div>' +
      C.line([{ color: '#26c6da', points: pts, area: true }], { w: 220, h: 64, L: 4, yMax: 100, xMin: t, xMax: t + 180, xTicks: 2, xFmt: D.fmt, yFmt: () => '', noLegend: true, hlines: [{ y: 30, color: '#ffb300' }] }) + '</div></div>' + liveLine();
  }

  function liveLine() {
    const L = FA.live && FA.live.metar && FA.live.metar.OMDB;
    if (!L) return '';
    const vis = L.visM == null ? '—' : L.visM >= 9999 ? '10km+' : Math.round(L.visM) + 'm';
    return '<div class="cmd-liveline"><i></i>LIVE OMDB · ' + (L.tempC != null ? Math.round(L.tempC) + '/' + Math.round(L.dewC) + '°C · ' : '') + 'vis ' + vis + (L.fogP != null ? ' · fog ' + Math.round(L.fogP * 100) + '%' : '') + '</div>';
  }
  function renderHqLive() {
    const L = FA.live, el = $('#hqLive');
    if (!el) return;
    if (!L || !L.metar) { el.innerHTML = '<i></i>SIMULATION'; return; }
    const n = L.adsb ? L.adsb.length : null;
    el.innerHTML = '<i></i>LIVE · ' + (L.kind === 'metar' ? 'METAR' : 'WX') + (n != null ? ' · ' + n + ' ✈ UAE' : '');
    el.title = (L.source || '') + (L.cached ? ' (cached)' : '');
  }

  /* ---------- arrival sequence (runway assignment · stand · predicted delay) ---------- */
  function renderSeq(t) {
    const S = FA.state, plan = shownPlan(), ac = new Map((FA.map.lastAircraft || []).map((a) => [a.id, a]));
    const rows = plan.seq.filter((s) => s.land >= t - 1.5).sort((a, b) => a.land - b.land).slice(0, 14);
    const divs = plan.divs.filter((d) => Math.abs(d.f.eta - t) < 25);
    const col = (f) => (f.airline === 'EK' ? '#e2b04a' : f.airline === 'FZ' ? '#4fc3f7' : '#90a4ae');
    let h = '<div class="sq hd"><span>#</span><span>FLIGHT</span><span>ETA</span><span>LAND</span><span>RW</span><span>STAND</span><span>STATUS</span></div>';
    divs.forEach((d) => { h += '<div class="sq" data-id="' + d.id + '"><span>—</span><span class="fl"><i style="background:' + col(d.f) + '"></i>' + d.id + '</span><span>' + D.fmt(d.f.eta) + '</span><span class="d2">—</span><span>—</span><span>—</span><span class="st div">↗ ' + d.alt + '</span></div>'; });
    rows.forEach((s) => {
      const a = plan.allocById.get(s.id), x = ac.get(s.id);
      const dl = Math.round(s.land - s.f.eta + (a ? a.wait : 0));
      const em = s.f.priority === 'mayday' || s.f.priority === 'medical';
      let st = 'SEQ', cls = '';
      if (x) {
        if (x.status === 'holding') { st = '⟳ HOLD'; cls = 'hold'; }
        else if (x.status === 'final') { st = '↓ FINAL'; cls = 'fin'; }
        else if (x.status === 'air') { st = '✈ INBOUND'; }
        else if (/taxi|rollout|hold-short/.test(x.status)) { st = '⇢ TAXI'; cls = 'land'; }
      }
      if (s.atfm > 1 && !x) { st = '⏱ ATFM ' + Math.round(s.atfm) + '′'; cls = 'fin'; }
      if (em) st = (s.f.priority === 'mayday' ? '🆘 ' : '🚑 ') + st;
      h += '<div class="sq' + (em ? ' em' : '') + (S.selected === s.id ? ' sel' : '') + '" data-id="' + s.id + '"><span>' + (s.pos + 1) + '</span><span class="fl"><i style="background:' + col(s.f) + '"></i>' + s.id + '</span><span>' + D.fmt(s.f.eta) + '</span><span class="' + (dl > 15 ? 'd2' : dl > 4 ? 'd1' : 'd0') + '">' + D.fmt(s.land) + '</span><span>' + (s.rwy === 'S' ? 'R' : 'L') + '</span><span' + (a && a.wait > 3 ? ' class="stw" title="waits ' + Math.round(a.wait) + ' min"' : '') + '>' + (a ? a.stand + (a.wait > 3 ? '⚠' : '') : '—') + '</span><span class="st ' + cls + '">' + st + '</span></div>';
    });
    $('#cmdSeq').innerHTML = h;
    const avg = rows.length ? rows.reduce((q, s) => q + Math.max(0, s.land - s.f.eta), 0) / rows.length : 0;
    $('#cmdSeqChip').textContent = 'next ' + rows.length + ' · avg +' + avg.toFixed(0) + '′';
    document.querySelectorAll('#cmdSeq .sq[data-id]').forEach((r) => r.onclick = () => FA.app.select(r.dataset.id));
  }

  /* ---------- live event feed ---------- */
  function events(plan) {
    const S = FA.state, inst = S.inst, sc = inst.scenario, ev = [];
    const add = (t, ic, tx, cls) => ev.push({ t, ic, tx, cls, key: t.toFixed(1) + ic + tx });
    if (sc.lvp && sc.wx.start != null) {
      let a = sc.wx.start - 60;
      while (a < sc.wx.start && FA.weather.nowcast(inst, a).p < 0.3) a += 2;
      if (a < sc.wx.start) add(a, '🌫', 'Fog alert · ' + Math.round(FA.weather.nowcast(inst, a).p * 100) + '%', 'warn');
      add(sc.wx.start, '🌫', 'LVP · CAT III', 'warn');
      add(sc.wx.end, '☀', 'LVP lifted', 'good');
    } else if (sc.degraded) { add(sc.wx.start, '🌪', 'Dust · vis ' + sc.wx.vis + ' m', 'warn'); add(sc.wx.end, '☀', 'Visibility restored', 'good'); }
    inst.events.forEach((e) => {
      if (e.type === 'rwyClosure') { add(e.start, '⛔', 'RWY 12L/30R closed', 'bad'); add(e.end, '✅', 'RWY 12L/30R open', 'good'); }
      if (e.type === 'standOutage') add(e.start + 1, '🔧', e.stands.join(' ') + ' jet-bridge U/S', 'bad');
    });
    plan.seq.filter((s) => s.f.priority === 'mayday' || s.f.priority === 'medical').forEach((s) => {
      add(s.f.eta - 12, s.f.priority === 'mayday' ? '🆘' : '🚑', s.id + ' ' + (s.f.priority === 'mayday' ? 'MAYDAY fuel' : 'medical'), 'bad');
      const dl = Math.round(s.land - s.f.eta);
      add(s.land, '🛬', s.id + ' landed ' + (dl > 0 ? '+' + dl + '′' : 'on time'), dl > 3 ? 'bad' : 'good');
    });
    if (plan.cfg.mode === 'baseline') {
      plan.alloc.filter((a) => a.wait > 3).forEach((a) => add(plan.seqById.get(a.id).land + a.taxiIn, '⚠', a.id + ' blocked · ' + Math.round(a.wait) + '′', 'bad'));
      plan.divs.forEach((d) => add(d.when, '⛽', d.id + ' min fuel → ' + d.alt.slice(2) + (d.altLvp ? ' (fog!)' : ''), 'bad'));
    } else {
      if (S.approved) add(S.approved.at, '✔', 'Plan approved', 'good');
      const atfm = plan.seq.filter((s) => s.atfm > 1).length;
      if (atfm && sc.wx.start != null) add(sc.wx.start - 40, '🛫', atfm + ' flights held at origin', 'ai');
      (plan.mixedWins || []).forEach((w) => add(w[0], '🛬', '12R/30L → mixed mode', 'ai'));
      plan.tows.forEach((tw) => add(tw.at, '🚜', tw.id + ' ' + tw.from + '→' + tw.to, 'ai'));
      plan.divs.forEach((d) => add(d.f.eta - 25, '↗', d.id + ' → ' + d.alt.slice(2) + ' early', 'ai'));
      plan.alloc.filter((a) => a.remote).slice(0, 8).forEach((a) => add(a.onBlock, '🚌', a.id + ' → ' + a.stand, 'ai'));
      plan.seq.filter((s) => s.pos < s.fcfsPos - 1 && s.f.priority === 'normal').slice(0, 6).forEach((s) => add(s.land - 6, '⤴', s.id + ' moved up ' + (s.fcfsPos - s.pos), 'ai'));
    }
    (S.replans || []).forEach((r) => add(r.t + 0.01, plan.cfg.mode === 'baseline' ? r.icon : '⚡', plan.cfg.mode === 'baseline' ? r.reason : 'Re-planned · ' + r.changes.length + ' changes · ' + Math.round(r.ms) + ' ms', plan.cfg.mode === 'baseline' ? 'bad' : 'ai'));
    (plan.taxiConflicts || []).slice(0, 12).forEach((c) => add(c.t, '✖', c.a + '/' + c.b + ' ' + c.type, 'bad'));
    return ev.sort((a, b) => b.t - a.t);
  }
  function renderFeed(t) {
    const plan = shownPlan(), ai = plan.cfg.mode !== 'baseline';
    $('#cmdFeedTitle').textContent = ai ? 'AI ACTIONS · LIVE' : 'INCIDENTS · LIVE';
    const list = events(plan).filter((e) => e.t <= t).slice(0, 9);
    if (!list.length) { $('#cmdFeed').innerHTML = '<div class="cf-empty">Monitoring…</div>'; return; }
    $('#cmdFeed').innerHTML = list.map((e) => {
      const isNew = !shown.has(e.key);
      shown.add(e.key);
      return '<div class="cf ' + e.cls + (isNew ? ' new' : '') + '"><span class="tm">' + D.fmt(e.t) + '</span><span>' + e.ic + '</span><span>' + U.esc(e.tx) + '</span></div>';
    }).join('');
  }

  /* ---------- mini UAE network ---------- */
  const UAE = [[51.6, 24.1], [52.0, 24.0], [52.6, 24.2], [53.4, 24.1], [54.1, 24.15], [54.4, 24.3], [54.6, 24.45], [55.0, 24.9], [55.35, 25.32], [55.55, 25.52], [55.85, 25.72], [56.05, 26.05], [56.15, 25.85], [56.27, 25.62], [56.36, 25.15], [56.37, 24.97], [56.1, 24.75], [55.85, 24.6], [55.95, 24.3], [55.8, 24.05], [55.5, 23.95], [55.6, 23.6], [55.2, 22.7], [54.0, 22.6], [52.6, 22.9], [51.6, 24.1]];
  function renderNet() {
    const S = FA.state, plan = shownPlan(), net = E.networkState(S.inst);
    const W = 320, H = 150, P = (lon, lat) => [((lon - 51.4) / (56.6 - 51.4)) * W, ((26.2 - lat) / (26.2 - 22.5)) * H];
    let g = '<polygon points="' + UAE.map((p) => P(p[0], p[1]).join(',')).join(' ') + '" fill="rgba(38,198,218,.05)" stroke="#2a4268"/>';
    const dxb = D.NETWORK[0], [x0, y0] = P(dxb.lon, dxb.lat);
    const ai = plan.cfg.mode !== 'baseline';
    const load = {};
    plan.divs.forEach((d) => { load[d.alt] = (load[d.alt] || 0) + 1; });
    Object.keys(load).forEach((icao) => {
      const a = D.NETWORK.find((n) => n.icao === icao), [x1, y1] = P(a.lon, a.lat);
      const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 24;
      g += '<path d="M' + x0 + ' ' + y0 + ' Q' + mx + ' ' + my + ' ' + x1 + ' ' + y1 + '" fill="none" stroke="' + (ai ? '#26c6da' : '#ef5350') + '" stroke-width="2.5" stroke-dasharray="6 5"><animate attributeName="stroke-dashoffset" from="22" to="0" dur="0.8s" repeatCount="indefinite"/></path>';
    });
    D.NETWORK.forEach((a) => {
      const [x, y] = P(a.lon, a.lat), w = net[a.icao];
      const col = w.lvp ? '#ffb300' : '#66bb6a';
      g += '<circle cx="' + x + '" cy="' + y + '" r="' + (a.icao === 'OMDB' ? 7 : 5) + '" fill="' + col + '" stroke="#06101e" stroke-width="1.5"' + (w.lvp ? ' class="pulse"' : '') + '/><text x="' + (x + 8) + '" y="' + (y + 4) + '" fill="#cfe0f5" font-size="10" font-weight="700" font-family="JetBrains Mono">' + a.iata + (load[a.icao] ? ' +' + load[a.icao] : '') + '</text>';
    });
    const live = FA.live && FA.live.adsb;
    if (live) live.forEach((p) => { if (p.lat < 22.5 || p.lat > 26.2 || p.lon < 51.4 || p.lon > 56.6) return; const [x, y] = P(p.lon, p.lat); g += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="1.6" fill="#ffee58" opacity=".85"/>'; });
    $('#cmdNet').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' + g + (live ? '<text x="' + (W - 4) + '" y="' + (H - 4) + '" fill="#c9b94a" font-size="9" text-anchor="end" font-family="JetBrains Mono">● ' + live.length + ' live aircraft (OpenSky)</text>' : '') + '</svg>';
    $('#cmdNetChip').innerHTML = '<span class="chip ' + (plan.divs.length ? (ai ? 'cy' : 'red') : 'live') + '">' + (plan.divs.length ? plan.divs.length + ' DIVERTED' : '0 DIVERTED') + '</span>';
  }

  /* ---------- bottom timeline ---------- */
  function renderTl(t) {
    const S = FA.state, plan = shownPlan(), sc = S.inst.scenario, W = 1000, H = 46, T0 = 300, T1 = 510;
    const X = (v) => ((Math.max(T0, Math.min(T1, v)) - T0) / (T1 - T0)) * W;
    let g = '';
    if (sc.wx.start != null) g += '<rect x="' + X(sc.wx.start) + '" y="0" width="' + (X(sc.wx.end) - X(sc.wx.start)) + '" height="' + H + '" fill="' + (sc.lvp ? 'rgba(255,179,0,.12)' : 'rgba(201,138,58,.12)') + '"/>';
    S.inst.events.filter((e) => e.type === 'rwyClosure').forEach((e) => { g += '<rect x="' + X(e.start) + '" y="0" width="' + (X(e.end) - X(e.start)) + '" height="' + H + '" fill="rgba(239,83,80,.14)"/>'; });
    plan.seq.forEach((s, i) => {
      const y = 8 + (i % 6) * 5.5, col = s.hold > 20 ? '#ef5350' : s.hold > 8 ? '#ffb300' : '#26c6da';
      if (s.land - s.f.eta > 1) g += '<line x1="' + X(s.f.eta + (s.atfm || 0)) + '" x2="' + X(s.land) + '" y1="' + y + '" y2="' + y + '" stroke="' + col + '" stroke-width="1.6" opacity=".7"/>';
      g += '<circle cx="' + X(s.land) + '" cy="' + y + '" r="2" fill="' + col + '"/>';
    });
    for (let m = 330; m <= 480; m += 30) g += '<text x="' + X(m) + '" y="' + (H - 2) + '" fill="#5f7598" font-size="9" text-anchor="middle" font-family="JetBrains Mono">' + D.fmt(m) + '</text>';
    g += '<rect x="0" y="0" width="' + X(t) + '" height="' + H + '" fill="rgba(0,229,255,.04)"/><line x1="' + X(t) + '" x2="' + X(t) + '" y1="0" y2="' + H + '" stroke="#00e5ff" stroke-width="2"/>';
    $('#cmdTl').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' + g + '</svg>';
    $('#cmdClock').textContent = D.fmt(t);
  }

  /* ---------- aircraft card ---------- */
  function renderCard() {
    const S = FA.state, id = S.selected, card = $('#cmdCard');
    if (!id || S.view !== 'command') { card.hidden = true; return; }
    const plan = shownPlan(), base = S.plans.baseline;
    const sq = plan.seqById.get(id), al = plan.allocById.get(id), dv = plan.divById.get(id), dp = plan.depById.get(id);
    const f = (sq || dv || dp || {}).f;
    if (!f) { card.hidden = true; return; }
    const chips = [], why = [];
    if (f.priority !== 'normal') chips.push('<span class="red">' + f.priority.toUpperCase() + '</span>');
    if (dp) {
      chips.push('<span>STD ' + D.fmt(f.std) + '</span>', '<span>T/O ' + D.fmt(dp.ttot) + '</span>');
      why.push(dp.towedTo ? 'Towed to ' + dp.towedTo + ' to free its gate' : plan.cfg.mode === 'opt' ? 'Engines-off gate hold — no runway queue' : 'Queues ' + Math.round(dp.queue) + '′ with engines running');
    } else if (dv) {
      chips.push('<span class="red">DIVERT → ' + dv.alt + '</span>');
      why.push(dv.reactive ? 'Held to minimum fuel, then diverted' : 'Diverted early to protect fuel margins');
    } else {
      const dl = Math.round(sq.land - f.eta);
      chips.push('<span>LAND ' + D.fmt(sq.land) + (dl > 0 ? ' +' + dl + '′' : '') + '</span>');
      if (al) chips.push('<span>STAND ' + al.stand + '</span>');
      if (sq.rwy === 'S') chips.push('<span>12R/30L</span>');
      if (f.priority === 'mayday' || f.priority === 'medical') why.push('Emergency → first available slot');
      else if (al && al.towed) why.push('Gate freed by towing ' + al.towed);
      else if (sq.atfm) why.push(Math.round(sq.atfm) + '′ absorbed on the ground at ' + f.port);
      else if (sq.pos < sq.fcfsPos) why.push('Moved up ' + (sq.fcfsPos - sq.pos) + ' · fuel / wake pairing');
      else if (al && al.remote) why.push('Remote stand · bus ops alerted');
      else why.push(al && al.wait > 1 ? 'Waits ' + Math.round(al.wait) + '′ for stand' : 'Optimal stand · zero wait');
      if (plan.cfg.mode === 'opt') {
        const bs = base.seqById.get(id), ba = base.allocById.get(id), bd = base.divById.get(id);
        if (bd) why.push('vs today: diverted to ' + bd.alt);
        else if (bs) { const bdl = Math.round(bs.land - f.eta + (ba ? ba.wait : 0)), ndl = Math.round(dl + (al ? al.wait : 0)); if (Math.abs(bdl - ndl) >= 3) why.push('vs today: ' + (bdl > 0 ? '+' : '') + bdl + '′' + (ba && ba.wait > 3 ? ' (blocked at stand)' : '')); }
      }
    }
    card.className = 'cmd-card';
    card.hidden = false;
    card.innerHTML = '<div class="t"><span>' + f.id + ' <span class="dim" style="font-weight:600;font-size:12px">' + f.type + ' · ' + f.port + '</span></span><button id="cmdCardX">✕</button></div><div class="chips">' + chips.join('') + '</div><div class="why">' + U.esc(why[0] || '') + '</div>' + (why[1] ? '<div class="vs">' + U.esc(why[1]) + '</div>' : '');
    $('#cmdCardX').onclick = () => FA.app.select(null);
  }

  /* ---------- runway status & resource utilisation ---------- */
  function renderRes(t) {
    const S = FA.state, inst = S.inst, plan = shownPlan(), c = E.conditions(inst, t);
    const win = (a, b) => a >= t - 30 && a < t + 30;
    const mixed = c.rwyNClosed || (plan.mixedWins || []).some((w) => t >= w[0] && t < w[1]);
    const nLand = plan.seq.filter((s) => s.rwy === 'N' && win(s.land)).length;
    const sMov = plan.seq.filter((s) => s.rwy === 'S' && win(s.land)).length + plan.deps.filter((d) => win(d.ttot)).length;
    const capN = c.rwyNClosed ? 0 : 60 / E.arrSep(inst, { wake: 'H' }, { wake: 'H' }, t, 0, false);
    const capS = mixed ? (c.lvp ? 26 : 36) : 60 / E.depInterval(inst, t, plan.mixedWins); // mixed mode: arrivals + departures share the runway
    let occ = 0, avail = 0;
    plan.tl.forEach((ivs) => {
      const cur = ivs.find((iv) => t >= iv.start && t < iv.end);
      if (cur && cur.kind === 'outage') return;
      avail++; if (cur) occ++;
    });
    const ac = FA.map.lastAircraft || [];
    const moving = ac.filter((a) => /taxi|rollout|hold-short|queue|tow|waiting/.test(a.status)).length;
    const capT = c.lvp ? 12 : 18;
    const row = (n, mode, cls, u) => {
      const pc = Math.round(Math.min(1.5, u) * 100), col = u >= 0.95 ? '#ef5350' : u >= 0.75 ? '#ffb300' : '#66bb6a';
      return '<div class="cr"><span class="n">' + n + '</span><span class="m ' + cls + '">' + mode + '</span><span class="bar"><i style="width:' + Math.min(100, pc) + '%;background:' + col + '"></i></span><span class="p" style="color:' + col + '">' + (mode === 'CLOSED' ? '—' : pc + '%') + '</span></div>';
    };
    $('#cmdRes').innerHTML = '<div class="cmd-h"><span>RESOURCES</span><span class="dim" style="letter-spacing:0;font-weight:600">±30 min</span></div>' +
      row('12L/30R', c.rwyNClosed ? 'CLOSED' : 'ARR', c.rwyNClosed ? 'closed' : '', capN ? nLand / capN : 0) +
      row('12R/30L', mixed ? 'MIXED' : 'DEP', mixed ? 'mixed' : '', sMov / capS) +
      row('STANDS', occ + '/' + avail, '', occ / Math.max(1, avail)) +
      row('TAXIWAYS', moving + ' a/c', '', moving / capT);
  }

  /* ---------- re-plan card (alternatives after a live disruption) ---------- */
  let rpTimer = null;
  function replanCard(rp) {
    const card = $('#cmdCard');
    if (FA.state.view !== 'command') return;
    clearTimeout(rpTimer);
    let body;
    if (rp.planId === 'baseline') {
      body = rp.stranded > 0 ? '<div class="vs">Current practice: ' + rp.stranded + ' aircraft stranded → press ⚡ AI RECOVER</div>' : '<div class="why">No aircraft affected in the next hours.</div>';
    } else if (!rp.changes.length) body = '<div class="why">Plan still optimal: no reassignments needed.</div>';
    else body = '<div class="rows">' + rp.changes.slice(0, 5).map((c) => '<div><b>' + c.id + '</b><span>' + c.from + ' → ' + c.to + (c.alts.length ? ' <span class="alt">alt ' + c.alts.join(' · ') + '</span>' : '') + '</span></div>').join('') + '</div>' + (rp.changes.length > 5 ? '<div class="alt dim" style="margin-top:4px;font-size:11px">+' + (rp.changes.length - 5) + ' more</div>' : '');
    card.className = 'cmd-card rp';
    card.hidden = false;
    card.innerHTML = '<div class="t"><span>' + rp.icon + ' ' + U.esc(rp.reason) + '</span><button id="cmdCardX">✕</button></div><div class="chips"><span>RE-PLANNED IN ' + Math.round(rp.ms) + ' ms</span><span>' + rp.changes.length + ' CHANGES</span></div>' + body;
    $('#cmdCardX').onclick = () => { card.hidden = true; };
    rpTimer = setTimeout(() => { if (card.classList.contains('rp')) card.hidden = true; }, 10000);
  }

  /* ---------- evaluation: today vs FalconAero ---------- */
  function renderEval() {
    const S = FA.state, el = $('#cmdEval');
    if (!el) return;
    const ai = S.plans[S.active !== 'baseline' ? S.active : S.rec], b = S.plans.baseline;
    const M = [
      ['Avg delay', (k) => k.avgDelayAll, (v) => v.toFixed(1) + '′'],
      ['Conflicts', (k) => k.conflicts, (v) => Math.round(v)],
      ['Taxi conflicts', (k) => k.taxiConflicts, (v) => Math.round(v)],
      ['Diversions', (k) => k.diversions, (v) => Math.round(v)],
      ['CO₂', (k) => k.co2 / 1000, (v) => Math.round(v) + 't'],
      ['Landed by 08:00', (k) => k.throughput, (v) => Math.round(v)]
    ];
    let h = '<div class="cmd-h"><span>EVALUATION</span><span class="chip ' + (S.approved ? 'live' : 'cy') + '">' + (S.approved ? 'APPROVED' : 'AI PROJECTION') + '</span></div><div class="ev-legend"><span><b style="background:#ef5350"></b>today</span><span><b style="background:#26c6da"></b>' + U.esc(ai.cfg.short) + '</span></div>';
    M.forEach(([lb, f, fmt]) => {
      const vb = f(b.kpi), va = f(ai.kpi), mx = Math.max(vb, va, 1e-6);
      h += '<div class="ev"><span class="lb">' + lb + '</span><div class="bars"><div class="b base"><i style="width:' + (100 * vb / mx).toFixed(0) + '%"></i><span>' + fmt(vb) + '</span></div><div class="b ai"><i style="width:' + Math.max(2, 100 * va / mx).toFixed(0) + '%"></i><span>' + fmt(va) + '</span></div></div></div>';
    });
    el.innerHTML = h;
  }

  /* ---------- tick ---------- */
  function onTick(t) {
    if (FA.state.view !== 'command') return;
    renderLive();
    renderStatus(t);
    const m = Math.floor(t);
    if (m !== lastMin) { lastMin = m; renderFeed(t); renderTl(t); renderRes(t); renderSeq(t); }
    if (Math.abs(t - lastFog) >= 2) { lastFog = t; renderFog(t); }
  }
  function full() {
    const t = FA.state.t;
    lastMin = -1; lastFog = -99;
    renderScn(); renderGo(); renderKpis(false); renderNet(); renderCard(); renderEval();
    renderRes(t);
    FA.map.render(t);
    onTick(t);
  }

  FA.views.command = {
    init() {
      $('#cmdGo').onclick = onGo;
      $('#cmdPlay').onclick = () => FA.app.play();
      FA.bus.on('play', (on) => { $('#cmdPlay').textContent = on ? '❚❚' : '▶'; });
      document.querySelectorAll('#cmdSpeed button').forEach((b) => b.onclick = () => {
        FA.state.speed = +b.dataset.s;
        document.querySelectorAll('#cmdSpeed button').forEach((x) => x.classList.toggle('on', x === b));
      });
      $('#cmdTl').addEventListener('click', (e) => { const r = e.currentTarget.getBoundingClientRect(); FA.app.setTime(300 + ((e.clientX - r.left) / r.width) * 210); });
      document.querySelectorAll('#cmdCmp button').forEach((b) => b.onclick = () => {
        FA.map.override = b.dataset.m === 'baseline' ? 'baseline' : null;
        document.querySelectorAll('#cmdCmp button').forEach((x) => x.classList.toggle('on', x === b));
        shown = new Set(); full();
      });
      FA.bus.on('tick', onTick);
      FA.bus.on('scenario', () => {
        phase = 'idle'; pick = null; shown = new Set(); FA.map.override = null;
        document.querySelectorAll('#cmdCmp button').forEach((x) => x.classList.toggle('on', x.dataset.m === 'ai'));
        $('#cmdOverlay').hidden = true;
        if (FA.state.view === 'command') full();
      });
      FA.bus.on('generated', () => {
        const S = FA.state;
        if (S.approved) return;
        if (!S.generated) { phase = 'idle'; $('#cmdOverlay').hidden = true; renderGo(); return; }
        phase = 'choose'; pick = S.rec; renderGo();
        if (S.view === 'command') chooser();
      });
      FA.bus.on('approved', () => {
        phase = 'active'; FA.map.override = null; shown = new Set();
        document.querySelectorAll('#cmdCmp button').forEach((x) => x.classList.toggle('on', x.dataset.m === 'ai'));
        $('#cmdOverlay').hidden = true;
        if (FA.state.view === 'command') { full(); renderKpis(true); }
      });
      FA.bus.on('select', () => { renderCard(); renderSeq(FA.state.t); });
      FA.bus.on('live', () => { renderHqLive(); renderNet(); lastFog = -99; if (FA.state.view === 'command') renderFog(FA.state.t); });
      renderHqLive();
      FA.bus.on('replan', (rp) => { shown = new Set(); if (FA.state.view === 'command') { full(); renderKpis(true); replanCard(rp); } });
      FA.bus.on('view', (v) => { if (v !== 'command') hostMap(false); });
    },
    show() {
      hostMap(true);
      if (phase === 'choose') chooser();
      full();
    },
    recover, approve,
    toggleCompare(mode) { const b = document.querySelector('#cmdCmp button[data-m="' + mode + '"]'); if (b) b.click(); },
    get phase() { return phase; }
  };
})(window.FA);
