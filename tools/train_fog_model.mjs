// FalconAero — fog nowcasting model for Dubai International (OMDB)
// --------------------------------------------------------------------------
// Reproducible:  node tools/fetch_metars.mjs      (downloads raw METARs, ~6 MB gz)
//                node tools/train_fog_model.mjs   (parses, trains, evaluates, writes js/fogmodel.js)
//
// Data: Iowa Environmental Mesonet (IEM) ASOS/AWOS/METAR archive, raw METAR text
// for OMDB / OMAA / OMDW 2015-01-01 .. 2025-12-31 (UTC).
// Model: L2-regularised logistic regression (full-batch gradient descent with Adam),
// standardised features, strict time-based split (train 2015-2022, test 2023-2025).
// No external dependencies — plain Node (>=18).

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data', 'raw');
const OUT_JS = path.join(ROOT, 'js', 'fogmodel.js');
const STATIONS = ['OMDB', 'OMAA', 'OMDW'];
const Y1 = 2015, Y2 = 2025;
const TRAIN_LAST_YEAR = 2022;          // train: 2015-2022, test: 2023-2025
const VAL_YEARS = [2021, 2022];        // inner validation (hyper-parameters / feature set) inside train period
const LOCAL_OFFSET_H = 4;              // UAE = UTC+4, no DST
const FOG_VIS = 1000;                  // metres
const H = 3600e3, MIN = 60e3;
const IEM_DOC_URL = 'https://mesonet.agron.iastate.edu/request/download.phtml';
const IEM_EXAMPLE_URL = 'https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=OMDB&data=tmpc&data=dwpc&data=relh&data=sknt&data=drct&data=vsby&data=wxcodes&data=metar&year1=2015&month1=1&day1=1&year2=2016&month2=1&day2=1&tz=Etc/UTC&format=onlycomma&latlon=no&missing=M&trace=T&direct=no&report_type=3&report_type=4';

// ---------------------------------------------------------------- METAR parsing
const WX_RE = /^(\+|-|VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?((DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)+)$/;
const TREND = new Set(['BECMG', 'TEMPO', 'NOSIG', 'RMK', 'NSW']);

function parseMetar(metar) {
  const toks = metar.trim().split(/\s+/);
  let i = 1;                                           // skip ICAO
  if (/^\d{6}Z$/.test(toks[i])) i++;
  while (toks[i] === 'AUTO' || toks[i] === 'COR') i++;
  if (/^(\d{3}|VRB)\d{2,3}(G\d{2,3})?(KT|MPS)$/.test(toks[i] || '')) i++;
  if (/^\d{3}V\d{3}$/.test(toks[i] || '')) i++;
  let visM = null, minVisM = null;
  const t = toks[i] || '';
  if (t === 'CAVOK') { visM = 10000; i++; }
  else if (/^\d{4}(NDV)?$/.test(t)) { visM = +t.slice(0, 4); if (visM >= 9999) visM = 10000; i++;
    if (/^\d{4}(N|NE|E|SE|S|SW|W|NW)$/.test(toks[i] || '')) { minVisM = +toks[i].slice(0, 4); i++; } }
  const rvr = [], wx = [];
  for (; i < toks.length; i++) {
    const k = toks[i];
    if (TREND.has(k)) break;
    const r = /^R(\d{2}[LRC]?)\/([PM]?)(\d{4})(?:V([PM]?)(\d{4}))?(FT)?\/?([UDN])?$/.exec(k);
    if (r) { let v = +r[3]; if (r[6]) v = Math.round(v * 0.3048); rvr.push({ rwy: r[1], m: v, pm: r[2] || '', tend: r[7] || '' }); continue; }
    if (WX_RE.test(k)) wx.push(k);
  }
  return { visM, minVisM, rvr, wx };
}

const num = s => (s === 'M' || s === '' || s == null ? null : +s);

function loadStation(st) {
  const byTime = new Map();
  let files = 0;
  for (let y = Y1; y <= Y2; y++) {
    const f = path.join(RAW, `${st}_${y}.csv.gz`);
    if (!fs.existsSync(f)) continue;
    files++;
    const lines = zlib.gunzipSync(fs.readFileSync(f)).toString('utf8').split('\n');
    const hdr = lines[0].split(',');
    const ix = Object.fromEntries(hdr.map((h, k) => [h.trim(), k]));
    for (let l = 1; l < lines.length; l++) {
      const line = lines[l]; if (!line.trim()) continue;
      const c = line.split(',');
      const metar = c.slice(ix.metar).join(',');
      const ts = Date.parse(c[ix.valid].replace(' ', 'T') + ':00Z');
      if (!Number.isFinite(ts)) continue;
      const p = parseMetar(metar);
      let visM = p.visM, visSrc = 'metar';
      const vsby = num(c[ix.vsby]);
      if (visM == null && vsby != null) { visM = Math.min(10000, Math.round(vsby * 1609.34)); visSrc = 'vsby'; }
      const drctRaw = num(c[ix.drct]);
      const o = { ts, tmpc: num(c[ix.tmpc]), dwpc: num(c[ix.dwpc]), relh: num(c[ix.relh]), sknt: num(c[ix.sknt]),
        drct: drctRaw, visM, visSrc, minVisM: p.minVisM, rvr: p.rvr, wx: p.wx, metar };
      const hasFG = o.wx.some(w => w.includes('FG')), hasBR = o.wx.some(w => w.includes('BR'));
      const hasDust = o.wx.some(w => /DU|SA|DS|SS|PO/.test(w));
      const hasPrecip = o.wx.some(w => /DZ|RA|SN|SG|PL|GR|GS|UP|TS|SQ|FC/.test(w));
      o.lowVis = visM != null && visM < FOG_VIS;
      o.dustLowVis = o.lowVis && hasDust && !hasFG && !hasBR;
      o.precipLowVis = o.lowVis && !o.dustLowVis && hasPrecip && !hasFG && !hasBR;
      o.fog = o.lowVis && !o.dustLowVis && !o.precipLowVis; // "fog-type" low visibility (excludes sand/dust and rain/thunderstorm events)
      o.minute = new Date(ts).getUTCMinutes();
      byTime.set(ts, o);                               // duplicates: keep last (corrections)
    }
  }
  const arr = [...byTime.values()].sort((a, b) => a.ts - b.ts);
  return { st, files, obs: arr };
}

// binary search: first index with ts > t
function upper(arr, t) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].ts <= t) lo = m + 1; else hi = m; } return lo; }
function nearest(arr, t, tol) {
  const k = upper(arr, t); let best = null, bd = Infinity;
  for (const j of [k - 1, k]) if (j >= 0 && j < arr.length) { const d = Math.abs(arr[j].ts - t); if (d < bd) { bd = d; best = arr[j]; } }
  return bd <= tol ? best : null;
}
const localParts = ts => { const d = new Date(ts + LOCAL_OFFSET_H * H); return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), date: d.toISOString().slice(0, 10), hhmm: d.toISOString().slice(11, 16) }; };

