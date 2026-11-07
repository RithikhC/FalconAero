/* Build js/opendata.js from official GCAA open data (via Bayanat) + OMDB METAR history.
   Usage:  npm i  &&  node tools/build_opendata.cjs
   Inputs : data/opendata/*.xlsx (downloaded from bayanat.ae, CC BY-SA 4.0, © GCAA)
            data/raw/OMDB_YYYY.csv.gz (Iowa Environmental Mesonet METAR archive)
   Output : js/opendata.js  (window.FA.openData) */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const X = require('xlsx');
const ROOT = path.resolve(__dirname, '..');
const OD = path.join(ROOT, 'data', 'opendata');

const sheet = (file, name) => X.utils.sheet_to_json(X.readFile(path.join(OD, file)).Sheets[name], { header: 1, defval: '' });

/* ---------- 1. movements & passengers per emirate ---------- */
function perEmirate(file) {
  const rows = sheet(file, 'Data Set').slice(1).filter((r) => r[0] !== '' && r[1] !== '');
  const years = [...new Set(rows.map((r) => +r[1]))].sort();
  const em = {};
  rows.forEach((r) => {
    const e = String(r[0]).trim(), y = +r[1], type = String(r[2]).trim(), c = +r[3] || 0;
    em[e] = em[e] || { total: {}, Arrivals: {}, Departures: {}, Transit: {} };
    em[e].total[y] = (em[e].total[y] || 0) + c;
    em[e][type] = em[e][type] || {};
    em[e][type][y] = (em[e][type][y] || 0) + c;
  });
  const out = { years, emirates: {} };
  Object.keys(em).forEach((e) => {
    out.emirates[e] = { total: years.map((y) => em[e].total[y] || 0), arrivals: years.map((y) => em[e].Arrivals[y] || 0), departures: years.map((y) => em[e].Departures[y] || 0), transit: years.map((y) => (em[e].Transit || {})[y] || 0) };
  });
  return out;
}
const movements = perEmirate('GCAA_Aircraft_Movements_Per_Emirate_Yearly.xlsx');
const passengers = perEmirate('GCAA_Passengers_Per_Emirate_Yearly.xlsx');

/* ---------- 2. international movements monthly ---------- */
const INTL = 'GCAA_International_Aircraft_Movements.xlsx';
const monthly = sheet(INTL, 'Data Set').slice(1).filter((r) => r[0] !== '' && r[1] !== '').map((r) => [+r[0], +r[1], +r[2], +r[3]]);

/* ---------- 3. daily movements (Sheikh Zayed Air Navigation Centre) ---------- */
const dailySheet = X.readFile(path.join(OD, INTL)).SheetNames.find((s) => /Daily/i.test(s));
const daily = new Map();
sheet(INTL, dailySheet).slice(1).forEach((r) => {
  if (typeof r[0] !== 'number') return;
  const d = new Date(Math.round((r[0] - 25569) * 86400 * 1000)); // Excel serial → UTC date
  const key = d.toISOString().slice(0, 10);
  daily.set(key, { arr: +r[1] || 0, dep: +r[2] || 0, local: +r[3] || 0, overfly: +r[4] || 0, total: +r[5] || 0 });
});

