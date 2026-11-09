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
    { ms: 7000, view: 'command', spot: '.cmd-map',
      run() { FA.app.loadScenario('storm', 2026, { t: 300 }); FA.state.speed = 120; FA.app.play(true); },
      text: () => '<b>Dubai International, 05:00.</b> Live digital twin: ' + FA.state.inst.arrivals.length + ' arrivals, 70 stands, 2 runways.' },
    { ms: 7000, view: 'command', spot: '#cmdFog',
      run() { this.t = alertT(); FA.app.setTime(this.t); FA.app.play(true); },
      text() { return '<b>AI sees the fog ' + Math.round(s0() - this.t) + ' minutes before it hits.</b> Trained on 11 years of real Dubai weather.'; } },
    { ms: 7500, view: 'command', spot: '#cmdKpis',
      run() { FA.app.loadScenario('storm', 2026, { t: 300 }); FA.app.setTime(s0() + 22); FA.app.play(true); },
      text: () => { const b = k('baseline'); return '<b>Fog + MAYDAY + broken jet-bridge.</b> ' + b.diversions + ' diversions · ' + b.conflicts + ' conflicts · ' + Math.round(b.avgDelayAll) + ' min delay.'; } },
    { ms: 6500, view: 'command', spot: '.cmd-map',
      run() { FA.app.play(false); FA.views.command.recover(); },
      text: () => '<b>One click.</b> Runways, stands, towing and diversions, re-planned together.' },
    { ms: 6500, view: 'command', spot: '.cmd-map',
      run() { },
      text: () => '<b>3 plans in ' + Math.round(['balanced', 'mindelay', 'safety'].reduce((a, id) => a + FA.state.plans[id].ms, 0)) + ' ms.</b> The AI recommends, a human decides.' },
    { ms: 7500, view: 'command', spot: '#cmdKpis',
      run() { FA.views.command.approve(); FA.app.setTime(s0() + 38); FA.app.play(true); },
      text: () => { const b = k('baseline'), r = rec().kpi; return '<b>−' + pct(r.avgDelayAll, b.avgDelayAll) + '% delay · ' + r.diversions + ' diversions · ' + r.conflicts + ' conflicts · −' + pct(r.co2, b.co2) + '% CO₂</b>'; } },
    { ms: 8000, view: 'command', spot: '.cmd-map',
      run() { FA.views.command.toggleCompare('baseline'); sub = setTimeout(() => FA.views.command.toggleCompare('ai'), 3800); },
      text: () => '<b>Before ⟷ After.</b> Same fog, same flights.' },
    { ms: 7000, view: 'command', spot: '.cmd-feed',
      run() { const p = rec(); const t = p.tows[0]; FA.app.select(t ? t.forArr : (p.seq.find((s) => s.f.priority === 'mayday') || p.seq[0]).id); },
      text: () => '<b>Every action live and explained.</b> Click any aircraft: why this stand, why this slot.' },
    { ms: 6500, view: 'network', spot: '#networkRoot', run() { FA.app.select(null); },
      text: () => '<b>National scale.</b> Diversions coordinated across 7 UAE airports, never into another fog bank.' },
    { ms: 6500, view: 'data', spot: '#dataRoot', run() { },
      text: () => '<b>Built on official GCAA open data</b> from Bayanat, plus live weather and live traffic.' },
    { ms: 8000, view: 'lab', spot: '#labRoot', run() { if (FA.lab && FA.lab.quickDemo) { try { FA.lab.quickDemo(); } catch (e) { console.warn(e); } } },
      text: () => '<b>Innovation Sandbox.</b> Any GCAA idea, tested on dozens of disruption days in minutes.' },
    { ms: 6000, view: 'gov', spot: '#govRoot', run() { },
      text: () => '<b>Responsible AI.</b> Human-in-the-loop · explainable · tamper-proof audit trail.' },
    { ms: 8000, view: 'command', spot: '#cmdKpis', run() { FA.app.play(true); },
      text: () => '<b>FalconAero.</b> Safer skies. Fewer delays. Faster innovation.' }
  ];

  function clearSpot() { document.querySelectorAll('.spot').forEach((e) => e.classList.remove('spot')); }

  function go(n) {
    clearTimeout(timer); clearTimeout(sub); cancelAnimationFrame(raf);
    i = Math.max(0, Math.min(STEPS.length - 1, n));
    const s = STEPS[i];
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