// ---------------------------------------------------------------- features
// raw = {tempC, dewC, rh, windKt, windDir, localHour, month, visM, visTrend1h, dpdTrend2h, tempDrop3h, station}
// The SAME transforms are embedded in js/fogmodel.js (predict) — keep them in sync.
function rhFromTd(t, td) { const es = x => Math.exp(17.625 * x / (243.04 + x)); return 100 * es(td) / es(t); }
const clampVis = v => Math.max(50, Math.min(10000, v));
const FEATURE_DEFS = [
  { key: 'dpd', label: 'Dewpoint depression (°C)', f: r => (r.tempC != null && r.dewC != null ? r.tempC - r.dewC : null) },
  { key: 'dpdLow', label: 'Near-saturation (max(0, 3 − T−Td))', f: r => (r.tempC != null && r.dewC != null ? Math.max(0, 3 - (r.tempC - r.dewC)) : null) },
  { key: 'rh', label: 'Relative humidity (%)', f: r => (r.rh != null ? r.rh : (r.tempC != null && r.dewC != null ? rhFromTd(r.tempC, r.dewC) : null)) },
  { key: 'wind', label: 'Wind speed (kt)', f: r => r.windKt },
  { key: 'windSin', label: 'Wind direction (east component)', f: r => (r.windKt == null ? null : (r.windDir == null || r.windKt === 0 ? 0 : Math.sin(r.windDir * Math.PI / 180))) },
  { key: 'windCos', label: 'Wind direction (north component)', f: r => (r.windKt == null ? null : (r.windDir == null || r.windKt === 0 ? 0 : Math.cos(r.windDir * Math.PI / 180))) },
  { key: 'hourSin', label: 'Local hour (sin)', f: r => (r.localHour == null ? null : Math.sin(2 * Math.PI * r.localHour / 24)) },
  { key: 'hourCos', label: 'Local hour (cos)', f: r => (r.localHour == null ? null : Math.cos(2 * Math.PI * r.localHour / 24)) },
  { key: 'monthSin', label: 'Season (month sin)', f: r => (r.month == null ? null : Math.sin(2 * Math.PI * (r.month - 0.5) / 12)) },
  { key: 'monthCos', label: 'Season (month cos)', f: r => (r.month == null ? null : Math.cos(2 * Math.PI * (r.month - 0.5) / 12)) },
  { key: 'logVis', label: 'Current visibility (log10 m)', f: r => (r.visM == null ? null : Math.log10(clampVis(r.visM))) },
  { key: 'visTrend', label: 'Visibility trend, last 1 h (log10 ratio now/1 h ago)', f: r => (r.visM == null || r.visTrend1h == null ? null :
      Math.log10(clampVis(r.visM) / clampVis(r.visM - r.visTrend1h))) },
  { key: 'dpdTrend2h', label: 'Dewpoint-depression change, last 2 h (°C)', f: r => r.dpdTrend2h },
  { key: 'tempDrop3h', label: 'Temperature drop, last 3 h (°C)', f: r => r.tempDrop3h },
  // station indicators (pooled model only; OMDB is the reference = 0,0). Not standardised (mean 0, std 1).
  { key: 'stOMAA', label: 'Station offset: OMAA', binary: true, f: r => (r.station === 'OMAA' ? 1 : 0) },
  { key: 'stOMDW', label: 'Station offset: OMDW', binary: true, f: r => (r.station === 'OMDW' ? 1 : 0) },
];

function rawAt(obs, o, st) {
  const lp = localParts(o.ts);
  const o1 = nearest(obs, o.ts - 1 * H, 15 * MIN), o2 = nearest(obs, o.ts - 2 * H, 15 * MIN), o3 = nearest(obs, o.ts - 3 * H, 15 * MIN);
  const dpd = (x) => (x && x.tmpc != null && x.dwpc != null ? x.tmpc - x.dwpc : null);
  return {
    tempC: o.tmpc, dewC: o.dwpc, rh: o.relh, windKt: o.sknt, windDir: o.drct,
    localHour: lp.h + lp.mi / 60, month: lp.mo, visM: o.visM,
    visTrend1h: o1 && o1.visM != null && o.visM != null ? o.visM - o1.visM : null,
    dpdTrend2h: dpd(o) != null && dpd(o2) != null ? dpd(o) - dpd(o2) : null,
    tempDrop3h: o3 && o3.tmpc != null && o.tmpc != null ? o3.tmpc - o.tmpc : null,
    station: st,
  };
}

// ---------------------------------------------------------------- dataset
function buildSamples(obs, st) {
  // Samples = on-the-hour METARs. Target pool = all reports except routine :30 METARs (IEM only carries
  // those from 2024 on), so the label definition is identical in train (hourly+SPECI) and test years.
  const pool = obs.filter(o => o.minute !== 30 && o.visM != null);
  const samples = [];
  for (const o of obs) {
    if (o.minute !== 0 || o.visM == null || o.tmpc == null || o.dwpc == null) continue;
    const k = upper(pool, o.ts);
    let fog60 = false, fog120 = false, has60 = false, has120 = false, first = null;
    for (let j = k; j < pool.length && pool[j].ts <= o.ts + 120 * MIN; j++) {
      const p = pool[j];
      if (p.ts <= o.ts + 60 * MIN) { if (p.ts >= o.ts + 45 * MIN) has60 = true; if (p.fog) { fog60 = true; first = first || p; } }
      else if (p.ts >= o.ts + 105 * MIN) has120 = true;
      if (p.fog) { fog120 = true; first = first || p; }
    }
    if (!has60) continue;                              // no verifying observation -> unknown label, drop
    samples.push({ st, o, year: new Date(o.ts).getUTCFullYear(), day: localParts(o.ts).date, raw: rawAt(obs, o, st), fogNow: o.fog,
      y60: fog60 ? 1 : 0, y120: has120 || fog120 ? (fog120 ? 1 : 0) : null, first });
  }
  return samples;
}

