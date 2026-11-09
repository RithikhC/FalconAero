/* FalconAero — taxiway network & ground-movement planner.
   The manoeuvring area is a connected graph (nodes = intersections / stand spurs, edges = taxiway segments).
   Current practice: fixed shortest routes, no deconfliction → head-on / crossing conflicts are detected.
   FalconAero: time-dependent Dijkstra with a reservation table (cooperative path-finding) →
   conflict-free routes that may pick another connector or hold short for a few seconds. */
(function (FA) {
  'use strict';
  const D = FA.data, G = D.G;
  const SAME_SEP = 0.35;  // min between two aircraft entering the same segment in the same direction
  const NODE_SEP = 0.2;   // min between two aircraft passing the same intersection
  const key = (x, y) => Math.round(x) + ',' + Math.round(y);

  /* ---------------- graph ---------------- */
  function buildGraph(stands) {
    const nodes = new Map(), edges = [];
    const node = (x, y, tag) => {
      const k = key(x, y);
      if (!nodes.has(k)) nodes.set(k, { k, x: Math.round(x), y: Math.round(y), adj: [], tag: tag || '' });
      const n = nodes.get(k);
      if (tag && !n.tag) n.tag = tag;
      return n;
    };
    const link = (a, b, cls) => {
      if (a === b || a.adj.some((x) => x.to === b)) return;
      const e = { id: a.k + '|' + b.k, a, b, len: Math.hypot(a.x - b.x, a.y - b.y), cls };
      a.adj.push({ e, to: b }); b.adj.push({ e, to: a }); edges.push(e);
    };
    const hline = (y, xs, cls) => { const s = [...new Set(xs.map(Math.round))].sort((p, q) => p - q); for (let i = 1; i < s.length; i++) link(node(s[i - 1], y), node(s[i], y), cls); };
    const vline = (x, ys, cls) => { const s = [...new Set(ys.map(Math.round))].sort((p, q) => p - q); for (let i = 1; i < s.length; i++) link(node(x, s[i - 1]), node(x, s[i]), cls); };
    const L = G.lanes, C = G.connectors, X = G.exitsN;
    const byLane = (lk) => stands.filter((s) => s.laneKey === lk).map((s) => s.x);
    hline(G.twyN, [G.rwyN.x1, 1090].concat(X, C, byLane('L1')), 'Taxiway N');
    hline(G.twyS, [G.holdS.x, 1090].concat(X, C), 'Taxiway S');
    hline(L.L1, [C[0], 1090].concat(C, byLane('L1')), 'Apron lane 1');
    hline(L.L2, [C[0], 1090].concat(C, byLane('L2')), 'Apron lane 2');
    hline(L.L3, [C[0], 1090].concat(C, byLane('L3')), 'Apron lane 3');
    C.forEach((x, i) => vline(x, [G.twyN, L.L1, L.L2, L.L3, G.twyS], 'Connector ' + 'WCE'[i]));
    stands.forEach((s) => {
      const st = node(s.x, s.y, 'stand:' + s.id);
      if (s.laneKey === 'L1') { link(node(s.x, G.twyN), node(s.x, L.L1), 'Apron lane 1'); link(node(s.x, L.L1), st, 'Stand ' + s.id); }
      else link(node(s.x, s.lane), st, 'Stand ' + s.id);
    });
    X.forEach((x) => {
      link(node(x - 30, G.rwyN.y, 'rwyN'), node(x, G.twyN), 'Exit ' + x);
      link(node(x - 30, G.rwyS.y, 'rwyS'), node(x, G.twyS), 'Exit ' + x);
    });
    vline(G.holdS.x, [G.twyS, G.holdS.y], 'Holding point');
    node(G.holdS.x, G.holdS.y, 'hold');
    return { nodes, edges, standNode: (s) => nodes.get(key(s.x, s.y)), hold: nodes.get(key(G.holdS.x, G.holdS.y)) };
  }

  /* ---------------- reservations ---------------- */
  function Reservations() { this.e = new Map(); this.n = new Map(); }
  Reservations.prototype.earliest = function (e, dir, tau, dur, v, id) {
    const er = this.e.get(e.id) || [], nr = this.n.get(v.k) || [];
    const checkNode = v.tag !== 'hold' && !/^rwy/.test(v.tag) && !/^stand/.test(v.tag);
    for (let it = 0; it < 40; it++) {
      let push = tau;
      er.forEach((r) => {
        if (r.id === id) return;
        if (r.dir !== dir && r.t0 < tau + dur && r.t1 > tau) push = Math.max(push, r.t1 + 0.01);
        if (r.dir === dir && Math.abs(r.t0 - tau) < SAME_SEP) push = Math.max(push, r.t0 + SAME_SEP);
      });
      if (checkNode) nr.forEach((r) => { if (r.id !== id && Math.abs(r.t - (tau + dur)) < NODE_SEP) push = Math.max(push, r.t + NODE_SEP - dur); });
      if (push <= tau + 1e-9) return tau;
      tau = push;
    }
    return tau;
  };
  Reservations.prototype.add = function (mv) {
    for (let i = 0; i < mv.segs.length; i++) {
      const s = mv.segs[i];
      if (!this.e.has(s.e.id)) this.e.set(s.e.id, []);
      this.e.get(s.e.id).push({ dir: s.dir, t0: s.t0, t1: s.t1, id: mv.id });
      if (!this.n.has(s.to.k)) this.n.set(s.to.k, []);
      this.n.get(s.to.k).push({ t: s.t1, id: mv.id });
    }
  };

  /* ---------------- time-dependent Dijkstra ---------------- */
  function route(graph, sources, target, speed, res, id) {
    const best = new Map(), prev = new Map(), open = [];
    sources.forEach((s) => { best.set(s.node.k, s.t); open.push({ n: s.node, t: s.t, pre: s.pre }); prev.set(s.node.k, { from: null, pre: s.pre }); });
    const done = new Set();
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].t < open[bi].t) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (done.has(cur.n.k)) continue;
      done.add(cur.n.k);
      if (cur.n === target) break;
      cur.n.adj.forEach(({ e, to }) => {
        if (done.has(to.k)) return;
        // stand spurs are dead ends: only enter the target stand
        if (/^stand/.test(to.tag) && to !== target) return;
        if (/^rwy/.test(to.tag) && to !== target) return;
        const dir = e.a === cur.n ? 1 : -1, dur = e.len / speed;
        const t0 = res ? res.earliest(e, dir, cur.t, dur, to, id) : cur.t;
        const t1 = t0 + dur + (t0 - cur.t > 8 ? 30 : 0); // discourage very long holds
        if (!best.has(to.k) || t1 < best.get(to.k)) {
          best.set(to.k, t1); prev.set(to.k, { from: cur.n, e, dir, t0, t1: t0 + dur });
          open.push({ n: to, t: t1 });
        }
      });
    }
    if (!prev.has(target.k)) return null;
    const segs = [];
    let k = target.k, startPre = null;
    while (prev.get(k) && prev.get(k).from) { const p = prev.get(k); segs.unshift({ e: p.e, dir: p.dir, from: p.from, to: graph.nodes.get(k), t0: p.t0, t1: p.t1 }); k = p.from.k; }
    startPre = prev.get(k).pre;
    return { segs, startNode: graph.nodes.get(k), pre: startPre };
  }

  function toPath(r, t0) {
    const pts = [], ts = [];
    if (r.pre) r.pre.forEach((p) => { pts.push([p[0], p[1]]); ts.push(p[2]); });
    let last = r.startNode;
    if (!pts.length) { pts.push([last.x, last.y]); ts.push(t0); }
    r.segs.forEach((s) => {
      const lt = ts[ts.length - 1];
      if (s.t0 > lt + 1e-6) { pts.push([s.from.x, s.from.y]); ts.push(s.t0); } // hold short
      pts.push([s.to.x, s.to.y]); ts.push(s.t1);
    });
    return { pts, ts };
  }

  /* ---------------- plan all ground movements ---------------- */
  function planMoves(plan) {
    const inst = plan.inst, E = FA.engine;
    const graph = inst._graph || (inst._graph = buildGraph(inst.stands));
    const smart = plan.cfg.mode === 'opt';
    const res = smart ? new Reservations() : null;
    const jobs = [];
    plan.alloc.forEach((a) => {
      const s = plan.seqById.get(a.id); if (!s) return;
      jobs.push({ id: a.id, kind: 'arr', t: s.land, a, s });
    });
    plan.deps.forEach((d) => jobs.push({ id: d.id, kind: 'dep', t: d.offBlock, d }));
    jobs.sort((x, y) => x.t - y.t);
    const moves = new Map(), all = [];
    let waitTot = 0, lenTot = 0, timeTot = 0;
    jobs.forEach((j) => {
      const speed = E.taxiSpeed(inst, j.t);
      let r;
      if (j.kind === 'arr') {
        const stand = E.standById(inst, j.a.stand), tgt = graph.standNode(stand);
        const ry = j.s.rwy === 'S' ? G.rwyS.y : G.rwyN.y, tag = j.s.rwy === 'S' ? 'rwyS' : 'rwyN';
        const td = G.rwyN.x1 + 40;
        const srcs = [];
        graph.nodes.forEach((n) => {
          if (n.tag !== tag) return;
          const roll = 0.4 + (n.x - td) / 650;      // landing roll to this exit
          if (n.x - td < 180) return;                // too short to vacate
          srcs.push({ node: n, t: j.s.land + roll, pre: [[td, ry, j.s.land]] });
        });
        if (!smart) { // current practice: published standard exit/route nearest the stand
          const ex = srcs.slice().sort((p, q) => Math.abs(p.node.x + 30 - stand.x) - Math.abs(q.node.x + 30 - stand.x))[0];
          r = route(graph, [ex], tgt, speed, null, j.id);
        } else r = route(graph, srcs, tgt, speed, res, j.id);
      } else {
        const sid = j.d.towedTo || j.d.stand, stand = E.standById(inst, sid);
        r = route(graph, [{ node: graph.standNode(stand), t: j.d.offBlock }], graph.hold, speed, res, j.id);
      }
      if (!r) return;
      const mv = Object.assign({ id: j.id, kind: j.kind, segs: r.segs }, toPath(r, j.t));
      mv.tStart = mv.ts[0]; mv.tEnd = mv.ts[mv.ts.length - 1];
      mv.len = r.segs.reduce((q, s) => q + s.e.len, 0);
      mv.wait = r.segs.reduce((q, s, i) => q + Math.max(0, s.t0 - (i ? r.segs[i - 1].t1 : s.t0)), 0);
      mv.route = [...new Set(r.segs.map((s) => s.e.cls).filter((c) => !/^Stand|^Exit/.test(c)))];
      if (res) res.add(mv);
      moves.set(j.id, mv); all.push(mv);
      waitTot += mv.wait; lenTot += mv.len; timeTot += mv.tEnd - (j.kind === 'arr' ? mv.ts[1] || mv.tStart : mv.tStart);
      // keep stand / runway timing consistent with the routed movement
      if (j.kind === 'arr') {
        const a = j.a, turn = D.TYPES[a.f.type].turn;
        const ob = Math.max(a.onBlock, mv.tEnd);
        if (ob !== a.onBlock) {
          const iv = (plan.tl.get(a.stand) || []).find((x) => x.kind === 'arr' && x.id === a.id);
          if (iv) { iv.start = ob; iv.end = ob + turn; }
          a.onBlock = ob;
        }
        a.taxiIn = mv.tEnd - j.s.land; a.wait = Math.max(0, a.onBlock - mv.tEnd);
      } else {
        const d = j.d;
        d.taxiOut = mv.tEnd - d.offBlock;
        if (d.ttot < mv.tEnd + 0.5) d.ttot = mv.tEnd + 0.5;
        d.queue = Math.max(0, d.ttot - mv.tEnd);
      }
    });
    plan.moves = moves;
    plan.taxiConflicts = detect(all);
    plan.taxiStats = { moves: all.length, avgTaxi: timeTot / Math.max(1, all.length), waitMin: waitTot, distKm: lenTot * 0.0042 };
    if (!smart) plan.taxiConflicts.forEach((c) => plan.conflicts.push({ type: 'taxi', id: c.a, msg: (c.type === 'head-on' ? 'Head-on conflict ' : c.type === 'crossing' ? 'Crossing conflict ' : 'Spacing conflict ') + c.a + ' / ' + c.b + ' on ' + c.where + ' at ' + D.fmt(c.t) }));
  }

  /* ---------------- conflict detection ---------------- */
  function detect(moves) {
    const byEdge = new Map(), byNode = new Map(), out = [], seen = new Set();
    moves.forEach((m) => m.segs.forEach((s) => {
      if (!byEdge.has(s.e.id)) byEdge.set(s.e.id, []);
      byEdge.get(s.e.id).push({ m, s });
      const n = s.to;
      if (n.tag === 'hold' || /^rwy|^stand/.test(n.tag)) return;
      if (!byNode.has(n.k)) byNode.set(n.k, []);
      byNode.get(n.k).push({ m, t: s.t1, n });
    }));
    const push = (a, b, type, where, t, x, y) => {
      const k = [a, b].sort().join('|') + type;
      if (seen.has(k)) return; seen.add(k);
      out.push({ a, b, type, where, t, x, y });
    };
    byEdge.forEach((list) => {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const p = list[i], q = list[j];
        if (p.m.id === q.m.id) continue;
        const ov = Math.min(p.s.t1, q.s.t1) - Math.max(p.s.t0, q.s.t0);
        const mx = (p.s.e.a.x + p.s.e.b.x) / 2, my = (p.s.e.a.y + p.s.e.b.y) / 2;
        if (p.s.dir !== q.s.dir && ov > 0.02) push(p.m.id, q.m.id, 'head-on', p.s.e.cls, Math.max(p.s.t0, q.s.t0), mx, my);
        else if (p.s.dir === q.s.dir && Math.abs(p.s.t0 - q.s.t0) < SAME_SEP * 0.5) push(p.m.id, q.m.id, 'spacing', p.s.e.cls, p.s.t0, mx, my);
      }
    });
    byNode.forEach((list) => {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const p = list[i], q = list[j];
        if (p.m.id !== q.m.id && Math.abs(p.t - q.t) < NODE_SEP * 0.5) push(p.m.id, q.m.id, 'crossing', 'intersection ' + p.n.k, p.t, p.n.x, p.n.y);
      }
    });
    return out.sort((a, b) => a.t - b.t);
  }

  /* ---------------- position along a timed path ---------------- */
  function at(mv, t) {
    const { pts, ts } = mv;
    if (t <= ts[0]) return { x: pts[0][0], y: pts[0][1], a: Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]), holding: false };
    for (let i = 1; i < ts.length; i++) {
      if (t <= ts[i]) {
        const p = pts[i - 1], q = pts[i], dt = ts[i] - ts[i - 1];
        const k = dt > 0 ? (t - ts[i - 1]) / dt : 1;
        const still = p[0] === q[0] && p[1] === q[1];
        let a = Math.atan2(q[1] - p[1], q[0] - p[0]);
        if (still && i > 1) a = Math.atan2(p[1] - pts[i - 2][1], p[0] - pts[i - 2][0]);
        return { x: p[0] + (q[0] - p[0]) * k, y: p[1] + (q[1] - p[1]) * k, a, holding: still };
      }
    }
    const n = pts.length - 1;
    return { x: pts[n][0], y: pts[n][1], a: 0, holding: false };
  }

  FA.taxi = { buildGraph, planMoves, detect, at };
})(window.FA);
