/* FalconAero — Ops Center view: scenarios, KPIs, AI recovery panel (human-in-the-loop), XAI, arrival stream. */
(function (FA) {
  'use strict';
  const D = FA.data, E = FA.engine, U = FA.ui;
  const $ = (s) => document.querySelector(s);
  const OPT = ['balanced', 'mindelay', 'safety'];

  /* ---------------- scenarios ---------------- */
  function renderScenarios() {
    const S = FA.state;
    $('#scenarioList').innerHTML = Object.values(D.SCENARIOS).map((sc) =>
      '<button class="scn' + (sc.id === S.scenarioId ? ' on' : '') + '" data-sc="' + sc.id + '"><span class="ic">' + sc.icon + '</span><span><b>' + U.esc(sc.name) + '</b><small>' + U.esc(sc.short) + '</small></span></button>').join('') +
      '<div class="small muted" style="margin-top:6px">' + U.esc(S.inst.scenario.desc) + '</div>';
    document.querySelectorAll('.scn').forEach((b) => b.onclick = () => { FA.app.loadScenario(b.dataset.sc); });
    $('#seedChip').textContent = 'day #' + S.seed;
  }

  /* ---------------- KPI strip ---------------- */
  function renderKpis() {
    const S = FA.state;
    const p = S.plans[S.active], b = S.plans.baseline, k = p.kpi, kb = b.kpi;
    const cmp = S.active !== 'baseline';
    const items = [
      { l: 'Avg delay', tip: 'Average arrival delay incl. diversions (a diversion counts as 180 min)', v: k.avgDelayAll.toFixed(1) + '′', d: cmp ? U.delta(k.avgDelayAll, kb.avgDelayAll, true) : '', c: '#26c6da' },
      { l: 'Diversions', v: k.diversions, d: cmp ? U.delta(k.diversions, kb.diversions, true) : (k.secondaryDiv ? '<span class="bad">' + k.secondaryDiv + ' into LVP fields</span>' : ''), c: '#b388ff' },
      { l: 'Conflicts', tip: 'Stand and ground conflicts', v: k.conflicts, d: cmp ? U.delta(k.conflicts, kb.conflicts, true) : '', c: '#ef5350' },
      { l: 'Min fuel margin', tip: 'Smallest remaining holding-fuel margin of any aircraft', v: Math.round(k.minFuelMargin) + '′', d: cmp ? U.delta(k.minFuelMargin, kb.minFuelMargin, false) : (k.fuelCritical ? '<span class="bad">' + k.fuelCritical + ' at minimum fuel</span>' : ''), c: '#ffb300' },
      { l: 'CO₂ (disruption)', tip: 'CO₂ from holding, queueing and diversions', v: (k.co2 / 1000).toFixed(0) + ' t', d: cmp ? U.delta(k.co2, kb.co2, true) : '', c: '#66bb6a' },
      { l: 'Missed conn.', tip: 'Transfer passengers projected to miss connections', v: U.num(k.missedConn), d: cmp ? U.delta(k.missedConn, kb.missedConn, true) : '', c: '#e2b04a' }
    ];
    $('#kpiStrip').innerHTML = items.map((i) => '<div class="kpi" style="--kc:' + i.c + '" title="' + U.esc(i.tip || i.l) + '"><div class="l">' + i.l + '</div><div class="v">' + i.v + '</div><div class="d">' + (i.d || '<span class="dim">' + (cmp ? '' : 'projection · current practice') + '</span>') + '</div></div>').join('');
    const pill = $('#modePill');
    pill.textContent = cmp ? 'Executing: ' + p.cfg.name + ' (approved by human)' : 'Projected: Current Practice (no decision support)';
    pill.classList.toggle('ai', cmp);
  }

  /* ---------------- AI panel ---------------- */
  let computing = false;
  function renderAI() {
    const S = FA.state, root = $('#aiPanel');
    if (computing) return;
    const b = S.plans.baseline.kpi;
    const sc = S.inst.scenario;
    let h = '<div class="panel-h"><span>⚡ AI Disruption Recovery</span><span class="chip ' + (S.approved ? 'live' : 'gold') + '">' + (S.approved ? 'EXECUTING' : S.generated ? 'AWAITING HUMAN DECISION' : 'MONITORING') + '</span></div>';
    if (!S.generated) {
      const bad = b.diversions + b.conflicts + b.fuelCritical > 0 || b.avgDelayAll > 10;
      if (bad) {
        h += '<div class="alert red"><div class="ic">🚨</div><div><b>' + U.esc(sc.name) + ' — projected impact under current practice</b><span class="small">' +
          [b.diversions ? b.diversions + ' diversions' + (b.secondaryDiv ? ' (' + b.secondaryDiv + ' into fields also in LVP)' : '') : '', b.fuelCritical ? b.fuelCritical + ' aircraft reach minimum fuel' : '', b.conflicts ? b.conflicts + ' stand / ground conflicts' : '', 'average delay ' + b.avgDelayAll.toFixed(0) + ' min', b.emergDelay > 1 ? 'emergency aircraft wait ' + Math.round(b.emergDelay) + ' min' : '', U.num(b.missedConn) + ' missed connections'].filter(Boolean).join(' · ') + '</span></div></div>';
      } else {
        h += '<div class="alert green"><div class="ic">✅</div><div><b>Operations nominal</b><span class="small">FalconAero is monitoring weather, traffic and stands. You can still compare plans.</span></div></div>';
      }
      h += '<button class="btn gold lg block" id="genBtn">⚡ Generate recovery plans</button>';
      h += '<div class="small muted" style="margin-top:8px">Fuses weather, flight plans (AODB), A-CDM milestones, stand status and UAE-network capacity; evaluates runway, taxiway, stand and diversion decisions <b>jointly</b>.</div>';
      root.innerHTML = h;
      $('#genBtn').onclick = runGenerate;
      return;
    }
    if (S.approved) {
      const ap = S.plans[S.approved.planId];
      h += '<div class="alert green"><div class="ic">✔</div><div><b>' + U.esc(ap.cfg.name) + ' approved</b><span class="small">by ' + U.esc(S.approved.by) + ' at ' + D.fmt(S.approved.at) + ' GST. Controllers issue all instructions; FalconAero tracks execution and re-plans on deviation.</span></div></div>';
    }
    h += '<div class="plan-cards">' + OPT.concat(['baseline']).map((id) => card(S.plans[id], id)).join('') + '</div>';
    const vp = S.plans[S.viewPlan];
    h += '<div class="small" style="font-weight:700;margin-top:4px">What ' + U.esc(vp.cfg.short) + ' does</div><ul class="actions-list">' + vp.actions.map((a) => '<li><span>' + a.icon + '</span><span>' + U.esc(a.text) + '</span></li>').join('') + '</ul>';
    h += '<div class="meta-line"><span>Computed in <b>' + Math.round(vp.ms) + ' ms</b></span><span>Stand-plan stability under ETA noise <b>' + Math.round(vp.robust * 100) + '%</b></span><span>Score <b>' + vp.kpi.scores.overall.toFixed(1) + '</b></span></div>';
    if (!S.approved || S.approved.planId !== S.viewPlan) {
      h += '<div class="hitl"><button class="btn green" id="apBtn">✔ Approve ' + U.esc(vp.cfg.short) + '</button><button class="btn ghost" id="modBtn">✎ Modify</button><button class="btn ghost" id="rejBtn">✕ Reject</button></div>';
    }
    h += '<div class="small dim" style="margin-top:8px">Human-in-the-loop: nothing changes in operations until an authorised supervisor approves. Every action is logged in the tamper-evident audit trail.</div>';
    root.innerHTML = h;
    root.querySelectorAll('.plan-card').forEach((c) => c.onclick = () => { S.viewPlan = c.dataset.id; renderAI(); FA.bus.emit('viewPlan', S.viewPlan); });
    const ap = $('#apBtn'); if (ap) ap.onclick = () => FA.app.approve(S.viewPlan);
    const mb = $('#modBtn'); if (mb) mb.onclick = modify;
    const rb = $('#rejBtn'); if (rb) rb.onclick = () => FA.app.reject('controller judgement');
  }

  function card(p, id) {
    const S = FA.state, k = p.kpi, rec = id === S.rec;
    return '<div class="plan-card' + (S.viewPlan === id ? ' sel' : '') + '" data-id="' + id + '"><div class="top"><span class="nm"><i class="swatch" style="background:' + p.cfg.color + '"></i>' + U.esc(p.cfg.short) + (rec ? ' <span class="rec-badge">AI RECOMMENDED</span>' : '') + (id === 'baseline' ? ' <span class="chip">reference</span>' : '') + (S.approved && S.approved.planId === id ? ' <span class="chip live">ACTIVE</span>' : '') + '</span><span class="sc" style="color:' + p.cfg.color + '">' + k.scores.overall.toFixed(0) + '</span></div>' +
      '<div class="row"><span>Avg delay<b>' + k.avgDelayAll.toFixed(1) + '′</b></span><span>Diversions<b>' + k.diversions + '</b></span><span>Conflicts<b>' + k.conflicts + '</b></span><span>CO₂<b>' + (k.co2 / 1000).toFixed(0) + 't</b></span></div></div>';
  }

  function runGenerate() {
    const S = FA.state;
    computing = true;
    const n = S.inst.arrivals.length;
    const steps = ['Fusing METAR, AODB flight plans, A-CDM milestones, stand status', 'Fog nowcast → capacity forecast (AAR ' + Math.round(60 / E.arrSep(S.inst, { wake: 'H' }, { wake: 'H' }, S.inst.scenario.wx.start || 360, 0, false)) + '/h in LVP)', 'Sequencing ' + n + ' arrivals (wake-aware lookahead, CPS-bounded)', 'Runway Configuration Advisor (segregated ↔ mixed mode)', 'Stand allocation (regret-based) + towing options', 'Diversion & alternate scoring across 6 UAE airports', 'Stress test: 20 Monte-Carlo ETA-noise runs per plan', 'Scoring 7 objectives · selecting recommendation'];
    $('#aiPanel').innerHTML = '<div class="panel-h"><span>⚡ AI Disruption Recovery</span><span class="chip cy">COMPUTING</span></div><div class="computing">' + steps.map((s) => '<div class="step">' + U.esc(s) + '</div>').join('') + '</div>';
    const els = document.querySelectorAll('.computing .step');
    els.forEach((e, i) => setTimeout(() => e.classList.add('done'), 160 + i * 170));
    setTimeout(() => { computing = false; FA.app.generate(); }, 200 + steps.length * 170);
  }

  function modify() {
    const S = FA.state, base = S.plans[S.viewPlan];
    if (base.cfg.mode === 'baseline') { U.toast('Pick an AI plan to modify', '', 'amber'); return; }
    const c = base.cfg;
    U.modal('<h2>Modify plan — ' + U.esc(c.name) + '</h2><p class="muted">Adjust the guardrails; FalconAero re-optimises instantly and logs your change as a human override.</p>' +
      slider('cps', 'Max sequence position shift (fairness bound)', 0, 6, 1, c.cps) +
      slider('reserve', 'Extra fuel margin before proactive diversion (min)', 0, 25, 1, c.reserve) +
      slider('towThreshold', 'Tow when an arrival would wait ≥ (min)', 4, 40, 1, c.towThreshold) +
      '<label class="toggle" style="margin:8px 0"><input type="checkbox" id="m_noDual"' + (c.dual ? '' : ' checked') + '> Keep runways segregated (no mixed mode)</label>' +
      '<label class="toggle" style="margin:8px 0"><input type="checkbox" id="m_noRemote"> Contact stands only (no remote / bussing)</label>' +
      '<div id="modPreview" class="card small" style="margin:10px 0">Adjust a value to preview.</div><div style="display:flex;gap:8px"><button class="btn green" id="modApply">✔ Approve modified plan</button><button class="btn ghost" onclick="FA.ui.closeModal()">Cancel</button></div>');
    const read = () => ({ cps: +$('#m_cps').value, reserve: +$('#m_reserve').value, towThreshold: +$('#m_towThreshold').value, noDual: $('#m_noDual').checked, noRemote: $('#m_noRemote').checked });
    const preview = () => {
      const pol = read();
      const p = E.buildPlan(S.inst, S.viewPlan, pol);
      const k = p.kpi;
      $('#modPreview').innerHTML = 'Preview: avg delay <b class="mono">' + k.avgDelayAll.toFixed(1) + '′</b> · diversions <b class="mono">' + k.diversions + '</b> · conflicts <b class="mono">' + k.conflicts + '</b> · min fuel margin <b class="mono">' + Math.round(k.minFuelMargin) + '′</b> · score <b class="mono">' + k.scores.overall.toFixed(1) + '</b> (was ' + base.kpi.scores.overall.toFixed(1) + ')';
      return p;
    };
    document.querySelectorAll('#modalBody input').forEach((i) => i.oninput = () => { const o = document.getElementById(i.id + '_v'); if (o) o.textContent = i.value; preview(); });
    $('#modApply').onclick = () => {
      const pol = read();
      const p = preview();
      p.robust = E.robustness(p);
      p.cfg = Object.assign({}, p.cfg, { id: 'custom', name: c.name + ' (modified)', short: 'Modified', color: '#ff8a65' });
      S.plans.custom = p;
      if (!OPT.includes('custom')) OPT.push('custom');
      FA.audit.add('HUMAN_MODIFY', 'ATC Supervisor (demo)', 'Modified ' + c.name + ': ' + JSON.stringify(pol));
      U.closeModal();
      FA.app.approve('custom');
    };
  }
  function slider(id, label, min, max, step, val) {
    return '<div style="margin:10px 0"><div class="small" style="display:flex;justify-content:space-between"><span>' + label + '</span><b class="mono" id="m_' + id + '_v">' + val + '</b></div><input type="range" id="m_' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" style="width:100%"></div>';
  }

  /* ---------------- explanation ---------------- */
  function renderExplain() {
    const S = FA.state, id = S.selected, root = $('#explainBody');
    if (!id) { root.innerHTML = '<span class="muted small">Click any aircraft on the map or a dot in the arrival stream to see what FalconAero decided for it — and why.</span>'; return; }
    const block = (plan, title, color) => {
      const x = E.explainFlight(plan, id);
      if (!x.title && !x.lines.length) return '';
      return '<div style="border-left:3px solid ' + color + ';padding-left:8px;margin-bottom:10px"><div class="small" style="font-weight:700;color:' + color + ';margin-bottom:4px">' + U.esc(title) + '</div>' +
        '<ul class="xp-lines">' + x.lines.map((l) => '<li>' + U.esc(l) + '</li>').join('') + '</ul>' +
        (x.alts && x.alts.length ? '<div class="xp-alts"><div class="dim" style="border:0">Alternatives considered</div>' + x.alts.map((a) => '<div><span class="mono">' + a.stand + '</span><span class="muted">' + U.esc(a.text) + '</span></div>').join('') + '</div>' : '') + '</div>';
    };
    const ref = S.active !== 'baseline' ? S.plans[S.active] : S.generated ? S.plans[S.viewPlan] : S.plans.baseline;
    const x = E.explainFlight(ref, id);
    let h = '<div class="xp-title">' + U.esc(x.title || id) + '</div>';
    if (x.factors && x.factors.length) h += '<div class="xp-factors">' + x.factors.map((f) => '<div><span>' + f.k + '</span><b class="mono">' + U.esc(f.v) + '</b></div>').join('') + '</div>';
    if (S.generated && ref.cfg.mode === 'opt') {
      h += block(ref, 'FalconAero — ' + ref.cfg.short, ref.cfg.color);
      h += block(S.plans.baseline, 'Current practice (for comparison)', '#ef5350');
    } else {
      h += block(S.plans.baseline, 'Current practice', '#ef5350');
      if (!S.generated) h += '<div class="small muted">Generate recovery plans to see FalconAero\'s decision for this flight.</div>';
    }
    root.innerHTML = h;
  }

  /* ---------------- arrival stream ---------------- */
  function renderTimeline() {
    const S = FA.state, plan = S.plans[S.active], inst = S.inst;
    const W = 1000, H = 170, L = 70, R = 10, T0 = 300, T1 = 510;
    const X = (t) => L + ((W - L - R) * (Math.max(T0, Math.min(T1, t)) - T0)) / (T1 - T0);
    const lanes = { N: 30, S: 82, D: 134 };
    let g = '';
    const sc = inst.scenario;
    if (sc.wx.start != null) g += '<rect x="' + X(sc.wx.start) + '" y="8" width="' + (X(sc.wx.end) - X(sc.wx.start)) + '" height="' + (H - 30) + '" fill="' + (sc.lvp ? 'rgba(255,179,0,.07)' : 'rgba(201,138,58,.08)') + '"/><text x="' + (X(sc.wx.start) + 4) + '" y="18" fill="#ffd54f" font-size="10">' + (sc.lvp ? 'LVP / fog' : 'dust') + '</text>';
    inst.events.filter((e) => e.type === 'rwyClosure').forEach((e) => { g += '<rect x="' + X(e.start) + '" y="' + (lanes.N - 18) + '" width="' + (X(e.end) - X(e.start)) + '" height="36" fill="rgba(239,83,80,.12)"/>'; });
    (plan.mixedWins || []).forEach((w) => { g += '<rect x="' + X(w[0]) + '" y="' + (lanes.S - 18) + '" width="' + Math.max(2, X(w[1]) - X(w[0])) + '" height="36" fill="rgba(38,198,218,.10)"/>'; });
    Object.entries({ N: '12L/30R', S: '12R/30L', D: 'Diverted' }).forEach(([k, v]) => { g += '<text x="6" y="' + (lanes[k] + 4) + '" fill="#8ea3c4" font-size="11" font-weight="600">' + v + '</text><line x1="' + L + '" x2="' + (W - R) + '" y1="' + lanes[k] + '" y2="' + lanes[k] + '" stroke="#1e3150"/>'; });
    for (let t = 300; t <= 510; t += 30) g += '<text x="' + X(t) + '" y="' + (H - 4) + '" fill="#5f7598" font-size="10" text-anchor="middle">' + D.fmt(t) + '</text>';
    plan.seq.forEach((s, i) => {
      const y = lanes[s.rwy] + ((i % 5) - 2) * 6;
      const col = s.f.priority === 'mayday' || s.f.priority === 'medical' ? '#ef5350' : s.f.airline === 'EK' ? '#e2b04a' : s.f.airline === 'FZ' ? '#4fc3f7' : '#b0bec5';
      const holdCol = s.hold > 20 ? '#ef5350' : s.hold > 8 ? '#ffb300' : '#3a5277';
      if (s.atfm) g += '<line x1="' + X(s.f.eta) + '" x2="' + X(s.f.eta + s.atfm) + '" y1="' + y + '" y2="' + y + '" stroke="#66bb6a" stroke-width="2" stroke-dasharray="2 2"/>';
      if (s.land - s.f.eta - (s.atfm || 0) > 0.5) g += '<line x1="' + X(s.f.eta + (s.atfm || 0)) + '" x2="' + X(s.land) + '" y1="' + y + '" y2="' + y + '" stroke="' + holdCol + '" stroke-width="2"/>';
      g += '<circle cx="' + X(s.land) + '" cy="' + y + '" r="' + (S.selected === s.id ? 5 : 3.2) + '" fill="' + col + '" stroke="' + (S.selected === s.id ? '#fff' : 'none') + '" data-id="' + s.id + '" style="cursor:pointer"><title>' + s.id + ' ETA ' + D.fmt(s.f.eta) + ' → ' + D.fmt(s.land) + '</title></circle>';
    });
    plan.divs.forEach((d, i) => {
      const t = d.reactive ? d.when : d.f.eta - 25;
      g += '<text x="' + X(t) + '" y="' + (lanes.D + 4 + ((i % 3) - 1) * 10) + '" fill="#b388ff" font-size="10" text-anchor="middle" data-id="' + d.id + '" style="cursor:pointer">↗' + d.id + '→' + d.alt.slice(2) + '</text>';
    });
    g += '<line x1="' + X(S.t) + '" x2="' + X(S.t) + '" y1="6" y2="' + (H - 18) + '" stroke="#00e5ff" stroke-width="1.5"/>';
    $('#arrTimeline').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '">' + g + '</svg><div class="small dim" style="margin-top:2px">Line = airborne holding (amber/red) · dashed green = delay absorbed on the ground at origin (ATFM) · dot = landing · cyan band = mixed-mode window</div>';
    document.querySelectorAll('#arrTimeline [data-id]').forEach((n) => n.addEventListener('click', () => FA.app.select(n.dataset.id)));
  }

  /* ---------------- sim controls ---------------- */
  function initControls() {
    const S = FA.state;
    $('#playBtn').onclick = () => FA.app.play();
    FA.bus.on('play', (on) => { $('#playBtn').textContent = on ? '❚❚' : '▶'; });
    document.querySelectorAll('#speedBtns button').forEach((b) => b.onclick = () => {
      S.speed = +b.dataset.s;
      document.querySelectorAll('#speedBtns button').forEach((x) => x.classList.toggle('on', x === b));
    });
    $('#timeSlider').oninput = (e) => FA.app.setTime(+e.target.value);
    let lastTl = -1;
    FA.bus.on('tick', (t) => {
      $('#timeSlider').value = t; $('#timeLabel').textContent = D.fmt(t);
      if (FA.state.view === 'ops' && Math.abs(t - lastTl) >= 1) { lastTl = t; renderTimeline(); }
    });
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); FA.app.play(); }
    });
  }

  FA.views.ops = {
    init() {
      FA.map.init();
      FA.weather.init();
      initControls();
      const all = () => { renderScenarios(); renderKpis(); renderAI(); renderExplain(); renderTimeline(); };
      FA.bus.on('scenario', all);
      FA.bus.on('replan', all);
      FA.bus.on('generated', () => { renderAI(); renderKpis(); renderExplain(); });
      FA.bus.on('approved', () => { renderAI(); renderKpis(); renderExplain(); renderTimeline(); });
      FA.bus.on('select', () => { renderExplain(); renderTimeline(); });
      FA.bus.on('viewPlan', renderExplain);
    },
    show() { FA.map.render(FA.state.t); renderTimeline(); },
    runGenerate
  };
})(window.FA);
