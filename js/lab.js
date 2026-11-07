/* FalconAero — Innovation Lab ("Ops Innovation Sandbox").
   Answers the GCAA problem statement: ideas stall because experimentation, testing and implementation
   support are not accessible. Here any employee or partner turns an operational idea into a policy
   experiment, runs it on the airport digital twin across many simulated disruption days, and gets an
   evidence pack + readiness score that moves the idea through a governed pipeline. */
(function (FA) {
  'use strict';
  const LS_KEY = 'fa.lab.v1';
  const STAGES = [
    { id: 0, name: 'Submitted', gate: 'Run a sandbox trial' },
    { id: 1, name: 'Sandbox-tested', gate: 'Evidence must support the idea, no safety blockers' },
    { id: 2, name: 'Validated (evidence)', gate: 'Service Owner + Safety/SMS sign-off' },
    { id: 3, name: 'Pilot approved', gate: 'Readiness ≥ 80 after 30-day shadow pilot' },
    { id: 4, name: 'Scaled', gate: '—' }
  ];
  // Engine defaults for the "FalconAero Balanced" configuration (see engine.js PLAN_CFGS.balanced)
  const DEF = { cps: 3, reserve: 8, towThreshold: 12, remote: true, atfm: true, nowcastLead: 40, prioritiseConnections: false, dual: true };
  const CONTROLS = {
    current: { label: 'Current FalconAero config (Balanced)', policy: {} },
    noAtfm: { label: 'Without ATFM pre-emption (today’s practice)', policy: { noAtfm: true } },
    noRemote: { label: 'Contact stands only (no remote/bus ops)', policy: { noRemote: true } },
    noDual: { label: 'Segregated runways (no dual-arrival mode)', policy: { noDual: true } }
  };
  const SIGNOFFS = [
    { k: 'owner', label: 'Service Owner (decision right)' },
    { k: 'safety', label: 'Safety / SMS review' },
    { k: 'cyber', label: 'IT, Digital & Cyber' },
    { k: 'partner', label: 'Airline / Airport partner' }
  ];
  const SCN = [{ id: 'fog', label: '🌫 Fog (LVP)' }, { id: 'storm', label: '⚠ Perfect storm' }, { id: 'sand', label: '🌪 Sandstorm' }, { id: 'runway', label: '⛔ Runway closure' }];
  const KPIS = [
    { key: 'avgDelayAll', label: 'Avg delay incl. diversions', unit: 'min', lower: true, d: 1 },
    { key: 'paxDelayHrs', label: 'Passenger-delay hours', unit: 'h', lower: true, d: 0 },
    { key: 'diversions', label: 'Diversions', unit: '', lower: true, d: 2 },
    { key: 'co2t', label: 'CO₂ (holding, queue, diversions)', unit: 't', lower: true, d: 1 },
    { key: 'missedConn', label: 'Missed connections', unit: 'pax', lower: true, d: 0 },
    { key: 'minFuelMargin', label: 'Min fuel margin', unit: 'min', lower: false, d: 1 },
    { key: 'fuelCritical', label: 'Fuel-critical events', unit: '', lower: true, d: 2 },
    { key: 'tows', label: 'Tows (ground workload)', unit: '', lower: true, d: 1 },
    { key: 'fairness', label: 'Airline fairness index', unit: '', lower: false, d: 3 },
    { key: 'workload', label: 'Workload score', unit: '/100', lower: false, d: 1 },
    { key: 'safety', label: 'Safety score', unit: '/100', lower: false, d: 1 },
    { key: 'overall', label: 'Overall plan score', unit: '/100', lower: false, d: 1 }
  ];

  /* ---------- seed pipeline (illustrative demo records) ---------- */
  function seedIdeas() {
    const I = (o) => Object.assign({ hypothesis: '', control: 'current', scenarios: ['fog', 'storm'], seeds: 8, result: null, signoffs: { owner: false, safety: false, cyber: false, partner: false }, source: 'Direct', created: Date.now() }, o);
    return [
      I({ id: 'IDEA-101', title: 'Trigger ATFM ground delays 45 min before forecast fog', unit: 'ANS Ops — ATFM Unit', role: 'ATFM specialist', owner: 'Director, Air Navigation Services', stage: 0, days: 6, source: 'BrainMiners',
        hypothesis: 'Holding short-haul arrivals on the ground at origin once the AI fog nowcast fires (45 min lead) cuts airborne holding, fuel burn and diversion risk without increasing passenger delay.',
        levers: { nowcastLead: 45 }, control: 'noAtfm', scenarios: ['fog', 'storm'] }),
      I({ id: 'IDEA-102', title: 'Use remote stands for narrow-bodies during LVP', unit: 'ATC Tower — Watch B', role: 'Tower supervisor', owner: 'Head of Airside Operations', stage: 3, days: 12, source: 'QAFAZAT',
        hypothesis: 'Allowing remote stands with pre-alerted bus operations during LVP removes stand waits on the taxiway.',
        levers: {}, control: 'noRemote', scenarios: ['fog', 'storm'], signoffs: { owner: true, safety: true, cyber: true, partner: false } }),
      I({ id: 'IDEA-103', title: 'Tow long-delayed departures off contact gates earlier', unit: 'Airport Ops Control Centre', role: 'Apron controller', owner: 'Head of Airport Operations', stage: 1, days: 19, source: 'Direct',
        hypothesis: 'Towing departures delayed by ≥6 min (instead of ≥12) frees contact stands for arrivals and reduces stand waits.',
        levers: { towThreshold: 6 }, scenarios: ['fog', 'storm'] }),
      I({ id: 'IDEA-104', title: 'Bound sequence shifts to ±2 for airline fairness', unit: 'Economic Regulation', role: 'Policy analyst', owner: 'Director, Economic Regulation', stage: 2, days: 27, source: 'Direct',
        hypothesis: 'Limiting constrained position shifting to ±2 keeps airline delays equitable at a small efficiency cost.',
        levers: { cps: 2 }, scenarios: ['fog', 'sand'], signoffs: { owner: true, safety: false, cyber: false, partner: false } }),
      I({ id: 'IDEA-105', title: 'Prioritise flights with most transfer passengers', unit: 'Airline partner — Emirates OCC', role: 'Duty manager (partner)', owner: 'Director, Air Navigation Services', stage: 0, days: 41, source: 'Partner portal',
        hypothesis: 'Weighting arrival sequencing by transfer passengers protects hub connections at DXB.',
        levers: { prioritiseConnections: true }, scenarios: ['fog', 'storm'] }),
      I({ id: 'IDEA-106', title: 'Earlier diversion decision with 15-min fuel margin', unit: 'Flight Operations & Safety', role: 'Flight ops inspector', owner: 'Director, Aviation Safety', stage: 0, days: 9, source: 'QAFAZAT',
        hypothesis: 'Raising the proactive diversion margin to 15 min increases fuel margins at the cost of more diversions.',
        levers: { reserve: 15 }, scenarios: ['fog', 'storm'] }),
      I({ id: 'IDEA-107', title: 'Disable dual-arrival runway mode in LVP', unit: 'Safety & SMS Office', role: 'SMS manager', owner: 'Director, Aviation Safety', stage: 1, days: 33, source: 'Direct',
        hypothesis: 'Keeping segregated runway operations during LVP reduces complexity; quantify the delay cost before deciding.',
        levers: { dual: false }, scenarios: ['fog', 'storm'] }),
      I({ id: 'IDEA-108', title: '90-min fog nowcast lead time from NWP ensembles', unit: 'UAE university research partner', role: 'Research team (partner)', owner: 'Head of Innovation', stage: 0, days: 15, source: 'Partner portal',
        hypothesis: 'A longer, ensemble-based nowcast lead time lets more short-haul flights absorb delay on the ground.',
        levers: { nowcastLead: 90 }, scenarios: ['fog', 'storm'] })
    ];
  }

  let ideas = load();
  let selId = 'IDEA-101';
  let running = false;
  let root = null;
  let lastResult = null;

  function load() {
    try { const s = JSON.parse(localStorage.getItem(LS_KEY)); if (s && Array.isArray(s.ideas) && s.ideas.length) return s.ideas; } catch (e) { /* ignore */ }
    return seedIdeas();
  }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify({ ideas })); } catch (e) { /* ignore */ } }
  const byId = (id) => ideas.find((i) => i.id === id);
  const esc = (s) => FA.ui.esc(s);
  const fmt = (v, d) => (v == null || !isFinite(v) ? '—' : Number(v).toFixed(d));

  /* ---------- levers → engine policy ---------- */
  function leversFull(l) { return Object.assign({}, DEF, l || {}); }
  function toPolicy(levers, controlKey) {
    const L = leversFull(levers);
    const p = Object.assign({}, (CONTROLS[controlKey] || CONTROLS.current).policy);
    if (L.cps !== DEF.cps) p.cps = L.cps;
    if (L.reserve !== DEF.reserve) p.reserve = L.reserve;
    if (L.towThreshold !== DEF.towThreshold) p.towThreshold = L.towThreshold;
    if (L.nowcastLead !== DEF.nowcastLead) p.nowcastLead = L.nowcastLead;
    if (L.prioritiseConnections) p.prioritiseConnections = true;
    // levers explicitly enabled override the control's restriction (treatment = idea)
    if (L.remote) delete p.noRemote; else p.noRemote = true;
    if (L.atfm) delete p.noAtfm; else p.noAtfm = true;
    if (L.dual) delete p.noDual; else p.noDual = true;
    return p;
  }
  function leverText(levers) {
    const L = leversFull(levers), out = [];
    if (L.cps !== DEF.cps) out.push('CPS ±' + L.cps);
    if (L.reserve !== DEF.reserve) out.push('Fuel margin ' + L.reserve + ' min');
    if (L.towThreshold !== DEF.towThreshold) out.push('Tow at ≥' + L.towThreshold + ' min');
    if (L.nowcastLead !== DEF.nowcastLead) out.push('Nowcast lead ' + L.nowcastLead + ' min');
    if (L.prioritiseConnections) out.push('Transfer-pax priority');
    if (!L.remote) out.push('No remote stands');
    if (!L.atfm) out.push('No ATFM');
    if (!L.dual) out.push('No dual-arrival');
    return out.length ? out : ['Default levers'];
  }

  /* ---------- statistics ---------- */
  function metricsOf(plan) {
    const k = plan.kpi;
    return {
      avgDelayAll: k.avgDelayAll, paxDelayHrs: k.paxDelayHrs, diversions: k.diversions, co2t: k.co2 / 1000,
      missedConn: k.missedConn, minFuelMargin: k.minFuelMargin, fuelCritical: k.fuelCritical, tows: k.tows,
      fairness: k.fairness, workload: k.scores.Workload, safety: k.scores.Safety, overall: k.scores.overall
    };
  }
  function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
  function bootstrapCI(diffs, rng, B) {
    B = B || 1000;
    if (diffs.length < 2) return [mean(diffs), mean(diffs)];
    const ms = [];
    for (let b = 0; b < B; b++) {
      let s = 0;
      for (let i = 0; i < diffs.length; i++) s += diffs[Math.floor(rng() * diffs.length)];
      ms.push(s / diffs.length);
    }
    ms.sort((x, y) => x - y);
    return [ms[Math.floor(0.025 * B)], ms[Math.min(B - 1, Math.floor(0.975 * B))]];
  }

  /**
   * Run a paired sandbox trial. CONTROL = Balanced + controlPolicy, TREATMENT = Balanced + policy,
   * on identical simulated days (same scenario + seed). A fresh instance is generated for every plan
   * because buildPlan annotates arrivals (ATFM eligibility) — no leakage between arms.
   */
  function runTrial(policy, scenarios, seeds, onProgress, controlPolicy) {
    scenarios = (scenarios && scenarios.length) ? scenarios : ['fog'];
    const n = typeof seeds === 'number' ? seeds : (seeds || []).length;
    const seedList = Array.isArray(seeds) ? seeds : Array.from({ length: n }, (_, i) => 101 + i);
    const tasks = [];
    scenarios.forEach((sc) => seedList.forEach((sd) => tasks.push({ sc, sd })));
    const runs = [];
    const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
    return new Promise((resolve) => {
      let i = 0;
      function step() {
        const end = Math.min(tasks.length, i + 1);
        for (; i < end; i++) {
          const { sc, sd } = tasks[i];
          const pc = FA.engine.buildPlan(FA.data.generate(sc, sd), 'balanced', Object.assign({}, controlPolicy || {}));
          const pt = FA.engine.buildPlan(FA.data.generate(sc, sd), 'balanced', Object.assign({}, policy || {}));
          runs.push({ sc, sd, c: metricsOf(pc), t: metricsOf(pt) });
        }
        if (onProgress) onProgress(i / tasks.length);
        if (i < tasks.length) setTimeout(step, 0);
        else resolve(summarise(runs, policy, scenarios, seedList, ((typeof performance !== 'undefined' ? performance : Date).now() - t0)));
      }
      step();
    });
  }

  function summarise(runs, policy, scenarios, seedList, ms) {
    const rng = FA.data.rng(4242);
    const rows = KPIS.map((m) => {
      const c = runs.map((r) => r.c[m.key]), t = runs.map((r) => r.t[m.key]);
      const d = runs.map((r) => r.t[m.key] - r.c[m.key]);
      const ci = bootstrapCI(d, rng, 1000);
      const md = mean(d);
      const sig = ci[0] > 0 || ci[1] < 0;
      const better = Math.abs(md) < 1e-9 ? 0 : (m.lower ? md < 0 : md > 0) ? 1 : -1;
      return { key: m.key, label: m.label, unit: m.unit, lower: m.lower, d: m.d, c: mean(c), t: mean(t), diff: md, lo: ci[0], hi: ci[1], sig, better };
    });
    const ov = rows.find((r) => r.key === 'overall');
    const win = runs.filter((r) => r.t.overall > r.c.overall + 1e-9).length / runs.length;
    const blockReasons = [];
    const minFuel = Math.min(...runs.map((r) => r.t.minFuelMargin));
    if (minFuel < 10) blockReasons.push('Min fuel margin fell to ' + minFuel.toFixed(1) + ' min on at least one day (guardrail ≥ 10 min)');
    const crit = runs.reduce((a, r) => a + r.t.fuelCritical, 0);
    if (crit > 0) blockReasons.push(crit + ' fuel-critical event(s) under the idea');
    const saf = rows.find((r) => r.key === 'safety');
    if (saf.hi < -2) blockReasons.push('Safety score significantly lower than control (Δ ' + saf.diff.toFixed(1) + ')');
    // a guardrail only blocks if the idea made it worse than control
    const ctrlMinFuel = Math.min(...runs.map((r) => r.c.minFuelMargin));
    if (minFuel < 10 && ctrlMinFuel <= minFuel) blockReasons.shift();
    let verdict = ov.lo > 0 ? 'supports' : ov.hi < 0 ? 'against' : 'inconclusive';
    const block = blockReasons.length > 0;
    return { n: runs.length, scenarios, seeds: seedList, policy, rows, runs: runs.map((r) => ({ sc: r.sc, sd: r.sd, c: +r.c.overall.toFixed(2), t: +r.t.overall.toFixed(2) })), win, verdict, block, blockReasons, ms: Math.round(ms), ranAt: new Date().toISOString() };
  }

  /* ---------- readiness ---------- */
  function readiness(idea) {
    const r = idea.result;
    const sign = SIGNOFFS.filter((s) => idea.signoffs && idea.signoffs[s.k]).length;
    const parts = { evidence: 0, safety: 0, signoffs: sign * 6.25, data: 0 };
    if (r) {
      const ov = r.rows.find((x) => x.key === 'overall');
      parts.evidence = r.verdict === 'supports' ? Math.min(40, 18 + 22 * Math.min(1, ov.diff / 4)) : r.verdict === 'inconclusive' ? 10 : 0;
      parts.safety = r.block ? 0 : 25;
      parts.data = (r.scenarios.length >= 2 ? 5 : 2.5) + (r.n >= 16 ? 5 : r.n >= 8 ? 3 : 1);
    }
    parts.total = Math.round(parts.evidence + parts.safety + parts.signoffs + parts.data);
    return parts;
  }

  /* ---------- CSS ---------- */
  function css() {
    if (document.getElementById('fa-lab-css')) return;
    const s = document.createElement('style');
    s.id = 'fa-lab-css';
    s.textContent = `
.lab-rc { display:flex; gap:6px; flex-wrap:wrap; margin:-4px 2px 12px; }
.lab-rc .chip { text-transform:none; letter-spacing:0; font-weight:500; padding:4px 10px; font-size:11px; }
.lab-rc .chip b { color:var(--gold); margin-right:4px; }
.lab-kanban { display:grid; grid-template-columns:repeat(5, minmax(0,1fr)); gap:8px; }
.lab-col { background:rgba(0,0,0,.18); border:1px solid var(--line); border-radius:10px; padding:8px; min-height:150px; display:flex; flex-direction:column; gap:7px; }
.lab-col-h { display:flex; justify-content:space-between; align-items:center; font-size:11px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:#b8c9e6; }
.lab-col-h .n { font-family:var(--mono); color:var(--cyan); }
.lab-gate { font-size:10px; color:var(--dim); margin-top:-3px; }
.lab-card { background:linear-gradient(180deg, rgba(25,42,70,.95), rgba(18,32,55,.95)); border:1px solid var(--line2); border-radius:9px; padding:8px; cursor:pointer; transition:.15s; font-size:11.5px; }
.lab-card:hover { border-color:var(--cyan); }
.lab-card.sel { border-color:var(--gold); box-shadow:0 0 0 2px rgba(226,176,74,.25); }
.lab-card .t { font-weight:700; font-size:12px; line-height:1.3; margin-bottom:4px; }
.lab-card .m { color:var(--muted); font-size:10.5px; }
.lab-card .f { display:flex; justify-content:space-between; align-items:center; margin-top:5px; gap:4px; }
.lab-card .stall { color:var(--amber); font-weight:700; }
.lab-rs { font-family:var(--mono); font-weight:700; font-size:11px; padding:1px 6px; border-radius:5px; background:rgba(38,198,218,.15); color:#7ff1ff; }
.lab-form label { display:block; font-size:11px; color:var(--muted); margin:8px 0 3px; }
.lab-form .inp { width:100%; }
.lab-lev { display:grid; grid-template-columns: 1fr 1fr; gap:6px 14px; }
.lab-lev .lv { background:rgba(0,0,0,.18); border:1px solid var(--line); border-radius:8px; padding:6px 8px; }
.lab-lev .lv .h { display:flex; justify-content:space-between; font-size:11px; color:var(--muted); }
.lab-lev .lv .h b { font-family:var(--mono); color:var(--text); }
.lab-lev .lv input[type=range] { width:100%; }
.lab-lev .lv.chg { border-color:rgba(226,176,74,.6); }
.lab-chk { display:flex; flex-wrap:wrap; gap:6px 12px; font-size:12px; }
.lab-chk label { display:flex; align-items:center; gap:5px; color:var(--text); margin:0; font-size:12px; cursor:pointer; }
.lab-prog { height:6px; background:rgba(255,255,255,.06); border-radius:4px; overflow:hidden; margin:8px 0; }
.lab-prog i { display:block; height:100%; width:0; background:linear-gradient(90deg,var(--cyan),var(--gold)); transition:width .15s; }
.lab-res table.t td.ok { color:var(--green); } .lab-res table.t td.ko { color:var(--red); }
.lab-ready { display:grid; grid-template-columns: 110px 1fr; gap:12px; align-items:center; }
.lab-ready .gauge { width:110px; height:110px; }
.lab-parts div { display:grid; grid-template-columns:1fr 46px; gap:6px; font-size:11.5px; margin-bottom:4px; align-items:center; }
.lab-parts .bar-h { grid-column:1/-1; height:5px; }
.lab-sign { display:grid; grid-template-columns:1fr 1fr; gap:4px 10px; font-size:11.5px; margin-top:8px; }
.lab-sign label { display:flex; gap:5px; align-items:center; cursor:pointer; }
.lab-lb li { display:grid; grid-template-columns:22px 1fr auto; gap:6px; padding:5px 6px; border-bottom:1px dashed var(--line); font-size:12px; }
.lab-lb { list-style:none; padding:0; margin:0; }
.lab-src { font-size:9.5px; padding:1px 5px; border-radius:4px; background:rgba(179,136,255,.15); color:#d1b8ff; }
@media (max-width:1180px){ .lab-kanban{grid-template-columns:1fr 1fr;} .lab-lev{grid-template-columns:1fr;} }
.lab-doc h2 { margin-top:0; } .lab-doc h3 { margin:14px 0 6px; color:#7ff1ff; } .lab-doc table { margin:6px 0; }
.lab-doc .kv { display:grid; grid-template-columns:150px 1fr; gap:4px 10px; font-size:12px; }
.lab-doc .kv span { color:var(--muted); }
`;
    document.head.appendChild(s);
  }

  /* ---------- rendering ---------- */
  function render() {
    if (!root) return;
    root.innerHTML = `
      <div class="page-head">
        <div><h1>Innovation Lab — from idea to validated pilot</h1>
        <p class="muted">GCAA problem statement: ideas stay unimplemented because experimentation, testing and implementation support are not accessible. The FalconAero digital twin doubles as an <b>Ops Innovation Sandbox</b> — any employee or partner can test an operational idea on hundreds of simulated disruption days in minutes, get an evidence pack, and move it through a governed pipeline.</p></div>
        <div class="head-actions"><button class="btn ghost sm" id="labNew">＋ Submit new idea</button><button class="btn ghost sm" id="labReset">Reset demo data</button></div>
      </div>
      <div class="lab-rc">
        <span class="chip"><b>R1</b>Pipeline lives inside the ops tool, not a side programme</span>
        <span class="chip"><b>R2</b>Named owner + sign-off gates per stage</span>
        <span class="chip"><b>R3</b>Sandbox → evidence → shadow pilot → scale</span>
        <span class="chip"><b>R4</b>Stage analytics show where ideas stall</span>
        <span class="chip"><b>R5</b>Zero-cost experiments + recognition points</span>
      </div>
      <div class="panel"><div class="panel-h"><span>Idea pipeline</span><span class="hint">Demo pipeline records are illustrative · click a card to open it in the sandbox</span></div><div class="lab-kanban" id="labKanban"></div></div>
      <div class="grid-2">
        <div class="panel lab-form" id="labBuilder"></div>
        <div class="panel lab-res" id="labResults"></div>
      </div>
      <div class="grid-2">
        <div class="panel"><div class="panel-h"><span>Pipeline analytics — where do ideas stall? (R4)</span></div><div id="labAnalytics"></div></div>
        <div class="panel"><div class="panel-h"><span>Recognition board (R5)</span><span class="hint">points: submit 10 · tested 20 · validated 30 · pilot 50 · scaled 80</span></div><div id="labBoard"></div></div>
      </div>`;
    root.querySelector('#labNew').onclick = newIdea;
    root.querySelector('#labReset').onclick = () => { ideas = seedIdeas(); selId = 'IDEA-101'; lastResult = null; save(); render(); FA.ui.toast('Demo pipeline reset', '8 seeded ideas restored.', 'gold'); };
    renderKanban(); renderBuilder(); renderResults(); renderAnalytics(); renderBoard();
  }

  function renderKanban() {
    const el = root.querySelector('#labKanban');
    el.innerHTML = STAGES.map((st) => {
      const list = ideas.filter((i) => i.stage === st.id);
      return `<div class="lab-col"><div class="lab-col-h"><span>${esc(st.name)}</span><span class="n">${list.length}</span></div>
        <div class="lab-gate">Gate: ${esc(st.gate)}</div>
        ${list.map((i) => {
          const rs = i.result ? readiness(i).total : null;
          return `<div class="lab-card ${i.id === selId ? 'sel' : ''}" data-id="${i.id}">
            <div class="t">${esc(i.title)}</div>
            <div class="m">${esc(i.unit)}</div>
            <div class="m">Owner: ${esc(i.owner)}</div>
            <div class="f"><span class="m ${i.days > 30 ? 'stall' : ''}">${i.days} d in stage${i.days > 30 ? ' ⚠' : ''}</span>${rs != null ? `<span class="lab-rs">R ${rs}</span>` : `<span class="lab-src">${esc(i.source)}</span>`}</div>
          </div>`;
        }).join('')}</div>`;
    }).join('');
    el.querySelectorAll('.lab-card').forEach((c) => c.addEventListener('click', () => { selId = c.dataset.id; lastResult = null; renderKanban(); renderBuilder(); renderResults(); }));
  }

  function lever(id, label, min, max, step, val, def, suffix) {
    return `<div class="lv ${val !== def ? 'chg' : ''}"><div class="h"><span>${label}</span><b id="lv-${id}-v">${val}${suffix || ''}</b></div><input type="range" data-lv="${id}" min="${min}" max="${max}" step="${step}" value="${val}"/><div class="dim" style="font-size:10px">default ${def}${suffix || ''}</div></div>`;
  }
  function toggle(id, label, val, def) {
    return `<div class="lv ${val !== def ? 'chg' : ''}"><div class="h"><span>${label}</span></div><label class="toggle" style="color:var(--text);margin-top:4px"><input type="checkbox" data-lv="${id}" ${val ? 'checked' : ''}/> ${val ? 'On' : 'Off'} <span class="dim">(default ${def ? 'on' : 'off'})</span></label></div>`;
  }

  function renderBuilder() {
    const el = root.querySelector('#labBuilder');
    const i = byId(selId);
    if (!i) { el.innerHTML = '<div class="muted">Select an idea.</div>'; return; }
    const L = leversFull(i.levers);
    el.innerHTML = `
      <div class="panel-h"><span>Sandbox experiment — ${esc(i.id)}</span><span class="chip gold">${esc(STAGES[i.stage].name)}</span></div>
      <label>Idea title</label><input class="inp" id="lbTitle" value="${esc(i.title)}"/>
      <label>Hypothesis</label><textarea class="inp" id="lbHyp" rows="2">${esc(i.hypothesis)}</textarea>
      <div class="grid-2" style="margin:0;gap:8px">
        <div><label>Submitted by</label><div class="small">${esc(i.unit)} · <span class="muted">${esc(i.role)}</span> <span class="lab-src">${esc(i.source)}</span></div></div>
        <div><label>Decision owner (R2)</label><div class="small">${esc(i.owner)}</div></div>
      </div>
      <label>Policy levers (mapped 1:1 to the FalconAero recovery engine)</label>
      <div class="lab-lev">
        ${lever('cps', 'Max sequence shift (CPS ±)', 0, 6, 1, L.cps, DEF.cps)}
        ${lever('reserve', 'Proactive diversion fuel margin', 0, 20, 1, L.reserve, DEF.reserve, ' min')}
        ${lever('towThreshold', 'Tow departures when arrival wait ≥', 5, 40, 1, L.towThreshold, DEF.towThreshold, ' min')}
        ${lever('nowcastLead', 'ATFM trigger: fog nowcast lead', 0, 90, 5, L.nowcastLead, DEF.nowcastLead, ' min')}
        ${toggle('atfm', 'ATFM ground delay at origin', L.atfm, DEF.atfm)}
        ${toggle('remote', 'Remote stands + bus ops', L.remote, DEF.remote)}
        ${toggle('dual', 'Dual-arrival runway mode', L.dual, DEF.dual)}
        ${toggle('prioritiseConnections', 'Prioritise transfer passengers', L.prioritiseConnections, DEF.prioritiseConnections)}
      </div>
      <label>Compare against (control arm)</label>
      <select class="inp" id="lbCtrl">${Object.entries(CONTROLS).map(([k, c]) => `<option value="${k}" ${i.control === k ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>
      <label>Test on simulated disruption days</label>
      <div class="lab-chk">${SCN.map((s) => `<label><input type="checkbox" data-sc="${s.id}" ${i.scenarios.includes(s.id) ? 'checked' : ''}/> ${s.label}</label>`).join('')}</div>
      <label>Days per scenario (paired seeds 101…): <b id="lbSeedsV">${i.seeds}</b></label>
      <input type="range" id="lbSeeds" min="5" max="30" step="1" value="${i.seeds}" style="width:100%"/>
      <div class="lab-prog"><i id="lbProg"></i></div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn" id="lbRun" ${running ? 'disabled' : ''}>🧪 Run sandbox trial</button>
        <span class="small muted" id="lbEst">${i.scenarios.length * i.seeds} paired days · ${i.scenarios.length * i.seeds * 2} full recovery plans</span>
      </div>`;
    const upd = () => {
      i.title = el.querySelector('#lbTitle').value;
      i.hypothesis = el.querySelector('#lbHyp').value;
      i.control = el.querySelector('#lbCtrl').value;
      save(); renderKanbanLight();
    };
    el.querySelector('#lbTitle').addEventListener('change', upd);
    el.querySelector('#lbHyp').addEventListener('change', upd);
    el.querySelector('#lbCtrl').addEventListener('change', upd);
    el.querySelectorAll('[data-lv]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const k = inp.dataset.lv;
        const v = inp.type === 'checkbox' ? inp.checked : Number(inp.value);
        i.levers = Object.assign({}, i.levers, { [k]: v });
        if (inp.type === 'range') el.querySelector('#lv-' + k + '-v').textContent = v + (k === 'cps' ? '' : ' min');
        inp.closest('.lv').classList.toggle('chg', v !== DEF[k]);
        if (inp.type === 'checkbox') inp.parentElement.childNodes[1].textContent = ' ' + (v ? 'On' : 'Off') + ' ';
        save();
      });
    });
    el.querySelectorAll('[data-sc]').forEach((cb) => cb.addEventListener('change', () => {
      i.scenarios = Array.from(el.querySelectorAll('[data-sc]')).filter((x) => x.checked).map((x) => x.dataset.sc);
      if (!i.scenarios.length) { cb.checked = true; i.scenarios = [cb.dataset.sc]; }
      el.querySelector('#lbEst').textContent = i.scenarios.length * i.seeds + ' paired days · ' + i.scenarios.length * i.seeds * 2 + ' full recovery plans';
      save();
    }));
    el.querySelector('#lbSeeds').addEventListener('input', (e) => {
      i.seeds = Number(e.target.value);
      el.querySelector('#lbSeedsV').textContent = i.seeds;
      el.querySelector('#lbEst').textContent = i.scenarios.length * i.seeds + ' paired days · ' + i.scenarios.length * i.seeds * 2 + ' full recovery plans';
      save();
    });
    el.querySelector('#lbRun').addEventListener('click', () => runFor(i));
  }
  function renderKanbanLight() { renderKanban(); }

  function runFor(i) {
    if (running) return Promise.resolve(null);
    running = true;
    const btn = root && root.querySelector('#lbRun');
    if (btn) { btn.disabled = true; btn.textContent = 'Running…'; }
    const policy = toPolicy(i.levers, 'current');
    // control arm = Balanced + the chosen control restriction; treatment = Balanced + the idea's levers
    const ctrl = Object.assign({}, CONTROLS[i.control] ? CONTROLS[i.control].policy : {});
    return runTrial(policy, i.scenarios, i.seeds, (p) => {
      const bar = root && root.querySelector('#lbProg');
      if (bar) bar.style.width = Math.round(p * 100) + '%';
    }, ctrl).then((res) => {
      running = false;
      res.control = i.control;
      i.result = res;
      lastResult = res;
      FA.audit.add('INNOVATION', i.unit, 'Sandbox trial for ' + i.id + ' "' + i.title + '": ' + res.n + ' paired days, verdict ' + res.verdict.toUpperCase() + (res.block ? ' (safety blocker)' : '') + ', win rate ' + Math.round(res.win * 100) + '%', { id: i.id, policy: res.policy });
      save();
      if (root) { renderKanban(); renderBuilder(); renderResults(); renderAnalytics(); renderBoard(); }
      FA.ui.toast('Sandbox trial complete', res.n + ' paired days in ' + (res.ms / 1000).toFixed(1) + ' s — evidence ' + res.verdict + (res.block ? ', safety blocker flagged' : ''), res.block ? 'red' : res.verdict === 'supports' ? 'green' : 'amber');
      return res;
    });
  }

  function diffChart(res) {
    const W = 560, H = 150, L = 40, R = 10, T = 12, B = 26;
    const d = res.runs.map((r) => r.t - r.c);
    const ext = Math.max(2, ...d.map((x) => Math.abs(x))) * 1.15;
    const X = (i) => L + ((W - L - R) * (i + 0.5)) / d.length;
    const Y = (v) => T + ((H - T - B) * (ext - v)) / (2 * ext);
    const ov = res.rows.find((r) => r.key === 'overall');
    let g = `<rect x="${L}" y="${Y(ov.hi)}" width="${W - L - R}" height="${Math.max(1, Y(ov.lo) - Y(ov.hi))}" fill="rgba(226,176,74,.12)"/>`;
    g += `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="#2a4268"/>`;
    g += `<line x1="${L}" x2="${W - R}" y1="${Y(ov.diff)}" y2="${Y(ov.diff)}" stroke="#e2b04a" stroke-dasharray="4 3"/>`;
    [ext * 0.8, 0, -ext * 0.8].forEach((v) => { g += `<text x="${L - 5}" y="${Y(v) + 3}" fill="#5f7598" font-size="9.5" text-anchor="end">${v > 0 ? '+' : ''}${v.toFixed(1)}</text>`; });
    d.forEach((v, i) => {
      const col = v > 0 ? '#66bb6a' : v < 0 ? '#ef5350' : '#8ea3c4';
      g += `<line x1="${X(i)}" x2="${X(i)}" y1="${Y(0)}" y2="${Y(v)}" stroke="${col}" stroke-width="${Math.max(2, Math.min(8, (W - L - R) / d.length - 3))}" stroke-linecap="round" opacity=".85"><title>${res.runs[i].sc} seed ${res.runs[i].sd}: Δ ${v.toFixed(2)}</title></line>`;
    });
    let x = L; res.scenarios.forEach((sc) => {
      const n = res.runs.filter((r) => r.sc === sc).length;
      const w = ((W - L - R) * n) / d.length;
      g += `<text x="${x + w / 2}" y="${H - 8}" fill="#8ea3c4" font-size="10" text-anchor="middle">${esc(sc)} × ${n}</text>`;
      x += w;
    });
    g += `<text x="${W - R}" y="${T + 2}" fill="#e2b04a" font-size="10" text-anchor="end">mean Δ ${ov.diff >= 0 ? '+' : ''}${ov.diff.toFixed(2)} · 95% CI shaded</text>`;
    return FA.charts.svg(W, H, g);
  }

  function renderResults() {
    const el = root.querySelector('#labResults');
    const i = byId(selId);
    const res = i && i.result;
    const rd = i ? readiness(i) : null;
    const sign = i ? SIGNOFFS.map((s) => `<label><input type="checkbox" data-sign="${s.k}" ${i.signoffs[s.k] ? 'checked' : ''}/> ${esc(s.label)}</label>`).join('') : '';
    const readyBlock = rd ? `
      <div class="lab-ready" style="margin-top:10px">
        ${FA.charts.gauge(rd.total / 100, 'readiness', rd.total >= 80 ? '#66bb6a' : rd.total >= 50 ? '#e2b04a' : '#ef5350')}
        <div class="lab-parts">
          ${[['Evidence strength', rd.evidence, 40], ['Safety guardrails', rd.safety, 25], ['Stakeholder sign-offs', rd.signoffs, 25], ['Data coverage', rd.data, 10]].map((p) => `<div><span>${p[0]}</span><b class="mono">${Math.round(p[1])}/${p[2]}</b><div class="bar-h"><i style="width:${(100 * p[1]) / p[2]}%"></i></div></div>`).join('')}
        </div>
      </div>
      <div class="lab-sign">${sign}</div>` : '';
    if (!res) {
      el.innerHTML = `<div class="panel-h"><span>Evidence & readiness</span></div>
        <div class="alert cy"><div class="ic">🧪</div><div><b>No trial yet for this idea</b>Set the levers and press <i>Run sandbox trial</i>. FalconAero replays identical simulated disruption days with and without the idea (paired design, fixed seeds — fully reproducible) and reports effect sizes with 95% bootstrap confidence intervals.</div></div>
        ${readyBlock}`;
      bindSign(el, i);
      return;
    }
    const v = res.block ? { c: 'red', t: '⛔ Blocked by safety guardrail', s: res.blockReasons.join(' · ') }
      : res.verdict === 'supports' ? { c: 'green', t: '✅ Evidence supports the idea', s: 'Overall plan score improves with 95% confidence across ' + res.n + ' paired days.' }
        : res.verdict === 'against' ? { c: 'red', t: '❌ Evidence against the idea', s: 'Overall plan score is worse with 95% confidence — the sandbox saved a costly real-world trial.' }
          : { c: 'amber', t: '◐ Inconclusive', s: 'The confidence interval spans zero — refine the idea or test more days.' };
    el.innerHTML = `
      <div class="panel-h"><span>Evidence — ${esc(i.id)}</span><span class="hint">${res.n} paired days · ${res.ms} ms · win rate ${Math.round(res.win * 100)}%</span></div>
      <div class="alert ${v.c}"><div class="ic"></div><div><b>${v.t}</b>${esc(v.s)}</div></div>
      <div class="small muted" style="margin:-4px 0 4px">Per-day Δ overall score (idea − control: ${esc((CONTROLS[res.control] || CONTROLS.current).label)})</div>
      ${diffChart(res)}
      <table class="t" style="margin-top:6px"><thead><tr><th>KPI</th><th>Control</th><th>Idea</th><th>Δ mean</th><th>95% CI</th></tr></thead><tbody>
        ${res.rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${fmt(r.c, r.d)}</td><td>${fmt(r.t, r.d)}</td><td class="${r.better > 0 ? 'ok' : r.better < 0 ? 'ko' : ''}">${r.diff >= 0 ? '+' : ''}${fmt(r.diff, r.d)}${r.sig ? ' *' : ''}</td><td class="dim">[${fmt(r.lo, r.d)}, ${fmt(r.hi, r.d)}]</td></tr>`).join('')}
      </tbody></table>
      <div class="src">* 95% bootstrap CI (1,000 resamples) excludes zero. Green = better for operations. Simulated twin with synthetic traffic — evidence for a shadow pilot, not for certification.</div>
      ${readyBlock}
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="btn gold" id="lbPack">📄 Evidence pack & pilot proposal</button>
        <button class="btn green" id="lbPromote" ${i.stage >= 4 ? 'disabled' : ''}>Promote → ${i.stage < 4 ? esc(STAGES[i.stage + 1].name) : 'done'}</button>
      </div>`;
    bindSign(el, i);
    el.querySelector('#lbPack').onclick = () => evidencePack(i);
    el.querySelector('#lbPromote').onclick = () => promote(i);
  }

  function bindSign(el, i) {
    if (!i) return;
    el.querySelectorAll('[data-sign]').forEach((cb) => cb.addEventListener('change', () => {
      i.signoffs[cb.dataset.sign] = cb.checked;
      FA.audit.add('INNOVATION', SIGNOFFS.find((s) => s.k === cb.dataset.sign).label, (cb.checked ? 'Signed off ' : 'Withdrew sign-off for ') + i.id + ' "' + i.title + '"');
      save(); renderResults(); renderKanban();
    }));
  }

  function promote(i) {
    const r = i.result, rd = readiness(i);
    let ok = true, why = '';
    if (i.stage === 0 && !r) { ok = false; why = 'Run a sandbox trial first.'; }
    if (i.stage === 1 && (!r || r.verdict !== 'supports' || r.block)) { ok = false; why = 'Gate: evidence must support the idea with no safety blocker.'; }
    if (i.stage === 2 && !(i.signoffs.owner && i.signoffs.safety)) { ok = false; why = 'Gate: Service Owner and Safety/SMS sign-off required.'; }
    if (i.stage === 3 && rd.total < 80) { ok = false; why = 'Gate: readiness ≥ 80 required to scale (currently ' + rd.total + ').'; }
    if (!ok) { FA.ui.toast('Gate not passed', why, 'amber'); return; }
    i.stage = Math.min(4, i.stage + 1); i.days = 0;
    FA.audit.add('INNOVATION', i.owner, 'Promoted ' + i.id + ' "' + i.title + '" to ' + STAGES[i.stage].name + ' (readiness ' + rd.total + ')');
    save(); renderKanban(); renderResults(); renderAnalytics(); renderBoard(); renderBuilder();
    FA.ui.toast('Idea promoted', i.title + ' → ' + STAGES[i.stage].name, 'green');
  }

  function newIdea() {
    const n = 100 + ideas.length + 1;
    const i = { id: 'IDEA-' + n, title: 'My operational idea', hypothesis: 'If we … then … because …', unit: 'Your department', role: 'Employee', owner: 'Head of Innovation', stage: 0, days: 0, levers: {}, control: 'current', scenarios: ['fog', 'storm'], seeds: 8, result: null, signoffs: { owner: false, safety: false, cyber: false, partner: false }, source: 'Direct', created: Date.now() };
    ideas.unshift(i); selId = i.id; save();
    FA.audit.add('INNOVATION', 'Employee', 'Submitted ' + i.id + ' via Innovation Lab');
    renderKanban(); renderBuilder(); renderResults(); renderAnalytics(); renderBoard();
    const t = root.querySelector('#lbTitle'); if (t) { t.focus(); t.select(); }
  }

  function renderAnalytics() {
    const el = root.querySelector('#labAnalytics');
    const rows = STAGES.map((s) => {
      const l = ideas.filter((i) => i.stage === s.id);
      return { s, n: l.length, avg: l.length ? mean(l.map((i) => i.days)) : 0, stalled: l.filter((i) => i.days > 30).length };
    });
    const worst = rows.slice(0, 4).sort((a, b) => b.avg - a.avg)[0];
    const tested = ideas.filter((i) => i.result).length;
    el.innerHTML = `
      <div class="grid-3" style="margin-bottom:8px">
        <div class="card"><div class="muted small">Ideas in pipeline</div><div class="stat-big">${ideas.length}</div></div>
        <div class="card"><div class="muted small">Sandbox-tested here</div><div class="stat-big cy">${tested}</div></div>
        <div class="card"><div class="muted small">Stalled &gt; 30 days</div><div class="stat-big warn">${rows.reduce((a, r) => a + r.stalled, 0)}</div></div>
      </div>
      ${FA.charts.bars(rows.map((r) => ({ label: r.s.name.replace(' (evidence)', ''), values: [r.n, r.avg] })), ['Ideas', 'Avg days in stage'], { h: 200, colors: ['#26c6da', '#e2b04a'], labels: true })}
      <div class="alert amber" style="margin-top:8px"><div class="ic">⏳</div><div><b>Bottleneck: ${esc(worst.s.name)}</b>Average ${worst.avg.toFixed(0)} days in stage. Gate “${esc(worst.s.gate)}”. FalconAero nudges the named owner and shows the evidence pack so the decision can be taken in one meeting.</div></div>`;
  }

  function renderBoard() {
    const el = root.querySelector('#labBoard');
    const pts = {};
    const P = [10, 30, 60, 110, 190];
    ideas.forEach((i) => { const k = i.unit; pts[k] = pts[k] || { unit: k, p: 0, n: 0, partner: /partner/i.test(k) }; pts[k].p += P[i.stage] + (i.result ? 5 : 0); pts[k].n++; });
    const list = Object.values(pts).sort((a, b) => b.p - a.p).slice(0, 8);
    el.innerHTML = `<ul class="lab-lb">${list.map((c, k) => `<li><span class="mono ${k < 3 ? 'gold' : 'dim'}">${k + 1}</span><span>${esc(c.unit)} ${c.partner ? '<span class="lab-src">partner</span>' : ''}<br><span class="dim small">${c.n} idea(s)</span></span><b class="mono">${c.p} pts</b></li>`).join('')}</ul>
      <div class="src" style="margin-top:8px">Ideas arrive from QAFAZAT and BrainMiners submissions, the partner portal (airlines, airports, universities, start-ups) or directly from the ops tool. Points convert into quarterly recognition and innovation-KPI credit for the unit.</div>`;
  }

  function evidencePack(i) {
    const r = i.result, rd = readiness(i);
    const body = `<div class="lab-doc" id="labDoc">
      <h2>Evidence Pack & 30-day Pilot Proposal — ${esc(i.id)}</h2>
      <div class="muted small">Generated by FalconAero Innovation Lab · ${new Date().toLocaleString()} · audit-logged</div>
      <h3>1. Idea</h3>
      <div class="kv"><span>Title</span><b>${esc(i.title)}</b><span>Submitted by</span><div>${esc(i.unit)} (${esc(i.role)}) · source: ${esc(i.source)}</div><span>Decision owner</span><div>${esc(i.owner)}</div><span>Hypothesis</span><div>${esc(i.hypothesis)}</div><span>Policy levers</span><div>${leverText(i.levers).map((t) => '<span class="tag">' + esc(t) + '</span>').join('')}</div></div>
      <h3>2. Test design (reproducible)</h3>
      <div class="kv"><span>Design</span><div>Paired comparison on the FalconAero airport digital twin (OMDB, stylised); identical traffic & weather per day in both arms.</div><span>Control arm</span><div>${esc((CONTROLS[r.control] || CONTROLS.current).label)}</div><span>Scenarios</span><div>${r.scenarios.map(esc).join(', ')}</div><span>Days</span><div>${r.n} paired days (seeds ${r.seeds[0]}–${r.seeds[r.seeds.length - 1]} per scenario)</div><span>Engine policy</span><div class="mono small">${esc(JSON.stringify(r.policy))}</div></div>
      <h3>3. Results</h3>
      <table class="t"><thead><tr><th>KPI</th><th>Control</th><th>Idea</th><th>Δ</th><th>95% CI</th></tr></thead><tbody>
      ${r.rows.map((x) => `<tr><td>${esc(x.label)}</td><td>${fmt(x.c, x.d)}</td><td>${fmt(x.t, x.d)}</td><td style="color:${x.better > 0 ? '#66bb6a' : x.better < 0 ? '#ef5350' : 'inherit'}">${x.diff >= 0 ? '+' : ''}${fmt(x.diff, x.d)}</td><td>[${fmt(x.lo, x.d)}, ${fmt(x.hi, x.d)}]</td></tr>`).join('')}
      </tbody></table>
      <p><b>Verdict:</b> ${r.block ? 'BLOCKED — ' + esc(r.blockReasons.join('; ')) : esc(r.verdict.toUpperCase())} · win rate ${Math.round(r.win * 100)}% of days · readiness ${rd.total}/100</p>
      <h3>4. Safety guardrails</h3>
      <ul><li>Minimum fuel margin ≥ 10 min on every simulated day</li><li>No fuel-critical (minimum-fuel) events introduced</li><li>Safety score not significantly worse than control</li><li>ICAO separation minima and stand code constraints are hard constraints in every arm</li></ul>
      <h3>5. Recommended 30-day shadow pilot</h3>
      <ol><li><b>Week 1</b> — configure lever in FalconAero shadow mode at the pilot airport; brief Watch supervisors.</li><li><b>Weeks 2–3</b> — run in shadow mode on live data; controllers compare AI plan vs. actual decisions; log disagreements.</li><li><b>Week 4</b> — review KPIs with the owner, Safety/SMS and partners; decide go / refine / stop.</li></ol>
      <div class="kv"><span>KPIs to monitor</span><div>Passenger-delay hours, diversions, min fuel margin, stand waits, tows, controller acceptance rate, CO₂</div><span>Pilot owner</span><div>${esc(i.owner)}</div><span>Sign-offs</span><div>${SIGNOFFS.map((s) => (i.signoffs[s.k] ? '✅ ' : '⬜ ') + esc(s.label)).join('<br>')}</div></div>
      <p class="src" style="margin-top:12px">Simulation evidence uses synthetic traffic calibrated to public figures; it supports a decision to run a shadow pilot and does not replace GCAA safety assessment.</p>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn gold" id="labPrint">🖨 Print / Save as PDF</button></div>`;
    FA.ui.modal(body);
    document.getElementById('labPrint').onclick = () => {
      const w = window.open('', '_blank');
      if (!w) { FA.ui.toast('Pop-up blocked', 'Allow pop-ups to print the evidence pack.', 'amber'); return; }
      w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(i.id) + ' Evidence Pack</title><style>body{font-family:Segoe UI,Arial,sans-serif;color:#111;padding:28px;font-size:12px;line-height:1.5}h2{margin:0 0 4px}h3{margin:16px 0 6px;color:#0b6b78}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 6px;text-align:left}.kv{display:grid;grid-template-columns:150px 1fr;gap:4px 10px}.kv span{color:#555}.tag{display:inline-block;border:1px solid #bbb;border-radius:4px;padding:1px 6px;margin:0 4px 4px 0}.muted,.src{color:#666}</style></head><body>' + document.getElementById('labDoc').innerHTML + '</body></html>');
      w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
    };
    FA.audit.add('INNOVATION', 'FalconAero', 'Generated evidence pack for ' + i.id + ' (readiness ' + rd.total + ')');
  }

  /* ---------- public API ---------- */
  FA.lab = {
    runTrial,
    readiness: (id) => { const i = byId(id); return i ? readiness(i) : null; },
    ideas: () => ideas,
    quickDemo() {
      selId = 'IDEA-101';
      const i = byId('IDEA-101') || ideas[0];
      selId = i.id;
      i.scenarios = ['fog', 'storm']; i.seeds = 6; save();
      if (FA.app && FA.state.view !== 'lab') FA.app.setView('lab');
      if (root) { renderKanban(); renderBuilder(); renderResults(); }
      return runFor(i);
    }
  };

  FA.views = FA.views || {};
  FA.views.lab = {
    mount(el) { root = el; css(); render(); },
    show() { if (root) { renderKanban(); renderAnalytics(); renderBoard(); } }
  };
  void lastResult;
})(window.FA);
