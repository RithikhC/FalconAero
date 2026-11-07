/* FalconAero — Responsible AI & Governance view.
   Theme: Responsible AI & Smart Cognitive Government. Human-in-the-loop by design:
   principles mapped to concrete mechanisms, live tamper-evident audit trail, oversight metrics,
   fairness dashboard, model cards and a safety-assurance roadmap. */
(function (FA) {
  'use strict';
  let root = null;
  const esc = (s) => FA.ui.esc(s);

  const TYPE_STYLE = {
    SCENARIO: ['', 'Scenario'], AI_RECOMMEND: ['cy', 'AI recommend'], HUMAN_APPROVE: ['live', 'Human approve'],
    HUMAN_OVERRIDE: ['gold', 'Human override'], HUMAN_REJECT: ['red', 'Human reject'], INNOVATION: ['', 'Innovation'],
    COPILOT: ['cy', 'Copilot'], ALERT: ['red', 'Alert']
  };

  const PRINCIPLES = [
    { ic: '🧑‍✈️', t: 'Human oversight', m: ['AI recommends; licensed controllers and supervisors decide', 'Every plan needs an explicit Approve / choose-alternative / Reject', 'FalconAero never issues ATC clearances or instructions'], see: 'Ops Center → AI Recovery panel' },
    { ic: '🔍', t: 'Transparency & explainability', m: ['Per-flight “Why?” with reasons, alternatives and their cost', 'Fog nowcast shows each factor’s contribution', 'Plan trade-offs shown side-by-side, not a single black-box answer'], see: 'Ops Center → Why? · Recovery Plans' },
    { ic: '🛡', t: 'Safety by construction', m: ['Hard constraints: ICAO Doc 4444 wake/radar separation, LVP spacing, Annex 14 stand code letters', 'Fuel-reserve guardrails trigger proactive diversion before minimum fuel', 'Monte-Carlo robustness test of every plan against ETA uncertainty'], see: 'Recovery Plans → KPI table' },
    { ic: '⚖', t: 'Fairness', m: ['Constrained position shifting caps how far any flight can move', 'Airline fairness index = 1 − Gini of per-airline mean delay', 'Fairness is an explicit term in the plan score'], see: 'This page → Fairness dashboard' },
    { ic: '🔗', t: 'Accountability', m: ['Append-only, SHA-256 hash-chained audit log of every AI output and human decision', 'Overrides and rejections are recorded with the actor', 'Exportable for investigations and SMS reviews'], see: 'This page → Audit trail' },
    { ic: '🔒', t: 'Privacy & security', m: ['Flight-level operational data only — no personal passenger data', 'Designed for UAE PDPL alignment and on-prem / sovereign-cloud hosting', 'Read-only integration with AODB / A-CDM; cyber review before any write access'], see: 'Architecture (Impact & Roadmap)' },
    { ic: '🌱', t: 'Sustainability', m: ['Holding, queueing and diversion fuel tracked per plan', 'CO₂ (3.16 kg per kg fuel) is a scored objective', 'Engines-off gate holding (A-CDM TSAT) by default'], see: 'Ops Center → KPI strip' }
  ];

  function css() {
    if (document.getElementById('fa-gov-css')) return;
    const s = document.createElement('style');
    s.id = 'fa-gov-css';
    s.textContent = `
.gov-anchors { display:flex; gap:6px; flex-wrap:wrap; margin:-4px 2px 12px; }
.gov-anchors .chip { text-transform:none; letter-spacing:0; font-weight:500; padding:4px 10px; font-size:11px; }
.gov-pr { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:10px; margin-bottom:12px; }
.gov-pr .card h3 { display:flex; gap:7px; align-items:center; }
.gov-pr .card ul { margin:4px 0 6px; padding-left:16px; font-size:11.5px; display:flex; flex-direction:column; gap:3px; }
.gov-pr .see { font-size:10.5px; color:var(--cyan); }
.gov-audit { max-height:360px; overflow:auto; }
.gov-audit table.t td { font-size:11px; vertical-align:top; }
.gov-audit td.det { font-family:inherit; color:var(--text); max-width:420px; }
.gov-hash { font-family:var(--mono); font-size:10px; color:var(--dim); white-space:nowrap; }
.gov-hash b { color:#7ff1ff; font-weight:400; }
.gov-metrics { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-bottom:8px; }
.gov-metrics .card { text-align:center; padding:8px; }
.gov-metrics .stat-big { font-size:24px; }
.gov-mc details { border:1px solid var(--line); border-radius:10px; padding:8px 12px; margin-bottom:8px; background:rgba(0,0,0,.15); }
.gov-mc summary { cursor:pointer; font-weight:700; display:flex; justify-content:space-between; align-items:center; list-style:none; }
.gov-mc summary::-webkit-details-marker { display:none; }
.gov-mc summary::after { content:'▾'; color:var(--muted); }
.gov-mc details[open] summary::after { content:'▴'; }
.gov-mc .kv { display:grid; grid-template-columns:150px 1fr; gap:4px 12px; font-size:12px; margin-top:8px; }
.gov-mc .kv > span { color:var(--muted); }
.gov-never li { display:grid; grid-template-columns:22px 1fr; gap:6px; padding:6px 4px; border-bottom:1px dashed var(--line); font-size:12.5px; }
.gov-never { list-style:none; padding:0; margin:0; }
.gov-road { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; }
.gov-road .card { position:relative; font-size:11.5px; }
.gov-road .card b { display:block; color:#7ff1ff; margin-bottom:3px; font-size:12px; }
.gov-road .card .n { font-family:var(--mono); color:var(--gold); font-size:11px; }
@media (max-width:1180px){ .gov-pr, .gov-metrics, .gov-road { grid-template-columns:1fr 1fr; } }
`;
    document.head.appendChild(s);
  }

  function render() {
    if (!root) return;
    root.innerHTML = `
      <div class="page-head">
        <div><h1>Responsible AI & Governance — human-in-the-loop by design</h1>
        <p class="muted">FalconAero is decision support for a safety-critical, sovereign service. Every principle below is backed by a working mechanism you can inspect in this prototype.</p></div>
        <div class="head-actions"><button class="btn ghost sm" id="govToOps">See it live in the Ops Center →</button></div>
      </div>
      <div class="gov-anchors">
        <span class="chip cy">UAE Charter for the Development and Use of AI (2024)</span>
        <span class="chip cy">UAE National Strategy for Artificial Intelligence 2031</span>
        <span class="chip cy">Dubai AI Ethics Principles (Digital Dubai)</span>
        <span class="chip">UAE PDPL — Federal Decree-Law 45/2021</span>
        <span class="chip">ICAO Doc 4444 · Annex 14 · Doc 9971</span>
      </div>
      <div class="gov-pr">${PRINCIPLES.map((p) => `<div class="card"><h3><span>${p.ic}</span>${esc(p.t)}</h3><ul>${p.m.map((x) => '<li>' + esc(x) + '</li>').join('')}</ul><div class="see">↳ ${esc(p.see)}</div></div>`).join('')}
        <div class="card" style="border-color:rgba(226,176,74,.5)"><h3><span>🚫</span>What the AI will never do</h3><ul class="gov-never">
          <li><span>✕</span>Issue ATC clearances or speak to aircraft</li>
          <li><span>✕</span>Override the pilot-in-command or the controller</li>
          <li><span>✕</span>Relax separation minima or stand constraints</li>
          <li><span>✕</span>Act without an explicit human approval</li>
          <li><span>✕</span>Use personal passenger data</li></ul></div>
      </div>
      <div class="panel"><div class="panel-h"><span>Human oversight metrics (this session)</span><span class="hint">derived from the audit log</span></div><div id="govOversight"></div></div>
      <div class="panel"><div class="panel-h"><span>Tamper-evident audit trail</span>
        <span style="display:flex;gap:6px"><button class="btn sm" id="govVerify">✔ Verify chain</button><button class="btn ghost sm" id="govTamper">⚠ Simulate tampering</button><button class="btn ghost sm" id="govExport">⬇ Export JSON</button></span></div>
        <div id="govVerifyOut"></div>
        <div class="gov-audit" id="govAudit"></div>
        <div class="src" style="margin-top:6px">Each entry stores SHA-256(n, time, sim time, type, actor, detail, previous hash). Changing any past entry breaks every later link — the same principle as a blockchain ledger, without the overhead.</div>
      </div>
      <div class="panel"><div class="panel-h"><span>Fairness dashboard — mean delay per airline</span><span class="hint" id="govFairHint"></span></div><div id="govFair"></div></div>
      <div class="panel gov-mc"><div class="panel-h"><span>Model cards</span><span class="hint">intended use, data, limitations, oversight</span></div><div id="govCards"></div></div>
      <div class="panel"><div class="panel-h"><span>Safety assurance roadmap</span><span class="hint">reference frameworks — no certification is claimed for this prototype</span></div>
        <div class="gov-road">
          <div class="card"><span class="n">01</span><b>Hazard identification</b>Joint hazard log with GCAA SMS, the ANSP and airport operator; failure modes (bad data, stale ETA, model drift).</div>
          <div class="card"><span class="n">02</span><b>Shadow mode</b>Runs on live AODB / A-CDM / METAR feeds, outputs compared with actual controller decisions; no operational effect.</div>
          <div class="card"><span class="n">03</span><b>Human-AI teaming trials</b>Supervisor-only advisory in a simulator, then on a single watch; acceptance & workload measured.</div>
          <div class="card"><span class="n">04</span><b>Assurance case</b>Evidence aligned with GCAA safety regulation and the EASA AI Concept Paper levels (Level 1 assistance → Level 2 human-AI teaming).</div>
          <div class="card"><span class="n">05</span><b>Continuous monitoring</b>Drift and calibration dashboards; overrides reviewed monthly; model re-trained on new seasons.</div>
        </div>
      </div>`;
    root.querySelector('#govToOps').onclick = () => FA.app.setView('ops');
    root.querySelector('#govVerify').onclick = verify;
    root.querySelector('#govTamper').onclick = tamper;
    root.querySelector('#govExport').onclick = exportJson;
    renderAudit(); renderOversight(); renderFair(); renderCards();
  }

  /* ---------- audit ---------- */
  function renderAudit() {
    const el = root && root.querySelector('#govAudit');
    if (!el) return;
    const log = FA.audit.log.slice().reverse().slice(0, 200);
    el.innerHTML = `<table class="t"><thead><tr><th>#</th><th>Sim</th><th>Wall clock (UTC)</th><th>Type</th><th>Actor</th><th>Detail</th><th>prev → hash</th></tr></thead><tbody>
      ${log.map((e) => { const s = TYPE_STYLE[e.type] || ['', e.type]; return `<tr><td>${e.n}</td><td>${esc(e.sim)}</td><td>${esc(e.ts.slice(11, 19))}</td><td><span class="chip ${s[0]}">${esc(s[1])}</span></td><td class="det">${esc(e.actor)}</td><td class="det">${esc(e.detail)}</td><td class="gov-hash">${e.prev.slice(0, 6)}… → <b>${e.hash.slice(0, 8)}…</b></td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">No entries yet.</td></tr>'}
    </tbody></table>`;
  }
  function verify() {
    const r = FA.audit.verify();
    const out = root.querySelector('#govVerifyOut');
    out.innerHTML = r.ok
      ? `<div class="alert green"><div class="ic">✔</div><div><b>Chain intact</b>${r.n} entries verified — every hash recomputes and links to its predecessor.</div></div>`
      : `<div class="alert red"><div class="ic">✕</div><div><b>Chain broken at entry #${r.at}</b>The log has been altered after the fact.</div></div>`;
  }
  function tamper() {
    const log = FA.audit.log;
    const out = root.querySelector('#govVerifyOut');
    if (log.length < 2) { out.innerHTML = '<div class="alert amber"><div class="ic">ℹ</div><div><b>Need at least 2 entries</b>Generate or approve a plan first.</div></div>'; return; }
    const idx = Math.max(0, Math.floor(log.length / 2) - 1);
    const original = log[idx].detail;
    log[idx].detail = original.replace(/Approved|Generated|Loaded|Rejected|Selected/, 'EDITED') + ' (edited)';
    const r = FA.audit.verify();
    log[idx].detail = original; // restore immediately — the real log is never left corrupted
    const r2 = FA.audit.verify();
    out.innerHTML = `<div class="alert ${r.ok ? 'amber' : 'red'}"><div class="ic">⚠</div><div><b>Tampering simulation: entry #${idx + 1} edited in memory</b>Verification result: ${r.ok ? 'not detected (unexpected)' : 'DETECTED — chain broken at entry #' + r.at}. The edit was reverted; current chain status: ${r2.ok ? 'intact (' + r2.n + ' entries)' : 'broken'}.</div></div>`;
  }
  function exportJson() {
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), verification: FA.audit.verify(), log: FA.audit.log }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'falconaero-audit-' + Date.now() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- oversight ---------- */
  function renderOversight() {
    const el = root && root.querySelector('#govOversight');
    if (!el) return;
    const log = FA.audit.log;
    const c = (t) => log.filter((e) => e.type === t).length;
    const rec = c('AI_RECOMMEND'), app = c('HUMAN_APPROVE'), ov = c('HUMAN_OVERRIDE'), rej = c('HUMAN_REJECT');
    const decided = app + ov + rej;
    const acc = decided ? Math.round((100 * app) / decided) : null;
    el.innerHTML = `<div class="gov-metrics">
      <div class="card"><div class="muted small">AI recommendations</div><div class="stat-big cy">${rec}</div></div>
      <div class="card"><div class="muted small">Approved as recommended</div><div class="stat-big good">${app}</div></div>
      <div class="card"><div class="muted small">Human overrides</div><div class="stat-big gold">${ov}</div></div>
      <div class="card"><div class="muted small">Rejected</div><div class="stat-big bad">${rej}</div></div>
      <div class="card"><div class="muted small">Acceptance rate</div><div class="stat-big">${acc == null ? '—' : acc + '%'}</div></div>
    </div>
    <div class="small muted">Overrides and rejections are not failures — they are the most valuable training signal. Each one is queued for monthly review by the ATC training unit and the model owner; persistent disagreement patterns trigger re-tuning of plan weights.${rec > decided ? ' <span class="warn">' + (rec - decided) + ' recommendation(s) still awaiting a human decision.</span>' : ''}</div>`;
  }

  /* ---------- fairness ---------- */
  function perAirline(plan) {
    const m = {};
    plan.seq.forEach((s) => {
      const a = plan.allocById.get(s.id);
      const d = (s.land - s.f.eta) + (a ? a.wait : 0); // ATFM ground delay is already inside land − eta
      (m[s.f.airline] = m[s.f.airline] || []).push(Math.max(0, d));
    });
    plan.divs.forEach((d) => { (m[d.f.airline] = m[d.f.airline] || []).push(180); });
    const out = {};
    Object.keys(m).forEach((k) => { out[k] = { mean: m[k].reduce((a, x) => a + x, 0) / m[k].length, n: m[k].length }; });
    return out;
  }
  function maxShift(plan) {
    let mx = 0;
    plan.seq.forEach((s) => { if (s.f.priority === 'normal') mx = Math.max(mx, Math.abs(s.pos - s.fcfsPos)); });
    return mx;
  }
  function renderFair() {
    const el = root && root.querySelector('#govFair');
    if (!el) return;
    const S = FA.state;
    if (!S.plans) { el.innerHTML = '<div class="muted">Load a scenario first.</div>'; return; }
    const base = S.plans.baseline;
    const pid = S.approved ? S.approved.planId : S.rec;
    const plan = S.plans[pid];
    const pb = perAirline(base), pp = perAirline(plan);
    const airlines = Object.keys(Object.assign({}, pb, pp)).sort((a, b) => ((pp[b] || pb[b]).n - (pp[a] || pb[a]).n));
    root.querySelector('#govFairHint').textContent = 'Baseline vs ' + plan.cfg.name + (S.approved ? ' (approved)' : ' (recommended)') + ' · diversions counted as 180 min';
    const data = airlines.map((a) => ({ label: a + ' (' + ((pp[a] || pb[a]).n) + ')', values: [pb[a] ? pb[a].mean : 0, pp[a] ? pp[a].mean : 0] }));
    const sh = maxShift(plan);
    const plansF = ['baseline', 'balanced', 'mindelay', 'safety'].map((id) => S.plans[id]);
    el.innerHTML = `<div class="grid-2" style="margin:0">
      <div>${FA.charts.bars(data, ['Current practice (FCFS)', plan.cfg.short], { h: 230, colors: ['#ef5350', plan.cfg.color] })}</div>
      <div>
        <table class="t"><thead><tr><th>Plan</th><th>Fairness index</th><th>Gini</th><th>Max shift</th><th>CPS bound</th></tr></thead><tbody>
        ${plansF.map((p) => { const ms = maxShift(p); return `<tr ${p.cfg.id === pid ? 'class="best"' : ''}><td><span class="swatch" style="background:${p.cfg.color}"></span> ${esc(p.cfg.short)}</td><td>${p.kpi.fairness.toFixed(3)}</td><td>${p.kpi.gini.toFixed(3)}</td><td>${ms}</td><td class="${ms <= Math.max(p.cfg.cps, 0) ? 'win' : ''}">±${p.cfg.cps}${ms <= p.cfg.cps ? ' ✓' : ''}</td></tr>`; }).join('')}
        </tbody></table>
        <div class="small muted" style="margin-top:8px">Fairness index = 1 − Gini coefficient of per-airline mean delay (1 = perfectly even). Max shift counts positions a normal-priority flight moved versus first-come-first-served; emergencies are exempt by design. ${plan.cfg.short}: max shift <b>${sh}</b> within its ±${plan.cfg.cps} bound.</div>
        <div class="alert cy" style="margin-top:8px"><div class="ic">⚖</div><div><b>Why it matters</b>A hub carrier and foreign carriers share the same runway. Bounded shifting plus an explicit fairness term means efficiency gains are not bought by systematically delaying any one airline.</div></div>
      </div></div>`;
  }

  /* ---------- model cards ---------- */
  function kv(rows) { return '<div class="kv">' + rows.map((r) => '<span>' + esc(r[0]) + '</span><div>' + r[1] + '</div>').join('') + '</div>'; }
  function fogCard() {
    const M = FA.fogModel;
    if (!M || !M.meta) {
      return `<details open><summary><span>🌫 Fog Nowcast — logistic regression on OMDB METAR</span><span class="chip">model file not loaded</span></summary>
        <p class="muted small" style="margin-top:8px">The trained model (js/fogmodel.js) is not available in this build; the Ops Center falls back to the scenario's scripted weather.</p></details>`;
    }
    const m = M.metrics || {};
    const pc = (v) => (v == null ? '—' : (100 * v).toFixed(1) + '%');
    const f3 = (v) => (v == null ? '—' : Number(v).toFixed(3));
    let cal = '';
    if (Array.isArray(M.calibration) && M.calibration.length) {
      const pts = M.calibration.filter((c) => c.n > 0 && c.observed != null).map((c) => [c.p, c.observed]);
      if (pts.length > 1) cal = FA.charts.line([{ name: 'Model', color: '#26c6da', points: pts }, { name: 'Perfect calibration', color: '#5f7598', dash: true, points: [[0, 0], [1, 1]] }], { w: 420, h: 200, xMin: 0, xMax: 1, yMax: 1, xFmt: (v) => v.toFixed(1), yFmt: (v) => v.toFixed(1) });
    }
    const feats = (M.features || []).map((f) => '<span class="tag">' + esc(f.label || f.key) + '</span>').join('');
    return `<details open><summary><span>🌫 Fog Nowcast — ${esc(M.meta.target || 'fog onset')}</span><span class="chip live">trained on real data</span></summary>
      <div class="grid-2" style="margin:8px 0 0">
        <div>${kv([
          ['Intended use', 'Advisory probability of low visibility at ' + esc(M.meta.station || 'OMDB') + ' to trigger early planning (ATFM, stand pre-allocation). Not a replacement for official NCM / MET office forecasts.'],
          ['Data', esc(M.meta.source || '') + '<br><span class="dim">' + esc(M.meta.period || '') + '</span>'],
          ['Split', 'Train ' + esc(M.meta.trainPeriod || '—') + ' (n=' + FA.ui.num(M.meta.nTrain) + ') · Test ' + esc(M.meta.testPeriod || '—') + ' (n=' + FA.ui.num(M.meta.nTest) + ') — time-based, no shuffling'],
          ['Features', feats],
          ['Test metrics', 'AUC <b>' + f3(m.auc) + '</b> (baseline ' + esc(m.baselineName || '—') + ': ' + f3(m.baselineAuc) + ') · Brier ' + f3(m.brier) + ' · base rate ' + pc(m.baseRate) + '<br>At threshold ' + (m.threshold != null ? m.threshold : '—') + ': precision ' + pc(m.precision) + ', recall ' + pc(m.recall) + ', F1 ' + f3(m.f1)],
          ['Limitations', 'Single station; METAR is ~30-min resolution; no NWP inputs; not certified.'],
          ['Oversight', 'Probability + factor contributions are shown to the supervisor, who decides whether to start LVP preparations.']
        ])}</div>
        <div>${cal ? '<div class="small muted">Reliability on the held-out test period</div>' + cal : '<div class="muted small">No calibration table available.</div>'}</div>
      </div></details>`;
  }
  function renderCards() {
    const el = root && root.querySelector('#govCards');
    if (!el) return;
    el.innerHTML = fogCard() +
      `<details><summary><span>🛬 Arrival Sequencer — constrained position shifting with look-ahead</span><span class="chip">optimisation heuristic</span></summary>${kv([
        ['Intended use', 'Propose a landing order and runway for each arrival during capacity drops (LVP, sandstorm, runway closure).'],
        ['Method', 'Greedy sequencing with one-step look-ahead over a window of the next k+1 flights (k = CPS bound: Balanced ±3, Min-Delay ±5, Max-Safety ±2). Objective: passenger-, transfer- and priority-weighted delay plus a fuel-slack urgency term.'],
        ['Hard constraints', 'Wake/radar separation (ICAO Doc 4444 distance minima converted at ~140 kt), runway occupancy, LVP spacing, mixed-mode gaps; a flight passed over k times must land next; MAYDAY/medical may jump the queue.'],
        ['Runway Configuration Advisor', 'Opens 12R/30L to arrivals (mixed mode) when the airborne backlog exceeds a trigger; departure spacing is re-planned accordingly.'],
        ['Diversions', 'Iteratively diverts the lowest-passenger-impact flight before it enters the hold when any flight would breach its fuel margin; alternate chosen by weather, Code-F stands and apron load.'],
        ['Limitations', 'Heuristic, not a proven optimum; ETAs assumed known ±3 min; stylised airport geometry.'],
        ['Oversight', 'Controllers see every position change and its reason; plan applies only after approval.']
      ])}</details>` +
      `<details><summary><span>🅿 Stand Allocator — regret-based assignment with towing</span><span class="chip">optimisation heuristic</span></summary>${kv([
        ['Intended use', 'Assign arriving aircraft to stands when departures are delayed and stands are blocked or unserviceable.'],
        ['Method', 'Batches of 5 arrivals; each candidate stand scored; the flight with the largest regret (2nd-best − best cost) is assigned first. Option to tow a ready, delayed departure to a remote stand.'],
        ['Cost terms', 'Wait (pax-weighted), remote/bus penalty, airline-terminal preference, Code-letter waste (keep Code-F for A380), medical → contact stand, transfer-walk bonus, tow cost.'],
        ['Hard constraints', 'ICAO Annex 14 code letter compatibility, unserviceable stands, 8-min buffer between occupancies.'],
        ['Limitations', 'Simplified turnaround times and tow durations; no gate staffing model.'],
        ['Oversight', 'Stand changes are proposals for the Airport Operations Control Centre.']
      ])}</details>` +
      `<details><summary><span>📊 Plan Scorer — multi-objective, weights visible</span><span class="chip">transparent formula</span></summary>${kv([
        ['Formula', 'Overall = 0.20·Delay + 0.28·Safety + 0.14·Passengers + 0.10·Sustainability + 0.08·Fairness + 0.10·Stands + 0.10·Workload (each 0–100).'],
        ['Safety sub-score', '0.30 fuel margin + 0.25 no fuel-critical events + 0.20 emergency delay + 0.15 conflicts + 0.10 taxiway saturation.'],
        ['Workload sub-score', 'Penalises tows, remote-stand bussing, mixed-mode minutes, stand conflicts and diversions — so the AI does not recommend plans that overload people.'],
        ['Governance', 'Weights are policy, not code: owned by GCAA/ANSP and adjustable in the Innovation Lab with evidence.'],
        ['Limitations', 'Normalisation ranges are prototype assumptions.']
      ])}</details>`;
  }

  function refresh() { if (!root) return; renderAudit(); renderOversight(); renderFair(); }

  FA.views = FA.views || {};
  FA.views.gov = {
    init() {
      FA.bus.on('audit', () => { if (root) { renderAudit(); renderOversight(); } });
      FA.bus.on('scenario', refresh);
      FA.bus.on('approved', refresh);
      FA.bus.on('generated', refresh);
    },
    mount(el) { root = el; css(); render(); },
    show() { refresh(); renderCards(); }
  };
})(window.FA);
