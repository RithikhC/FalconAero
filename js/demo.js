/* FalconAero — guided demo (pitch mode). Short captions, live numbers, runs on the Command dashboard. */
(function (FA) {
  'use strict';
  const U = FA.ui;
  const $ = (s) => document.querySelector(s);
  let i = 0, timer = null, paused = false, startAt = 0, dur = 0, raf = null, sub = null;

  const k = (id) => FA.state.plans[id].kpi;
  const rec = () => FA.state.plans[FA.state.rec];
  const pct = (a, b) => (b ? Math.round((100 * (b - a)) / b) : 0);
  const s0 = () => FA.state.inst.scenario.wx.start;
  function alertT() { let t = s0() - 60; while (t < s0() && FA.weather.nowcast(FA.state.inst, t).p < 0.3) t += 2; return t; }

  const STEPS = [
    { ms: 7000, view: 'command', spot: '.db-center',
      run() { FA.app.loadScenario('storm', 2026, { t: 300 }); FA.state.speed = 120; FA.app.play(true); },
      text: () => '<b>Dubai International, 05:00.</b> Digital twin of the airfield: ' + FA.state.inst.arrivals.length + ' arrivals, 70 stands, 2 runways, full taxiway network.' },
    { ms: 7000, view: 'command', spot: '#cmdFog',
      run() { this.t = alertT(); FA.app.setTime(this.t); FA.app.play(true); },
      text() { return '<b>Fog alert issued ' + Math.round(s0() - this.t) + ' minutes before onset.</b> Forecast model trained on 11 years of OMDB observations.'; } },
    { ms: 7500, view: 'command', spot: '#cmdKpis',
      run() { FA.app.loadScenario('storm', 2026, { t: 300 }); FA.app.setTime(s0() + 22); FA.app.play(true); },
      text: () => { const b = k('baseline'); return '<b>Fog, a MAYDAY and a jet-bridge failure.</b> Without decision support: ' + b.diversions + ' diversions · ' + b.conflicts + ' conflicts · ' + Math.round(b.avgDelayAll) + ' min delay.'; } },
    { ms: 6000, view: 'command', spot: '.cmd-center',
      run() { FA.app.play(false); FA.views.command.recover(); },
      text: () => '<b>Generate recovery options.</b> Runways, stands, taxi routes and diversions are re-planned together.' },
    { ms: 6000, view: 'command', spot: '.cmd-center',
      run() { },
      text: () => '<b>Three options in ' + Math.round(['balanced', 'mindelay', 'safety'].reduce((a, id) => a + FA.state.plans[id].ms, 0)) + ' ms.</b> The system recommends; the duty supervisor decides.' },
    { ms: 7500, view: 'command', spot: '#cmdKpis',
      run() { FA.views.command.approve(); FA.app.setTime(s0() + 38); FA.app.play(true); },
      text: () => { const b = k('baseline'), r = rec().kpi; return '<b>−' + pct(r.avgDelayAll, b.avgDelayAll) + '% delay · ' + r.diversions + ' diversions · ' + r.conflicts + ' conflicts · −' + pct(r.co2, b.co2) + '% CO₂</b>'; } },
    { ms: 7500, view: 'command', spot: '.cmd-center',
      run() { FA.views.command.toggleCompare('baseline'); sub = setTimeout(() => FA.views.command.toggleCompare('ai'), 3600); },
      text: () => '<b>Baseline vs plan.</b> Same weather, same traffic.' },
    { ms: 7000, view: 'command', spot: '.db-seq',
      run() { const p = rec(); const s = p.seq.find((x) => x.f.priority === 'mayday') || p.seq[30]; FA.app.select(s.id); },
      text: () => '<b>Arrival sequence:</b> runway, stand and predicted delay for every flight, with the reasoning.' },
    { ms: 7500, view: 'command', spot: '.cmd-center',
      run() { FA.app.select(null); const on = FA.state.inst.events.some((e) => e.user && e.type === 'standOutage' && e.stands[0] === 'B2'); this.r = on ? (FA.state.replans || []).slice(-1)[0] : FA.app.toggleStand('B2'); },
      text() { return '<b>Stand B2 out of service.</b> Plan updated in ' + Math.round(this.r ? this.r.ms : 0) + ' ms with alternative stands.'; } },
    { ms: 6500, view: 'command', spot: '#cmdRes',
      run() { },
      text: () => '<b>' + k('baseline').taxiConflicts + ' → 0 taxi conflicts.</b> Deconflicted taxi routes; runway and stand load balanced.' },
    { ms: 6500, view: 'command', spot: '.db-net',
      run() { },
      text: () => '<b>Network view.</b> Live METAR and ' + (FA.live && FA.live.adsb ? FA.live.adsb.length + ' real aircraft' : 'live traffic') + ' over the UAE; diversions coordinated across 7 airports.' },
    { ms: 8000, view: 'command', spot: '#cmdKpis', run() { FA.app.play(true); },
      text: () => '<b>FalconAero.</b> Decision support for safer, more resilient airport operations.' }
  ];

  function clearSpot() { document.querySelectorAll('.spot').forEach((e) => e.classList.remove('spot')); }

  function go(n) {
    clearTimeout(timer); clearTimeout(sub); cancelAnimationFrame(raf);
    i = Math.max(0, Math.min(STEPS.length - 1, n));
    const s = STEPS[i];
    if (FA.map.override && FA.views.command.phase === 'active') FA.views.command.toggleCompare('ai'); // never leave the screen stuck on BEFORE
    if (FA.state.view !== s.view) FA.app.setView(s.view);
    try { s.run(); } catch (e) { console.warn('demo step', e); }
    setTimeout(() => {
      clearSpot();
      const el = s.spot && document.querySelector(s.spot);
      if (el) { el.classList.add('spot'); if (s.view !== 'command') el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
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
    clearTimeout(timer); clearTimeout(sub); cancelAnimationFrame(raf); clearSpot();
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