/* ---------- 4. OMDB fog days from METAR ---------- */
function visFromMetar(m, vsbyMiles) {
  if (/ CAVOK/.test(m)) return 9999;
  const body = m.split(/ (BECMG|TEMPO|NOSIG|RMK)/)[0];
  const g = body.split(' ').slice(2).find((t) => /^\d{4}$/.test(t));
  if (g) return +g;
  const v = parseFloat(vsbyMiles);
  return isNaN(v) ? null : v * 1609;
}
const fogObs = new Map(); // local date → count of obs with vis < 1000 m in the 22:00–10:00 local window
const obsCount = new Map();
const rawDir = path.join(ROOT, 'data', 'raw');
const files = fs.existsSync(rawDir) ? fs.readdirSync(rawDir).filter((f) => /^OMDB_\d{4}\.csv\.gz$/.test(f)) : [];
files.forEach((f) => {
  const lines = zlib.gunzipSync(fs.readFileSync(path.join(rawDir, f))).toString('utf8').split('\n').slice(1);
  lines.forEach((ln) => {
    if (!ln) return;
    const c = ln.split(',');
    const t = new Date(c[1].replace(' ', 'T') + ':00Z');
    if (isNaN(t)) return;
    const local = new Date(t.getTime() + 4 * 3600e3);
    const h = local.getUTCHours();
    if (!(h >= 22 || h < 10)) return;
    const day = new Date(local.getTime() + (h >= 22 ? 86400e3 : 0)).toISOString().slice(0, 10); // night belongs to the following morning
    const vis = visFromMetar(c.slice(9).join(','), c[7]);
    obsCount.set(day, (obsCount.get(day) || 0) + 1);
    const dpd = parseFloat(c[2]) - parseFloat(c[3]);
    const fogLike = /FG|BR/.test(c[8] || '') || (!isNaN(dpd) && dpd <= 2);   // exclude dust/sand obscuration
    if (vis != null && vis < 1000 && fogLike) fogObs.set(day, (fogObs.get(day) || 0) + 1);
  });
});
const isFog = (d) => (fogObs.get(d) || 0) >= 1;        // ≥ 1 hourly METAR with fog (vis < 1000 m)
const hasObs = (d) => (obsCount.get(d) || 0) >= 8;

/* fog days per month (climatology) */
const fogByMonth = Array(12).fill(0), yearsSeen = new Set();
[...obsCount.keys()].forEach((d) => { yearsSeen.add(d.slice(0, 4)); if (isFog(d)) fogByMonth[+d.slice(5, 7) - 1]++; });
const nYears = yearsSeen.size || 1;
const fogDaysByMonth = fogByMonth.map((v) => +(v / nYears).toFixed(1));
const fogDaysPerYear = {};
[...obsCount.keys()].forEach((d) => { if (isFog(d)) fogDaysPerYear[d.slice(0, 4)] = (fogDaysPerYear[d.slice(0, 4)] || 0) + 1; });

