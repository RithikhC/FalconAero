/* FalconAero — guided demo (pitch mode). Every caption uses numbers computed live by the engine. */
(function (FA) {
  'use strict';
  const D = FA.data, U = FA.ui;
  const $ = (s) => document.querySelector(s);
  let i = 0, timer = null, paused = false, startAt = 0, dur = 0, raf = null;

  const k = (id) => FA.state.plans[id].kpi;
  const rec = () => FA.state.plans[FA.state.rec];
  const pct = (a, b) => (b ? Math.round((100 * (b - a)) / b) : 0);

  const STEPS = [
    {
      ms: 9000, view: 'ops', spot: '.map-wrap',
      run() { FA.app.loadScenario('storm', 2026, { t: 300 }); FA.state.speed = 120; setSpeedUi(120); FA.app.setTime(300); FA.app.play(true); },
      text: () => '<b>05:00 GST, Dubai International.</b> FalconAero runs a live digital twin of the airfield: ' + FA.state.inst.arrivals.length + ' arrivals and ' + FA.state.inst.departures.length + ' departures in the morning bank, every stand, runway and taxiway.'
    },
    {
      ms: 9000, view: 'ops', spot: '#wxPanel',
      run() { const s0 = FA.state.inst.scenario.wx.start; let t = s0 - 60; while (t < s0 && FA.weather.nowcast(FA.state.inst, t).p < 0.3) t += 2; this.t = t; FA.app.setTime(t); FA.app.play(false); },
      text() { const s0 = FA.state.inst.scenario.wx.start, nc = FA.weather.nowcast(FA.state.inst, this.t); return '<b>Predict before it happens.</b> Our fog nowcast, ' + (FA.fogModel ? 'trained on <b>11 years</b> of real Dubai airport (OMDB) weather reports' : 'a logistic model on surface observations') + ', flags <b>' + Math.round(nc.p * 100) + '% fog risk ' + Math.round(s0 - this.t) + ' minutes before</b> visibility collapses, and shows <i>why</i>: shrinking dew-point gap, mist, calm wind, pre-dawn cooling.'; }
    },
    {
      ms: 10000, view: 'ops', spot: '#kpiStrip',
      run() { FA.app.setTime(FA.state.inst.scenario.wx.start + 22); FA.app.play(true); },
      text: () => { const b = k('baseline'); return '<b>Fog + a MAYDAY + a jet-bridge failure.</b> Arrival capacity drops ~45%. Under current practice: <b>' + b.diversions + ' diversions</b> (' + b.secondaryDiv + ' into airports also in fog), <b>' + b.conflicts + ' stand/ground conflicts</b>, emergency waits <b>' + Math.round(b.emergDelay) + ' min</b>, <b>' + U.num(b.missedConn) + '</b> missed connections.'; }
    },
    {
      ms: 8000, view: 'ops', spot: '#aiPanel',
      run() { FA.app.play(false); FA.views.ops.runGenerate(); },
      text: () => '<b>One click.</b> FalconAero plans runways, stands, taxi flow, towing and UAE-wide diversions <b>together</b>, producing 3 complete recovery plans, each stress-tested with Monte-Carlo ETA noise, in about <b>' + Math.round(['balanced', 'mindelay', 'safety'].reduce((a, id) => a + FA.state.plans[id].ms, 0)) + ' ms</b>.'
    },
    {
      ms: 10000, view: 'ops', spot: '#aiPanel',
      run() { },
      text: () => '<b>Recommended: ' + U.esc(rec().cfg.name) + '.</b> ' + rec().actions.slice(0, 4).map((a) => U.esc(a.text)).join(' · ')
    },
    {
      ms: 9000, view: 'ops', spot: '#explainPanel',
      run() {
        const p = rec();
        const t = p.tows[0];
        const f = (t && t.forArr) || (p.seq.find((s) => s.f.priority === 'mayday') || p.seq[0]).id;
        FA.app.select(f);
      },
      text: () => '<b>Explainable, not a black box.</b> Click any aircraft: FalconAero shows the decision, the reason, the alternatives it rejected and what current practice would have done.'
    },
    {
      ms: 9000, view: 'ops', spot: '#aiPanel',
      run() { FA.app.approve(FA.state.rec, 'ATC Supervisor (demo)'); FA.app.play(true); },
      text: () => '<b>Human-in-the-loop.</b> The supervisor approves, modifies or rejects. Nothing happens without a human, and every decision is written to a hash-chained, tamper-evident audit log.'
    },
    {
      ms: 10000, view: 'ops', spot: '#kpiStrip',
      run() { FA.app.setTime(FA.state.inst.scenario.wx.start + 40); FA.app.play(true); },
      text: () => { const b = k('baseline'), r = rec().kpi; return '<b>Outcome.</b> Average delay <b>−' + pct(r.avgDelayAll, b.avgDelayAll) + '%</b>, diversions <b>' + b.diversions + ' → ' + r.diversions + '</b>, conflicts <b>' + b.conflicts + ' → ' + r.conflicts + '</b>, CO₂ <b>−' + pct(r.co2, b.co2) + '%</b>, missed connections <b>' + U.num(b.missedConn) + ' → ' + U.num(r.missedConn) + '</b>, emergency landed with <b>' + Math.round(r.emergDelay) + ' min</b> delay.'; }
    },
    {
      ms: 8000, view: 'plans', spot: '#radar',
      run() { FA.app.play(false); },
      text: () => '<b>Transparent trade-offs.</b> Delay vs safety vs passengers vs CO₂ vs airline fairness vs controller workload. Supervisors see exactly what each plan costs.'
    },
    {
      ms: 9000, view: 'network', spot: '#networkRoot',
      run() { },
      text: () => '<b>National, not just one airport.</b> Diversions are coordinated across the UAE network. Alternates are scored on live weather, Code-F stands and apron capacity, so aircraft are not sent into another fog bank.'
    },
    {
      ms: 9000, view: 'data', spot: '#dataRoot',
      run() { },
      text: () => { const O = FA.openData; return '<b>Built on official UAE data.</b> GCAA statistics from Bayanat calibrate the digital twin, and 11 years of real METARs train the fog model. Our study of ' + (O ? O.fogImpact.nFogDays : '') + ' fog days shows UAE traffic volume barely drops (' + (O ? O.fogImpact.arrPct.toFixed(1) : '') + '%): the cost is <b>delays and diversions</b>, exactly what FalconAero fixes.'; }
    },
    {
      ms: 11000, view: 'lab', spot: '#labRoot',
      run() { if (FA.lab && FA.lab.quickDemo) { try { FA.lab.quickDemo(); } catch (e) { console.warn(e); } } },
      text: () => '<b>GCAA\'s real problem: ideas that never get tested.</b> The same digital twin is an <b>Innovation Sandbox</b>. Any employee turns an idea into an experiment, tests it on dozens of simulated disruption days, and gets an evidence pack and readiness score that move it to a pilot.'
    },
    {
      ms: 8000, view: 'gov', spot: '#govRoot',
      run() { },
      text: () => '<b>Responsible AI by design,</b> aligned with the UAE Charter for the Development & Use of AI: human oversight, explainability, fairness bounds, safety guardrails and full auditability.'
    },
    {
      ms: 10000, view: 'impact', spot: '#impactRoot',
      run() { },
      text: () => { const B = FA.benchmark; return '<b>Proven across many disruption days, ready in 90 days.</b> ' + (B && B.summary ? 'Benchmark: passenger-delay hours −' + Math.round(B.summary.paxDelayPct || 0) + '%, CO₂ −' + Math.round(B.summary.co2Pct || 0) + '%. ' : '') + 'Shadow mode → advisory → validated pilot with GCAA and a UAE airport. <b>FalconAero: safer skies, fewer delays, faster innovation.</b>'; }
    }
  ];

  function setSpeedUi(s) { document.querySelectorAll('#speedBtns button').forEach((x) => x.classList.toggle('on', +x.dataset.s === s)); }
  function clearSpot() { document.querySelectorAll('.spot').forEach((e) => e.classList.remove('spot')); }

  function go(n) {
    clearTimeout(timer); cancelAnimationFrame(raf);
    i = Math.max(0, Math.min(STEPS.length - 1, n));
    const s = STEPS[i];
    if (FA.state.view !== s.view) FA.app.setView(s.view);
    try { s.run(); } catch (e) { console.warn('demo step', e); }
    setTimeout(() => {
      clearSpot();
      const el = s.spot && document.querySelector(s.spot);
      if (el) { el.classList.add('spot'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      $('#demoText').innerHTML = s.text();
    }, 120);
    $('#demoStep').textContent = (i + 1) + '/' + STEPS.length;
    $('#demoNext').textContent = i === STEPS.length - 1 ? 'Finish ✓' : 'Next ▶';
    dur = s.ms; startAt = performance.now();
    if (!paused) timer = setTimeout(() => (i < STEPS.length - 1 ? go(i + 1) : stop()), s.ms);
    progress();
  }
  function progress() {
    const p = paused ? 0 : Math.min(1, (performance.now() - startAt) / dur);
    $('#demoProg').style.width = (100 * p) + '%';
    if (!paused && p < 1) raf = requestAnimationFrame(progress);
  }
  function start() {
    paused = false; $('#demoPause').textContent = '❚❚';
    $('#demoBar').hidden = false;
    FA.audit.add('DEMO', 'presenter', 'Guided demo started');
    go(0);
  }
  function stop() {
    clearTimeout(timer); cancelAnimationFrame(raf); clearSpot();
    $('#demoBar').hidden = true;
  }

  FA.demo = { start, stop, go, STEPS };
  FA.views.demo = {
    init() {
      $('#demoBtn').onclick = start;
      $('#demoNext').onclick = () => (i < STEPS.length - 1 ? go(i + 1) : stop());
      $('#demoPrev').onclick = () => go(i - 1);
      $('#demoClose').onclick = stop;
      $('#demoPause').onclick = () => {
        paused = !paused; $('#demoPause').textContent = paused ? '▶' : '❚❚';
        if (paused) { clearTimeout(timer); cancelAnimationFrame(raf); $('#demoProg').style.width = '0'; } else go(i);
      };
      document.addEventListener('keydown', (e) => {
        if ($('#demoBar').hidden || e.target.tagName === 'INPUT') return;
        if (e.key === 'ArrowRight') go(i + 1);
        if (e.key === 'ArrowLeft') go(i - 1);
        if (e.key === 'Escape') stop();
      });
    }
  };
})(window.FA);
