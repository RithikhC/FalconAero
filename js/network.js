/* FalconAero — UAE Network view: cross-airport diversion coordination + live METAR / ADS-B feed. */
(function (FA) {
  'use strict';
  FA.views = FA.views || {};

  const CSS = `
  .nw-layout { display:grid; grid-template-columns: minmax(0,1.35fr) minmax(0,1fr); gap:12px; margin-bottom:12px; }
  .nw-map svg { width:100%; display:block; }
  .nw-land { fill:#10233b; stroke:#2f5a86; stroke-width:1.4; }
  .nw-sea { fill:#071426; }
  .nw-grid { stroke:#13243c; stroke-width:1; }
  .nw-lbl { font-size:12px; font-weight:700; fill:#e6eefb; paint-order:stroke; stroke:#06101e; stroke-width:3px; }
  .nw-sub { font-size:10px; fill:#8ea3c4; font-family:'JetBrains Mono',monospace; paint-order:stroke; stroke:#06101e; stroke-width:3px; }
  .nw-apt { cursor:pointer; }
  .nw-apt:hover circle.core { stroke:#fff; }
  .nw-arc { fill:none; stroke-width:2.6; stroke-linecap:round; stroke-dasharray:7 7; animation: nwdash 1.1s linear infinite; }
  .nw-arc.base { stroke:#ef5350; opacity:.85; }
  .nw-arc.ai { stroke:#26c6da; }
  @keyframes nwdash { to { stroke-dashoffset:-28; } }
  .nw-ring { fill:none; stroke-width:2; animation: nwring 2.2s ease-out infinite; transform-box: fill-box; transform-origin:center; }
  @keyframes nwring { from { transform:scale(.6); opacity:.9; } to { transform:scale(1.9); opacity:0; } }
  .nw-adsb { fill:#ffee58; opacity:.85; }
  .nw-toolbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px; }
  .nw-metar { font-family:'JetBrains Mono',monospace; font-size:10.5px; color:#9fd8e3; word-break:break-all; }
  .nw-live-row { display:grid; grid-template-columns: 54px 1fr 64px; gap:8px; align-items:center; padding:6px 0; border-bottom:1px dashed #1e3150; }
  .nw-live-row:last-child { border-bottom:0; }
  .nw-pill { font-family:'JetBrains Mono',monospace; font-size:11px; font-weight:700; padding:2px 6px; border-radius:6px; text-align:center; }
  .nw-score td { font-size:11.5px; }
  .nw-legend { display:flex; gap:14px; flex-wrap:wrap; font-size:11px; color:#8ea3c4; margin-top:6px; }
  .nw-legend i { display:inline-block; width:18px; height:3px; vertical-align:middle; margin-right:5px; border-radius:2px; }
  @media (max-width:1180px){ .nw-layout{ grid-template-columns:1fr; } }
  `;

  /* ---------- stylised UAE outline (lon, lat) ---------- */
  const OUTLINE = [
    [51.58, 24.12], [51.77, 24.06], [52.05, 24.02], [52.38, 24.16], [52.62, 24.19], [52.75, 24.11], [53.05, 24.13],
    [53.45, 24.12], [53.75, 24.10], [54.05, 24.16], [54.25, 24.30], [54.40, 24.48], [54.62, 24.62], [54.85, 24.84],
    [55.03, 24.98], [55.18, 25.12], [55.30, 25.27], [55.40, 25.36], [55.48, 25.44], [55.58, 25.56], [55.75, 25.68],
    [55.92, 25.78], [56.00, 25.90], [56.08, 26.05], [56.15, 25.90], [56.19, 25.70], [56.27, 25.62], [56.33, 25.45],
    [56.36, 25.30], [56.37, 25.12], [56.37, 24.97], [56.20, 24.92], [56.10, 24.80], [55.98, 24.62], [55.85, 24.40],
    [55.78, 24.22], [55.62, 24.05], [55.55, 23.70], [55.40, 23.20], [55.22, 22.70], [54.20, 22.70], [53.20, 22.80],
    [52.58, 22.94], [52.10, 23.40], [51.80, 23.80]
  ];
  const W = 760, H = 560;
  const K = 132, LON0 = 51.25, LAT0 = 26.45, COSL = Math.cos((24.5 * Math.PI) / 180);
  const P = (lon, lat) => [Math.round((lon - LON0) * K * COSL * 1.12 + 10), Math.round((LAT0 - lat) * K + 6)];

  const IDS = ['OMDB', 'OMDW', 'OMAA', 'OMSJ', 'OMRK', 'OMFJ', 'OMAL'];
  const CACHE_KEY = 'fa-live-v1';
  let root = null, mode = null, selApt = 'OMAA', fetching = false;

  /* ---------- helpers ---------- */
  const esc = (s) => (FA.ui ? FA.ui.esc(s) : String(s));
  function planFor(m) {
    const S = FA.state;
    if (!S.plans) return null;
    if (m === 'baseline') return S.plans.baseline;
    return S.plans[S.approved ? S.active : S.rec] || S.plans.balanced;
  }
  function divLoad(plan) {
    const out = {};
    (plan ? plan.divs : []).forEach((d) => { out[d.alt] = (out[d.alt] || 0) + 1; });
    return out;
  }
  function wxColor(w) {
    if (!w) return '#66bb6a';
    if (w.lvp && w.rvr != null && w.rvr <= 400) return '#ef5350';
    if (w.lvp) return '#ffb300';
    if (w.rvr != null && w.rvr < 3000) return '#ffd54f';
    return '#66bb6a';
  }
  function rvrTxt(w) { return !w || w.rvr == null || w.rvr >= 9999 ? 'CAVOK' : 'RVR ' + w.rvr + ' m'; }

  /** Mirror of engine chooseAlternate() scoring, for display. */
  function altScores(flightCode, airline, used) {
    const net = FA.engine.networkState(FA.state.inst);
    return FA.data.NETWORK.filter((a) => a.icao !== 'OMDB').map((a) => {
      const w = net[a.icao];
      const parts = [{ k: 'Distance ' + a.dist + ' km', v: a.dist * 0.25 }];
      if (w.lvp) parts.push({ k: 'In LVP', v: 60 });
      if (flightCode === 'F' && a.codeF < 3) parts.push({ k: 'Few Code-F stands', v: 80 });
      const free = Math.round(a.stands * (1 - w.load)) - ((used || {})[a.icao] || 0);
      if (free < 4) parts.push({ k: 'Apron near capacity', v: 70 });
      if (airline === 'EK' && a.icao === 'OMDW') parts.push({ k: 'EK handling at DWC', v: -8 });
      return { a, w, free, parts, cost: parts.reduce((s, p) => s + p.v, 0) };
    }).sort((x, y) => x.cost - y.cost);
  }

  /* ---------- live data ---------- */
  function timeoutFetch(url, ms) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = setTimeout(() => ctl && ctl.abort(), ms || 6000);
    return fetch(url, ctl ? { signal: ctl.signal } : {}).then((r) => { clearTimeout(t); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function rhFrom(t, d) {
    if (t == null || d == null) return null;
    const a = 17.625, b = 243.04;
    return Math.max(0, Math.min(100, 100 * Math.exp((a * d) / (b + d) - (a * t) / (b + t))));
  }
  function visFromRaw(raw) {
    if (!raw) return null;
    if (/\bCAVOK\b/.test(raw)) return 10000;
    const m = raw.match(/\s(\d{4})(?:NDV)?\s/);
    if (m) return +m[1] === 9999 ? 10000 : +m[1];
    return null;
  }
  function rvrFromRaw(raw) {
    const m = raw && raw.match(/R\d{2}[LRC]?\/[PM]?(\d{4})/);
    return m ? +m[1] : null;
  }
  function fogProb(o) {
    if (!FA.fogModel || typeof FA.fogModel.predict !== 'function' || !o) return null;
    try {
      const now = new Date(o.time || Date.now());
      const local = new Date(now.getTime() + 4 * 3600 * 1000);
      const r = FA.fogModel.predict({
        tempC: o.tempC, dewC: o.dewC, rh: o.rh != null ? o.rh : rhFrom(o.tempC, o.dewC), windKt: o.windKt, windDir: o.windDir,
        localHour: local.getUTCHours() + local.getUTCMinutes() / 60, month: local.getUTCMonth() + 1, visM: o.visM
      });
      return r && typeof r.p === 'number' ? r.p : null;
    } catch (e) { return null; }
  }

  function setLive(obj, persist) {
    FA.live = obj;
    Object.keys(obj.metar || {}).forEach((id) => { const o = obj.metar[id]; o.fogP = fogProb(o); });
    if (persist) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch (e) { /* quota / file:// */ } }
    if (FA.bus) FA.bus.emit('live', FA.live);
    if (root) renderLive(), renderMap();
  }

  function parseAwc(arr) {
    if (!Array.isArray(arr) || !arr.length) throw new Error('empty');
    const metar = {};
    arr.forEach((m) => {
      const id = m.icaoId || m.stationId; if (!id || metar[id]) return;
      let visM = visFromRaw(m.rawOb);
      if (visM == null && m.visib != null) { const v = parseFloat(String(m.visib).replace('+', '')); if (!isNaN(v)) visM = Math.min(10000, Math.round(v * 1609)); }
      metar[id] = {
        icao: id, raw: m.rawOb || '', tempC: m.temp, dewC: m.dewp, windKt: m.wspd, windDir: typeof m.wdir === 'number' ? m.wdir : null,
        visM, rvr: rvrFromRaw(m.rawOb), time: m.obsTime ? m.obsTime * 1000 : Date.now(), rh: rhFrom(m.temp, m.dewp)
      };
    });
    return metar;
  }
  const ageMin = (iso) => (Date.now() - Date.parse(iso)) / 60000;
  // snapshot published every 30 min by .github/workflows/live-snapshot.yml to the `live-data` branch (raw.githubusercontent allows CORS)
  const SNAP = 'https://raw.githubusercontent.com/RithikhC/FalconAero/live-data/';
  const snapshot = (file) => timeoutFetch(SNAP + file + '?ts=' + Math.floor(Date.now() / 300000), 5000)
    .then((x) => { if (!x || !x.fetchedAt || ageMin(x.fetchedAt) > 180) throw new Error('stale'); return x; })
    .catch(() => timeoutFetch('data/live/' + file + '?ts=' + Date.now(), 4000).then((x) => { if (!x || !x.fetchedAt || ageMin(x.fetchedAt) > 180) throw new Error('stale'); return x; }));
  // 1) snapshot committed every 30 min by .github/workflows/live-snapshot.yml (AWC has no CORS) → 2) direct AWC → 3) Open-Meteo
  function fetchMetar() {
    return snapshot('metar.json').then((snap) => ({ metar: parseAwc(snap.data), source: 'aviationweather.gov METAR · snapshot ' + new Date(snap.fetchedAt).toISOString().slice(11, 16) + 'Z (GitHub Action)', kind: 'metar' })).catch(() => timeoutFetch('https://aviationweather.gov/api/data/metar?ids=' + IDS.join(',') + '&format=json', 6500).then((arr) =>
      ({ metar: parseAwc(arr), source: 'aviationweather.gov (NOAA AWC) — live METAR', kind: 'metar' })));
  }
  function fetchOpenMeteo() {
    const apts = FA.data.NETWORK;
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + apts.map((a) => a.lat).join(',') + '&longitude=' + apts.map((a) => a.lon).join(',') +
      '&current=temperature_2m,dew_point_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,visibility&wind_speed_unit=kn';
    return timeoutFetch(url, 6500).then((res) => {
      const arr = Array.isArray(res) ? res : [res];
      const metar = {};
      arr.forEach((r, i) => {
        const a = apts[i]; if (!a || !r || !r.current) return;
        const c = r.current;
        metar[a.icao] = {
          icao: a.icao, raw: 'Open-Meteo model analysis (not a METAR) · vis ' + Math.round(c.visibility) + ' m', tempC: c.temperature_2m, dewC: c.dew_point_2m,
          rh: c.relative_humidity_2m, windKt: c.wind_speed_10m, windDir: c.wind_direction_10m, visM: Math.min(10000, Math.round(c.visibility)), rvr: null, time: Date.now()
        };
      });
      if (!Object.keys(metar).length) throw new Error('empty');
      return { metar, source: 'Open-Meteo (model analysis) — fallback', kind: 'model' };
    });
  }
  function fetchAdsb() {
    const direct = () => timeoutFetch('https://opensky-network.org/api/states/all?lamin=22.5&lomin=51.5&lamax=26.5&lomax=56.6', 8000);
    const snap = snapshot('adsb.json').then((x) => { if (!x.data) throw new Error('empty'); return x.data; });
    return snap.catch(direct).then((r) => {
      const st = (r && r.states) || [];
      return st.filter((s) => s[5] != null && s[6] != null && !s[8]).map((s) => ({ cs: (s[1] || '').trim(), lon: s[5], lat: s[6], alt: s[7], trk: s[10] }));
    });
  }

  function refreshLive(quiet) {
    if (fetching) return; fetching = true;
    if (root) { const b = root.querySelector('#nwRefresh'); if (b) { b.disabled = true; b.textContent = 'Fetching…'; } }
    const wx = fetchMetar().catch(() => fetchOpenMeteo()).catch(() => null);
    const ad = fetchAdsb().catch(() => null);
    Promise.all([wx, ad]).then(([w, a]) => {
      fetching = false;
      if (w || a) {
        const prev = FA.live || {};
        setLive({
          metar: w ? w.metar : prev.metar || {}, source: w ? w.source : prev.source || 'cached', kind: w ? w.kind : prev.kind,
          fetchedAt: Date.now(), cached: false, adsb: a || null, adsbAt: a ? Date.now() : null
        }, true);
        if (!quiet && FA.ui) FA.ui.toast('Live data refreshed', (w ? Object.keys(w.metar).length + ' airports · ' + w.source : 'weather unavailable') + (a ? ' · ' + a.length + ' aircraft (OpenSky)' : ''), 'green');
      } else {
        if (!quiet && FA.ui) FA.ui.toast('Live feeds unreachable', 'Offline or blocked by the network — showing cached/simulated values.', 'amber');
      }
      if (root) { const b = root.querySelector('#nwRefresh'); if (b) { b.disabled = false; b.textContent = '⟳ Refresh live data'; } renderLive(); }
    });
  }

  function loadCache() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c && c.metar) { c.cached = true; setLive(c, false); }
    } catch (e) { /* ignore */ }
  }

  /* ---------- rendering ---------- */
  function renderMap() {
    const box = root && root.querySelector('#nwMap');
    if (!box || !FA.state.inst) return;
    const net = FA.engine.networkState(FA.state.inst);
    const m = mode || 'ai';
    const base = planFor('baseline'), ai = planFor('ai');
    const lb = divLoad(base), la = divLoad(ai);
    const apts = FA.data.NETWORK;
    const dxb = P(apts[0].lon, apts[0].lat);
    let g = '<rect class="nw-sea" x="0" y="0" width="' + W + '" height="' + H + '"/>';
    for (let lo = 52; lo <= 56; lo++) { const [x] = P(lo, 24); g += '<line class="nw-grid" x1="' + x + '" x2="' + x + '" y1="0" y2="' + H + '"/><text x="' + (x + 3) + '" y="' + (H - 6) + '" fill="#2a4268" font-size="9">' + lo + '°E</text>'; }
    for (let la2 = 23; la2 <= 26; la2++) { const [, y] = P(52, la2); g += '<line class="nw-grid" x1="0" x2="' + W + '" y1="' + y + '" y2="' + y + '"/><text x="4" y="' + (y - 3) + '" fill="#2a4268" font-size="9">' + la2 + '°N</text>'; }
    g += '<polygon class="nw-land" points="' + OUTLINE.map((p) => P(p[0], p[1]).join(',')).join(' ') + '"/>';
    g += '<text x="' + P(52.2, 25.6)[0] + '" y="' + P(52.2, 25.6)[1] + '" fill="#1f4166" font-size="13" font-style="italic">Arabian Gulf</text>';
    g += '<text x="' + P(56.45, 24.55)[0] + '" y="' + P(56.45, 24.55)[1] + '" fill="#1f4166" font-size="11" font-style="italic">Gulf of Oman</text>';
    g += '<text x="' + (W - 8) + '" y="16" fill="#3a5578" font-size="10" text-anchor="end">UAE · stylised outline</text>';

    // fog footprint around DXB/DWC/SHJ when LVP
    apts.forEach((a) => {
      const w = net[a.icao];
      if (w && w.lvp) { const [x, y] = P(a.lon, a.lat); g += '<circle cx="' + x + '" cy="' + y + '" r="34" fill="rgba(220,230,240,.10)" filter="url(#nwblur)"/>'; }
    });

    // ADS-B live traffic
    const ad = FA.live && FA.live.adsb;
    if (ad && ad.length) {
      ad.forEach((p) => {
        const [x, y] = P(p.lon, p.lat);
        if (x < 0 || y < 0 || x > W || y > H) return;
        const r = ((p.trk || 0) * Math.PI) / 180;
        g += '<g transform="translate(' + x + ',' + y + ') rotate(' + (p.trk || 0) + ')"><path class="nw-adsb" d="M0,-4 L2.6,3 L0,1.6 L-2.6,3 Z"><title>' + esc(p.cs || 'aircraft') + (p.alt ? ' · ' + Math.round(p.alt * 3.281) + ' ft' : '') + '</title></path></g>';
        void r;
      });
    }

    // arcs
    const arc = (to, cls, n, k) => {
      const [x2, y2] = P(to.lon, to.lat);
      const mx = (dxb[0] + x2) / 2, my = (dxb[1] + y2) / 2;
      const dx = x2 - dxb[0], dy = y2 - dxb[1], len = Math.hypot(dx, dy) || 1;
      const off = 40 * (k || 1);
      const cx = mx - (dy / len) * off, cy = my + (dx / len) * off;
      return '<path class="nw-arc ' + cls + '" d="M' + dxb[0] + ',' + dxb[1] + ' Q' + cx + ',' + cy + ' ' + x2 + ',' + y2 + '" stroke-width="' + (2 + n * 1.2) + '"/>' +
        '<text class="nw-sub" x="' + cx + '" y="' + cy + '" text-anchor="middle" fill="' + (cls === 'ai' ? '#7ff1ff' : '#ff8a80') + '">' + n + '×</text>';
    };
    const showBase = m === 'baseline' || m === 'both';
    const showAi = m === 'ai' || m === 'both';
    apts.slice(1).forEach((a) => {
      if (showBase && lb[a.icao]) g += arc(a, 'base', lb[a.icao], 1);
      if (showAi && la[a.icao]) g += arc(a, 'ai', la[a.icao], -1);
    });

    // airports
    apts.forEach((a) => {
      const [x, y] = P(a.lon, a.lat);
      const w = net[a.icao];
      const live = FA.live && FA.live.metar && FA.live.metar[a.icao];
      const col = wxColor(w);
      const r = 5 + Math.sqrt(a.cap) * 1.1;
      const isSel = a.icao === selApt;
      const dyLbl = a.icao === 'OMSJ' ? -r - 8 : a.icao === 'OMDB' ? -r - 10 : r + 14;
      const dxLbl = a.icao === 'OMSJ' ? 18 : a.icao === 'OMDB' ? -18 : 0;
      g += '<g class="nw-apt" data-icao="' + a.icao + '">' +
        (w && w.lvp ? '<circle class="nw-ring" cx="' + x + '" cy="' + y + '" r="' + r + '" stroke="' + col + '"/>' : '') +
        '<circle cx="' + x + '" cy="' + y + '" r="' + (r + 4) + '" fill="' + col + '" fill-opacity=".15"' + (isSel ? ' stroke="#fff" stroke-width="1.5"' : '') + '/>' +
        '<circle class="core" cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + col + '" fill-opacity=".85" stroke="#06101e" stroke-width="2"/>' +
        '<text class="nw-lbl" x="' + (x + dxLbl) + '" y="' + (y + dyLbl) + '" text-anchor="middle">' + a.iata + '</text>' +
        '<text class="nw-sub" x="' + (x + dxLbl) + '" y="' + (y + dyLbl + 12) + '" text-anchor="middle">' + rvrTxt(w) + (live && live.fogP != null ? ' · fog ' + Math.round(live.fogP * 100) + '%' : '') + '</text>' +
        '<title>' + esc(a.name + ' (' + a.icao + ') — ' + rvrTxt(w) + (w && w.lvp ? ', LVP' : '')) + '</title></g>';
    });
    const defs = '<defs><filter id="nwblur"><feGaussianBlur stdDeviation="8"/></filter></defs>';
    box.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' + defs + g + '</svg>' +
      '<div class="nw-legend"><span><i style="background:#ef5350"></i>Current practice diversions (late, nearest field)</span><span><i style="background:#26c6da"></i>FalconAero diversions (proactive, weather/stand-aware)</span>' +
      '<span><i style="background:#ffb300;height:9px;width:9px;border-radius:50%"></i>LVP</span><span><i style="background:#66bb6a;height:9px;width:9px;border-radius:50%"></i>Clear</span>' +
      (ad && ad.length ? '<span><i style="background:#ffee58;height:6px;width:6px;border-radius:50%"></i>' + ad.length + ' aircraft airborne now — OpenSky Network' + (FA.live.cached ? ' (cached)' : '') + '</span>' : '') + '</div>';
    box.querySelectorAll('.nw-apt').forEach((el) => el.addEventListener('click', () => { selApt = el.dataset.icao; renderMap(); renderScore(); }));
  }

  function renderTable() {
    const el = root && root.querySelector('#nwTable');
    if (!el || !FA.state.inst) return;
    const net = FA.engine.networkState(FA.state.inst);
    const lb = divLoad(planFor('baseline')), la = divLoad(planFor('ai'));
    const aiName = (planFor('ai') || { cfg: { short: 'FalconAero' } }).cfg.short;
    let h = '<table class="t"><thead><tr><th>Airport</th><th>Weather</th><th>Free stands*</th><th>Code F</th><th>Div. baseline</th><th>Div. ' + esc(aiName) + '</th></tr></thead><tbody>';
    FA.data.NETWORK.forEach((a) => {
      const w = net[a.icao];
      const free = Math.round(a.stands * (1 - w.load));
      const lvp = w.lvp;
      h += '<tr' + (a.icao === selApt ? ' class="best"' : '') + '><td><b style="color:#e6eefb">' + a.iata + '</b> <span class="dim">' + esc(a.name) + '</span></td>' +
        '<td><span class="nw-pill" style="background:' + wxColor(w) + '22;color:' + wxColor(w) + '">' + (lvp ? 'LVP ' : '') + rvrTxt(w) + '</span></td>' +
        '<td>' + (a.icao === 'OMDB' ? '<span class="dim">origin</span>' : free) + '</td><td>' + a.codeF + '</td>' +
        '<td class="' + (lb[a.icao] ? (lvp ? 'bad' : 'warn') : 'dim') + '">' + (lb[a.icao] || '—') + (lb[a.icao] && lvp ? ' ⚠' : '') + '</td>' +
        '<td class="' + (la[a.icao] ? 'cy' : 'dim') + '">' + (la[a.icao] || '—') + '</td></tr>';
    });
    h += '</tbody></table><div class="src" style="margin-top:6px">* Free stands = published stand count × (1 − simulated apron load) for this scenario. Weather for alternates is the scenario state (fog scenarios put DWC & SHJ in LVP as they share DXB\'s coastal fog regime). ⚠ = diversion into an airport that is itself in LVP → secondary-diversion risk.</div>';
    el.innerHTML = h;
  }

  function renderScore() {
    const el = root && root.querySelector('#nwScore');
    if (!el || !FA.state.inst) return;
    const used = divLoad(planFor('ai'));
    const wide = altScores('E', 'EK', used), a380 = altScores('F', 'EK', used);
    const nearest = FA.data.NETWORK.filter((a) => a.icao !== 'OMDB').slice().sort((x, y) => x.dist - y.dist)[0];
    const rowsFor = (list) => list.map((s, i) => '<tr' + (s.a.icao === selApt ? ' class="best"' : '') + '><td>' + (i === 0 ? '🥇 ' : '') + s.a.iata + '</td><td>' + s.cost.toFixed(0) + '</td><td style="font-family:Inter,sans-serif;color:#8ea3c4">' + s.parts.map((p) => esc(p.k) + ' <b style="color:' + (p.v > 0 ? '#ff8a80' : '#a5d6a7') + '">' + (p.v > 0 ? '+' : '') + p.v.toFixed(0) + '</b>').join(' · ') + '</td></tr>').join('');
    el.innerHTML =
      '<p class="muted small">Lower cost = better alternate. FalconAero scores every UAE airport on <b>distance</b>, <b>weather (LVP)</b>, <b>Code-F stand availability</b> and <b>apron capacity already consumed by other diversions</b>. Current practice simply picks the nearest field (' + nearest.iata + ', ' + nearest.dist + ' km) — even when it shares the same fog.</p>' +
      '<div class="grid-2" style="margin-bottom:0"><div><h3>Code-E widebody (e.g. B777)</h3><table class="t nw-score"><thead><tr><th>Alt</th><th>Cost</th><th>Breakdown</th></tr></thead><tbody>' + rowsFor(wide) + '</tbody></table></div>' +
      '<div><h3>A380 (Code F)</h3><table class="t nw-score"><thead><tr><th>Alt</th><th>Cost</th><th>Breakdown</th></tr></thead><tbody>' + rowsFor(a380) + '</tbody></table></div></div>';
  }

  function renderLive() {
    const el = root && root.querySelector('#nwLive');
    if (!el) return;
    const L = FA.live;
    const chip = root.querySelector('#nwLiveChip');
    if (!L || !L.metar || !Object.keys(L.metar).length) {
      if (chip) { chip.className = 'chip'; chip.textContent = 'OFFLINE'; }
      el.innerHTML = '<p class="muted small">Live feeds not reached yet (offline, or blocked by the venue network). The operational picture keeps running on the simulated scenario. Try <b>Refresh live data</b>.</p>';
      return;
    }
    if (chip) { chip.className = L.cached ? 'chip gold' : 'chip live'; chip.textContent = L.cached ? 'CACHED' : 'LIVE'; }
    const when = new Date(L.fetchedAt || Date.now());
    let h = '<div class="src" style="margin-bottom:6px">Source: ' + esc(L.source || '—') + ' · ' + (L.cached ? 'cached ' : 'fetched ') + when.toLocaleString() + '</div>';
    FA.data.NETWORK.forEach((a) => {
      const o = L.metar[a.icao];
      if (!o) { h += '<div class="nw-live-row"><b>' + a.iata + '</b><span class="dim small">no report</span><span></span></div>'; return; }
      const vis = o.visM != null ? (o.visM >= 10000 ? '≥10 km' : o.visM + ' m') : '—';
      const dpd = o.tempC != null && o.dewC != null ? (o.tempC - o.dewC).toFixed(1) : '—';
      const fp = o.fogP;
      const fc = fp == null ? '#5f7598' : fp > 0.5 ? '#ef5350' : fp > 0.2 ? '#ffb300' : '#66bb6a';
      h += '<div class="nw-live-row"><div><b>' + a.iata + '</b><div class="dim" style="font-size:10px">' + a.icao + '</div></div>' +
        '<div><div class="nw-metar">' + esc(o.raw || '') + '</div><div class="small muted">vis ' + vis + (o.rvr ? ' · RVR ' + o.rvr + ' m' : '') + ' · T/Td ' + (o.tempC != null ? Math.round(o.tempC) : '—') + '/' + (o.dewC != null ? Math.round(o.dewC) : '—') + ' °C (spread ' + dpd + ') · wind ' + (o.windKt != null ? Math.round(o.windKt) + ' kt' : '—') + '</div></div>' +
        '<div class="nw-pill" style="background:' + fc + '22;color:' + fc + '" title="AI fog nowcast: probability of visibility < 1000 m within 60 min">' + (fp == null ? 'n/a' : Math.round(fp * 100) + '%') + '<div style="font-size:9px;font-weight:400">fog 60′</div></div></div>';
    });
    if (!FA.fogModel) h += '<div class="src">Fog probability appears when the trained nowcast model (js/fogmodel.js) is loaded.</div>';
    el.innerHTML = h;
  }

  function renderOutlook() {
    const el = root && root.querySelector('#nwOutlook');
    if (!el || !FA.state.inst) return;
    const net = FA.engine.networkState(FA.state.inst);
    const lb = divLoad(planFor('baseline')), la = divLoad(planFor('ai'));
    const data = FA.data.NETWORK.slice(1).map((a) => {
      const w = net[a.icao];
      const eff = a.cap * (w.lvp ? 0.55 : 1); // movements/h under current weather
      const spare = Math.max(0, eff * 3 * (1 - w.load)); // spare movement slots next 3 h
      return { label: a.iata, values: [Math.round(Math.round(a.stands * (1 - w.load))), Math.round(spare), lb[a.icao] || 0, la[a.icao] || 0] };
    });
    el.innerHTML = FA.charts.bars(data, ['Free stands now', 'Spare arrival slots (3 h)', 'Diversions — baseline', 'Diversions — FalconAero'], { w: 620, h: 250, labels: true, colors: ['#3d5f8c', '#5c7fae', '#ef5350', '#26c6da'] }) +
      '<div class="src">Assumptions: spare arrival slots = declared capacity × (0.55 if LVP) × 3 h × (1 − current load). Capacities and loads are indicative planning values for the simulation, not published airport data.</div>';
  }

  function renderHead() {
    const el = root && root.querySelector('#nwHead');
    if (!el || !FA.state.inst) return;
    const base = planFor('baseline'), ai = planFor('ai');
    const kb = base.kpi, ka = ai.kpi;
    const sec = base.divs.filter((d) => d.altLvp).length;
    const card = (l, v, d, color) => '<div class="kpi" style="--kc:' + color + '"><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="d">' + d + '</div></div>';
    el.innerHTML = '<div class="grid-4" style="margin-bottom:12px">' +
      card('Diversions', kb.diversions + ' → ' + ka.diversions, FA.ui.delta(ka.diversions, kb.diversions, true), '#26c6da') +
      card('Into fog-bound fields', sec + ' → ' + ai.divs.filter((d) => d.altLvp).length, sec ? '<span class="good">secondary-diversion risk removed</span>' : '<span class="dim">none</span>', '#ef5350') +
      card('Diverted passengers', FA.ui.num(kb.divPax) + ' → ' + FA.ui.num(ka.divPax), FA.ui.delta(ka.divPax, kb.divPax, true), '#e2b04a') +
      card('Decision lead time', ai.divs.length ? '−25 min' : '—', ai.divs.length ? 'decided before top-of-descent, not at minimum fuel' : '<span class="dim">no diversion needed</span>', '#66bb6a') + '</div>';
  }

  function render() {
    if (!root || !FA.state.inst) return;
    const segs = root.querySelectorAll('#nwMode button');
    const m = mode || 'ai';
    segs.forEach((b) => b.classList.toggle('on', b.dataset.m === m));
    const scn = root.querySelector('#nwScn');
    if (scn) scn.textContent = FA.state.inst.scenario.name + ' · ' + (FA.state.approved ? 'approved plan: ' + FA.state.plans[FA.state.active].cfg.short : 'recommended: ' + FA.state.plans[FA.state.rec].cfg.short);
    renderHead(); renderMap(); renderTable(); renderScore(); renderLive(); renderOutlook();
  }

  FA.views.network = {
    init() {
      if (!document.getElementById('fa-network-css')) { const s = document.createElement('style'); s.id = 'fa-network-css'; s.textContent = CSS; document.head.appendChild(s); }
      loadCache();
      setTimeout(() => refreshLive(true), 900);
      ['scenario', 'approved', 'generated'].forEach((e) => FA.bus.on(e, () => { if (root && FA.state.view === 'network') render(); }));
    },
    mount(r) {
      root = r;
      root.innerHTML =
        '<div class="page-head"><div><h1>UAE Network Coordination</h1><p class="muted">DXB never recovers alone. FalconAero links air navigation and airport systems across the seven UAE international airports — choosing alternates by weather, stand fit and spare capacity, and deciding diversions 25 minutes earlier than today.</p></div>' +
        '<div class="head-actions"><span class="chip cy" id="nwScn"></span></div></div>' +
        '<div id="nwHead"></div>' +
        '<div class="nw-layout">' +
        '<div class="panel nw-map"><div class="panel-h"><span>Diversion flows across the UAE</span><span class="seg" id="nwMode"><button data-m="baseline">Current practice</button><button data-m="ai">FalconAero plan</button><button data-m="both">Compare</button></span></div><div id="nwMap"></div></div>' +
        '<div style="display:flex;flex-direction:column;gap:12px">' +
        '<div class="panel"><div class="panel-h"><span>Airports & diversion load</span></div><div id="nwTable"></div></div>' +
        '<div class="panel"><div class="panel-h"><span>Live weather · UAE airports</span><span style="display:flex;gap:6px;align-items:center"><span class="chip" id="nwLiveChip">…</span><button class="btn ghost sm" id="nwRefresh">⟳ Refresh live data</button></span></div><div id="nwLive" style="max-height:330px;overflow:auto"></div></div>' +
        '</div></div>' +
        '<div class="grid-2"><div class="panel"><div class="panel-h"><span>Alternate selection — explained</span><span class="hint">click an airport on the map</span></div><div id="nwScore"></div></div>' +
        '<div class="panel"><div class="panel-h"><span>Network capacity outlook (next 3 h)</span></div><div id="nwOutlook"></div></div></div>';
      root.querySelectorAll('#nwMode button').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.m; render(); }));
      root.querySelector('#nwRefresh').addEventListener('click', () => refreshLive(false));
    },
    show() { render(); },
    refreshLive
  };
})(window.FA);
