/* FalconAero — tiny dependency-free SVG chart kit (works offline). */
(function (FA) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const C = {
    grid: '#1e3150', axis: '#2a4268', text: '#8ea3c4', dim: '#5f7598',
    palette: ['#26c6da', '#e2b04a', '#66bb6a', '#ef5350', '#b388ff', '#4fc3f7', '#ff8a65', '#90a4ae']
  };

  function svg(w, h, inner, cls) {
    return '<svg class="' + (cls || '') + '" viewBox="0 0 ' + w + ' ' + h + '" width="100%" preserveAspectRatio="xMidYMid meet" xmlns="' + NS + '" style="display:block;max-height:' + h * 1.2 + 'px">' + inner + '</svg>';
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  const fmtN = (v) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1) + 'k' : Math.abs(v) < 10 && v % 1 ? v.toFixed(1) : Math.round(v));

  /** radar(series:[{name,color,values:[0..100]}], axes:[string]) */
  function radar(axes, series, opt) {
    opt = opt || {};
    const W = opt.w || 440, H = opt.h || 360, cx = W / 2, cy = H / 2 + 6, R = Math.min(W, H) / 2 - 52;
    const n = axes.length;
    const pt = (i, r) => [cx + Math.sin((2 * Math.PI * i) / n) * r, cy - Math.cos((2 * Math.PI * i) / n) * r];
    let g = '';
    [0.25, 0.5, 0.75, 1].forEach((k) => {
      g += '<polygon points="' + axes.map((_, i) => pt(i, R * k).join(',')).join(' ') + '" fill="none" stroke="' + C.grid + '"/>';
    });
    axes.forEach((a, i) => {
      const [x, y] = pt(i, R);
      const [lx, ly] = pt(i, R + 22);
      g += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x + '" y2="' + y + '" stroke="' + C.grid + '"/>';
      g += '<text x="' + lx + '" y="' + (ly + 4) + '" fill="' + C.text + '" font-size="11.5" font-weight="600" text-anchor="middle">' + esc(a) + '</text>';
    });
    series.forEach((s) => {
      const pts = s.values.map((v, i) => pt(i, (R * Math.max(2, v)) / 100).join(',')).join(' ');
      g += '<polygon points="' + pts + '" fill="' + s.color + '" fill-opacity="' + (s.fill != null ? s.fill : 0.12) + '" stroke="' + s.color + '" stroke-width="' + (s.width || 2) + '"' + (s.dash ? ' stroke-dasharray="5 4"' : '') + '/>';
    });
    let lg = '';
    series.forEach((s, i) => {
      lg += '<rect x="' + (10 + i * (W - 20) / series.length) + '" y="' + (H - 14) + '" width="10" height="10" rx="2" fill="' + s.color + '"/><text x="' + (24 + i * (W - 20) / series.length) + '" y="' + (H - 5) + '" fill="' + C.text + '" font-size="11">' + esc(s.name) + '</text>';
    });
    return svg(W, H, g + lg);
  }

  /** bars(data:[{label, values:[..]}], seriesNames, opt) — grouped vertical bars */
  function bars(data, names, opt) {
    opt = opt || {};
    const W = opt.w || 560, H = opt.h || 240, L = 44, B = 34, T = 14, Rr = 10;
    const colors = opt.colors || C.palette;
    const maxV = niceMax(opt.max || Math.max(...data.flatMap((d) => d.values), 0.0001));
    const gw = (W - L - Rr) / data.length, bw = Math.min(26, (gw * 0.75) / names.length);
    let g = '';
    for (let k = 0; k <= 4; k++) {
      const y = T + ((H - T - B) * k) / 4;
      g += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + y + '" y2="' + y + '" stroke="' + C.grid + '"/><text x="' + (L - 6) + '" y="' + (y + 4) + '" fill="' + C.dim + '" font-size="10" text-anchor="end">' + fmtN(maxV * (1 - k / 4)) + '</text>';
    }
    data.forEach((d, i) => {
      const x0 = L + gw * i + (gw - bw * names.length) / 2;
      d.values.forEach((v, j) => {
        const h = ((H - T - B) * v) / maxV;
        g += '<rect x="' + (x0 + j * bw) + '" y="' + (H - B - h) + '" width="' + (bw - 3) + '" height="' + Math.max(0, h) + '" rx="3" fill="' + (d.colors ? d.colors[j] : colors[j % colors.length]) + '"><title>' + esc(names[j] + ': ' + fmtN(v)) + '</title></rect>';
        if (opt.labels) g += '<text x="' + (x0 + j * bw + (bw - 3) / 2) + '" y="' + (H - B - h - 4) + '" fill="' + C.text + '" font-size="9.5" text-anchor="middle">' + fmtN(v) + '</text>';
      });
      g += '<text x="' + (L + gw * i + gw / 2) + '" y="' + (H - B + 15) + '" fill="' + C.text + '" font-size="10.5" text-anchor="middle">' + esc(d.label) + '</text>';
    });
    if (names.length > 1 && !opt.noLegend) {
      names.forEach((n, j) => { g += '<rect x="' + (L + j * 130) + '" y="' + (H - 12) + '" width="10" height="10" rx="2" fill="' + colors[j % colors.length] + '"/><text x="' + (L + 14 + j * 130) + '" y="' + (H - 3) + '" fill="' + C.text + '" font-size="10.5">' + esc(n) + '</text>'; });
    }
    return svg(W, H, g);
  }

  /** hbars(rows:[{label, value, color?, note?}], opt) */
  function hbars(rows, opt) {
    opt = opt || {};
    const W = opt.w || 520, rowH = opt.rowH || 24, L = opt.labelW || 150, H = rows.length * rowH + 8;
    const maxV = opt.max || Math.max(...rows.map((r) => r.value), 0.0001);
    let g = '';
    rows.forEach((r, i) => {
      const y = 4 + i * rowH, w = ((W - L - 60) * r.value) / maxV;
      g += '<text x="' + (L - 8) + '" y="' + (y + rowH / 2 + 4) + '" fill="' + C.text + '" font-size="11" text-anchor="end">' + esc(r.label) + '</text>';
      g += '<rect x="' + L + '" y="' + (y + 4) + '" width="' + (W - L - 60) + '" height="' + (rowH - 9) + '" rx="4" fill="rgba(255,255,255,.04)"/>';
      g += '<rect x="' + L + '" y="' + (y + 4) + '" width="' + Math.max(1, w) + '" height="' + (rowH - 9) + '" rx="4" fill="' + (r.color || C.palette[0]) + '"/>';
      g += '<text x="' + (L + Math.max(1, w) + 6) + '" y="' + (y + rowH / 2 + 4) + '" fill="#e6eefb" font-size="11" font-family="JetBrains Mono, monospace">' + esc(r.note != null ? r.note : fmtN(r.value)) + '</text>';
    });
    return svg(W, H, g);
  }

  /** line(series:[{name,color,points:[[x,y]...], band?:[[x,lo,hi]], dash?}], opt:{xLabel, yLabel, xFmt, yMax, yMin, marks:[{x,label,color}], hlines:[{y,label,color}]}) */
  function line(series, opt) {
    opt = opt || {};
    const W = opt.w || 560, H = opt.h || 220, L = opt.L || 42, B = 28, T = 12, Rr = 12;
    const xs = series.flatMap((s) => s.points.map((p) => p[0]));
    const ys = series.flatMap((s) => s.points.map((p) => p[1]).concat((s.band || []).map((b) => b[2])));
    const x0 = opt.xMin != null ? opt.xMin : Math.min(...xs), x1 = opt.xMax != null ? opt.xMax : Math.max(...xs);
    const y0 = opt.yMin != null ? opt.yMin : 0, y1 = opt.yMax != null ? opt.yMax : niceMax(Math.max(...ys, 0.0001));
    const X = (x) => L + ((W - L - Rr) * (x - x0)) / (x1 - x0 || 1);
    const Y = (y) => T + (H - T - B) * (1 - (y - y0) / (y1 - y0 || 1));
    let g = '';
    for (let k = 0; k <= 4; k++) {
      const v = y0 + ((y1 - y0) * k) / 4;
      g += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="' + C.grid + '"/><text x="' + (L - 6) + '" y="' + (Y(v) + 4) + '" fill="' + C.dim + '" font-size="10" text-anchor="end">' + (opt.yFmt ? opt.yFmt(v) : fmtN(v)) + '</text>';
    }
    const nT = opt.xTicks || 6;
    for (let k = 0; k <= nT; k++) {
      const v = x0 + ((x1 - x0) * k) / nT;
      g += '<text x="' + X(v) + '" y="' + (H - B + 15) + '" fill="' + C.dim + '" font-size="10" text-anchor="middle">' + (opt.xFmt ? opt.xFmt(v) : fmtN(v)) + '</text>';
    }
    (opt.hlines || []).forEach((h) => { g += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + Y(h.y) + '" y2="' + Y(h.y) + '" stroke="' + (h.color || C.axis) + '" stroke-dasharray="4 4"/><text x="' + (W - Rr - 2) + '" y="' + (Y(h.y) - 4) + '" fill="' + (h.color || C.text) + '" font-size="10" text-anchor="end">' + esc(h.label || '') + '</text>'; });
    (opt.bands || []).forEach((b) => { g += '<rect x="' + X(b.x0) + '" y="' + T + '" width="' + Math.max(0, X(b.x1) - X(b.x0)) + '" height="' + (H - T - B) + '" fill="' + (b.color || 'rgba(255,179,0,.08)') + '"/>' + (b.label ? '<text x="' + (X(b.x0) + 4) + '" y="' + (T + 12) + '" fill="' + (b.textColor || '#ffd54f') + '" font-size="10">' + esc(b.label) + '</text>' : ''); });
    series.forEach((s) => {
      if (s.band && s.band.length) {
        const up = s.band.map((b) => X(b[0]) + ',' + Y(b[2])).join(' ');
        const dn = s.band.slice().reverse().map((b) => X(b[0]) + ',' + Y(b[1])).join(' ');
        g += '<polygon points="' + up + ' ' + dn + '" fill="' + s.color + '" fill-opacity=".14"/>';
      }
      if (s.area) {
        g += '<polygon points="' + X(s.points[0][0]) + ',' + Y(y0) + ' ' + s.points.map((p) => X(p[0]) + ',' + Y(p[1])).join(' ') + ' ' + X(s.points[s.points.length - 1][0]) + ',' + Y(y0) + '" fill="' + s.color + '" fill-opacity=".15"/>';
      }
      g += '<polyline points="' + s.points.map((p) => X(p[0]) + ',' + Y(p[1])).join(' ') + '" fill="none" stroke="' + s.color + '" stroke-width="' + (s.width || 2) + '"' + (s.dash ? ' stroke-dasharray="5 4"' : '') + ' stroke-linejoin="round"/>';
    });
    (opt.marks || []).forEach((m) => { g += '<line x1="' + X(m.x) + '" x2="' + X(m.x) + '" y1="' + T + '" y2="' + (H - B) + '" stroke="' + (m.color || '#fff') + '" stroke-width="1.5"' + (m.dash ? ' stroke-dasharray="3 3"' : '') + '/>' + (m.label ? '<text x="' + (X(m.x) + 4) + '" y="' + (T + 10) + '" fill="' + (m.color || '#fff') + '" font-size="10">' + esc(m.label) + '</text>' : ''); });
    if (series.length > 1 && !opt.noLegend) {
      let lx = L;
      series.forEach((s) => { if (!s.name) return; g += '<rect x="' + lx + '" y="' + (H - 11) + '" width="10" height="3" fill="' + s.color + '"/><text x="' + (lx + 14) + '" y="' + (H - 6) + '" fill="' + C.text + '" font-size="10">' + esc(s.name) + '</text>'; lx += 26 + s.name.length * 6; });
    }
    return svg(W, H, g);
  }

  /** gauge(p 0..1, label) — semicircle-ish ring gauge */
  function gauge(p, label, color) {
    const R = 34, c = 2 * Math.PI * R, v = Math.max(0, Math.min(1, p));
    color = color || (v > 0.66 ? '#ef5350' : v > 0.33 ? '#ffb300' : '#66bb6a');
    return '<svg class="gauge" viewBox="0 0 84 84"><circle cx="42" cy="42" r="' + R + '" fill="none" stroke="#1e3150" stroke-width="8"/><circle cx="42" cy="42" r="' + R + '" fill="none" stroke="' + color + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + (c * v) + ' ' + c + '" transform="rotate(-90 42 42)"/><text x="42" y="44" text-anchor="middle" fill="#fff" font-size="17" font-weight="800" font-family="JetBrains Mono, monospace">' + Math.round(v * 100) + '%</text><text x="42" y="58" text-anchor="middle" fill="#8ea3c4" font-size="8.5">' + esc(label || '') + '</text></svg>';
  }

  /** donut(parts:[{label,value,color}]) */
  function donut(parts, center) {
    const R = 46, c = 2 * Math.PI * R, tot = parts.reduce((a, p) => a + p.value, 0) || 1;
    let off = 0, g = '';
    parts.forEach((p) => { const len = (c * p.value) / tot; g += '<circle cx="60" cy="60" r="' + R + '" fill="none" stroke="' + p.color + '" stroke-width="16" stroke-dasharray="' + len + ' ' + c + '" stroke-dashoffset="' + -off + '" transform="rotate(-90 60 60)"><title>' + esc(p.label + ': ' + p.value) + '</title></circle>'; off += len; });
    return '<svg viewBox="0 0 120 120" width="120" height="120">' + g + '<text x="60" y="64" text-anchor="middle" fill="#fff" font-size="16" font-weight="800" font-family="JetBrains Mono, monospace">' + esc(center || '') + '</text></svg>';
  }

  FA.charts = { svg, radar, bars, hbars, line, gauge, donut, niceMax, fmtN, C, esc };
})(window.FA);