// ---------------------------------------------------------------- model
const defsFor = keys => FEATURE_DEFS.filter(d => keys.includes(d.key));
function makeX(samples, keys) {
  const defs = defsFor(keys);
  return samples.map(s => defs.map(d => { const v = d.f(s.raw); return v == null || !Number.isFinite(v) ? null : v; }));
}
function fitScaler(X, keys) {
  const defs = defsFor(keys), p = defs.length, mean = Array(p).fill(0), std = Array(p).fill(0), n = Array(p).fill(0);
  for (const r of X) r.forEach((v, j) => { if (v != null) { mean[j] += v; n[j]++; } });
  for (let j = 0; j < p; j++) mean[j] /= n[j];
  for (const r of X) r.forEach((v, j) => { if (v != null) std[j] += (v - mean[j]) ** 2; });
  for (let j = 0; j < p; j++) std[j] = Math.sqrt(std[j] / n[j]) || 1;
  defs.forEach((d, j) => { if (d.binary) { mean[j] = 0; std[j] = 1; } });
  return { mean, std };
}
// -> flat Float64Array (row-major), missing values imputed with the training mean (= 0 after standardising)
function standardise(X, sc) {
  const p = sc.mean.length, Z = new Float64Array(X.length * p);
  X.forEach((r, i) => r.forEach((v, j) => { Z[i * p + j] = v == null ? 0 : (v - sc.mean[j]) / sc.std[j]; }));
  return { Z, n: X.length, p };
}
const sigmoid = z => 1 / (1 + Math.exp(-z));

function trainLR({ Z, n, p }, y, lambda, maxIter = 4000) {
  // Full-batch gradient descent with Adam step sizes on mean log-loss + (lambda/2)·||w||² (intercept unpenalised).
  // Stops when the largest gradient component < 1e-7.
  const w = new Float64Array(p + 1), m = new Float64Array(p + 1), v = new Float64Array(p + 1), g = new Float64Array(p + 1);
  let ybar = 0; for (let i = 0; i < n; i++) ybar += y[i]; ybar /= n; w[p] = Math.log(ybar / (1 - ybar));
  const lr = 0.05, b1 = 0.9, b2 = 0.999, eps = 1e-8;
  let it = 1;
  for (; it <= maxIter; it++) {
    g.fill(0);
    for (let i = 0, off = 0; i < n; i++, off += p) {
      let s = w[p];
      for (let j = 0; j < p; j++) s += w[j] * Z[off + j];
      const e = sigmoid(s) - y[i];
      for (let j = 0; j < p; j++) g[j] += e * Z[off + j];
      g[p] += e;
    }
    let gmax = 0;
    for (let j = 0; j <= p; j++) {
      g[j] /= n; if (j < p) g[j] += lambda * w[j];
      gmax = Math.max(gmax, Math.abs(g[j]));
      m[j] = b1 * m[j] + (1 - b1) * g[j]; v[j] = b2 * v[j] + (1 - b2) * g[j] * g[j];
      w[j] -= lr * (m[j] / (1 - b1 ** it)) / (Math.sqrt(v[j] / (1 - b2 ** it)) + eps);
    }
    if (gmax < 1e-7) break;
  }
  w.iters = it;
  return w;
}
function predictZ({ Z, n, p }, w) {
  const out = new Array(n);
  for (let i = 0, off = 0; i < n; i++, off += p) { let s = w[p]; for (let j = 0; j < p; j++) s += w[j] * Z[off + j]; out[i] = sigmoid(s); }
  return out;
}

// ---------------------------------------------------------------- metrics
function auc(p, y) {
  const idx = p.map((v, i) => i).sort((a, b) => p[a] - p[b]);
  let rankSum = 0, nPos = 0, i = 0;
  while (i < idx.length) { let j = i; while (j + 1 < idx.length && p[idx[j + 1]] === p[idx[i]]) j++;
    const r = (i + j) / 2 + 1; for (let k = i; k <= j; k++) if (y[idx[k]]) { rankSum += r; nPos++; } i = j + 1; }
  const nNeg = y.length - nPos;
  return nPos && nNeg ? (rankSum - nPos * (nPos + 1) / 2) / (nPos * nNeg) : null;
}
function avgPrecision(p, y) {                         // area under precision-recall curve (step-wise), ties grouped
  const idx = p.map((v, i) => i).sort((a, b) => p[b] - p[a]);
  const nPos = y.reduce((a, b) => a + b, 0); if (!nPos) return null;
  let tp = 0, fp = 0, ap = 0, i = 0;
  while (i < idx.length) { let j = i, dtp = 0; while (j < idx.length && p[idx[j]] === p[idx[i]]) { if (y[idx[j]]) dtp++; else fp++; j++; }
    tp += dtp; if (dtp) ap += (dtp / nPos) * (tp / (tp + fp)); i = j; }
  return ap;
}
const brier = (p, y) => p.reduce((a, v, i) => a + (v - y[i]) ** 2, 0) / p.length;
const logloss = (p, y) => -p.reduce((a, v, i) => a + (y[i] ? Math.log(Math.max(v, 1e-12)) : Math.log(Math.max(1 - v, 1e-12))), 0) / p.length;
function confusion(p, y, thr) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  p.forEach((v, i) => { const h = v >= thr; if (h && y[i]) tp++; else if (h) fp++; else if (y[i]) fn++; else tn++; });
  const precision = tp / (tp + fp) || 0, recall = tp / (tp + fn) || 0;
  return { tp, fp, fn, tn, precision, recall, f1: 2 * precision * recall / (precision + recall) || 0, far: fp / (tp + fp) || 0, csi: tp / (tp + fp + fn) || 0 };
}
function bestF1Threshold(p, y) {
  let best = { thr: 0.5, f1: -1 };
  for (let t = 0.02; t <= 0.9001; t += 0.01) { const c = confusion(p, y, t); if (c.f1 > best.f1) best = { thr: +t.toFixed(2), f1: c.f1 }; }
  return best.thr;
}
function calibration(p, y, bins = 10) {
  const out = [];
  for (let b = 0; b < bins; b++) {
    const lo = b / bins, hi = (b + 1) / bins; let n = 0, sp = 0, sy = 0;
    p.forEach((v, i) => { if (v >= lo && (v < hi || (b === bins - 1 && v <= hi))) { n++; sp += v; sy += y[i]; } });
    out.push({ bin: `${lo.toFixed(1)}–${hi.toFixed(1)}`, p: n ? +(sp / n).toFixed(4) : +((lo + hi) / 2).toFixed(2), observed: n ? +(sy / n).toFixed(4) : null, n });
  }
  return out;
}
// day-block bootstrap (resample whole local days, so the hours of one fog night stay together) -> 95% CI
function bootstrapCI(samples, p, y, metric, B = 500) {
  const byDay = new Map(); samples.forEach((s, i) => { const k = s.st + s.day; if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(i); });
  const days = [...byDay.values()]; let seed = 12345;
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; // mulberry32
  const vals = [];
  for (let b = 0; b < B; b++) { const pp = [], yy = [];
    for (let d = 0; d < days.length; d++) for (const i of days[Math.floor(rnd() * days.length)]) { pp.push(p[i]); yy.push(y[i]); }
    const v = metric(pp, yy); if (v != null) vals.push(v); }
  vals.sort((a, b) => a - b);
  return [vals[Math.floor(0.025 * vals.length)], vals[Math.floor(0.975 * vals.length)]];
}
const r4 = x => (x == null || !Number.isFinite(x) ? null : +x.toFixed(4));
const s4 = x => (x == null || !Number.isFinite(x) ? null : +x.toPrecision(4));   // 4 significant digits (small Brier/base rates)

