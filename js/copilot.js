/* FalconAero Copilot — natural-language & voice interface for supervisors (EN + Arabic keywords).
   Deterministic intent parser on top of the engine: every answer is grounded in computed plan data (no hallucination). */
(function (FA) {
  'use strict';
  const D = FA.data, E = FA.engine, U = FA.ui;
  const $ = (s) => document.querySelector(s);

  function say(text, who) {
    const m = document.createElement('div');
    m.className = 'msg ' + (who || 'bot');
    m.textContent = text;
    $('#chat').appendChild(m);
    $('#chat').scrollTop = 1e6;
    return m;
  }
  function speak(text, lang) {
    if (!window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang || 'en-GB'; u.rate = 1.04;
      window.speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  }

  function plan() { const S = FA.state; return S.plans[S.active !== 'baseline' ? S.active : S.generated ? S.viewPlan : S.rec]; }

  function briefing(ar) {
    const S = FA.state, inst = S.inst, t = S.t, c = E.conditions(inst, t), b = S.plans.baseline.kpi, p = plan(), k = p.kpi;
    const nc = FA.weather.nowcast(inst, t);
    const holding = (FA.map.lastAircraft || []).filter((a) => a.status === 'holding').length;
    if (ar) {
      return 'إحاطة فالكون إيرو — الساعة ' + D.fmt(t) + '. ' + (c.lvp ? 'إجراءات الرؤية المنخفضة مفعّلة، مدى الرؤية على المدرج ' + c.rvr + ' متر. ' : 'الظروف الجوية ضمن الحدود. ') +
        'احتمال الضباب خلال ساعة ' + Math.round(nc.p * 100) + ' بالمئة. عدد الطائرات في الانتظار ' + holding + '. ' +
        'الخطة الموصى بها: ' + p.cfg.short + '، بمتوسط تأخير ' + k.avgDelayAll.toFixed(0) + ' دقيقة مقابل ' + b.avgDelayAll.toFixed(0) + ' دقيقة دون دعم القرار، وعدد التحويلات ' + k.diversions + ' مقابل ' + b.diversions + '. القرار النهائي للمراقب الجوي.';
    }
    return 'FalconAero brief, ' + D.fmt(t) + ' GST. ' + (c.lvp ? 'Low visibility procedures active, RVR ' + c.rvr + ' metres. ' : c.rwyNClosed ? 'Runway 12L/30R closed, single-runway mixed mode. ' : 'Weather within limits. ') +
      'Fog probability next hour ' + Math.round(nc.p * 100) + ' percent. ' + holding + ' aircraft holding. ' +
      'Recommended plan ' + p.cfg.name + ': average delay ' + k.avgDelayAll.toFixed(0) + ' minutes versus ' + b.avgDelayAll.toFixed(0) + ' under current practice; diversions ' + k.diversions + ' versus ' + b.diversions + '; stand conflicts ' + k.conflicts + ' versus ' + b.conflicts + '. ' +
      (p.actions[1] ? 'Key action: ' + p.actions[1].text + ' ' : '') + 'Awaiting supervisor decision.';
  }

  function findFlight(q) {
    const S = FA.state;
    const m = q.toUpperCase().match(/\b(EK|FZ|QR|SV|AI|6E|BA|TK|PK)\s?0*(\d{1,4})\b/);
    if (!m) return null;
    const all = S.inst.arrivals.concat(S.inst.departures);
    return all.find((f) => f.airline === m[1] && parseInt(f.id.slice(m[1].length), 10) === parseInt(m[2], 10)) || null;
  }

  function customClosure(mins, rwy) {
    const S = FA.state, t = Math.max(300, Math.round(S.t));
    FA.app.loadScenario('runway', S.seed, { t });
    const ev = { type: 'rwyClosure', rwy: 'N', start: t, end: t + mins };
    S.inst.events = [ev]; S.inst.scenario = Object.assign({}, S.inst.scenario, { name: 'RWY ' + rwy + ' closure ' + mins + ' min (copilot what-if)', desc: 'What-if from Copilot: 12L/30R closed ' + D.fmt(t) + '–' + D.fmt(t + mins) + '.', events: [ev] });
    const r = E.buildAll(S.inst);
    S.plans = r.plans; S.rec = r.rec; S.viewPlan = r.rec;
    FA.audit.add('WHAT_IF', 'Supervisor via Copilot', 'Runway ' + rwy + ' closure for ' + mins + ' min from ' + D.fmt(t));
    FA.bus.emit('scenario', S); FA.bus.emit('tick', S.t);
  }

  function handle(qRaw) {
    const q = qRaw.trim(); if (!q) return;
    say(q, 'me');
    const l = q.toLowerCase();
    const S = FA.state;
    const ar = /[؀-ۿ]/.test(q);
    let r;
    const fl = findFlight(q);
    if (/help|what can you|مساعدة/.test(l)) {
      r = 'Try: "brief me", "fog risk?", "close runway 30R for 40 minutes", "simulate emergency", "generate plans", "why EK123?", "compare plans", "where do diversions go?", "approve". Arabic: "ملخص", "ضباب", "طوارئ".';
    } else if (/(close|closure|shut).*(runway|rwy|30r|12l)|مدرج/.test(l)) {
      const mm = l.match(/(\d{1,3})\s*(min|minutes|m\b|دقيقة)/);
      const mins = mm ? Math.min(150, +mm[1]) : 40;
      customClosure(mins, '12L/30R');
      const p = S.plans[S.rec].kpi, b = S.plans.baseline.kpi;
      r = 'What-if applied: 12L/30R closed for ' + mins + ' min from ' + D.fmt(S.t) + '. Current practice → avg delay ' + b.avgDelayAll.toFixed(1) + ' min, ' + b.conflicts + ' conflicts. FalconAero ' + S.plans[S.rec].cfg.short + ' → ' + p.avgDelayAll.toFixed(1) + ' min, ' + p.conflicts + ' conflicts. Say "generate plans" to review.';
    } else if (/perfect storm|everything|worst/.test(l)) {
      FA.app.loadScenario('storm'); r = 'Loaded the Perfect Storm scenario: fog + MAYDAY fuel + medical + A-pier stand outage.';
    } else if (/sand|shamal|dust|غبار/.test(l)) {
      FA.app.loadScenario('sand'); r = 'Loaded Shamal sandstorm scenario.';
    } else if (/emergenc|mayday|medical|طوارئ/.test(l)) {
      FA.app.loadScenario('storm');
      const em = S.inst.arrivals.filter((f) => f.priority === 'mayday' || f.priority === 'medical');
      r = 'Emergencies injected: ' + em.map((f) => f.id + ' (' + f.note + ', ETA ' + D.fmt(f.eta) + ')').join('; ') + '. FalconAero gives them the next landing slot and a contact stand with ambulance access.';
      if (em[0]) FA.app.select(em[0].id);
    } else if (/(simulate|load|start).*(fog)|^fog$/.test(l)) {
      FA.app.loadScenario('fog'); r = 'Loaded dense radiation fog scenario (CAT III, LVP).';
    } else if (/fog|visib|rvr|ضباب/.test(l)) {
      const nc = FA.weather.nowcast(S.inst, S.t);
      r = (ar ? 'احتمال الضباب خلال ٦٠ دقيقة: ' + Math.round(nc.p * 100) + '٪. ' : 'Fog probability within 60 min: ' + Math.round(nc.p * 100) + '%. ') + 'Main drivers: ' + nc.contributions.slice(0, 3).map((c) => c.label + ' (' + (c.contrib > 0 ? '↑' : '↓') + ')').join(', ') + '.';
    } else if (/normal|clear|reset/.test(l)) {
      FA.app.loadScenario('normal'); r = 'Back to normal operations.';
    } else if (/generat|recommend|what should|plan|options|خطة/.test(l) && !/compare|approve/.test(l)) {
      FA.views.ops.runGenerate(); r = 'Generating recovery plans… the recommendation will appear in the AI panel. Nothing changes until a supervisor approves.';
    } else if (/approve|accept|go ahead|وافق|اعتمد/.test(l)) {
      if (!S.generated) FA.app.generate();
      FA.app.approve(S.viewPlan === 'baseline' ? S.rec : S.viewPlan, 'ATC Supervisor (voice)');
      r = 'Approved ' + S.plans[S.active].cfg.name + '. Logged with your identity in the audit trail.';
    } else if (/compare|difference|trade.?off|قارن/.test(l)) {
      r = ['balanced', 'mindelay', 'safety', 'baseline'].map((id) => { const k = S.plans[id].kpi; return S.plans[id].cfg.short + ': delay ' + k.avgDelayAll.toFixed(1) + '′, div ' + k.diversions + ', conflicts ' + k.conflicts + ', CO₂ ' + (k.co2 / 1000).toFixed(0) + ' t, score ' + k.scores.overall.toFixed(0); }).join('\n') + '\nRecommended: ' + S.plans[S.rec].cfg.short + '.';
    } else if (/divert|alternate|تحويل/.test(l)) {
      const p = plan(), b = S.plans.baseline;
      r = 'Current practice diverts ' + b.divs.length + (b.divs.length ? ' (' + b.divs.map((d) => d.id + '→' + d.alt + (d.altLvp ? ' [LVP!]' : '')).join(', ') + ')' : '') + '. ' + p.cfg.short + ' diverts ' + p.divs.length + (p.divs.length ? ' (' + p.divs.map((d) => d.id + '→' + d.alt).join(', ') + ')' : '') + '. Alternates are scored on weather, Code-F stands, free apron and distance — see UAE Network.';
    } else if (fl || /why|explain|لماذا/.test(l)) {
      if (!fl) r = 'Tell me the flight, e.g. "why EK412?"';
      else {
        FA.app.select(fl.id);
        const x = E.explainFlight(plan(), fl.id);
        r = (x.title || fl.id) + '\n• ' + x.lines.join('\n• ');
      }
    } else if (/stand\s*([a-z]\d{1,2})/.test(l)) {
      const id = l.match(/stand\s*([a-z]\d{1,2})/)[1].toUpperCase();
      const iv = (plan().tl.get(id) || []).find((x) => S.t >= x.start && S.t < x.end);
      r = 'Stand ' + id + ': ' + (iv ? (iv.kind === 'outage' ? 'unserviceable' : 'occupied by ' + iv.id + ' until ' + D.fmt(iv.end)) : 'free now') + '.';
    } else if (/brief|status|summary|sitrep|ملخص|إحاطة/.test(l)) {
      r = briefing(ar); speak(r, ar ? 'ar-AE' : 'en-GB');
    } else {
      r = 'I can brief, run what-ifs, explain decisions and compare plans. Try "brief me" or "close runway 30R for 30 minutes". (Copilot answers only from computed plan data.)';
    }
    setTimeout(() => say(r), 150);
  }

  function initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btn = $('#micBtn');
    if (!SR) { btn.title = 'Voice input needs Chrome / Edge'; btn.onclick = () => U.toast('Voice input', 'Speech recognition is available in Chrome and Edge.', 'amber'); return; }
    let rec = null;
    btn.onclick = () => {
      if (rec) { rec.stop(); return; }
      rec = new SR();
      rec.lang = document.body.classList.contains('ar') ? 'ar-AE' : 'en-US';
      rec.interimResults = false;
      rec.onresult = (e) => { const txt = e.results[0][0].transcript; $('#chatIn').value = ''; handle(txt); };
      rec.onend = () => { btn.classList.remove('rec'); rec = null; };
      rec.onerror = () => { btn.classList.remove('rec'); rec = null; };
      btn.classList.add('rec');
      rec.start();
    };
  }

  function chips() {
    const S = FA.state;
    const em = S.inst && S.inst.arrivals.find((f) => f.priority === 'mayday' || f.priority === 'medical');
    const list = ['Brief me', 'Fog risk?', 'Close runway 30R for 40 min', em ? 'Why ' + em.id + '?' : 'Simulate emergency', 'Compare plans', 'ملخص'];
    $('#chatChips').innerHTML = list.map((c) => '<button>' + U.esc(c) + '</button>').join('');
    document.querySelectorAll('#chatChips button').forEach((b) => b.onclick = () => handle(b.textContent));
  }

  FA.copilot = { handle, briefing, say, speak };
  FA.views.copilot = {
    init() {
      $('#chatForm').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#chatIn').value; $('#chatIn').value = ''; handle(v); });
      initVoice();
      FA.bus.on('scenario', chips);
      say('Marhaba 👋 I\'m the FalconAero Copilot. Ask for a brief, a what-if ("close runway 30R for 40 min") or why a flight got its stand. Type or tap 🎤.');
    }
  };
})(window.FA);
