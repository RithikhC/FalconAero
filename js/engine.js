/* FalconAero — Unified Disruption-Recovery Engine.
   Jointly plans: arrival sequencing (runway), diversions (network), stand allocation (apron),
   towing, departure gate-holding (A-CDM TSAT) and taxi flow — then scores, explains and stress-tests each plan.
   Pure functions, runs in the browser in milliseconds. */
(function (FA) {
  'use strict';
  const D = FA.data;
  const { TYPES, CODE_RANK, G, SEP_NM, NM_SEC, fmt } = D;

  /* =========================================================
     Conditions & capacity
     ========================================================= */
  function conditions(inst, t) {
    const sc = inst.scenario;
    const wxOn = sc.wx.start != null && t >= sc.wx.start && t < sc.wx.end;
    const closure = inst.events.find((e) => e.type === 'rwyClosure' && t >= e.start && t < e.end);
    return {
      lvp: !!(sc.lvp && wxOn),
      degraded: !!(sc.degraded && wxOn),
      rwyNClosed: !!closure,
      mixed: !!closure,
      rvr: wxOn ? sc.wx.rvr : null,
      vis: wxOn ? sc.wx.vis : 9999
    };
  }

  /** Arrival-arrival spacing in minutes (leader → follower) at time t.
      onS = arrival on the departure runway 12R/30L (always mixed mode: leave a departure gap). */
  function arrSep(inst, leader, follower, t, extraSec, onS) {
    const c = conditions(inst, t);
    let sec = leader ? SEP_NM[leader.wake][follower.wake] * NM_SEC : 0;
    sec = Math.max(sec, 75); // runway occupancy time
    if (c.lvp) sec = Math.max(sec, 5.5 * NM_SEC) + 20; // ILS sensitive-area protection
    if (c.degraded) sec *= 1.3;
    if (onS) sec = Math.max(sec, c.lvp ? 210 : 150); // mixed mode: departure between arrivals
    return (sec + (extraSec || 0)) / 60;
  }

  /** Departure interval in minutes at time t (mixed = arrivals also using 12R/30L). */
  function depInterval(inst, t, mixedWins) {
    const c = conditions(inst, t);
    const mixed = c.rwyNClosed || (mixedWins || []).some((w) => t >= w[0] && t < w[1]);
    if (mixed) return c.lvp ? 4.6 : 4.0;
    if (c.lvp) return 2.8;
    if (c.degraded) return 2.1;
    return 1.6;
  }

  function taxiSpeed(inst, t) { // px per minute
    const c = conditions(inst, t);
    return c.lvp ? 78 : c.degraded ? 105 : 140;
  }

  /* =========================================================
     Taxi routes (shared with the map renderer)
     ========================================================= */
  function nearest(arr, x) { return arr.reduce((b, v) => (Math.abs(v - x) < Math.abs(b - x) ? v : b), arr[0]); }

  function routeIn(stand, rwy) {
    const pts = [];
    if (rwy === 'S') { // mixed mode: land on south runway, exit to south taxiway
      const ex = nearest(G.exitsN, stand.x);
      pts.push([G.rwyS.x1 + 60, G.rwyS.y], [ex, G.rwyS.y], [ex, G.twyS]);
      const c = nearest(G.connectors, stand.x);
      if (stand.laneKey === 'L1') { pts.push([c, G.twyS], [c, G.lanes.L1], [stand.x, G.lanes.L1]); }
      else { pts.push([c, G.twyS], [c, stand.lane], [stand.x, stand.lane]); }
      pts.push([stand.x, stand.y]);
      return pts;
    }
    if (stand.laneKey === 'L1') {
      const ex = nearest(G.exitsN, stand.x);
      pts.push([G.rwyN.x1 + 60, G.rwyN.y], [ex, G.rwyN.y], [ex, G.twyN], [stand.x, G.twyN], [stand.x, stand.y]);
    } else {
      const c = nearest(G.connectors, stand.x);
      const ex = nearest(G.exitsN, c);
      pts.push([G.rwyN.x1 + 60, G.rwyN.y], [ex, G.rwyN.y], [ex, G.twyN], [c, G.twyN], [c, stand.lane], [stand.x, stand.lane], [stand.x, stand.y]);
    }
    return pts;
  }

  function routeOut(stand) {
    const c = nearest(G.connectors, stand.x);
    const lane = stand.laneKey === 'L1' ? G.lanes.L1 : stand.lane;
    return [[stand.x, stand.y], [stand.x, lane], [c, lane], [c, G.twyS], [G.holdS.x, G.twyS], [G.holdS.x, G.holdS.y]];
  }

  function polyLen(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return L;
  }
  function pointAt(pts, frac) {
    const total = polyLen(pts);
    let d = Math.max(0, Math.min(1, frac)) * total;
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (d <= seg || i === pts.length - 1) {
        const k = seg ? Math.min(1, d / seg) : 0;
        return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k, a: Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]) };
      }
      d -= seg;
    }
    const p = pts[pts.length - 1];
    return { x: p[0], y: p[1], a: 0 };
  }

  const standById = (inst, id) => inst.stands.find((s) => s.id === id);
  function taxiIn(inst, stand, t, rwy) { return polyLen(routeIn(stand, rwy)) / taxiSpeed(inst, t) + 1; }
  function taxiOut(inst, stand, t) { return polyLen(routeOut(stand)) / taxiSpeed(inst, t) + 2; }

  /* =========================================================
     Network (alternates) weather state per scenario
     ========================================================= */
  function networkState(inst) {
    const id = inst.scenario.id;
    const fogLike = id === 'fog' || id === 'storm';
    const st = {
      OMDB: { rvr: inst.scenario.wx.rvr, lvp: inst.scenario.lvp, load: 0.92 },
      OMDW: { rvr: fogLike ? 300 : 9999, lvp: fogLike, load: 0.55 },
      OMSJ: { rvr: fogLike ? 450 : id === 'sand' ? 1500 : 9999, lvp: fogLike, load: 0.7 },
      OMAA: { rvr: fogLike ? 1400 : id === 'sand' ? 2500 : 9999, lvp: false, load: 0.62 },
      OMRK: { rvr: 9999, lvp: false, load: 0.35 },
      OMFJ: { rvr: 9999, lvp: false, load: 0.2 },
      OMAL: { rvr: fogLike ? 2000 : 9999, lvp: false, load: 0.25 }
    };
    return st;
  }

  function chooseAlternate(inst, flight, smart, divLoad) {
    const net = networkState(inst);
    const alts = D.NETWORK.filter((a) => a.icao !== 'OMDB');
    const scored = alts.map((a) => {
      const w = net[a.icao];
      const needF = flight.code === 'F';
      let cost = a.dist * 0.25;
      const reasons = [];
      if (w.lvp) { cost += 60; reasons.push('in LVP (RVR ' + w.rvr + ' m)'); }
      if (needF && a.codeF < 3) { cost += 80; reasons.push('few Code-F stands'); }
      const used = divLoad[a.icao] || 0;
      const freeStands = Math.round(a.stands * (1 - w.load)) - used;
      if (freeStands < 4) { cost += 70; reasons.push('apron near capacity'); }
      if (flight.airline === 'EK' && a.icao === 'OMDW') cost -= 8; // EK ground handling at DWC
      return { a, cost, reasons, freeStands, w };
    }).sort((x, y) => x.cost - y.cost);
    if (!smart) { // baseline: nearest suitable field (by distance only)
      const n = alts.slice().sort((x, y) => x.dist - y.dist).find((a) => !(flight.code === 'F' && a.codeF < 3)) || alts[0];
      return scored.find((s) => s.a.icao === n.icao);
    }
    return scored[0];
  }

  /* =========================================================
     Plan configurations
     ========================================================= */
  const PLAN_CFGS = {
    baseline: { id: 'baseline', name: 'Current Practice (FCFS)', short: 'Baseline', color: '#ef5350', mode: 'baseline', cps: 0, reserve: 0, extraSec: 0, queueMax: 9, tow: false, remote: false, atfm: false, smartDivert: false },
    balanced: { id: 'balanced', name: 'FalconAero Balanced', short: 'Balanced', color: '#26c6da', mode: 'opt', cps: 3, reserve: 8, extraSec: 0, towThreshold: 12, dual: true, dualTrigger: 5, tow: true, remote: true, atfm: true, smartDivert: true, w: { wait: 2.6, remote: 22, pref: 12, codeWaste: 6, tow: 18 } },
    mindelay: { id: 'mindelay', name: 'FalconAero Min-Delay', short: 'Min-Delay', color: '#ffca28', mode: 'opt', cps: 5, reserve: 4, extraSec: 0, towThreshold: 8, dual: true, dualTrigger: 3, tow: true, remote: true, atfm: false, smartDivert: true, w: { wait: 4.0, remote: 12, pref: 6, codeWaste: 3, tow: 10 } },
    safety: { id: 'safety', name: 'FalconAero Max-Safety', short: 'Max-Safety', color: '#66bb6a', mode: 'opt', cps: 3, reserve: 10, extraSec: 8, towThreshold: 16, dual: true, dualTrigger: 8, tow: true, remote: true, atfm: true, smartDivert: true, w: { wait: 2.0, remote: 24, pref: 14, codeWaste: 7, tow: 24 } }
  };

  const PRIO_W = { mayday: 1000, medical: 600, state: 40, normal: 0 };

  /* =========================================================
     1. Runway arrival sequencing (constrained position shifting)
     ========================================================= */
  function sequence(inst, cfg, divertedIds, policy) {
    policy = policy || {};
    const pending = inst.arrivals.filter((f) => !divertedIds.has(f.id)).map((f) => ({ f, eta: f.eta, skipped: 0 }));
    const fcfsIdx = new Map(pending.map((p, i) => [p.f.id, i]));
    const out = [];
    let rw = { N: { t: -1e9, l: null }, S: { t: -1e9, l: null } };
    const mixedMins = [];
    const k = cfg.cps;
    const dualOn = cfg.dual && !policy.noDual;
    const wDelay = (f, hold) => {
      const slack = f.fuelMin - cfg.reserve - hold;
      return 1 + f.pax / 400 + f.connPax / 250 + (policy.prioritiseConnections ? f.connPax / 80 : 0) +
        PRIO_W[f.priority] / 20 + (slack < 12 ? (12 - slack) * 0.6 : 0);
    };
    // Runway Configuration Advisor: open 12R/30L to arrivals when the airborne backlog exceeds the trigger
    const backlog = (t) => pending.filter((p) => p.eta < t - 3).length;
    const landOn = (state, p, dual) => {
      const opts = [];
      const tN = Math.max(p.eta, state.N.t);
      if (!conditions(inst, tN).rwyNClosed) opts.push({ r: 'N', land: Math.max(p.eta, state.N.t + arrSep(inst, state.N.l, p.f, tN, cfg.extraSec, false)) });
      const tS = Math.max(p.eta, state.S.t);
      if (conditions(inst, tS).rwyNClosed || dual) opts.push({ r: 'S', land: Math.max(p.eta, state.S.t + arrSep(inst, state.S.l, p.f, tS, cfg.extraSec, true)) });
      if (!opts.length) opts.push({ r: 'N', land: Math.max(p.eta, state.N.t + 1) });
      return opts.sort((a, b) => a.land - b.land)[0];
    };
    const evalOrder = (order, dual) => {
      const st = { N: Object.assign({}, rw.N), S: Object.assign({}, rw.S) };
      let cost = 0;
      order.forEach((p) => {
        const o = landOn(st, p, dual);
        cost += (o.land - p.eta) * wDelay(p.f, o.land - p.eta);
        st[o.r] = { t: o.land, l: p.f };
      });
      return cost;
    };
    while (pending.length) {
      const tMin = Math.min(...pending.map((p) => p.eta));
      const now = Math.max(tMin, Math.min(rw.N.t, rw.S.t > 0 ? rw.S.t : rw.N.t));
      const dual = dualOn && backlog(Math.max(now, rw.N.t)) >= cfg.dualTrigger;
      let win = pending.slice(0, k + 1);
      const forced = win.find((p) => p.skipped >= k && k > 0);
      if (forced) win = [forced];
      pending.forEach((p) => {
        if (win.includes(p)) return;
        const isEmerg = p.f.priority === 'mayday' || (cfg.mode === 'opt' && p.f.priority === 'medical');
        if (isEmerg && p.eta <= Math.max(rw.N.t, tMin) + 6) win.push(p);
      });
      let best = null;
      win.forEach((p) => {
        const o = landOn(rw, p, dual);
        let score;
        if (cfg.mode === 'baseline') score = p.eta + (p.f.priority === 'mayday' ? -1000 : 0);
        else {
          const rest = pending.slice(0, k + 3).filter((q) => q !== p);
          score = evalOrder([p].concat(rest), dual) - PRIO_W[p.f.priority] * 10;
        }
        if (!best || score < best.score) best = { p, o, score };
      });
      pending.slice(0, pending.indexOf(best.p)).forEach((q) => { q.skipped++; });
      pending.splice(pending.indexOf(best.p), 1);
      const { land, r } = best.o;
      if (r === 'S' && !conditions(inst, land).rwyNClosed) mixedMins.push(land);
      out.push({ id: best.p.f.id, f: best.p.f, land, hold: Math.max(0, land - best.p.eta), pos: out.length, fcfsPos: fcfsIdx.get(best.p.f.id), rwy: r });
      rw[r] = { t: land, l: best.p.f };
    }
    // merge S-runway arrival minutes into mixed-mode windows (for departure planning)
    const wins = [];
    mixedMins.sort((a, b) => a - b).forEach((t) => {
      const w = wins[wins.length - 1];
      if (w && t - w[1] < 8) w[1] = t + 3; else wins.push([t - 3, t + 3]);
    });
    out.mixedWins = wins;
    return out;
  }

  /** Iteratively divert flights whose holding would breach their fuel reserve. */
  function planArrivals(inst, cfg, policy) {
    const diverted = new Map();
    let seq;
    for (let iter = 0; iter < 40; iter++) {
      seq = sequence(inst, cfg, new Set(diverted.keys()), policy);
      const breach = seq.filter((s) => s.hold > s.f.fuelMin - cfg.reserve && s.f.priority !== 'mayday' && !s.f.atfmEligible);
      if (!breach.length) break;
      if (cfg.mode === 'baseline') {
        // reactive: the first aircraft to hit minimum fuel diverts after holding until bingo fuel
        const b = breach[0];
        diverted.set(b.id, { id: b.id, f: b.f, heldMin: Math.max(0, b.f.fuelMin - cfg.reserve), when: b.f.eta + Math.max(0, b.f.fuelMin - cfg.reserve), reactive: true });
      } else {
        // proactive: among flights landing in the congested window, divert the one with least passenger impact
        const b = breach[0];
        const pool = seq.filter((s) => s.land <= b.land + 1 && s.land >= b.land - 30 && s.f.priority === 'normal' && !s.f.atfmEligible);
        const impact = (s) => s.f.pax + s.f.connPax * 2.2 + (s.f.code === 'F' ? 400 : 0) + (s.f.airline === 'EK' ? 60 : 0);
        const v = pool.sort((x, y) => impact(x) - impact(y))[0] || b;
        diverted.set(v.id, { id: v.id, f: v.f, heldMin: 0, when: v.f.eta - 25, reactive: false, protectedFor: b.id });
      }
    }
    // pick alternates
    const divLoad = {};
    const divs = [...diverted.values()].map((d) => {
      const alt = chooseAlternate(inst, d.f, cfg.smartDivert, divLoad);
      divLoad[alt.a.icao] = (divLoad[alt.a.icao] || 0) + 1;
      // baseline nearest field may itself be in LVP → secondary diversion risk
      return Object.assign(d, { alt: alt.a.icao, altName: alt.a.name, altReasons: alt.reasons, altLvp: alt.w.lvp, freeStands: alt.freeStands });
    });
    return { seq, divs, mixedWins: seq.mixedWins || [] };
  }

  /* =========================================================
     2. Departures: runway slots + off-block policy
     ========================================================= */
  function planDepartures(inst, cfg, mixedWins) {
    // ICAO time-based departure wake separation: 2 min behind Heavy (for Medium), 3 min behind Super (A380)
    const depSep = (L, F, t) => {
      const base = depInterval(inst, t, mixedWins);
      if (!L) return 0;
      const wake = L.wake === 'J' ? 3 : (L.wake === 'H' && F.wake === 'M') ? 2 : 0;
      return Math.max(base, wake);
    };
    const pend = inst.departures.slice().sort((a, b) => a.std - b.std).map((d) => {
      const txo = taxiOut(inst, standById(inst, d.stand), d.std);
      return { d, txo, earliest: d.std + txo, skipped: 0 };
    });
    let tLast = -1e9, leader = null;
    const res = [];
    const k = cfg.mode === 'opt' ? 3 : 0;  // constrained position shifting on departures too
    while (pend.length) {
      let win = pend.slice(0, k + 1);
      const forced = win.find((p) => p.skipped >= k && k > 0);
      if (forced) win = [forced];
      let best = null;
      win.forEach((p) => {
        const tto = Math.max(p.earliest, tLast + depSep(leader, p.d, Math.max(p.earliest, tLast)));
        // pick the departure that frees the runway soonest, lightly preferring the earlier-ready one
        const score = cfg.mode === 'opt' ? tto + (p.earliest - pend[0].earliest) * 0.15 : p.earliest;
        if (!best || score < best.score) best = { p, tto, score };
      });
      pend.slice(0, pend.indexOf(best.p)).forEach((q) => { q.skipped++; });
      pend.splice(pend.indexOf(best.p), 1);
      tLast = best.tto; leader = best.p.d;
      res.push({ id: best.p.d.id, f: best.p.d, stand: best.p.d.stand, ttot: best.tto, taxiOut: best.p.txo, delay: best.tto - best.p.earliest });
    }
    // off-block times
    res.forEach((r, i) => {
      if (cfg.mode === 'baseline') {
        // push when ready, unless the runway queue is full (ATC holds at gate)
        const ahead = res[i - cfg.queueMax];
        const qFree = ahead ? ahead.ttot - r.taxiOut : -1e9;
        r.offBlock = Math.max(r.f.std, qFree);
      } else {
        // A-CDM: TSAT = TTOT − EXOT − 2 → no runway queue, engines off at the gate
        r.offBlock = Math.max(r.f.std, r.ttot - r.taxiOut - 2);
      }
      r.queue = Math.max(0, r.ttot - r.offBlock - r.taxiOut);
    });
    return res;
  }

  /* =========================================================
     3. Stand allocation
     ========================================================= */
  function makeTimeline(inst, deps) {
    const tl = new Map(inst.stands.map((s) => [s.id, []]));
    inst.stands.forEach((s) => { if (s.outOfService) tl.get(s.id).push({ start: s.outage.start, end: s.outage.end, kind: 'outage', id: 'U/S' }); });
    deps.forEach((d) => tl.get(d.stand).push({ start: inst.T0 - 60, end: d.offBlock, kind: 'dep', id: d.id, ref: d }));
    return tl;
  }
  const BUF = 8; // min stand buffer between occupancies

  function freeFrom(tl, standId, t, dur) {
    // earliest start >= t such that [start, start+dur) does not overlap any interval (+buffer)
    const iv = tl.get(standId).slice().sort((a, b) => a.start - b.start);
    let s = t;
    for (const x of iv) {
      if (s + dur + BUF <= x.start) break;
      if (x.end + BUF > s) s = Math.max(s, x.end + BUF);
    }
    return s;
  }

  function allocateBaseline(inst, cfg, seq, deps) {
    const tl = makeTimeline(inst, deps);
    const out = [];
    const conflicts = [];
    seq.slice().sort((a, b) => a.land - b.land).forEach((s) => {
      const f = s.f;
      const turn = TYPES[f.type].turn;
      let stand = f.origStand ? standById(inst, f.origStand) : null;
      let onBlockPlan = s.land + (stand ? taxiIn(inst, stand, s.land, s.rwy) : 8);
      let start, wait = 0, reassigned = false;
      if (stand && !stand.outOfService) {
        start = freeFrom(tl, stand.id, onBlockPlan, turn);
        wait = start - onBlockPlan;
      }
      if (!stand || stand.outOfService || wait > 15) {
        // manual re-assignment after waiting (controller/AOC phone loop)
        const manualDelay = !stand ? 6 : stand.outOfService ? 12 : 15;
        const cands = inst.stands.filter((x) => !x.outOfService && D.compatible(x, f));
        let best = null;
        cands.forEach((x) => {
          const ob = s.land + taxiIn(inst, x, s.land, s.rwy) + manualDelay;
          const st = freeFrom(tl, x.id, ob, turn);
          if (!best || st < best.st) best = { x, st, ob };
        });
        conflicts.push({ type: 'stand', id: f.id, stand: stand ? stand.id : '—', msg: (stand ? (stand.outOfService ? 'Planned stand ' + stand.id + ' unserviceable' : 'Planned stand ' + stand.id + ' still occupied') : 'No stand planned') + ' — aircraft held on taxiway, manual re-allocation to ' + best.x.id });
        reassigned = true;
        wait = best.st - (s.land + taxiIn(inst, best.x, s.land, s.rwy));
        stand = best.x; start = best.st;
      } else if (wait > 3) {
        conflicts.push({ type: 'stand', id: f.id, stand: stand.id, msg: 'Stand ' + stand.id + ' occupied by delayed departure — ' + Math.round(wait) + ' min wait on taxiway' });
      }
      const ti = taxiIn(inst, stand, s.land, s.rwy);
      tl.get(stand.id).push({ start, end: start + turn, kind: 'arr', id: f.id });
      out.push({ id: f.id, f, stand: stand.id, onBlock: start, taxiIn: ti, wait: Math.max(0, start - (s.land + ti)), reassigned, remote: !stand.contact });
    });
    return { alloc: out, tl, tows: [], conflicts };
  }

  function standCost(inst, cfg, f, stand, wait) {
    const W = cfg.w;
    let c = wait * W.wait * (0.6 + f.pax / 400);
    if (!stand.contact) c += W.remote + f.pax * 0.03;
    if (stand.contact && !stand.airlines.includes(f.airline)) c += W.pref;
    c += (CODE_RANK[stand.code] - CODE_RANK[f.code]) * W.codeWaste;
    if (f.priority === 'medical' && !stand.contact) c += 60; // ambulance access at contact stand
    if (f.priority === 'state') c += stand.pier === 'R' ? -20 : 10; // protocol at remote VIP stand
    if (f.airline === 'EK' && ['A', 'B', 'C'].includes(stand.pier)) c -= f.connPax / 60; // short transfer walk
    return c;
  }

  function allocateOpt(inst, cfg, seq, deps) {
    const tl = makeTimeline(inst, deps);
    const out = [], tows = [];
    const queue = seq.slice().sort((a, b) => a.land - b.land);
    const remotes = inst.stands.filter((s) => !s.contact && !s.outOfService);

    function options(s) {
      const f = s.f, turn = TYPES[f.type].turn;
      const opts = [];
      inst.stands.forEach((x) => {
        if (!D.compatible(x, f)) return;
        if (!cfg.remote && !x.contact) return;
        const ti = taxiIn(inst, x, s.land, s.rwy);
        const ob = s.land + ti;
        if (x.outOfService && x.outage && ob < x.outage.end && ob + turn > x.outage.start) return;
        const st = freeFrom(tl, x.id, ob, turn);
        const wait = st - ob;
        opts.push({ x, ob, st, wait, ti, cost: standCost(inst, cfg, f, x, wait), tow: null });
        // towing option: occupying departure delayed well beyond its STD
        if (cfg.tow && x.contact && wait > 4) {
          const occ = wait >= cfg.towThreshold && tl.get(x.id).find((iv) => iv.kind === 'dep' && !iv.towed && iv.end > ob - BUF && iv.start < ob + turn && iv.ref && iv.ref.f.std <= ob - 4);
          if (occ) {
            const towStart = Math.max(occ.ref.f.std, ob - BUF - 14);
            const rem = remotes.find((r) => D.compatible(r, occ.ref.f) && freeFrom(tl, r.id, towStart + 12, occ.end - towStart - 12) <= towStart + 12);
            if (rem) {
              const others = tl.get(x.id).filter((iv) => iv !== occ);
              const clash = others.some((iv) => iv.end + BUF > Math.max(ob, towStart + 2) && iv.start < Math.max(ob, towStart + 2) + turn + BUF);
              if (!clash) {
                const st2 = Math.max(ob, towStart + 2 + BUF);
                opts.push({ x, ob, st: st2, wait: st2 - ob, ti, cost: standCost(inst, cfg, f, x, st2 - ob) + cfg.w.tow, tow: { dep: occ, to: rem, at: towStart } });
              }
            }
          }
        }
      });
      return opts.sort((a, b) => a.cost - b.cost);
    }

    // regret-based batch assignment
    while (queue.length) {
      const batch = queue.slice(0, 5);
      let pick = null;
      batch.forEach((s) => {
        const o = options(s);
        if (!o.length) return;
        const regret = (o[1] ? o[1].cost : o[0].cost + 100) - o[0].cost;
        const urgency = PRIO_W[s.f.priority] / 10;
        const key = regret + urgency - (s.land - batch[0].land) * 2.5;
        if (!pick || key > pick.key) pick = { s, o, key };
      });
      if (!pick) { queue.shift(); continue; }
      const { s, o } = pick;
      const best = o[0];
      if (best.tow) {
        const t = best.tow;
        const dep = t.dep;
        dep.end = t.at; // leaves contact stand at tow start
        tl.get(t.to.id).push({ start: t.at + 12, end: dep.ref.offBlock, kind: 'dep', id: dep.id, ref: dep.ref, towed: true });
        dep.ref.towedTo = t.to.id; dep.ref.towAt = t.at;
        tows.push({ id: dep.id, from: best.x.id, to: t.to.id, at: t.at, forArr: s.id });
      }
      const turn = TYPES[s.f.type].turn;
      tl.get(best.x.id).push({ start: best.st, end: best.st + turn, kind: 'arr', id: s.id });
      out.push({ id: s.id, f: s.f, stand: best.x.id, onBlock: best.st, taxiIn: best.ti, wait: best.wait, remote: !best.x.contact, alts: o.slice(1, 4).map((a) => ({ stand: a.x.id, wait: a.wait, cost: a.cost, remote: !a.x.contact })), cost: best.cost, towed: best.tow ? best.tow.dep.id : null });
      queue.splice(queue.indexOf(s), 1);
    }
    return { alloc: out, tl, tows, conflicts: [] };
  }

  /* =========================================================
     4. Full plan
     ========================================================= */
  function buildPlan(inst, cfgId, policy) {
    const t0 = performance.now();
    const cfg = Object.assign({}, PLAN_CFGS[cfgId] || cfgId);
    policy = policy || {};
    if (policy.cps != null && cfg.mode === 'opt') cfg.cps = policy.cps;
    if (policy.reserve != null && cfg.mode === 'opt') cfg.reserve = policy.reserve;
    if (policy.towThreshold != null && cfg.mode === 'opt') cfg.towThreshold = policy.towThreshold;
    if (policy.noRemote) cfg.remote = false;
    if (policy.noAtfm) cfg.atfm = false;

    // ATFM eligibility: short-haul flights still on the ground at origin when the fog alert fires
    const alertT = inst.scenario.wx.start != null ? inst.scenario.wx.start - (policy.nowcastLead != null ? policy.nowcastLead : 40) : null;
    inst.arrivals.forEach((f) => { f.atfmEligible = cfg.atfm && alertT != null && f.code === 'C' && f.eta - alertT >= 55 && f.priority === 'normal'; });

    const { seq, divs, mixedWins } = planArrivals(inst, cfg, policy);
    const deps = planDepartures(inst, cfg, mixedWins);
    const st = cfg.mode === 'baseline' ? allocateBaseline(inst, cfg, seq, deps) : allocateOpt(inst, cfg, seq, deps);

    // ATFM: convert airborne holding into ground delay at origin for eligible flights
    seq.forEach((s) => {
      s.atfm = 0;
      if (s.f.atfmEligible && s.hold > 6) { s.atfm = s.hold - 3; s.hold = 3; }
    });

    const plan = { cfg, inst, seq, divs, deps, mixedWins, alloc: st.alloc, tl: st.tl, tows: st.tows, conflicts: st.conflicts.slice() };
    plan.allocById = new Map(plan.alloc.map((a) => [a.id, a]));
    plan.seqById = new Map(seq.map((s) => [s.id, s]));
    plan.depById = new Map(deps.map((d) => [d.id, d]));
    plan.divById = new Map(divs.map((d) => [d.id, d]));
    if (FA.taxi) FA.taxi.planMoves(plan); // taxiway network routing + conflict detection
    taxiCongestion(plan);
    plan.kpi = kpis(plan);
    plan.ms = performance.now() - t0;
    plan.actions = keyActions(plan);
    return plan;
  }

  /* taxiway congestion: aircraft simultaneously moving on the manoeuvring area */
  function taxiCongestion(plan) {
    const inst = plan.inst;
    const ev = [];
    plan.alloc.forEach((a) => { const s = plan.seqById.get(a.id); ev.push([s.land, a.onBlock]); });
    plan.deps.forEach((d) => ev.push([d.offBlock, d.ttot]));
    let over = 0, peak = 0;
    const peakAt = [];
    for (let t = inst.T0; t < inst.T1 + 60; t += 1) {
      const n = ev.filter((e) => e[0] <= t && e[1] > t).length;
      const cap = conditions(inst, t).lvp ? 12 : 18;
      if (n > peak) peak = n;
      if (n > cap) { over++; peakAt.push(t); }
    }
    plan.taxiOver = over; plan.taxiPeak = peak;
    if (over > 0 && plan.cfg.mode === 'baseline') {
      plan.conflicts.push({ type: 'taxi', id: '—', msg: 'Taxiway saturation for ' + over + ' min (peak ' + peak + ' aircraft moving) — LVP limits exceeded around ' + fmt(peakAt[0]) });
    }
    plan.divs.filter((d) => d.reactive).forEach((d) => {
      plan.conflicts.push({ type: 'fuel', id: d.id, msg: d.id + ' reached minimum fuel after ' + Math.round(d.heldMin) + ' min holding — late diversion to ' + d.alt + (d.altLvp ? ' (also in LVP → secondary diversion risk)' : '') });
    });
  }

  /* =========================================================
     5. KPIs & scores
     ========================================================= */
  function gini(arr) {
    const a = arr.filter((x) => x >= 0).sort((x, y) => x - y);
    const n = a.length; if (!n) return 0;
    const sum = a.reduce((s, v) => s + v, 0); if (!sum) return 0;
    let cum = 0; a.forEach((v, i) => { cum += (i + 1) * v; });
    return (2 * cum) / (n * sum) - (n + 1) / n;
  }

  function kpis(plan) {
    const { seq, divs, deps, alloc } = plan;
    let arrDelay = 0, holdFuel = 0, holdMin = 0, atfmMin = 0, paxAffected = 0, missed = 0, standWait = 0, contact = 0, maxDelay = 0, minMargin = 999, emergDelay = 0;
    const perAirline = {};
    seq.forEach((s) => {
      const a = plan.allocById.get(s.id);
      const ty = TYPES[s.f.type];
      const delay = (s.land - s.f.eta) + (a ? a.wait : 0); // ATFM ground delay is already inside land − eta
      arrDelay += delay; maxDelay = Math.max(maxDelay, delay);
      holdMin += s.hold; atfmMin += s.atfm || 0;
      holdFuel += ty.burn * s.hold / 60 + (a ? a.wait * ty.taxiBurn : 0);
      if (delay > 15) paxAffected += s.f.pax;
      missed += s.f.connPax * Math.max(0, Math.min(1, (delay - 40) / 80));
      standWait += a ? a.wait : 0;
      if (a && !a.remote) contact++;
      const margin = s.f.fuelMin - s.hold;
      minMargin = Math.min(minMargin, margin);
      if (s.f.priority === 'mayday' || s.f.priority === 'medical') emergDelay = Math.max(emergDelay, s.land - s.f.eta);
      (perAirline[s.f.airline] = perAirline[s.f.airline] || []).push(delay);
    });
    let divFuel = 0, divPax = 0, divConn = 0, secondary = 0;
    divs.forEach((d) => {
      const ty = TYPES[d.f.type];
      divFuel += ty.burn * (d.heldMin / 60) + ty.burn * 0.45 + ty.burn * 0.6; // hold + diversion leg + later repositioning
      divPax += d.f.pax; divConn += d.f.connPax;
      if (d.altLvp) secondary++;
      if (d.reactive) minMargin = Math.min(minMargin, d.f.fuelMin - d.heldMin);
    });
    let depDelay = 0, queueFuel = 0, queueMin = 0;
    deps.forEach((d) => {
      depDelay += d.ttot - d.taxiOut - d.f.std;
      queueMin += d.queue;
      queueFuel += d.queue * TYPES[d.f.type].taxiBurn;
    });
    const fuel = holdFuel + divFuel + queueFuel;
    const airlineAvg = Object.values(perAirline).map((v) => v.reduce((s, x) => s + x, 0) / v.length);
    const g = gini(airlineAvg);
    const standConf = plan.conflicts.filter((c) => c.type === 'stand').length;
    const DIV_EQ = 180; // a diversion ≈ 3 h of passenger delay (re-fuel, crew, re-positioning)
    const paxDelayHrs = (seq.reduce((acc, s) => { const a = plan.allocById.get(s.id); return acc + s.f.pax * Math.max(0, (s.land - s.f.eta) + (a ? a.wait : 0)); }, 0) + divPax * DIV_EQ) / 60;
    const k = {
      landed: seq.length, arrDelay, avgDelay: arrDelay / Math.max(1, seq.length), maxDelay,
      avgDelayAll: (arrDelay + divs.length * DIV_EQ) / Math.max(1, seq.length + divs.length), paxDelayHrs,
      holdMin, atfmMin, holdFuel, diversions: divs.length, divPax, divConn, secondaryDiv: secondary,
      depDelay, avgDepDelay: depDelay / Math.max(1, deps.length), queueMin, queueFuel,
      fuel, co2: fuel * 3.16, paxAffected: paxAffected + divPax,
      missedConn: Math.round(missed + divConn * 0.85),
      standWait, standConflicts: standConf, conflicts: plan.conflicts.length, taxiOver: plan.taxiOver,
      contactPct: (100 * contact) / Math.max(1, alloc.length), tows: plan.tows.length,
      remoteCount: alloc.filter((a) => a.remote).length,
      minFuelMargin: minMargin, emergDelay, fairness: Math.max(0, 1 - g), gini: g,
      fuelCritical: divs.filter((d) => d.reactive).length,
      mixedMin: (plan.mixedWins || []).reduce((a, w) => a + (w[1] - w[0]), 0),
      taxiConflicts: (plan.taxiConflicts || []).length,
      avgTaxi: plan.taxiStats ? plan.taxiStats.avgTaxi : 0,
      taxiWait: plan.taxiStats ? plan.taxiStats.waitMin : 0,
      throughput: seq.filter((s) => s.land <= plan.inst.T1).length,
      standUtil: (() => { let o = 0, n = 0; for (let t = plan.inst.T0; t <= plan.inst.T1; t += 15) { let occ = 0, av = 0; plan.tl.forEach((ivs) => { const c = ivs.find((iv) => t >= iv.start && t < iv.end); if (c && c.kind === 'outage') return; av++; if (c) occ++; }); o += occ / Math.max(1, av); n++; } return (100 * o) / Math.max(1, n); })()
    };
    k.scores = scores(k);
    return k;
  }

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function scores(k) {
    const s = {
      Delay: 100 * clamp01(1 - k.avgDelayAll / 50),
      Safety: 100 * clamp01(0.3 * clamp01((k.minFuelMargin) / 30) + 0.25 * clamp01(1 - k.fuelCritical / 3) + 0.2 * clamp01(1 - k.emergDelay / 10) + 0.15 * clamp01(1 - k.conflicts / 15) + 0.1 * clamp01(1 - k.taxiOver / 60)),
      Passengers: 100 * clamp01(1 - k.missedConn / 900),
      Sustainability: 100 * clamp01(1 - k.co2 / 400000),
      Fairness: 100 * clamp01((k.fairness - 0.5) / 0.5),
      Stands: 100 * clamp01(0.6 * clamp01(1 - k.standConflicts / 12) + 0.4 * clamp01(k.contactPct / 100)),
      Workload: 100 * clamp01(1 - (k.tows * 4 + k.remoteCount * 1.5 + k.mixedMin / 8 + k.standConflicts * 3 + k.diversions * 4) / 70)
    };
    s.overall = 0.2 * s.Delay + 0.28 * s.Safety + 0.14 * s.Passengers + 0.1 * s.Sustainability + 0.08 * s.Fairness + 0.1 * s.Stands + 0.1 * s.Workload;
    return s;
  }

  /* =========================================================
     6. Explanations (XAI)
     ========================================================= */
  function keyActions(plan) {
    const A = [];
    const k = plan.kpi;
    if (plan.cfg.mode === 'baseline') {
      A.push({ icon: '⏱', text: 'Arrivals land first-come-first-served; holding grows to ' + Math.round(k.maxDelay) + ' min.' });
      if (k.standConflicts) A.push({ icon: '⚠', text: k.standConflicts + ' stand conflicts: delayed departures still block planned stands.' });
      if (k.diversions) A.push({ icon: '↗', text: k.diversions + ' late diversions after reaching minimum fuel' + (k.secondaryDiv ? ' (' + k.secondaryDiv + ' to an airport also in LVP)' : '') + '.' });
      if (plan.taxiOver) A.push({ icon: '🚧', text: 'Taxiways saturated for ' + plan.taxiOver + ' min — departures queue with engines running.' });
      return A;
    }
    const shifted = plan.seq.filter((s) => s.pos !== s.fcfsPos).length;
    const prio = plan.seq.filter((s) => s.f.priority !== 'normal');
    A.push({ icon: '🛬', text: 'Re-sequenced ' + shifted + ' arrivals within ±' + plan.cfg.cps + ' positions (wake-optimised, fairness-bounded).' });
    prio.forEach((s) => A.push({ icon: s.f.priority === 'mayday' ? '🆘' : s.f.priority === 'medical' ? '🚑' : '★', text: s.id + ' (' + s.f.priority.toUpperCase() + ') lands ' + fmt(s.land) + ' — ' + Math.max(0, Math.round(s.land - s.f.eta)) + ' min after ETA.' }));
    const mixedMin = (plan.mixedWins || []).reduce((a, w) => a + (w[1] - w[0]), 0);
    if (mixedMin > 0) A.push({ icon: '🛬', text: 'Runway Configuration Advisor: open 12R/30L to arrivals (mixed mode) for ' + Math.round(mixedMin) + ' min across ' + plan.mixedWins.length + ' window(s) to clear the airborne backlog.' });
    if (plan.divs.length) A.push({ icon: '↗', text: 'Proactive diversion of ' + plan.divs.length + ' flight(s) 25 min before arrival → ' + [...new Set(plan.divs.map((d) => d.alt))].join(', ') + ' (clear weather, free stands).' });
    if (k.atfmMin > 1) A.push({ icon: '🛫', text: 'Converted ' + Math.round(k.atfmMin) + ' min of airborne holding into ground delay at origin (ATFM slots) for short-haul flights.' });
    if (plan.tows.length) A.push({ icon: '🚜', text: 'Tow ' + plan.tows.length + ' delayed departures to remote stands to free contact gates.' });
    if (k.remoteCount) A.push({ icon: '🚌', text: k.remoteCount + ' arrivals to remote stands with bus operations pre-alerted.' });
    A.push({ icon: '⛽', text: 'Departures gate-held to TSAT (A-CDM): runway queue ' + Math.round(k.queueMin) + ' min total, engines-off saving fuel.' });
    return A;
  }

  function explainFlight(plan, id) {
    const inst = plan.inst;
    const div = plan.divById.get(id);
    const s = plan.seqById.get(id);
    const a = plan.allocById.get(id);
    const dep = plan.depById.get(id);
    const out = { id, lines: [], alts: [], factors: [] };
    if (dep) {
      const f = dep.f;
      out.title = f.id + ' · departure ' + f.type + ' → ' + f.port;
      out.lines.push('Scheduled off-block ' + fmt(f.std) + ', target take-off ' + fmt(dep.ttot) + ' (' + Math.round(dep.ttot - dep.taxiOut - f.std) + ' min delay from reduced departure rate).');
      out.lines.push(plan.cfg.mode === 'opt' ? 'Engines-off gate hold until TSAT ' + fmt(dep.offBlock) + ' — avoids ' + Math.round(dep.queue) + ' min runway queueing.' : 'Pushes back at ' + fmt(dep.offBlock) + ' and queues ' + Math.round(dep.queue) + ' min at the holding point with engines running.');
      if (dep.towedTo) out.lines.push('Towed from ' + dep.stand + ' to remote stand ' + dep.towedTo + ' at ' + fmt(dep.towAt) + ' to free the contact gate for an arriving aircraft.');
      return out;
    }
    const f = (s || div).f;
    out.title = f.id + ' · ' + D.AIRLINE[f.airline].name + ' ' + f.type + ' from ' + f.port;
    out.factors = [
      { k: 'Priority', v: f.priority.toUpperCase() },
      { k: 'Fuel endurance', v: f.fuelMin + ' min' },
      { k: 'Pax / transfer', v: f.pax + ' / ' + f.connPax },
      { k: 'Wake / code', v: f.wake + ' / ' + f.code }
    ];
    if (div) {
      out.lines.push((div.reactive ? 'Diverted late after holding ' + Math.round(div.heldMin) + ' min at minimum fuel.' : 'Proactively diverted before entering the hold — protects fuel margins of ' + (div.protectedFor || 'priority traffic') + '.'));
      out.lines.push('Alternate ' + div.altName + ' (' + div.alt + ')' + (div.altReasons.length ? ' — note: ' + div.altReasons.join(', ') : ' — clear weather, ' + div.freeStands + ' stands free') + '.');
      if (!div.reactive) out.lines.push('Chosen because it has the lowest passenger impact in the congested window (' + f.connPax + ' transfer pax).');
      return out;
    }
    const delay = s.land - f.eta;
    out.lines.push('ETA ' + fmt(f.eta) + ' → landing ' + fmt(s.land) + ' on ' + (s.rwy === 'S' ? '12R/30L (mixed mode)' : '12L/30R') + ' (' + (delay > 0.5 ? '+' + Math.round(delay) + ' min' : 'on time') + ').');
    if (s.atfm) out.lines.push('ATFM: ' + Math.round(s.atfm) + ' min absorbed as ground delay at ' + f.port + ' instead of airborne holding (saves ~' + Math.round(TYPES[f.type].burn * s.atfm / 60) + ' kg fuel).');
    if (s.pos < s.fcfsPos) out.lines.push('Moved ahead ' + (s.fcfsPos - s.pos) + ' position(s): ' + (f.priority !== 'normal' ? 'priority ' + f.priority : f.fuelMin - s.hold < 25 ? 'lowest fuel slack in queue' : 'better wake pairing reduces spacing') + '.');
    if (s.pos > s.fcfsPos) out.lines.push('Moved back ' + (s.pos - s.fcfsPos) + ' position(s) (max ±' + plan.cfg.cps + '): fuel slack ' + Math.round(f.fuelMin - s.hold) + ' min remains safe.');
    if (a) {
      const st = standById(inst, a.stand);
      out.lines.push('Stand ' + a.stand + ' (' + (st.contact ? 'contact, ' + st.terminal : 'remote, bus ops') + ', Code ' + st.code + ') on-block ' + fmt(a.onBlock) + (a.wait > 0.5 ? ' after ' + Math.round(a.wait) + ' min wait' : '') + '.');
      if (a.towed) out.lines.push('Made available by towing delayed departure ' + a.towed + ' to a remote stand.');
      if (f.origStand && f.origStand !== a.stand) out.lines.push('Original plan ' + f.origStand + ' unavailable at on-block time' + (standById(inst, f.origStand).outOfService ? ' (unserviceable)' : ' (delayed departure)') + '.');
      if (a.alts) out.alts = a.alts.map((x) => ({ stand: x.stand, text: (x.remote ? 'remote' : 'contact') + ', wait ' + Math.round(x.wait) + ' min, cost +' + Math.round(x.cost - a.cost) }));
      if (a.reassigned) out.lines.push('Manual re-allocation needed after taxiway hold (no decision support).');
    }
    return out;
  }

  /* =========================================================
     7. Robustness stress test (Monte Carlo on ETA uncertainty)
     ========================================================= */
  function robustness(plan, runs) {
    runs = runs || 20;
    const inst = plan.inst;
    const r = D.rng(plan.inst.seed * 7 + 13);
    let held = 0, total = 0;
    const order = plan.seq.map((s) => s.f);
    for (let i = 0; i < runs; i++) {
      let tLast = -1e9, leader = null;
      const tl = new Map();
      plan.tl.forEach((iv, id) => tl.set(id, iv.filter((x) => x.kind !== 'arr').map((x) => Object.assign({}, x, { end: x.end + Math.abs(r.normal(0, 2.5)) }))));
      for (const f of order) {
        const eta = f.eta + r.normal(0, 3);
        const sq = plan.seqById.get(f.id);
        const land = Math.max(eta, sq.land + (eta - f.eta) * 0.5);
        const a = plan.allocById.get(f.id);
        if (!a) continue;
        const st = Math.max(land + a.taxiIn, a.onBlock - 3);
        const end = st + TYPES[f.type].turn;
        const ivs = tl.get(a.stand);
        total++;
        if (!ivs.some((x) => x.end > st + 0.5 && x.start < end)) held++;
        ivs.push({ start: st, end, kind: 'arr' });
      }
    }
    return held / Math.max(1, total);
  }

  function buildAll(inst, policy) {
    const ids = ['baseline', 'balanced', 'mindelay', 'safety'];
    const plans = {};
    ids.forEach((id) => { plans[id] = buildPlan(inst, id, policy); });
    ids.forEach((id) => { plans[id].robust = robustness(plans[id]); });
    // recommendation = best overall score among optimised plans
    const rec = ['balanced', 'mindelay', 'safety'].sort((a, b) => plans[b].kpi.scores.overall - plans[a].kpi.scores.overall)[0];
    return { plans, rec };
  }

  FA.engine = {
    conditions, arrSep, depInterval, taxiSpeed, routeIn, routeOut, polyLen, pointAt, taxiIn, taxiOut,
    networkState, PLAN_CFGS, buildPlan, buildAll, explainFlight, robustness, standById, gini
  };
})(window.FA);