// ---------------------------------------------------------------- climatology
function climatology(obs) {
  const hourly = obs.filter(o => o.minute === 0 && o.visM != null);
  const mCnt = Array(12).fill(0), mFog = Array(12).fill(0), hCnt = Array(24).fill(0), hFog = Array(24).fill(0);
  const hCntSeason = Array(24).fill(0), hFogSeason = Array(24).fill(0);
  const monthHours = new Map();                      // 'YYYY-MM' (local) -> hourly obs count
  for (const o of hourly) {
    const lp = localParts(o.ts);
    mCnt[lp.mo - 1]++; hCnt[lp.h]++; if (o.fog) { mFog[lp.mo - 1]++; hFog[lp.h]++; }
    if ([9, 10, 11, 12, 1, 2, 3].includes(lp.mo)) { hCntSeason[lp.h]++; if (o.fog) hFogSeason[lp.h]++; }
    const ym = `${lp.y}-${String(lp.mo).padStart(2, '0')}`; monthHours.set(ym, (monthHours.get(ym) || 0) + 1);
  }
  // fog days: local calendar days with >=1 fog report (routine or SPECI); months with >=60% hourly coverage only
  const fogDays = new Set(); obs.forEach(o => { if (o.fog) fogDays.add(localParts(o.ts).date); });
  const daysByYM = new Map(); for (const d of fogDays) { const ym = d.slice(0, 7); daysByYM.set(ym, (daysByYM.get(ym) || 0) + 1); }
  const fdSum = Array(12).fill(0), fdYears = Array(12).fill(0), fogDaysByYear = {};
  for (const [ym, n] of monthHours) {
    const [y, m] = ym.split('-').map(Number); if (y < Y1 || y > Y2) continue;
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (n < 0.6 * dim * 24) continue;
    fdSum[m - 1] += daysByYM.get(ym) || 0; fdYears[m - 1]++;
    fogDaysByYear[y] = (fogDaysByYear[y] || 0) + (daysByYM.get(ym) || 0);
  }
  // fog events (episodes): consecutive fog reports, a new event after >= 3 h without fog. Season = Jul–Jun (local).
  const events = []; let cur = null;
  for (const o of obs) { if (!o.fog) continue;
    if (cur && o.ts - cur.end <= 3 * H) { cur.end = o.ts; cur.minVis = Math.min(cur.minVis, o.visM); }
    else { cur = { start: o.ts, end: o.ts, minVis: o.visM }; events.push(cur); } }
  const perSeason = {};
  for (const e of events) { const lp = localParts(e.start); const s0 = lp.mo >= 7 ? lp.y : lp.y - 1; const k = `${s0}/${String((s0 + 1) % 100).padStart(2, '0')}`; perSeason[k] = (perSeason[k] || 0) + 1; }
  return {
    nHourlyObs: hourly.length,
    byMonth: mCnt.map((c, i) => r4(c ? 100 * mFog[i] / c : null)),
    fogDaysByMonth: fdSum.map((s, i) => (fdYears[i] ? +(s / fdYears[i]).toFixed(2) : null)),
    yearsPerMonth: fdYears,
    fogDaysByYear,
    byHour: hCnt.map((c, i) => r4(c ? 100 * hFog[i] / c : null)),
    byHourFogSeason: hCntSeason.map((c, i) => r4(c ? 100 * hFogSeason[i] / c : null)),
    eventsPerSeason: perSeason,
    nEvents: events.length,
    meanEventHours: r4(events.reduce((a, e) => a + (e.end - e.start) / H, 0) / (events.length || 1)),
  };
}

// ================================================================ main
const t0 = Date.now();
const stations = {};
for (const st of STATIONS) {
  const s = loadStation(st);
  if (!s.files) { console.log(`[${st}] no raw files — skipped`); continue; }
  stations[st] = s;
  const o = s.obs, years = new Set(o.map(x => new Date(x.ts).getUTCFullYear()));
  const nVsby = o.filter(x => x.visSrc === 'vsby').length, nNoVis = o.filter(x => x.visM == null).length;
  s.summary = { reports: o.length, years: [...years].sort(), hourly: o.filter(x => x.minute === 0).length, visFromMetar: o.length - nVsby - nNoVis,
    visFromVsby: nVsby, visMissing: nNoVis, lowVis: o.filter(x => x.lowVis).length, dust: o.filter(x => x.dustLowVis).length,
    precip: o.filter(x => x.precipLowVis).length, fog: o.filter(x => x.fog).length, rvrReports: o.filter(x => x.rvr.length).length };
  console.log(`[${st}] ${JSON.stringify(s.summary)}`);
}
if (!stations.OMDB) throw new Error('OMDB data missing — run tools/fetch_metars.mjs first');