/* ---------- 5. fog-impact study: daily UAE movements on OMDB fog days vs matched baseline ---------- */
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
const median = (a) => { const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const study = [];
[...daily.keys()].sort().forEach((d) => {
  if (!hasObs(d) || !isFog(d)) return;
  if (d < '2015-01-01' || (d >= '2020-03-01' && d < '2021-10-01')) return; // skip COVID collapse period
  const base = [-21, -14, -7, 7, 14, 21].map((k) => addDays(d, k)).filter((x) => daily.has(x) && daily.get(x).arr > 100 && hasObs(x) && !isFog(x));
  if (!(daily.get(d).arr > 100)) return;
  if (base.length < 3) return;
  const cur = daily.get(d);
  const b = (fld) => median(base.map((x) => daily.get(x)[fld]));
  const nb = (fld) => { const n = daily.get(addDays(d, 1)); return n ? n[fld] : null; };
  study.push({ d, fogObs: fogObs.get(d), arr: cur.arr, arrBase: b('arr'), dep: cur.dep, depBase: b('dep'), local: cur.local, localBase: b('local'), arrNext: nb('arr') });
});
const meanPct = (k, kb) => study.length ? study.reduce((a, s) => a + (s[k] - s[kb]) / s[kb], 0) / study.length * 100 : null;
const severe = study.filter((s) => s.fogObs >= 3); // ≥ ~3 h of fog
const meanPctOf = (arr, k, kb) => arr.length ? arr.reduce((a, s) => a + (s[k] - s[kb]) / s[kb], 0) / arr.length * 100 : null;
const fogImpact = {
  method: 'OMDB fog day = ≥1 routine (hourly) METAR with visibility < 1000 m in fog/mist (FG/BR or T−Td ≤ 2 °C) between 22:00 and 10:00 GST. For each fog day, the same weekday ±1/2/3 weeks (non-fog days) form a matched baseline (median). COVID period Mar-2020 – Sep-2021 excluded. Daily counts: GCAA "International Aircraft Movements" (DailyWiseMvmts sheet, Sheikh Zayed Air Navigation Centre, UAE-wide).',
  period: study.length ? study[0].d + ' → ' + study[study.length - 1].d : '',
  nFogDays: study.length,
  arrPct: meanPct('arr', 'arrBase'), depPct: meanPct('dep', 'depBase'), localPct: meanPct('local', 'localBase'),
  severe: { n: severe.length, arrPct: meanPctOf(severe, 'arr', 'arrBase'), depPct: meanPctOf(severe, 'dep', 'depBase') },
  worst: study.slice().sort((a, b) => (a.arr - a.arrBase) / a.arrBase - (b.arr - b.arrBase) / b.arrBase).slice(0, 8).map((s) => ({ d: s.d, fogHours: s.fogObs, arr: s.arr, arrBase: s.arrBase, pct: +((100 * (s.arr - s.arrBase)) / s.arrBase).toFixed(1) }))
};

/* ---------- 6. write ---------- */
const out = {
  builtAt: new Date().toISOString().slice(0, 10),
  licence: 'GCAA open data via Bayanat — CC BY-SA 4.0. Please cite: General Civil Aviation Authority (GCAA), UAE.',
  datasets: [
    { title: 'Aircraft Movements Per Emirate Yearly', publisher: 'General Civil Aviation Authority (GCAA)', portal: 'Bayanat (bayanat.ae)', url: 'https://bayanat.ae/en/Datasets/Dataset-info?id=kxuZ3oMVtzE4Y81JnazA9mimspukxqTE2PkLqk0_aHY', format: 'XLSX (bundled)', coverage: movements.years[0] + '–' + movements.years[movements.years.length - 1] + ', all emirates', updated: '18/03/2025', used_for: 'Calibrating simulated traffic volumes; network capacity context; impact scaling', status: 'used' },
    { title: 'Passengers Per Emirate Yearly', publisher: 'General Civil Aviation Authority (GCAA)', portal: 'Bayanat (bayanat.ae)', url: 'https://bayanat.ae/en/Datasets/Dataset-info?id=raIY5qaSUK-sIdyuF0PToYl1x5nSINLVXadeztkQgyk', format: 'XLSX (bundled)', coverage: passengers.years[0] + '–' + passengers.years[passengers.years.length - 1] + ', all emirates', updated: '19/03/2025', used_for: 'Passenger-impact estimates (pax affected, transfer share)', status: 'used' },
    { title: 'International Aircraft Movements (monthly + daily 1998–2023)', publisher: 'General Civil Aviation Authority (GCAA) — Sheikh Zayed Air Navigation Centre', portal: 'Bayanat (bayanat.ae)', url: 'https://bayanat.ae/en/Datasets/Dataset-info?id=SPineUQC-jJj32JHqshQ_NkgTg-M0TG0bpBucVBkcOg', format: 'XLSX (bundled)', coverage: 'Monthly ' + monthly[0][0] + '-' + monthly[0][1] + ' → ' + monthly[monthly.length - 1][0] + '-' + monthly[monthly.length - 1][1] + '; daily Jan-1998 → Apr-2023', updated: 'file metadata 2026-04-27', used_for: 'Fog-impact study (daily movements × OMDB fog days); seasonality vs fog season', status: 'used' },
    { title: 'Number of Fog Days by Station and Month', publisher: 'Federal Competitiveness & Statistics Centre (NCM data)', portal: 'Bayanat (bayanat.ae)', url: 'https://bayanat.ae/en/Datasets/Dataset-info?id=X0y7KIXasWuUW8i-lEmNURZJOAEuilU1t-3RBP1zkOs', format: 'XLSX (2017 only; download host offline)', coverage: '2017, 6 airport stations', updated: '03/01/2019', used_for: 'Cross-check of METAR-derived fog climatology (Jan-2017: Dubai 1 fog day, Abu Dhabi 6)', status: 'reference' },
    { title: 'OMDB / OMAA / OMDW METAR history', publisher: 'Iowa Environmental Mesonet (ASOS/METAR archive)', portal: 'mesonet.agron.iastate.edu', url: 'https://mesonet.agron.iastate.edu/request/download.phtml', format: 'CSV', coverage: '2015–2025, half-hourly', updated: '—', used_for: 'Training the fog nowcast model; fog-day detection', status: 'used' },
    { title: 'Open-Meteo current weather (UAE airports)', publisher: 'Open-Meteo', portal: 'api.open-meteo.com', url: 'https://open-meteo.com/', format: 'JSON API (CORS-enabled)', coverage: 'live', updated: 'live', used_for: 'Live weather feed in the browser', status: 'used' },
    { title: 'Live METAR + ADS-B snapshots', publisher: 'aviationweather.gov · OpenSky Network', portal: 'GitHub Action → data/live/*.json', url: 'https://aviationweather.gov/data/api/', format: 'JSON (scheduled snapshot, no CORS)', coverage: 'every 30 min', updated: 'scheduled', used_for: 'Live METAR text and real traffic over the UAE', status: 'used' }
  ],
  movements, passengers, intlMonthly: monthly,
  fog: { station: 'OMDB', years: [...yearsSeen].sort(), fogDaysByMonth, fogDaysPerYear },
  fogImpact,
  headline: [
    { label: 'Aircraft movements, Dubai (2023)', value: (movements.emirates.Dubai ? movements.emirates.Dubai.total[movements.years.indexOf(2023)] : null), source: 'GCAA via Bayanat' },
    { label: 'Passengers, UAE total (2023)', value: Object.values(passengers.emirates).reduce((a, e) => a + (e.total[passengers.years.indexOf(2023)] || 0), 0), source: 'GCAA via Bayanat' },
    { label: 'International movements, UAE (2025)', value: monthly.filter((r) => r[0] === 2025).reduce((a, r) => a + r[2] + r[3], 0), source: 'GCAA via Bayanat' },
    { label: 'DXB passengers (2025)', value: 95200000, source: 'Dubai Media Office, 11 Feb 2026', url: 'https://mediaoffice.ae/en/news/2026/february/11-02/dxb-sets-new-global' },
    { label: 'DXB movements (2025)', value: 454800, source: 'Dubai Media Office, 11 Feb 2026', url: 'https://mediaoffice.ae/en/news/2026/february/11-02/dxb-sets-new-global' }
  ],
  events: [
    { date: '2025-11-20', text: '19 inbound DXB flights diverted by 09:00 due to fog', source: 'Gulf News', url: 'https://gulfnews.com/business/aviation/19-inbound-flights-diverted-as-fog-causes-flight-disruptions-at-dubai-international-airport-1.500353607' },
    { date: '2026-01-03', text: '23 inbound diversions (21 DXB, 2 DWC); flydubai cancellations and delays', source: 'Khaleej Times', url: 'https://www.khaleejtimes.com/business/aviation/23-inbound-flights-diverted-dubai-airports-fog-jan-3-morning' }
  ]
};
const js = '/* AUTO-GENERATED by tools/build_opendata.cjs on ' + out.builtAt + ' — official UAE open data (GCAA via Bayanat, CC BY-SA 4.0) + OMDB METAR. Do not edit by hand. */\nwindow.FA = window.FA || {};\nFA.openData = ' + JSON.stringify(out) + ';\n';
fs.writeFileSync(path.join(ROOT, 'js', 'opendata.js'), js);
console.log('wrote js/opendata.js', (js.length / 1024).toFixed(1) + ' KB');
console.log('fog days/yr', fogDaysPerYear, 'byMonth', fogDaysByMonth);
console.log('fogImpact', JSON.stringify(fogImpact, null, 1).slice(0, 1600));
