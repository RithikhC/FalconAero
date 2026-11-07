/* FalconAero — Recovery Plans page: KPI table, trade-off radar, sequence waterfall, stand Gantt, decision log. */
(function (FA) {
  'use strict';
  const D = FA.data, E = FA.engine, U = FA.ui, C = FA.charts;
  const $ = (s) => document.querySelector(s);
  let seqPlan = null, ganttPlan = null;

  const ROWS = [
    ['Overall score (0–100)', (k) => k.scores.overall, 1, false],
    ['Avg delay incl. diversions (min)', (k) => k.avgDelayAll, 1, true],
    ['Passenger-delay hours', (k) => k.paxDelayHrs, 0, true],
    ['Max delay (min)', (k) => k.maxDelay, 0, true],
    ['Diversions', (k) => k.diversions, 0, true],
    ['…into airports also in LVP', (k) => k.secondaryDiv, 0, true],
    ['Aircraft reaching minimum fuel', (k) => k.fuelCritical, 0, true],
    ['Min fuel margin (min)', (k) => k.minFuelMargin, 0, false],
    ['Emergency landing delay (min)', (k) => k.emergDelay, 1, true],
    ['Stand / ground conflicts', (k) => k.conflicts, 0, true],
    ['Taxiway saturation (min)', (k) => k.taxiOver, 0, true],
    ['Airborne holding (min)', (k) => k.holdMin, 0, true],
    ['Delay moved to ground via ATFM (min)', (k) => k.atfmMin, 0, false],
    ['CO₂ from disruption (t)', (k) => k.co2 / 1000, 1, true],
    ['Missed connections (pax)', (k) => k.missedConn, 0, true],
    ['Contact-stand share (%)', (k) => k.contactPct, 0, false],
    ['Tows / remote stands', (k) => k.tows + ' / ' + k.remoteCount, null, null],
    ['Airline fairness index', (k) => k.fairness, 2, false],
    ['Mixed-mode minutes', (k) => k.mixedMin, 0, null]
  ];

  function ids() { return ['baseline', 'balanced', 'mindelay', 'safety'].concat(FA.state.plans.custom ? ['custom'] : []); }

  function table() {
    const S = FA.state, P = S.plans, I = ids();
    let h = '<table class="t"><tr><th>Metric</th>' + I.map((id) => '<th style="color:' + P[id].cfg.color + '">' + U.esc(P[id].cfg.short) + (id === S.rec ? ' ★' : '') + '</th>').join('') + '</tr>';
    ROWS.forEach(([label, fn, dp, lower]) => {
      const vals = I.map((id) => fn(P[id].kpi));
      let best = null;
      if (lower != null && typeof vals[0] === 'number') best = lower ? Math.min(...vals) : Math.max(...vals);
      h += '<tr><td>' + label + '</td>' + vals.map((v) => '<td class="' + (best != null && Math.abs(v - best) < 1e-6 ? 'win' : '') + '">' + (typeof v === 'number' ? U.num(v, dp) : v) + '</td>').join('') + '</tr>';
    });
    h += '<tr><td>Compute time (ms)</td>' + I.map((id) => '<td>' + Math.round(P[id].ms) + '</td>').join('') + '</tr>';
    h += '<tr><td>Stand-plan stability (ETA noise)</td>' + I.map((id) => '<td>' + Math.round((P[id].robust || 0) * 100) + '%</td>').join('') + '</tr></table>';
    h += '<div class="small dim" style="margin-top:6px">★ = AI recommendation (highest weighted score: Safety 28% · Delay 20% · Passengers 14% · Sustainability 10% · Stands 10% · Workload 10% · Fairness 8%). Green = best in row.</div>';
    $('#planTable').innerHTML = h;
  }

  function radar() {
    const S = FA.state, axes = ['Delay', 'Safety', 'Passengers', 'Sustainability', 'Fairness', 'Stands', 'Workload'];
    const series = ids().map((id) => ({ name: S.plans[id].cfg.short, color: S.plans[id].cfg.color, values: axes.map((a) => S.plans[id].kpi.scores[a]), dash: id === 'baseline', fill: id === S.rec ? 0.2 : 0.05, width: id === S.rec ? 3 : 1.6 }));
    $('#radar').innerHTML = C.radar(axes, series, { w: 520, h: 380 });
  }

  function seg(el, cur, cb) {
    const S = FA.state;
    el.innerHTML = ids().map((id) => '<button data-id="' + id + '" class="' + (id === cur ? 'on' : '') + '">' + U.esc(S.plans[id].cfg.short) + '</button>').join('');
    el.querySelectorAll('button').forEach((b) => b.onclick = () => cb(b.dataset.id));
  }

  function seqChart() {
    const S = FA.state, plan = S.plans[seqPlan];
    seg($('#seqPlanSel'), seqPlan, (id) => { seqPlan = id; seqChart(); });
    const arr = S.inst.arrivals.slice();
    const W = 1100, rowH = 5, T = 20, L = 50, R = 10, H = T + arr.length * rowH + 26, T0 = 300, T1 = 520;
    const X = (t) => L + ((W - L - R) * (Math.max(T0, Math.min(T1, t)) - T0)) / (T1 - T0);
    let g = '';
    const sc = S.inst.scenario;
    if (sc.wx.start != null) g += '<rect x="' + X(sc.wx.start) + '" y="' + T + '" width="' + (X(sc.wx.end) - X(sc.wx.start)) + '" height="' + arr.length * rowH + '" fill="rgba(255,179,0,.06)"/>';
    (plan.mixedWins || []).forEach((w) => { g += '<rect x="' + X(w[0]) + '" y="' + T + '" width="' + Math.max(2, X(w[1]) - X(w[0])) + '" height="' + arr.length * rowH + '" fill="rgba(38,198,218,.07)"/>'; });
    for (let t = 300; t <= 510; t += 30) g += '<line x1="' + X(t) + '" x2="' + X(t) + '" y1="' + T + '" y2="' + (T + arr.length * rowH) + '" stroke="#1e3150"/><text x="' + X(t) + '" y="' + (H - 8) + '" fill="#5f7598" font-size="10" text-anchor="middle">' + D.fmt(t) + '</text>';
    arr.forEach((f, i) => {
      const y = T + i * rowH + rowH / 2;
      const s = plan.seqById.get(f.id), d = plan.divById.get(f.id);
      if (d) { g += '<text x="' + X(d.reactive ? d.when : f.eta - 25) + '" y="' + (y + 3) + '" fill="#b388ff" font-size="8">↗ ' + f.id + ' → ' + d.alt + '</text>'; return; }
      if (!s) return;
      if (s.atfm) g += '<line x1="' + X(f.eta) + '" x2="' + X(f.eta + s.atfm) + '" y1="' + y + '" y2="' + y + '" stroke="#66bb6a" stroke-width="3"/>';
      const hold0 = f.eta + (s.atfm || 0);
      if (s.land - hold0 > 0.3) g += '<line x1="' + X(hold0) + '" x2="' + X(s.land) + '" y1="' + y + '" y2="' + y + '" stroke="' + (s.hold > 20 ? '#ef5350' : '#ffb300') + '" stroke-width="3"/>';
      g += '<circle cx="' + X(s.land) + '" cy="' + y + '" r="2.2" fill="' + (s.rwy === 'S' ? '#26c6da' : '#e6eefb') + '"/>';
      if (f.priority !== 'normal') g += '<text x="' + (X(s.land) + 5) + '" y="' + (y + 3) + '" fill="#ef5350" font-size="8">' + f.id + ' ' + f.priority.toUpperCase() + '</text>';
    });
    g += '<text x="' + L + '" y="12" fill="#8ea3c4" font-size="10.5">Each row = one arrival (ordered by ETA). Amber/red = airborne holding · green = ground delay at origin (ATFM) · white dot = landing 12L/30R · cyan dot = landing 12R/30L (mixed mode)</text>';
    $('#seqChart').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%">' + g + '</svg>';
  }

  function gantt() {
    const S = FA.state, plan = S.plans[ganttPlan], inst = S.inst;
    seg($('#ganttPlanSel'), ganttPlan, (id) => { ganttPlan = id; gantt(); });
    const stands = inst.stands;
    const W = 1100, rowH = 13, T = 18, L = 46, R = 10, T0 = 300, T1 = 510;
    const H = T + stands.length * rowH + 20;
    const X = (t) => L + ((W - L - R) * (Math.max(T0, Math.min(T1, t)) - T0)) / (T1 - T0);
    let g = '';
    for (let t = 300; t <= 510; t += 30) g += '<line x1="' + X(t) + '" x2="' + X(t) + '" y1="' + T + '" y2="' + (H - 18) + '" stroke="#1e3150"/><text x="' + X(t) + '" y="12" fill="#5f7598" font-size="10" text-anchor="middle">' + D.fmt(t) + '</text>';
    stands.forEach((s, i) => {
      const y = T + i * rowH;
      if (i % 2) g += '<rect x="' + L + '" y="' + y + '" width="' + (W - L - R) + '" height="' + rowH + '" fill="rgba(255,255,255,.015)"/>';
      g += '<text x="' + (L - 6) + '" y="' + (y + 10) + '" fill="' + (s.contact ? '#8ea3c4' : '#5f7598') + '" font-size="9.5" text-anchor="end" font-family="JetBrains Mono">' + s.id + (s.code === 'F' ? '·F' : '') + '</text>';
      (plan.tl.get(s.id) || []).forEach((iv) => {
        if (iv.end < T0 || iv.start > T1) return;
        const x0 = X(iv.start), x1 = X(iv.end);
        let fill = '#2c4570', stroke = 'none', label = iv.id;
        if (iv.kind === 'outage') { fill = 'url(#ghatch)'; label = 'U/S'; }
        else if (iv.kind === 'arr') { const f = plan.seqById.get(iv.id); fill = f && f.f.airline === 'EK' ? '#8a6a24' : f && f.f.airline === 'FZ' ? '#25677f' : '#4b5d73'; }
        if (iv.towed) stroke = '#ffee58';
        g += '<rect x="' + x0 + '" y="' + (y + 1.5) + '" width="' + Math.max(1.5, x1 - x0) + '" height="' + (rowH - 3) + '" rx="2" fill="' + fill + '" stroke="' + stroke + '"><title>' + U.esc(iv.id + ' ' + D.fmt(iv.start) + '–' + D.fmt(iv.end)) + '</title></rect>';
        if (x1 - x0 > 36) g += '<text x="' + (x0 + 3) + '" y="' + (y + 9.5) + '" fill="#e6eefb" font-size="8" font-family="JetBrains Mono">' + U.esc(label) + '</text>';
      });
    });
    plan.alloc.filter((a) => a.wait > 1).forEach((a) => {
      const i = stands.findIndex((s) => s.id === a.stand), y = T + i * rowH;
      g += '<rect x="' + X(a.onBlock - a.wait) + '" y="' + (y + 4) + '" width="' + Math.max(1.5, X(a.onBlock) - X(a.onBlock - a.wait)) + '" height="' + (rowH - 8) + '" fill="#ef5350" opacity=".85"><title>' + a.id + ' waits ' + Math.round(a.wait) + ' min for stand</title></rect>';
    });
    plan.tows.forEach((tw) => {
      const i = stands.findIndex((s) => s.id === tw.from), y = T + i * rowH;
      g += '<text x="' + X(tw.at) + '" y="' + (y + 10) + '" font-size="9">🚜</text>';
    });
    const defs = '<defs><pattern id="ghatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#3a1418"/><line x1="0" y1="0" x2="0" y2="5" stroke="#ef5350" stroke-width="2"/></pattern></defs>';
    $('#gantt').innerHTML = '<div class="small dim" style="margin-bottom:6px">Grey-blue = departure on stand · gold = Emirates arrival · teal = flydubai · grey = other · red = aircraft waiting for its stand · hatched = unserviceable · yellow outline / 🚜 = towed</div><svg viewBox="0 0 ' + W + ' ' + H + '" width="100%">' + defs + g + '</svg>';
  }

  function decisions() {
    const S = FA.state, plan = S.plans[S.viewPlan === 'baseline' ? S.rec : S.viewPlan];
    const items = [];
    plan.divs.forEach((d) => items.push({ ic: '↗', id: d.id, t: d.id + ' diverted to ' + d.alt + (d.reactive ? ' (late, at minimum fuel)' : ' — decided 25 min before arrival') }));
    plan.tows.forEach((tw) => items.push({ ic: '🚜', id: tw.id, t: tw.id + ' towed ' + tw.from + ' → ' + tw.to + ' at ' + D.fmt(tw.at) + ' to free the gate for ' + tw.forArr }));
    plan.seq.filter((s) => s.f.priority !== 'normal').forEach((s) => items.push({ ic: s.f.priority === 'mayday' ? '🆘' : s.f.priority === 'medical' ? '🚑' : '★', id: s.id, t: s.id + ' ' + s.f.priority.toUpperCase() + ' — lands ' + D.fmt(s.land) + ' (+' + Math.round(s.land - s.f.eta) + ' min), stand ' + (plan.allocById.get(s.id) || {}).stand }));
    plan.seq.filter((s) => s.atfm > 1).forEach((s) => items.push({ ic: '🛫', id: s.id, t: s.id + ' ATFM: ' + Math.round(s.atfm) + ' min ground delay at ' + s.f.port + ' instead of holding' }));
    plan.seq.filter((s) => s.pos !== s.fcfsPos && s.f.priority === 'normal').slice(0, 25).forEach((s) => items.push({ ic: s.pos < s.fcfsPos ? '⤴' : '⤵', id: s.id, t: s.id + ' sequence ' + (s.fcfsPos + 1) + ' → ' + (s.pos + 1) + (s.rwy === 'S' ? ' (lands 12R/30L, mixed mode)' : '') }));
    plan.alloc.filter((a) => a.remote).forEach((a) => items.push({ ic: '🚌', id: a.id, t: a.id + ' → remote stand ' + a.stand + ' (bus ops pre-alerted)' }));
    $('#decisionList').innerHTML = '<div class="small muted" style="margin-bottom:4px">' + U.esc(plan.cfg.name) + ' · ' + items.length + ' decisions · click for explanation</div>' + items.map((i) => '<div class="dec" data-id="' + i.id + '"><span>' + i.ic + '</span><span>' + U.esc(i.t) + '</span></div>').join('');
    $('#conflictList').innerHTML = S.plans.baseline.conflicts.length ? S.plans.baseline.conflicts.map((c) => '<div class="dec" data-id="' + c.id + '"><span>' + (c.type === 'fuel' ? '⛽' : c.type === 'taxi' ? '🚧' : '⚠') + '</span><span>' + U.esc(c.msg) + '</span></div>').join('') : '<div class="muted small">No conflicts under current practice in this scenario.</div>';
    document.querySelectorAll('#view-plans .dec').forEach((n) => n.onclick = () => {
      if (!n.dataset.id || n.dataset.id === '—') return;
      const x = E.explainFlight(plan, n.dataset.id), xb = E.explainFlight(S.plans.baseline, n.dataset.id);
      U.modal('<h2>' + U.esc(x.title || n.dataset.id) + '</h2><h3 style="color:' + plan.cfg.color + '">' + U.esc(plan.cfg.name) + '</h3><ul class="xp-lines">' + x.lines.map((l) => '<li>' + U.esc(l) + '</li>').join('') + '</ul>' + (x.alts && x.alts.length ? '<div class="xp-alts" style="margin-top:8px">' + x.alts.map((a) => '<div><span class="mono">' + a.stand + '</span><span class="muted">' + U.esc(a.text) + '</span></div>').join('') + '</div>' : '') + '<h3 style="color:#ef5350;margin-top:14px">Current practice</h3><ul class="xp-lines">' + xb.lines.map((l) => '<li>' + U.esc(l) + '</li>').join('') + '</ul><div style="margin-top:12px"><button class="btn sm" id="showOnMap">Show on map</button></div>');
      document.getElementById('showOnMap').onclick = () => { U.closeModal(); FA.app.select(n.dataset.id); FA.app.setView('ops'); };
    });
  }

  function actions() {
    const S = FA.state;
    $('#plansActions').innerHTML = (S.approved ? '<span class="chip live">ACTIVE: ' + U.esc(S.plans[S.approved.planId].cfg.short) + '</span>' : '') +
      '<button class="btn ghost" id="toOps">← Ops Center</button>' + (!S.approved ? '<button class="btn green" id="apRec">✔ Approve AI recommendation (' + U.esc(S.plans[S.rec].cfg.short) + ')</button>' : '');
    $('#toOps').onclick = () => FA.app.setView('ops');
    const a = $('#apRec'); if (a) a.onclick = () => { if (!S.generated) FA.app.generate(); FA.app.approve(S.rec); render(); };
  }

  function render() {
    const S = FA.state;
    if (!S.plans) return;
    if (!seqPlan || !S.plans[seqPlan]) seqPlan = S.rec;
    if (!ganttPlan || !S.plans[ganttPlan]) ganttPlan = 'baseline';
    actions(); table(); radar(); seqChart(); gantt(); decisions();
  }

  FA.views.plans = {
    init() {
      FA.bus.on('scenario', () => { seqPlan = null; ganttPlan = null; if (FA.state.view === 'plans') render(); });
      FA.bus.on('approved', () => { if (FA.state.view === 'plans') render(); });
    },
    show: render
  };
})(window.FA);