const samplesBy = {}; for (const st of Object.keys(stations)) samplesBy[st] = buildSamples(stations[st].obs, st);
const pooledAvailable = Object.keys(stations).length > 1;
console.log(`\nsamples (hourly :00 with verifying obs): ${Object.entries(samplesBy).map(([k, v]) => `${k}=${v.length} (fog at t ${v.filter(s => s.fogNow).length})`).join(', ')}`);

const WX_KEYS = FEATURE_DEFS.filter(d => !d.binary).map(d => d.key);
const ST_KEYS = Object.keys(stations).filter(s => s !== 'OMDB').map(s => 'st' + s);
const LAMBDAS = [1e-5, 1e-4, 1e-3];

// One experiment = (subset filter, target). Candidates: training pool {OMDB only, OMDB+OMAA+OMDW with station offsets}
// × feature set {base, +near-saturation hinge} × λ. Selection by OMDB log-loss on the inner validation years.
function experiment(filter, target, label) {
  const sel = st => samplesBy[st].filter(s => filter(s) && s[target] != null);
  const rowsBy = {}; for (const st of Object.keys(samplesBy)) rowsBy[st] = sel(st);
  const omdbTr = rowsBy.OMDB.filter(s => s.year <= TRAIN_LAST_YEAR), omdbTe = rowsBy.OMDB.filter(s => s.year > TRAIN_LAST_YEAR);
  const omdbInner = omdbTr.filter(s => !VAL_YEARS.includes(s.year)), omdbVal = omdbTr.filter(s => VAL_YEARS.includes(s.year));
  const pooledTr = Object.values(rowsBy).flat().filter(s => s.year <= TRAIN_LAST_YEAR);
  const pooledTe = Object.values(rowsBy).flat().filter(s => s.year > TRAIN_LAST_YEAR);
  const candidates = [];
  for (const pool of pooledAvailable ? ['OMDB', 'pooled'] : ['OMDB'])
    for (const [setName, wx] of [['base', WX_KEYS.filter(k => k !== 'dpdLow')], ['withHinge', WX_KEYS]])
      for (const lam of LAMBDAS) candidates.push({ pool, setName, keys: pool === 'pooled' ? [...wx, ...ST_KEYS] : wx, lam });
  let best = null;
  for (const c of candidates) {
    const inner = c.pool === 'pooled' ? pooledTr.filter(s => !VAL_YEARS.includes(s.year)) : omdbInner;
    const Xi = makeX(inner, c.keys), sc = fitScaler(Xi, c.keys), w = trainLR(standardise(Xi, sc), inner.map(s => s[target]), c.lam, 2000);
    const pv = predictZ(standardise(makeX(omdbVal, c.keys), sc), w), yv = omdbVal.map(s => s[target]);
    c.valAuc = auc(pv, yv); c.valAp = avgPrecision(pv, yv); c.valLL = logloss(pv, yv);
    console.log(`  [${label}] val(OMDB ${VAL_YEARS.join('-')}) ${c.pool.padEnd(6)} ${c.setName.padEnd(9)} λ=${c.lam}: AUC=${c.valAuc.toFixed(4)} AP=${c.valAp.toFixed(3)} logloss=${c.valLL.toFixed(5)} (iters ${w.iters})`);
    if (!best || c.valLL < best.valLL) best = c;
  }
  // --- refit chosen configuration on the full training period
  const tr = best.pool === 'pooled' ? pooledTr : omdbTr;
  const Xtr = makeX(tr, best.keys), sc = fitScaler(Xtr, best.keys), Ztr = standardise(Xtr, sc), ytr = tr.map(s => s[target]);
  const w = trainLR(Ztr, ytr, best.lam, 4000);
  const ptrO = predictZ(standardise(makeX(omdbTr, best.keys), sc), w), ytrO = omdbTr.map(s => s[target]);
  const thr = bestF1Threshold(predictZ(Ztr, w), ytr);   // operating threshold chosen on TRAINING data only
  const evalSet = (te) => {
    const y = te.map(s => s[target]), p = predictZ(standardise(makeX(te, best.keys), sc), w);
    const humid = te.map((s, i) => i).filter(i => te[i].raw.rh != null ? te[i].raw.rh >= 80 : rhFromTd(te[i].raw.tempC, te[i].raw.dewC) >= 80);
    const sub = arr => humid.map(i => arr[i]);
    // baselines, fitted on the OMDB training period
    const clim = new Map(); omdbTr.forEach(s => { const k = `${s.raw.month}-${Math.floor(s.raw.localHour)}`; const c = clim.get(k) || [0, 0]; c[0] += s[target]; c[1]++; clim.set(k, c); });
    const brTr = ytrO.reduce((a, b) => a + b, 0) / ytrO.length;
    const pClim = te.map(s => { const c = clim.get(`${s.raw.month}-${Math.floor(s.raw.localHour)}`); return c && c[1] ? c[0] / c[1] : brTr; });
    const pDpd = te.map(s => -(s.raw.tempC - s.raw.dewC) + 1e-3 * (s.raw.rh || 0));     // rule of thumb: smaller T−Td ⇒ fog-prone
    const pPersist = te.map(s => (s.fogNow ? 1 : 0));
    const out = { n: te.length, pos: y.reduce((a, b) => a + b, 0), baseRate: y.reduce((a, b) => a + b, 0) / y.length,
      auc: auc(p, y), aucCI: bootstrapCI(te, p, y, auc), ap: avgPrecision(p, y), apCI: bootstrapCI(te, p, y, avgPrecision),
      brier: brier(p, y), logloss: logloss(p, y), ...confusion(p, y, thr),
      humid: { n: humid.length, pos: sub(y).reduce((a, b) => a + b, 0), auc: auc(sub(p), sub(y)), ap: avgPrecision(sub(p), sub(y)), dpdRuleAuc: auc(sub(pDpd), sub(y)) },
      baselines: {
        climMonthHour: { auc: auc(pClim, y), ap: avgPrecision(pClim, y), brier: brier(pClim, y) },
        dpdRule: { auc: auc(pDpd, y), ap: avgPrecision(pDpd, y) },
        constantBaseRate: { brier: brier(te.map(() => brTr), y) },
        persistence: { brier: brier(pPersist, y), ...confusion(pPersist, y, 0.5) },
      },
      calibration: calibration(p, y), p, te };
    out.bss = 1 - out.brier / out.baselines.climMonthHour.brier;
    return out;
  };
  const res = { target, pool: best.pool, featureSet: best.setName, keys: best.keys, lambda: best.lam, scaler: sc, w: Array.from(w), iters: w.iters, threshold: thr,
    nTrain: tr.length, posTrain: ytr.reduce((a, b) => a + b, 0), nTrainOMDB: omdbTr.length, posTrainOMDB: ytrO.reduce((a, b) => a + b, 0),
    trainAucOMDB: auc(ptrO, ytrO), val: { auc: best.valAuc, ap: best.valAp, logloss: best.valLL }, candidates: candidates.map(({ pool, setName, lam, valAuc, valAp, valLL }) => ({ pool, setName, lam, valAuc, valAp, valLL })),
    test: evalSet(omdbTe), testPooled: pooledAvailable ? evalSet(pooledTe) : null };
  const show = (nm, t) => {
    console.log(`  [${label}] ${nm}: n=${t.n} pos=${t.pos} base=${t.baseRate.toFixed(5)} AUC=${t.auc.toFixed(4)} [${t.aucCI.map(v => v.toFixed(3))}] AP=${t.ap.toFixed(3)} [${t.apCI.map(v => v.toFixed(3))}] Brier=${t.brier.toFixed(5)} BSS(clim)=${t.bss.toFixed(3)} | thr=${thr} TP=${t.tp} FP=${t.fp} FN=${t.fn} P=${t.precision.toFixed(3)} R=${t.recall.toFixed(3)} F1=${t.f1.toFixed(3)} CSI=${t.csi.toFixed(3)}`);
    console.log(`  [${label}] ${nm} baselines: clim AUC=${t.baselines.climMonthHour.auc?.toFixed(4)} AP=${t.baselines.climMonthHour.ap?.toFixed(3)} Brier=${t.baselines.climMonthHour.brier.toFixed(5)}; T−Td rule AUC=${t.baselines.dpdRule.auc?.toFixed(4)} AP=${t.baselines.dpdRule.ap?.toFixed(3)}; const Brier=${t.baselines.constantBaseRate.brier.toFixed(5)}; persistence Brier=${t.baselines.persistence.brier.toFixed(5)} F1=${t.baselines.persistence.f1.toFixed(3)}`);
    console.log(`  [${label}] ${nm} humid subset (RH≥80%): n=${t.humid.n} pos=${t.humid.pos} AUC=${t.humid.auc?.toFixed(4)} AP=${t.humid.ap?.toFixed(3)} T−Td rule AUC=${t.humid.dpdRuleAuc?.toFixed(4)}`);
    console.log('  calibration:', t.calibration.map(c => `${c.bin}: p=${c.p} obs=${c.observed} n=${c.n}`).join(' | '));
  };
  console.log(`  [${label}] CHOSEN pool=${best.pool} set=${best.setName} λ=${best.lam}; train n=${res.nTrain} (pos ${res.posTrain}), iters=${res.iters}, OMDB train AUC=${res.trainAucOMDB.toFixed(4)}`);
  show('TEST OMDB', res.test); if (res.testPooled) show('TEST 3-station', res.testPooled);
  return res;
}

