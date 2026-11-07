// Downloads historical METARs from the Iowa Environmental Mesonet (IEM) ASOS/AWOS/METAR archive.
// Usage: node tools/fetch_metars.mjs [STATION ...]   (default: OMDB OMAA OMDW)
// Output: data/raw/<STATION>_<YEAR>.csv.gz  (gzip-compressed IEM "onlycomma" CSV)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'raw');
fs.mkdirSync(OUT, { recursive: true });
const stations = process.argv.slice(2).length ? process.argv.slice(2) : ['OMDB', 'OMAA', 'OMDW'];
const Y1 = 2015, Y2 = 2025;

export function iemUrl(station, y1, y2) {
  const p = new URLSearchParams();
  p.append('station', station);
  for (const d of ['tmpc', 'dwpc', 'relh', 'sknt', 'drct', 'vsby', 'wxcodes', 'metar']) p.append('data', d);
  Object.entries({ year1: y1, month1: 1, day1: 1, year2: y2 + 1, month2: 1, day2: 1, tz: 'Etc/UTC',
    format: 'onlycomma', latlon: 'no', missing: 'M', trace: 'T', direct: 'no' }).forEach(([k, v]) => p.append(k, v));
  p.append('report_type', '3'); p.append('report_type', '4');
  return 'https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?' + p.toString();
}

async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.text();
      console.warn('HTTP', r.status, 'retrying');
    } catch (e) { console.warn('fetch error', e.message); }
    await new Promise(r => setTimeout(r, 5000 * (i + 1)));
  }
  throw new Error('failed ' + url);
}

for (const st of stations) {
  for (let y = Y1; y <= Y2; y++) {
    const f = path.join(OUT, `${st}_${y}.csv.gz`);
    if (fs.existsSync(f)) { console.log('skip', f); continue; }
    const url = iemUrl(st, y, y);
    const t0 = Date.now();
    const txt = await get(url);
    const n = txt.split('\n').filter(l => l.trim()).length - 1;
    fs.writeFileSync(f, zlib.gzipSync(txt, { level: 9 }));
    console.log(st, y, n, 'rows', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }
}
