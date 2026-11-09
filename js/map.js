/* FalconAero — airport digital twin map (SVG) + aircraft kinematics derived from the active plan. */
(function (FA) {
  'use strict';
  const D = FA.data, E = FA.engine, G = D.G;
  const NS = 'http://www.w3.org/2000/svg';
  const PLANE = 'M10 0 L4 -1.3 L-0.5 -7.5 L-2.8 -7.5 L-0.8 -1.3 L-6.5 -1.3 L-8.6 -3.8 L-10 -3.8 L-8.7 0 L-10 3.8 L-8.6 3.8 L-6.5 1.3 L-0.8 1.3 L-2.8 7.5 L-0.5 7.5 L4 1.3 Z';
  const SCALE = { J: 1.3, H: 1.05, M: 0.85 };
  let svg, gStatic, gStands, gFx, gRoute, gAc, fogLayer, sandLayer, closureLayer, mixedLayer;
  const pool = new Map();
  let poolPlan = null;
  const standEls = new Map();

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

  /* ---------------- static airport ---------------- */
  function drawStatic() {
    svg.innerHTML = '';
    const defs = el('defs', {}, svg);
    defs.innerHTML =
      '<linearGradient id="bgG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1626"/><stop offset="1" stop-color="#08111d"/></linearGradient>' +
      '<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#0f1d33" stroke-width="1"/></pattern>' +
      '<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#3a1418"/><line x1="0" y1="0" x2="0" y2="6" stroke="#ef5350" stroke-width="2"/></pattern>' +
      '<filter id="blur12"><feGaussianBlur stdDeviation="14"/></filter>' +
      '<filter id="glow"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '<radialGradient id="fogR" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#dfe7ef" stop-opacity=".9"/><stop offset="1" stop-color="#dfe7ef" stop-opacity="0"/></radialGradient>';
    el('rect', { x: 0, y: 0, width: G.W, height: G.H, fill: 'url(#bgG)' }, svg);
    el('rect', { x: 0, y: 0, width: G.W, height: G.H, fill: 'url(#grid)' }, svg);
    gStatic = el('g', {}, svg);

    // apron surface
    el('rect', { x: 190, y: 190, width: 905, height: 355, rx: 14, fill: '#0d1a2c', stroke: '#152741' }, gStatic);

    // taxiways
    const twy = (pts, w) => {
      const d = 'M' + pts.map((p) => p.join(',')).join(' L');
      el('path', { d, stroke: '#1a2a44', 'stroke-width': w || 11, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, gStatic);
      el('path', { d, stroke: '#c9a227', 'stroke-width': 1, fill: 'none', opacity: 0.45, 'stroke-dasharray': '6 5' }, gStatic);
    };
    twy([[G.rwyN.x1, G.twyN], [G.rwyN.x2, G.twyN]]);
    twy([[G.holdS.x, G.twyS], [G.rwyS.x2, G.twyS]]);
    twy([[G.holdS.x, G.twyS], [G.holdS.x, G.rwyS.y]], 9);
    G.connectors.forEach((x) => twy([[x, G.twyN], [x, G.twyS]]));
    [G.lanes.L1, G.lanes.L2, G.lanes.L3].forEach((y) => twy([[G.connectors[0], y], [1090, y]], 9));
    G.exitsN.forEach((x) => { twy([[x - 30, G.rwyN.y], [x, G.twyN]], 8); twy([[x - 30, G.rwyS.y], [x, G.twyS]], 8); });

    // runways
    const rwy = (r, label, role) => {
      el('rect', { x: r.x1, y: r.y - 11, width: r.x2 - r.x1, height: 22, rx: 3, fill: '#1c2433', stroke: '#33435e' }, gStatic);
      el('line', { x1: r.x1 + 70, x2: r.x2 - 70, y1: r.y, y2: r.y, stroke: '#e8eef8', 'stroke-width': 1.4, 'stroke-dasharray': '16 12', opacity: 0.7 }, gStatic);
      for (let i = 0; i < 6; i++) {
        el('rect', { x: r.x1 + 8, y: r.y - 9 + i * 3.3, width: 16, height: 1.8, fill: '#e8eef8', opacity: 0.8 }, gStatic);
        el('rect', { x: r.x2 - 24, y: r.y - 9 + i * 3.3, width: 16, height: 1.8, fill: '#e8eef8', opacity: 0.8 }, gStatic);
      }
      // approach lights
      for (let i = 1; i <= 6; i++) el('circle', { cx: r.x1 - i * 14, cy: r.y, r: 1.8, fill: '#ffe082', opacity: 0.9 - i * 0.12, class: 'pulse' }, gStatic);
      const [a, b] = label.split('/');
      el('text', { x: r.x1 + 34, y: r.y + 4, class: 'rwy-lbl', 'text-anchor': 'start' }, gStatic).textContent = a;
      el('text', { x: r.x2 - 34, y: r.y + 4, class: 'rwy-lbl', 'text-anchor': 'end' }, gStatic).textContent = b;
      el('text', { x: (r.x1 + r.x2) / 2, y: r.y + (r === G.rwyN ? -18 : 28), fill: '#5f7598', 'font-size': 11, 'font-weight': 700, 'text-anchor': 'middle', 'letter-spacing': '.12em' }, gStatic).textContent = 'RWY ' + label + ' · ' + role;
    };
    rwy(G.rwyN, '12L/30R', 'PRIMARY ARRIVALS');
    rwy(G.rwyS, '12R/30L', 'PRIMARY DEPARTURES');
    const hit = el('rect', { x: G.rwyN.x1, y: G.rwyN.y - 14, width: G.rwyN.x2 - G.rwyN.x1, height: 28, fill: 'transparent', style: 'cursor:pointer' }, gStatic);
    el('title', {}, hit).textContent = 'Runway 12L/30R · click to close for 45 min';
    hit.addEventListener('click', (e) => { e.stopPropagation(); FA.app.toggleRunway(); });

    // holding stacks
    G.holdStacks.forEach((s) => {
      el('circle', { cx: s.x, cy: s.y, r: 26, fill: 'none', stroke: '#ffb300', 'stroke-opacity': 0.35, 'stroke-dasharray': '4 4' }, gStatic);
      el('text', { x: s.x, y: s.y + 40, fill: '#9c7a2a', 'font-size': 9, 'text-anchor': 'middle', 'font-weight': 700 }, gStatic).textContent = s.name;
    });
    el('text', { x: G.holdS.x - 6, y: G.holdS.y - 12, fill: '#5f7598', 'font-size': 9, 'text-anchor': 'end' }, gStatic).textContent = 'HOLD';

    // piers
    D.PIERS.forEach((p) => {
      if (p.id !== 'R') el('rect', { x: p.x1, y: p.y - 14, width: p.x2 - p.x1, height: 28, rx: 6, fill: p.contact ? '#1a2d4b' : 'none', stroke: '#36507a' }, gStatic);
      el('text', { x: (p.x1 + p.x2) / 2, y: p.y + 4, class: 'pier-lbl', 'text-anchor': 'middle' }, gStatic).textContent = p.label;
    });

    // stands
    gStands = el('g', {}, svg);
    standEls.clear();
    const inst = FA.state.inst;
    inst.stands.forEach((s) => {
      const g = el('g', { 'data-stand': s.id, style: 'cursor:pointer' }, gStands);
      g.addEventListener('click', (e) => { e.stopPropagation(); FA.app.toggleStand(s.id); });
      el('title', {}, g).textContent = 'Stand ' + s.id + ' (Code ' + s.code + ') · click to mark unavailable';
      if (s.contact) el('line', { x1: s.x, y1: s.side === 'top' ? s.y + 9 : s.y - 9, x2: s.x, y2: s.side === 'top' ? s.y + 24 : s.y - 24, stroke: '#2b4166', 'stroke-width': 3 }, g);
      const w = s.code === 'F' ? 30 : s.code === 'E' ? 26 : 20;
      const r = el('rect', { x: s.x - w / 2, y: s.y - 10, width: w, height: 20, rx: 3, class: 'stand-rect', fill: '#0f1b2f' }, g);
      el('text', { x: s.x, y: s.side === 'top' ? s.y - 13 : s.y + 19, class: 'stand-lbl', 'text-anchor': 'middle' }, g).textContent = s.id + (s.code === 'F' ? '·F' : '');
      standEls.set(s.id, r);
    });

    // weather & event layers
    gFx = el('g', { 'pointer-events': 'none' }, svg);
    fogLayer = el('g', { opacity: 0 }, gFx);
    el('rect', { x: 0, y: 0, width: G.W, height: G.H, fill: '#cfd8e3', opacity: 0.2 }, fogLayer);
    for (let i = 0; i < 9; i++) {
      el('ellipse', { cx: 80 + i * 135, cy: 120 + (i % 3) * 220, rx: 190, ry: 90, fill: 'url(#fogR)', opacity: 0.38, class: 'fogcloud', style: 'animation-delay:-' + i * 2 + 's' }, fogLayer);
    }
    sandLayer = el('g', { opacity: 0 }, gFx);
    el('rect', { x: 0, y: 0, width: G.W, height: G.H, fill: '#c98a3a', opacity: 0.28 }, sandLayer);
    closureLayer = el('g', { opacity: 0 }, gFx);
    for (let x = G.rwyN.x1 + 120; x < G.rwyN.x2 - 60; x += 160) {
      el('path', { d: 'M' + (x - 12) + ' ' + (G.rwyN.y - 10) + ' L' + (x + 12) + ' ' + (G.rwyN.y + 10) + ' M' + (x + 12) + ' ' + (G.rwyN.y - 10) + ' L' + (x - 12) + ' ' + (G.rwyN.y + 10), stroke: '#ef5350', 'stroke-width': 4 }, closureLayer);
    }
    mixedLayer = el('g', { opacity: 0 }, gFx);
    el('rect', { x: G.rwyS.x1, y: G.rwyS.y - 13, width: G.rwyS.x2 - G.rwyS.x1, height: 26, rx: 4, fill: 'none', stroke: '#26c6da', 'stroke-width': 2, 'stroke-dasharray': '8 5', filter: 'url(#glow)' }, mixedLayer);
    el('text', { x: G.rwyS.x2 - 10, y: G.rwyS.y - 18, fill: '#7ff1ff', 'font-size': 10, 'font-weight': 800, 'text-anchor': 'end' }, mixedLayer).textContent = 'MIXED MODE — ARRIVALS + DEPARTURES';

    gRoute = el('g', {}, svg);
    gAc = el('g', {}, svg);
    // compass
    const cg = el('g', { transform: 'translate(1160,668)' }, svg);
    el('path', { d: 'M0 -14 L5 4 L0 0 L-5 4 Z', fill: '#8ea3c4' }, cg);
    el('text', { x: 0, y: -18, fill: '#8ea3c4', 'font-size': 9, 'text-anchor': 'middle' }, cg).textContent = 'N';
    el('text', { x: 14, y: 692, fill: '#3f5577', 'font-size': 10 }, svg).textContent = 'OMDB · Dubai International — stylised digital twin (not to scale) · synthetic traffic';
    pool.clear(); poolPlan = null;
  }

  /* ---------------- kinematics ---------------- */
  function orbit(stack, t, id) {
    const ph = (hash(id) % 360) * Math.PI / 180;
    const ang = ph + t * 1.6;
    const r = 18 + (hash(id) % 3) * 5;
    return { x: stack.x + Math.cos(ang) * r, y: stack.y + Math.sin(ang) * r * 0.6, a: ang + Math.PI / 2 };
  }
  function lerp(a, b, k) { return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, a: Math.atan2(b.y - a.y, b.x - a.x) }; }

  function arrivalState(plan, s, t) {
    const f = s.f, inst = plan.inst;
    const a = plan.allocById.get(f.id);
    const ry = s.rwy === 'S' ? G.rwyS.y : G.rwyN.y;
    const thr = { x: G.rwyN.x1 + 40, y: ry };
    const faf = { x: -40, y: ry };
    const stack = G.holdStacks[hash(f.id) % 2];
    const entry = { x: stack.x < 600 ? 20 + (hash(f.id) % 200) : 1180 - (hash(f.id) % 200), y: -30 };
    const st = { id: f.id, f, kind: 'arr', status: 'air' };
    const holdStart = f.eta - 7;
    if (t < f.eta - 12) return null;
    if (t < s.land - 4) {
      if (s.hold > 3 && t >= holdStart && t < s.land - 5) Object.assign(st, orbit(stack, t, f.id), { status: 'holding' });
      else if (s.hold > 3 && t >= s.land - 5) Object.assign(st, lerp(stack, faf, Math.min(1, t - (s.land - 5))), { status: 'holding' });
      else {
        const t0 = f.eta - 12, t1 = s.hold > 3 ? holdStart : s.land - 4;
        const k = Math.max(0, Math.min(1, (t - t0) / Math.max(0.5, t1 - t0)));
        Object.assign(st, lerp(entry, s.hold > 3 ? stack : faf, k));
      }
      return st;
    }
    if (t < s.land) { Object.assign(st, lerp(faf, thr, (t - (s.land - 4)) / 4), { status: 'final' }); return st; }
    if (!a) return null;
    const stand = E.standById(inst, a.stand);
    const mv = plan.moves && plan.moves.get(f.id);
    if (mv) {
      if (t < mv.tEnd) { const p = FA.taxi.at(mv, t); Object.assign(st, p, { status: p.holding ? 'hold-short' : t < mv.ts[1] ? 'rollout' : 'taxi-in', route: mv.pts }); return st; }
      if (t < a.onBlock) { const q = mv.pts[Math.max(0, mv.pts.length - 2)]; Object.assign(st, { x: q[0], y: q[1], a: 0 }, { status: 'waiting', route: mv.pts, conflict: plan.cfg.mode === 'baseline' }); return st; }
    }
    const route = E.routeIn(stand, s.rwy);
    const ti = a.taxiIn;
    if (!mv && t < s.land + ti) {
      const p = E.pointAt(route, (t - s.land) / ti);
      Object.assign(st, p, { status: 'taxi-in', route }); return st;
    }
    if (!mv && t < a.onBlock) {
      const p = E.pointAt(route, 0.93);
      Object.assign(st, p, { status: 'waiting', route, conflict: plan.cfg.mode === 'baseline' }); return st;
    }
    const turn = D.TYPES[f.type].turn;
    if (t < a.onBlock + turn) {
      Object.assign(st, { x: stand.x, y: stand.y, a: stand.side === 'top' ? Math.PI / 2 : -Math.PI / 2, status: 'parked' });
      return st;
    }
    return null;
  }

  function divertState(plan, d, t) {
    if (!d.reactive) return null;
    const f = d.f, stack = G.holdStacks[hash(f.id) % 2];
    const st = { id: f.id, f, kind: 'arr', status: 'diverting', alt: d.alt };
    if (t < f.eta - 12 || t > d.when + 5) return null;
    if (t < f.eta - 7) Object.assign(st, lerp({ x: 300, y: -30 }, stack, (t - (f.eta - 12)) / 5), { status: 'air' });
    else if (t < d.when) Object.assign(st, orbit(stack, t, f.id), { status: 'holding', lowFuel: t > d.when - 6 });
    else Object.assign(st, lerp(stack, { x: stack.x < 600 ? -60 : 1260, y: 260 }, (t - d.when) / 5));
    return st;
  }

  function departureState(plan, d, t, queueIdx) {
    const inst = plan.inst, f = d.f;
    const st = { id: f.id, f, kind: 'dep', status: 'parked' };
    const s0 = E.standById(inst, d.stand);
    const cur = d.towedTo ? E.standById(inst, d.towedTo) : s0;
    if (d.towedTo && t >= d.towAt && t < d.towAt + 12) {
      const path = [[s0.x, s0.y], [s0.x, s0.laneKey === 'L1' ? G.lanes.L1 : s0.lane], [cur.x, cur.laneKey === 'L1' ? G.lanes.L1 : cur.lane], [cur.x, cur.y]];
      Object.assign(st, E.pointAt(path, (t - d.towAt) / 12), { status: 'tow' });
      return st;
    }
    const at = d.towedTo && t >= d.towAt + 12 ? cur : s0;
    if (t < d.offBlock) { Object.assign(st, { x: at.x, y: at.y, a: at.side === 'top' ? Math.PI / 2 : -Math.PI / 2 }); return st; }
    const mvd = plan.moves && plan.moves.get(f.id);
    if (mvd && t < mvd.tEnd) { const p = FA.taxi.at(mvd, t); Object.assign(st, p, { status: p.holding ? 'hold-short' : 'taxi-out', route: mvd.pts }); return st; }
    const route = E.routeOut(at);
    const txo = d.taxiOut;
    if (!mvd && t < d.offBlock + txo) { Object.assign(st, E.pointAt(route, (t - d.offBlock) / txo), { status: 'taxi-out', route }); return st; }
    if (t < d.ttot - 0.7) {
      const qi = queueIdx.get(f.id) || 0;
      Object.assign(st, { x: G.holdS.x + 26 + qi * 24, y: G.twyS, a: Math.PI, status: 'queue' });
      return st;
    }
    if (t < d.ttot + 0.6) {
      const k = (t - (d.ttot - 0.7)) / 1.3;
      Object.assign(st, { x: G.holdS.x + 20 + k * k * 1050, y: G.rwyS.y - Math.max(0, k - 0.6) * 60, a: -Math.max(0, k - 0.6) * 0.3, status: 'takeoff' });
      return st;
    }
    return null;
  }

  function aircraftAt(plan, t) {
    const out = [];
    plan.seq.forEach((s) => { const st = arrivalState(plan, s, t); if (st) out.push(st); });
    plan.divs.forEach((d) => { const st = divertState(plan, d, t); if (st) out.push(st); });
    const q = plan.deps.filter((d) => t >= d.offBlock + d.taxiOut && t < d.ttot - 0.7).sort((a, b) => a.ttot - b.ttot);
    const qi = new Map(q.map((d, i) => [d.id, i]));
    plan.deps.forEach((d) => { const st = departureState(plan, d, t, qi); if (st) out.push(st); });
    return out;
  }

  /* ---------------- render ---------------- */
  function acColor(f) {
    if (f.airline === 'EK') return '#e2b04a';
    if (f.airline === 'FZ') return '#4fc3f7';
    return '#b0bec5';
  }

  function ensure(id, f) {
    let g = pool.get(id);
    if (g) return g;
    g = el('g', { class: 'ac', 'data-id': id }, gAc);
    el('circle', { r: 11, class: 'halo', fill: 'none', stroke: 'transparent', 'stroke-width': 2 }, g);
    const body = el('path', { d: PLANE, fill: acColor(f), stroke: '#06101e', 'stroke-width': 0.8 }, g);
    body.setAttribute('class', 'body');
    const tx = el('text', { x: 9, y: -9 }, g);
    tx.textContent = f.id;
    g.addEventListener('click', (e) => { e.stopPropagation(); FA.app.select(id); });
    pool.set(id, g);
    return g;
  }

  function render(t) {
    const S = FA.state;
    if (!S.inst || !svg) return;
    const plan = S.plans[(FA.map && FA.map.override && S.plans[FA.map.override]) ? FA.map.override : S.active];
    if (poolPlan !== plan) { gAc.innerHTML = ''; pool.clear(); poolPlan = plan; }
    const c = E.conditions(S.inst, t);
    // layers
    const sc = S.inst.scenario;
    let fog = 0;
    if (sc.lvp && sc.wx.start != null) {
      const s0 = sc.wx.start, s1 = sc.wx.end;
      fog = t < s0 - 15 || t > s1 + 10 ? 0 : t < s0 ? (t - (s0 - 15)) / 15 * 0.6 : t > s1 ? (1 - (t - s1) / 10) : 1;
    }
    fogLayer.setAttribute('opacity', Math.max(0, Math.min(1, fog)).toFixed(2));
    sandLayer.setAttribute('opacity', c.degraded ? 1 : 0);
    closureLayer.setAttribute('opacity', c.rwyNClosed ? 1 : 0);
    const mixed = (plan.mixedWins || []).some((w) => t >= w[0] && t < w[1]) || c.rwyNClosed;
    mixedLayer.setAttribute('opacity', mixed ? 1 : 0);

    // stands
    const waitingFor = new Set();
    const acs = aircraftAt(plan, t);
    acs.forEach((a) => { if (a.status === 'waiting' && a.conflict) { const al = plan.allocById.get(a.id); if (al) waitingFor.add(al.stand); if (a.f.origStand) waitingFor.add(a.f.origStand); } });
    plan.tl.forEach((ivs, id) => {
      const r = standEls.get(id); if (!r) return;
      const cur = ivs.find((iv) => t >= iv.start && t < iv.end);
      const out = cur && cur.kind === 'outage';
      r.setAttribute('fill', out ? 'url(#hatch)' : cur ? (cur.kind === 'arr' ? '#1f4a6e' : '#283a5c') : '#0f1b2f');
      r.setAttribute('stroke', waitingFor.has(id) ? '#ef5350' : out ? '#ef5350' : '#36507a');
      r.setAttribute('stroke-width', waitingFor.has(id) ? 2.5 : 1);
    });

    // aircraft
    const seen = new Set();
    const showLbl = document.getElementById('labelsToggle') ? document.getElementById('labelsToggle').checked : true;
    acs.forEach((a) => {
      seen.add(a.id);
      const g = ensure(a.id, a.f);
      g.style.display = '';
      const sc2 = SCALE[a.f.wake] || 1;
      g.setAttribute('transform', 'translate(' + a.x.toFixed(1) + ',' + a.y.toFixed(1) + ')');
      const body = g.querySelector('.body');
      body.setAttribute('transform', 'rotate(' + (a.a * 180 / Math.PI).toFixed(1) + ') scale(' + sc2 + ')');
      const halo = g.querySelector('.halo');
      let ring = 'transparent', dash = '';
      if (a.f.priority === 'mayday' || a.f.priority === 'medical') ring = '#ef5350';
      else if (a.status === 'diverting') ring = '#b388ff';
      else if (a.status === 'waiting' && a.conflict) ring = '#ef5350';
      else if (a.status === 'holding') ring = a.lowFuel ? '#ef5350' : '#ffb300';
      else if (a.status === 'tow') { ring = '#ffee58'; dash = '3 2'; }
      else if (a.status === 'hold-short') { ring = '#26c6da'; dash = '2 2'; }
      else if (a.f.priority === 'state') ring = '#e2b04a';
      if (S.selected === a.id) ring = '#ffffff';
      halo.setAttribute('stroke', ring);
      halo.setAttribute('stroke-dasharray', dash);
      halo.setAttribute('class', 'halo' + ((a.status === 'waiting' && a.conflict) || a.lowFuel ? ' pulse' : ''));
      const tx = g.querySelector('text');
      const moving = a.status !== 'parked';
      tx.style.display = (showLbl && (moving || S.selected === a.id)) ? '' : 'none';
      tx.textContent = a.f.id + (a.status === 'diverting' ? ' → ' + a.alt : a.status === 'holding' ? ' ⟳' : a.status === 'tow' ? ' 🚜' : a.status === 'hold-short' ? ' ⏸' : '');
    });
    pool.forEach((g, id) => { if (!seen.has(id)) g.style.display = 'none'; });

    // selected route
    gRoute.innerHTML = '';
    if (S.selected) {
      const a = acs.find((x) => x.id === S.selected);
      const al = plan.allocById.get(S.selected);
      const sq = plan.seqById.get(S.selected);
      const smv = plan.moves && plan.moves.get(S.selected);
      let route = (a && a.route) || (smv && smv.pts);
      if (!route && al && sq) route = E.routeIn(E.standById(S.inst, al.stand), sq.rwy);
      if (route) el('path', { d: 'M' + route.map((p) => p.join(',')).join(' L'), class: 'route' }, gRoute);
      if (al) { const s = E.standById(S.inst, al.stand); el('rect', { x: s.x - 18, y: s.y - 14, width: 36, height: 28, rx: 5, fill: 'none', stroke: '#00e5ff', 'stroke-width': 2, class: 'pulse' }, gRoute); }
    }

    // ground-movement conflicts (current practice) flash where and when they happen
    (plan.taxiConflicts || []).filter((c) => Math.abs(c.t - t) < 1.2).forEach((c) => {
      el('circle', { cx: c.x, cy: c.y, r: 13, fill: 'rgba(239,83,80,.25)', stroke: '#ef5350', 'stroke-width': 2, class: 'pulse' }, gRoute);
      el('text', { x: c.x, y: c.y + 4, fill: '#fff', 'font-size': 11, 'font-weight': 800, 'text-anchor': 'middle' }, gRoute).textContent = '!';
    });
    // banner
    const b = [];
    if (c.lvp) b.push('<span class="b lvp">LVP ACTIVE · CAT III · RVR ' + c.rvr + ' m</span>');
    if (c.degraded) b.push('<span class="b lvp">DUST / X-WIND · VIS ' + c.vis + ' m</span>');
    if (c.rwyNClosed) b.push('<span class="b red">RWY 12L/30R CLOSED</span>');
    else if (mixed) b.push('<span class="b cy">AI: 12R/30L MIXED MODE</span>');
    const waiting = acs.filter((a) => a.status === 'waiting' && a.conflict).length;
    if (waiting) b.push('<span class="b red">' + waiting + ' AIRCRAFT BLOCKED — STAND CONFLICT</span>');
    const tc = (plan.taxiConflicts || []).filter((c) => Math.abs(c.t - t) < 1.2).length;
    if (tc) b.push('<span class="b red">' + tc + ' TAXI CONFLICT' + (tc > 1 ? 'S' : '') + '</span>');
    const holding = acs.filter((a) => a.status === 'holding').length;
    if (holding >= 3) b.push('<span class="b lvp">' + holding + ' HOLDING</span>');
    document.getElementById('mapBanner').innerHTML = b.join('');
    FA.map.lastAircraft = acs;
  }

  FA.map = {
    init() {
      svg = document.getElementById('map');
      svg.addEventListener('click', () => FA.app.select(null));
      FA.bus.on('scenario', () => { drawStatic(); render(FA.state.t); });
      FA.bus.on('replan', () => render(FA.state.t));
      FA.bus.on('tick', (t) => { if (FA.state.view === 'ops' || FA.state.view === 'command') render(t); });
      FA.bus.on('approved', () => render(FA.state.t));
      FA.bus.on('generated', () => render(FA.state.t));
      FA.bus.on('select', () => render(FA.state.t));
      FA.bus.on('view', (v) => { if (v === 'ops' || v === 'command') render(FA.state.t); });
      document.getElementById('labelsToggle').addEventListener('change', () => render(FA.state.t));
    },
    render, aircraftAt, lastAircraft: [], override: null
  };
})(window.FA);