console.log('\n=== ONSET model, 60 min (no fog at t) ===');
const m60 = experiment(s => !s.fogNow, 'y60', 'onset60');
console.log('\n=== ONSET model, 120 min (no fog at t) ===');
const m120 = experiment(s => !s.fogNow, 'y120', 'onset120');
console.log('\n=== PERSISTENCE model, 60 min (fog at t) ===');
const mPer = experiment(s => s.fogNow, 'y60', 'persist60');

// ---------------------------------------------------------------- climatology
const clim = {};
for (const [st, s] of Object.entries(stations)) {
  clim[st] = climatology(s.obs);
  console.log(`\n[${st}] climatology (hourly obs n=${clim[st].nHourlyObs}):\n  % fog by month: ${clim[st].byMonth.map(v => v == null ? '-' : v.toFixed(2)).join(' ')}` +
    `\n  fog days/month: ${clim[st].fogDaysByMonth.join(' ')} (years: ${clim[st].yearsPerMonth.join(',')}); total/yr ${clim[st].fogDaysByMonth.reduce((a, b) => a + (b || 0), 0).toFixed(1)}` +
    `\n  fog days by year: ${JSON.stringify(clim[st].fogDaysByYear)}\n  % fog by local hour: ${clim[st].byHour.map(v => v == null ? '-' : v.toFixed(2)).join(' ')}` +
    `\n  events per season (Jul–Jun): ${JSON.stringify(clim[st].eventsPerSeason)}; total ${clim[st].nEvents}, mean duration ${clim[st].meanEventHours} h`);
}

// ---------------------------------------------------------------- examples (real OMDB test-period onsets)
const r6 = x => +x.toPrecision(6);
function coefObj(m) { const o = { intercept: r6(m.w[m.w.length - 1]) }; m.keys.forEach((k, j) => { o[k] = r6(m.w[j]); }); return o; }
function describeOutcome(s) {
  const f = s.first, lp = localParts(f.ts);
  const rv = f.rvr.length ? `, RVR ${f.rvr.map(r => `${r.rwy} ${r.pm === 'M' ? '<' : r.pm === 'P' ? '>' : ''}${r.m} m`).join(' / ')}` : '';
  return `Fog at ${lp.hhmm} local, vis ${f.visM} m${rv}`;
}
function exampleOf(s, p, kind) {
  const lp = localParts(s.o.ts), r = s.raw;
  return { station: s.st, date: lp.date, localTime: lp.hhmm, kind,
    features: { tempC: r.tempC, dewC: r.dewC, rh: r4(r.rh), windKt: r.windKt, windDir: r.windDir, localHour: r.localHour, month: r.month,
      visM: r.visM, visTrend1h: r.visTrend1h, dpdTrend2h: r.dpdTrend2h, tempDrop3h: r.tempDrop3h },
    prob: r4(p), outcome: s.y60 ? describeOutcome(s) : 'No fog within 60 min', metar: s.o.metar, verifyingMetar: s.first ? s.first.metar : null };
}
const cand = m60.test.te.map((s, i) => ({ s, p: m60.test.p[i] }));
const pos = cand.filter(c => c.s.y60).sort((a, b) => b.p - a.p);
const usedDays = new Set(), examples = [];
for (const c of pos) { const d = c.s.day; if (usedDays.has(d)) continue; usedDays.add(d); examples.push(exampleOf(c.s, c.p, c.p >= m60.threshold ? 'hit' : 'miss')); if (examples.length >= 3) break; }
const misses = pos.filter(c => c.p < m60.threshold && !usedDays.has(c.s.day));
if (misses.length) { const mm = misses[Math.floor(misses.length / 2)]; usedDays.add(mm.s.day); examples.push(exampleOf(mm.s, mm.p, 'miss')); }
const fa = cand.filter(c => !c.s.y60 && c.p >= m60.threshold).sort((a, b) => b.p - a.p)[0];
if (fa) examples.push(exampleOf(fa.s, fa.p, 'false alarm'));
console.log('\nexamples:', JSON.stringify(examples.map(e => [e.kind, e.date, e.localTime, e.prob, e.outcome])));

