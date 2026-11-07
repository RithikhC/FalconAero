/* FalconAero — scenario weather, METAR synthesis and the AI fog nowcast panel. */
(function (FA) {
  'use strict';
  const D = FA.data, E = FA.engine, C = FA.charts;
  const lerp = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));

  /** Synthetic surface observation for the scenario at time t (minutes, local). */
  function obsAt(inst, t) {
    const sc = inst.scenario, s0 = sc.wx.start, s1 = sc.wx.end;
    const month = 1, hour = Math.floor(t / 60) % 24;
    let o = { tempC: 21 - (t - 300) / 90, dewC: 11, windKt: 9, windDir: 300, visM: 9999, rvr: null, wx: '', cloud: 'FEW030' };
    if (sc.id === 'fog' || sc.id === 'storm') {
      // radiation fog: cooling under calm winds, dewpoint depression collapses before onset
      const pre = (t - (s0 - 120)) / 120;            // 0..1 over the 2 h before onset
      o.tempC = lerp(19.5, 16.2, pre); o.dewC = lerp(15.0, 16.0, pre);
      o.windKt = Math.round(lerp(7, 2, pre)); o.windDir = 140;
      o.visM = pre < 0.45 ? 8000 : pre < 0.6 ? 5000 : pre < 0.72 ? 3500 : pre < 0.85 ? 2500 : 1500;
      if (pre >= 0.72) o.wx = 'BR';
      o.cloud = pre > 0.8 ? 'SCT008' : 'FEW040';
      if (t >= s0 - 6 && t < s0) { o.visM = 600; o.wx = 'BR'; o.tempC = 16.1; o.dewC = 16.0; }
      if (t >= s0 && t < s1) {
        o.tempC = 16 + (t - s0) / 120; o.dewC = o.tempC - 0.1; o.windKt = 2; o.visM = 100 + Math.round(((t - s0) % 20) * 4);
        o.rvr = sc.wx.rvr + Math.round(Math.sin(t / 4) * 40); o.wx = 'FG'; o.cloud = 'VV001';
      }
      if (t >= s1) { const k = (t - s1) / 40; o.tempC = 18 + k * 3; o.dewC = 16.2; o.visM = k < 0.4 ? 1500 : k < 1 ? 4000 : 8000; o.wx = k < 0.4 ? 'BR' : ''; o.windKt = 5; o.cloud = 'BKN010'; }
    } else if (sc.id === 'sand') {
      o.tempC = 27; o.dewC = 6; o.windDir = 320;
      const on = s0 != null && t >= s0 && t < s1;
      o.windKt = on ? 26 : t >= s0 - 30 ? 18 : 12; o.visM = on ? sc.wx.vis : t >= s0 - 30 ? 4000 : 8000; o.wx = on ? 'SA' : t >= s0 - 30 ? 'DU' : '';
      if (on) o.rvr = sc.wx.rvr;
    }
    o.rh = Math.round(100 * Math.exp((17.625 * o.dewC) / (243.04 + o.dewC)) / Math.exp((17.625 * o.tempC) / (243.04 + o.tempC)));
    o.localHour = hour + (t % 60) / 60; o.month = month;
    return o;
  }

  function featuresAt(inst, t) {
    const o = obsAt(inst, t), o1 = obsAt(inst, t - 60), o2 = obsAt(inst, t - 120), o3 = obsAt(inst, t - 180);
    return {
      tempC: o.tempC, dewC: o.dewC, rh: o.rh, windKt: o.windKt, windDir: o.windDir, localHour: o.localHour, month: o.month,
      visM: o.visM, visTrend1h: o.visM - o1.visM, dpdTrend2h: (o.tempC - o.dewC) - (o2.tempC - o2.dewC), tempDrop3h: o3.tempC - o.tempC
    };
  }

  /* fallback model (used only if the METAR-trained js/fogmodel.js is not loaded) */
  const FALLBACK = {
    meta: { station: 'OMDB', source: 'fallback heuristic (trained model not loaded)', target: 'Visibility < 1000 m within 60 min' },
    predict(raw) {
      const dpd = raw.tempC - raw.dewC;
      const terms = [
        { key: 'dpd', label: 'Dewpoint depression', value: dpd.toFixed(1) + ' °C', contrib: -1.15 * (dpd - 3) },
        { key: 'wind', label: 'Wind speed', value: raw.windKt + ' kt', contrib: -0.28 * (raw.windKt - 6) },
        { key: 'night', label: 'Night-time cooling', value: Math.floor(raw.localHour) + ':00', contrib: raw.localHour < 8 || raw.localHour > 21 ? 0.7 : -0.8 },
        { key: 'vis', label: 'Current visibility', value: raw.visM + ' m', contrib: -0.9 * (Math.log(Math.max(100, raw.visM)) - Math.log(5000)) },
        { key: 'trend', label: 'Dewpoint-depression trend (2 h)', value: (raw.dpdTrend2h || 0).toFixed(1) + ' °C', contrib: -0.35 * (raw.dpdTrend2h || 0) }
      ];
      const z = -2.2 + terms.reduce((a, x) => a + x.contrib, 0);
      return { p: 1 / (1 + Math.exp(-z)), contributions: terms.sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib)) };
    }
  };
  const model = () => FA.fogModel || FALLBACK;
  const ALERT = 0.3; // above the model's F1-optimal operating point (0.10) to keep false alarms low

  function nowcast(inst, t) {
    const raw = featuresAt(inst, t);
    const r = model().predict(raw);
    return { p: r.p, contributions: r.contributions || [], raw };
  }

  function metar(icao, o, t) {
    const dd = String(Math.round(o.windDir / 10) * 10).padStart(3, '0');
    const ff = String(Math.round(o.windKt)).padStart(2, '0');
    const utc = ((Math.round(t) - 240) + 1440) % 1440;
    const z = '07' + String(Math.floor(utc / 60)).padStart(2, '0') + String(utc % 60 - (utc % 30)).padStart(2, '0') + 'Z';
    const vis = o.visM >= 9999 ? '9999' : String(Math.round(o.visM / 50) * 50).padStart(4, '0');
    const rvr = o.rvr ? ' R12L/' + String(Math.round(o.rvr / 25) * 25).padStart(4, '0') + 'N R30R/' + String(Math.round((o.rvr + 50) / 25) * 25).padStart(4, '0') + 'N' : '';
    const tt = (v) => (v < 0 ? 'M' : '') + String(Math.round(Math.abs(v))).padStart(2, '0');
    return icao + ' ' + z + ' ' + (o.windKt < 3 ? '00000KT' : dd + ff + 'KT') + ' ' + vis + rvr + (o.wx ? ' ' + o.wx : '') + ' ' + o.cloud + ' ' + tt(o.tempC) + '/' + tt(o.dewC) + ' Q1013 ' + (o.wx === 'FG' ? 'BECMG FM0730 3000 BR' : 'NOSIG');
  }

  function category(c, o) {
    if (o.visM < 550 || (c.rvr && c.rvr < 550)) return { k: 'CAT III', color: '#ef5350' };
    if (o.visM < 800) return { k: 'CAT II', color: '#ffb300' };
    if (o.visM < 5000) return { k: 'CAT I', color: '#ffd54f' };
    return { k: 'VMC', color: '#66bb6a' };
  }

  let alerted = {};
  function render(t) {
    const S = FA.state, inst = S.inst;
    if (!inst) return;
    const o = obsAt(inst, t), c = E.conditions(inst, t), cat = category(c, o);
    const nc = nowcast(inst, t);
    const sc = inst.scenario;
    const aar = Math.round(60 / E.arrSep(inst, { wake: 'H' }, { wake: 'H' }, t, 0, false));
    const live = FA.live && FA.live.metar && FA.live.metar.OMDB;
    const m = model();
    // trajectory for next 3 h
    const pts = [];
    for (let k = 0; k <= 180; k += 10) { const tt = Math.min(530, t + k); pts.push([tt, nowcast(inst, tt).p * 100]); }
    const fogBand = sc.lvp && sc.wx.start != null ? [{ x0: Math.max(t, sc.wx.start), x1: Math.min(t + 180, sc.wx.end), label: 'LVP', color: 'rgba(255,179,0,.08)' }].filter((b) => b.x1 > b.x0) : [];
    const contrib = nc.contributions.slice(0, 5);
    const maxC = Math.max(0.5, ...contrib.map((x) => Math.abs(x.contrib)));
    let html = '';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span class="cat-badge" style="background:' + cat.color + '22;color:' + cat.color + ';border:1px solid ' + cat.color + '88">' + cat.k + (c.lvp ? ' · LVP' : '') + '</span><span class="small muted">Arrival rate ≈ <b class="mono" style="color:#fff">' + aar + '/h</b> per rwy</span></div>';
    html += '<div class="metar">' + FA.ui.esc(metar('OMDB', o, t)) + '</div>';
    html += '<div class="wx-grid">' +
      cell('Visibility', o.visM >= 9999 ? '10 km+' : o.visM + ' m') + cell('RVR', c.rvr ? c.rvr + ' m' : '—') +
      cell('Temp / Dew', o.tempC.toFixed(1) + ' / ' + o.dewC.toFixed(1) + '°') + cell('Wind', (o.windKt < 3 ? 'Calm' : o.windDir + '° / ' + o.windKt + ' kt')) + '</div>';
    html += '<div class="fogprob">' + C.gauge(nc.p, 'fog ≤ 60 min') + '<div style="flex:1;min-width:0"><div class="small" style="font-weight:700;margin-bottom:4px">AI Fog Nowcast — why?</div><div class="contrib">' +
      contrib.map((x) => {
        const w = (Math.abs(x.contrib) / maxC) * 50;
        const col = x.contrib > 0 ? '#ef5350' : '#66bb6a';
        return '<span class="muted" title="' + FA.ui.esc(x.label) + '" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + FA.ui.esc(x.label) + '</span><div class="bar"><i style="left:' + (x.contrib > 0 ? 50 : 50 - w) + '%;width:' + w + '%;background:' + col + '"></i></div><span class="mono" style="font-size:10px">' + FA.ui.esc(fmtVal(x.value)) + '</span>';
      }).join('') + '</div></div></div>';
    html += C.line([{ name: 'P(fog ≤ 60 min)', color: '#26c6da', points: pts, area: true }], { w: 270, h: 120, L: 30, yMax: 100, xMin: t, xMax: t + 180, xTicks: 3, xFmt: D.fmt, yFmt: (v) => v + '%', noLegend: true, bands: fogBand, hlines: [{ y: ALERT * 100, label: 'alert', color: '#ffb300' }] });
    html += '<div class="src" style="margin-top:6px">Model: ' + FA.ui.esc(m.meta && m.meta.source ? (m.meta.source.length > 70 ? 'logistic regression trained on ' + (m.meta.period || '') + ' OMDB METARs' : m.meta.source) : '') + (m.metrics ? ' · test AUC ' + m.metrics.auc.toFixed(2) : '') + ' · <a href="#" id="modelInfo">model card</a></div>';
    if (live) {
      const L = FA.live.metar.OMDB;
      html += '<div class="card" style="margin-top:8px"><div class="small" style="display:flex;justify-content:space-between"><b>Live OMDB now</b><span class="chip live">LIVE</span></div><div class="metar" style="margin:6px 0 4px">' + FA.ui.esc(L.raw || '') + '</div>' + (L.fogP != null ? '<div class="small muted">Live fog nowcast: <b class="mono" style="color:#fff">' + Math.round(L.fogP * 100) + '%</b> · source ' + FA.ui.esc(FA.live.source || '') + '</div>' : '') + '</div>';
    }
    // pre-emptive alert
    if (sc.lvp && t < sc.wx.start && nc.p >= ALERT) {
      html += '<div class="alert amber" style="margin-top:8px"><div class="ic">⚠</div><div><b>Fog likely in ≤ 60 min (' + Math.round(nc.p * 100) + '%)</b><span class="small">Prepare LVP now. FalconAero can issue ATFM ground-delay proposals to short-haul inbounds before they depart.</span><div style="margin-top:6px"><button class="btn sm" id="preemptBtn">Pre-empt: generate recovery plans</button></div></div></div>';
      if (!alerted[inst.seed + sc.id]) { alerted[inst.seed + sc.id] = true; FA.ui.toast('AI fog alert · OMDB', Math.round(nc.p * 100) + '% probability of visibility < 1000 m within 60 min.', 'amber'); FA.audit.add('AI_ALERT', 'FalconAero', 'Fog nowcast ' + Math.round(nc.p * 100) + '% within 60 min — LVP preparation advised'); }
    }
    document.getElementById('wxBody').innerHTML = html;
    document.getElementById('wxSource').textContent = live ? 'SIM + LIVE' : 'SIM';
    const pb = document.getElementById('preemptBtn');
    if (pb) pb.onclick = () => { FA.app.generate(); };
    const mi = document.getElementById('modelInfo');
    if (mi) mi.onclick = (e) => { e.preventDefault(); modelCard(); };
  }
  function fmtVal(v) { return typeof v === 'number' ? (Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1)) : String(v); }
  function cell(l, v) { return '<div class="wx-cell"><div class="l">' + l + '</div><div class="v">' + v + '</div></div>'; }

  function modelCard() {
    const m = model();
    const mt = m.metrics;
    let h = '<h2>Fog Nowcast — model card</h2>';
    h += '<p class="muted">' + FA.ui.esc((m.meta && m.meta.target) || '') + '</p>';
    if (m.meta) h += '<table class="t"><tr><td>Station</td><td>' + FA.ui.esc(m.meta.station) + '</td></tr><tr><td>Data</td><td style="font-family:inherit">' + FA.ui.esc(m.meta.source) + '</td></tr>' + (m.meta.period ? '<tr><td>Period</td><td>' + FA.ui.esc(m.meta.period) + '</td></tr><tr><td>Train / test</td><td>' + FA.ui.esc(m.meta.trainPeriod) + ' / ' + FA.ui.esc(m.meta.testPeriod) + ' (n=' + FA.ui.num(m.meta.nTrain) + ' / ' + FA.ui.num(m.meta.nTest) + ')</td></tr>' : '') + '</table>';
    if (mt) {
      h += '<h3 style="margin-top:12px">Out-of-sample performance (time-based split)</h3><table class="t"><tr><th>AUC-ROC</th><th>Brier</th><th>Precision</th><th>Recall</th><th>F1</th><th>' + FA.ui.esc(mt.baselineName || 'Baseline') + ' AUC</th></tr><tr><td>' + mt.auc.toFixed(3) + '</td><td>' + mt.brier.toFixed(3) + '</td><td>' + mt.precision.toFixed(2) + '</td><td>' + mt.recall.toFixed(2) + '</td><td>' + mt.f1.toFixed(2) + '</td><td>' + (mt.baselineAuc != null ? mt.baselineAuc.toFixed(3) : '—') + '</td></tr></table>';
    }
    if (m.calibration) {
      h += '<h3 style="margin-top:12px">Calibration</h3>' + C.line([{ name: 'Model', color: '#26c6da', points: m.calibration.filter((c) => c.n > 0).map((c) => [c.p * 100, c.observed * 100]) }, { name: 'Perfect', color: '#5f7598', dash: true, points: [[0, 0], [100, 100]] }], { w: 520, h: 200, yMax: 100, xMin: 0, xMax: 100, xFmt: (v) => Math.round(v) + '%', yFmt: (v) => Math.round(v) + '%' });
    }
    if (m.climatology && m.climatology.OMDB) {
      const cl = m.climatology.OMDB;
      h += '<h3 style="margin-top:12px">OMDB fog climatology (real METAR history)</h3>' + C.bars(['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].map((mm, i) => ({ label: mm, values: [cl.fogDaysByMonth ? cl.fogDaysByMonth[i] : cl.byMonth[i]] })), [cl.fogDaysByMonth ? 'Fog days / month' : '% of obs with fog'], { w: 520, h: 200, labels: true });
    }
    h += '<p class="small muted" style="margin-top:10px">Limitations: single-station METAR at 30-min resolution; not a certified forecast — advisory input for human forecasters and ATC supervisors. Production: add NCM observations, RVR sensor feeds and NWP ensembles.</p>';
    FA.ui.modal(h);
  }

  FA.weather = {
    obsAt, featuresAt, nowcast, metar, render, modelCard,
    init() {
      FA.bus.on('tick', (t) => { if (FA.state.view === 'ops') throttle(t); });
      FA.bus.on('scenario', () => render(FA.state.t));
      FA.bus.on('live', () => render(FA.state.t));
    }
  };
  let lastR = -99;
  function throttle(t) { if (Math.abs(t - lastR) >= 1) { lastR = t; render(t); } }
})(window.FA);