// ---------------------------------------------------------------- write js/fogmodel.js
const featureMeta = m => m.keys.map((k, j) => ({ key: k, label: FEATURE_DEFS.find(d => d.key === k).label, mean: r6(m.scaler.mean[j]), std: r6(m.scaler.std[j]) }));
const climOut = {}; for (const [st, c] of Object.entries(clim)) climOut[st] = { byMonth: c.byMonth, fogDaysByMonth: c.fogDaysByMonth, byHour: c.byHour,
  byHourFogSeason: c.byHourFogSeason, fogDaysByYear: c.fogDaysByYear, eventsPerSeason: c.eventsPerSeason, nEvents: c.nEvents, meanEventHours: c.meanEventHours, nHourlyObs: c.nHourlyObs };
const metricsOf = (m, t = m.test, evaluatedOn = 'OMDB 2023–2025') => ({ evaluatedOn, auc: r4(t.auc), aucCI95: t.aucCI.map(r4), pr_auc: r4(t.ap), prAucCI95: t.apCI.map(r4), brier: s4(t.brier), logloss: s4(t.logloss),
  baseRate: s4(t.baseRate), threshold: m.threshold, precision: r4(t.precision), recall: r4(t.recall), f1: r4(t.f1), csi: r4(t.csi), far: r4(t.far),
  tp: t.tp, fp: t.fp, fn: t.fn, tn: t.tn, brierSkillVsClimatology: r4(t.bss),
  baselineAuc: r4(t.baselines.climMonthHour.auc), baselinePrAuc: r4(t.baselines.climMonthHour.ap), baselineBrier: s4(t.baselines.climMonthHour.brier),
  baselineName: 'Climatology P(event | month, local hour), OMDB 2015–2022',
  dpdRuleAuc: r4(t.baselines.dpdRule.auc), dpdRulePrAuc: r4(t.baselines.dpdRule.ap), persistenceBrier: s4(t.baselines.persistence.brier), persistenceF1: r4(t.baselines.persistence.f1),
  humidSubset: { rhMin: 80, n: t.humid.n, pos: t.humid.pos, auc: r4(t.humid.auc), pr_auc: r4(t.humid.ap), dpdRuleAuc: r4(t.humid.dpdRuleAuc) },
  nTest: t.n, posTest: t.pos, nTrain: m.nTrain, posTrain: m.posTrain, trainPool: m.pool, lambda: m.lambda });

const model = {
  meta: {
    station: 'OMDB', stationName: 'Dubai International',
    source: `Iowa Environmental Mesonet (IEM) ASOS/AWOS/METAR archive — ${IEM_DOC_URL} (cgi-bin/request/asos.py, raw METAR text)`,
    sourceUrlExample: IEM_EXAMPLE_URL,
    period: `${Y1}-01 – ${Y2}-12`, trainPeriod: `${Y1}-01 – ${TRAIN_LAST_YEAR}-12`, testPeriod: `${TRAIN_LAST_YEAR + 1}-01 – ${Y2}-12`,
    nTrain: m60.nTrain, nTest: m60.test.n,
    trainStations: m60.pool === 'pooled' ? Object.keys(stations) : ['OMDB'],
    target: 'Visibility < 1000 m within next 60 min',
    targetDetail: 'Onset: any METAR/SPECI in (t, t+60 min] with prevailing visibility < 1000 m (sand/dust- and rain/thunderstorm-only reports excluded), given no such fog at t. One sample per on-the-hour METAR.',
    model: 'L2-regularised logistic regression on standardised features (full-batch gradient descent, Adam step sizes); configuration chosen on 2021–2022 validation',
    featureSet: m60.featureSet, lambda: m60.lambda,
    stationsData: Object.fromEntries(Object.entries(stations).map(([k, v]) => [k, v.summary])),
    trainedAt: new Date().toISOString().slice(0, 10),
    script: 'tools/train_fog_model.mjs',
  },
  features: featureMeta(m60),
  coef: coefObj(m60),
  coef120: coefObj(m120),
  features120: featureMeta(m120),
  coefPersist: coefObj(mPer),
  featuresPersist: featureMeta(mPer),
  metrics: metricsOf(m60),
  metricsNetwork: m60.testPooled ? metricsOf(m60, m60.testPooled, 'OMDB+OMAA+OMDW 2023–2025') : null,
  metrics120: metricsOf(m120),
  // OMDB alone has only a handful of fog-at-t test cases, so the persistence model is scored on all three stations
  metricsPersist: { ...metricsOf(mPer, mPer.testPooled || mPer.test, mPer.testPooled ? 'OMDB+OMAA+OMDW 2023–2025' : 'OMDB 2023–2025'), persistenceBaselineName: 'Persistence (fog now ⇒ fog continues, p=1)', omdbOnly: metricsOf(mPer) },
  calibration: m60.test.calibration.map(c => ({ p: c.p, observed: c.observed, n: c.n, bin: c.bin })),
  calibrationNetwork: m60.testPooled ? m60.testPooled.calibration.map(c => ({ p: c.p, observed: c.observed, n: c.n, bin: c.bin })) : null,
  calibration120: m120.test.calibration.map(c => ({ p: c.p, observed: c.observed, n: c.n, bin: c.bin })),
  climatology: climOut,
  examples,
};

const predictSrc = `function (raw, horizon) {
    // raw = {tempC, dewC, rh, windKt, windDir, localHour, month, visM, visTrend1h, dpdTrend2h, tempDrop3h, station}
    //   visTrend1h = visM(now) − visM(1 h ago) in metres; dpdTrend2h = (T−Td)now − (T−Td)2h ago; tempDrop3h = T(3h ago) − T(now)
    // horizon: 60 (default) or 120 (onset models). If visM < 1000 (fog already present) the 60-min persistence model is used.
    // Missing values -> training mean (standardised 0). Returns {p, contributions:[{key,label,value,contrib}], ...} sorted by |contrib|.
    raw = raw || {};
    var self = FA.fogModel, ok = function (v) { return v !== null && v !== undefined && v !== '' && isFinite(v); };
    var r = {}; ['tempC','dewC','rh','windKt','windDir','localHour','month','visM','visTrend1h','dpdTrend2h','tempDrop3h'].forEach(function (k) { r[k] = ok(raw[k]) ? +raw[k] : null; });
    var es = function (x) { return Math.exp(17.625 * x / (243.04 + x)); };
    var clampVis = function (v) { return Math.max(50, Math.min(10000, v)); };
    var hasTd = r.tempC !== null && r.dewC !== null;
    var fx = {
      dpd: hasTd ? r.tempC - r.dewC : null,
      dpdLow: hasTd ? Math.max(0, 3 - (r.tempC - r.dewC)) : null,
      rh: r.rh !== null ? r.rh : (hasTd ? 100 * es(r.dewC) / es(r.tempC) : null),
      wind: r.windKt,
      windSin: r.windKt === null ? null : (r.windDir === null || r.windKt === 0 ? 0 : Math.sin(r.windDir * Math.PI / 180)),
      windCos: r.windKt === null ? null : (r.windDir === null || r.windKt === 0 ? 0 : Math.cos(r.windDir * Math.PI / 180)),
      hourSin: r.localHour === null ? null : Math.sin(2 * Math.PI * r.localHour / 24),
      hourCos: r.localHour === null ? null : Math.cos(2 * Math.PI * r.localHour / 24),
      monthSin: r.month === null ? null : Math.sin(2 * Math.PI * (r.month - 0.5) / 12),
      monthCos: r.month === null ? null : Math.cos(2 * Math.PI * (r.month - 0.5) / 12),
      logVis: r.visM === null ? null : Math.log10(clampVis(r.visM)),
      visTrend: (r.visM === null || r.visTrend1h === null) ? null : Math.log10(clampVis(r.visM) / clampVis(r.visM - r.visTrend1h)),
      dpdTrend2h: r.dpdTrend2h,
      tempDrop3h: r.tempDrop3h,
      stOMAA: raw.station === 'OMAA' ? 1 : 0,
      stOMDW: raw.station === 'OMDW' ? 1 : 0
    };
    var shown = { dpd: fx.dpd, dpdLow: fx.dpd, rh: fx.rh, wind: r.windKt, windSin: r.windDir, windCos: r.windDir, hourSin: r.localHour, hourCos: r.localHour,
      monthSin: r.month, monthCos: r.month, logVis: r.visM, visTrend: r.visTrend1h, dpdTrend2h: r.dpdTrend2h, tempDrop3h: r.tempDrop3h, stOMAA: fx.stOMAA, stOMDW: fx.stOMDW };
    var fogNow = r.visM !== null && r.visM < 1000;
    var feats, coef, which, thr;
    if (fogNow) { feats = self.featuresPersist; coef = self.coefPersist; which = 'persistence-60'; thr = self.metricsPersist.threshold; }
    else if (horizon === 120) { feats = self.features120; coef = self.coef120; which = 'onset-120'; thr = self.metrics120.threshold; }
    else { feats = self.features; coef = self.coef; which = 'onset-60'; thr = self.metrics.threshold; }
    var z = coef.intercept, contributions = [];
    for (var i = 0; i < feats.length; i++) {
      var f = feats[i], v = fx[f.key], imputed = !ok(v);
      var s = imputed ? 0 : (v - f.mean) / f.std;
      var c = (coef[f.key] || 0) * s; z += c;
      contributions.push({ key: f.key, label: f.label, value: imputed ? null : (ok(shown[f.key]) ? shown[f.key] : v), imputed: imputed, contrib: c });
    }
    contributions.sort(function (a, b) { return Math.abs(b.contrib) - Math.abs(a.contrib); });
    return { p: 1 / (1 + Math.exp(-z)), logit: z, model: which, fogNow: fogNow, threshold: thr, alert: 1 / (1 + Math.exp(-z)) >= thr, contributions: contributions };
  }`;

const header = `// AUTO-GENERATED by tools/train_fog_model.mjs on ${model.meta.trainedAt} — do not edit by hand.
// Fog nowcasting model for Dubai International (OMDB), trained on real METARs from the
// Iowa Environmental Mesonet archive. See docs/FOG_MODEL.md for the model card.
// Prototype decision-support only — NOT a certified forecast; human-in-the-loop required.
`;
const body = Object.entries(model).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`).join('\n');
fs.writeFileSync(OUT_JS, `${header}window.FA = window.FA || {};\nFA.fogModel = {\n${body}\n  predict: ${predictSrc}\n};\n`);

// self-check: the browser predict() must reproduce the training-pipeline probabilities exactly
{
  globalThis.window = globalThis; delete globalThis.FA;
  (0, eval)(fs.readFileSync(OUT_JS, 'utf8'));
  let maxDiff = 0;
  m60.test.te.forEach((s, i) => { if (i % 50) return; maxDiff = Math.max(maxDiff, Math.abs(globalThis.FA.fogModel.predict(s.raw).p - m60.test.p[i])); });
  console.log(`\nself-check predict() vs pipeline on OMDB test rows: max |Δp| = ${maxDiff.toExponential(2)} (non-zero only from 6-significant-digit rounding)`);
}
console.log(`wrote ${OUT_JS} (${(fs.statSync(OUT_JS).size / 1024).toFixed(1)} KB) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
