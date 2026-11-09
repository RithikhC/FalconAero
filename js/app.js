/* FalconAero — app core: state, event bus, views, audit trail, UI helpers, boot. */
(function (FA) {
  'use strict';

  /* ---------- event bus ---------- */
  const handlers = {};
  FA.bus = {
    on(evt, fn) { (handlers[evt] = handlers[evt] || []).push(fn); },
    emit(evt, data) { (handlers[evt] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error('[bus]', evt, e); } }); }
  };

  /* ---------- state ---------- */
  FA.state = {
    scenarioId: 'storm', seed: 2026, inst: null, plans: null, rec: null,
    active: 'baseline',       // plan currently driving the map (baseline until a human approves)
    viewPlan: 'balanced',     // plan highlighted in the AI panel / plans page
    generated: false,         // has the controller asked the AI for plans?
    approved: null,           // {planId, by, at}
    t: 300, playing: false, speed: 120, selected: null, view: 'command'
  };

  /* ---------- SHA-256 (sync, for the tamper-evident audit chain) ---------- */
  function sha256(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    const mp = Math.pow, max = mp(2, 32);
    let result = '', words = [], i, j;
    const asciiBitLength = ascii.length * 8;
    const hash = sha256.h = sha256.h || [], k = sha256.k = sha256.k || [];
    let primeCounter = k.length;
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (mp(candidate, 0.5) * max) | 0;
        k[primeCounter++] = (mp(candidate, 1 / 3) * max) | 0;
      }
    }
    ascii = unescape(encodeURIComponent(ascii));
    const len = ascii.length * 8;
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii.length; i++) {
      j = ascii.charCodeAt(i);
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = (len / max) | 0;
    words[words.length] = len;
    let h = hash.slice(0, 8);
    for (j = 0; j < words.length;) {
      const w = words.slice(j, j += 16), oldHash = h;
      h = h.slice(0, 8);
      for (i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2], a = h[0], e = h[4];
        const temp1 = h[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & h[5]) ^ ((~e) & h[6])) + k[i] +
          (w[i] = i < 16 ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        const temp2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & h[1]) ^ (a & h[2]) ^ (h[1] & h[2]));
        h = [(temp1 + temp2) | 0].concat(h);
        h[4] = (h[4] + temp1) | 0;
      }
      for (i = 0; i < 8; i++) h[i] = (h[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) { const b = (h[i] >> (j * 8)) & 255; result += (b < 16 ? '0' : '') + b.toString(16); }
    void asciiBitLength;
    return result;
  }

  /* ---------- audit trail (hash-chained, append-only) ---------- */
  FA.audit = {
    log: [],
    add(type, actor, detail, extra) {
      const prev = this.log.length ? this.log[this.log.length - 1].hash : '0'.repeat(64);
      const e = { n: this.log.length + 1, ts: new Date().toISOString(), sim: FA.data.fmt(FA.state.t), type, actor, detail, extra: extra || null, prev };
      e.hash = sha256(JSON.stringify([e.n, e.ts, e.sim, e.type, e.actor, e.detail, e.prev]));
      this.log.push(e);
      FA.bus.emit('audit', e);
      return e;
    },
    verify() {
      for (let i = 0; i < this.log.length; i++) {
        const e = this.log[i];
        const prev = i ? this.log[i - 1].hash : '0'.repeat(64);
        if (e.prev !== prev) return { ok: false, at: e.n };
        if (sha256(JSON.stringify([e.n, e.ts, e.sim, e.type, e.actor, e.detail, e.prev])) !== e.hash) return { ok: false, at: e.n };
      }
      return { ok: true, n: this.log.length };
    }
  };
  FA.sha256 = sha256;

  /* ---------- UI helpers ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v, d) => (v == null || isNaN(v) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 }));
  const pct = (a, b) => (b ? Math.round((100 * (a - b)) / b) : 0);

  FA.ui = {
    $, $$, esc, num, pct,
    toast(title, text, kind, ms) {
      const t = document.createElement('div');
      t.className = 'toast ' + (kind || '');
      t.innerHTML = '<b>' + esc(title) + '</b>' + (text ? '<span>' + esc(text) + '</span>' : '');
      $('#toasts').appendChild(t);
      setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = 0; setTimeout(() => t.remove(), 450); }, ms || 4200);
    },
    modal(html) { $('#modalBody').innerHTML = html; $('#modal').hidden = false; },
    closeModal() { $('#modal').hidden = true; },
    delta(cur, base, lowerIsBetter, unit) {
      if (base == null || cur == null) return '';
      const d = cur - base;
      if (Math.abs(d) < 1e-9) return '<span class="dim">± 0</span>';
      const good = lowerIsBetter ? d < 0 : d > 0;
      const p = base ? Math.round((100 * d) / Math.abs(base)) : null;
      return '<span class="' + (good ? 'good' : 'bad') + '">' + (d > 0 ? '▲ ' : '▼ ') + (p != null && isFinite(p) ? Math.abs(p) + '%' : num(Math.abs(d)) + (unit || '')) + '</span>';
    }
  };

  /* ---------- views ---------- */
  FA.views = FA.views || {};
  const mounted = {};
  FA.app = {
    setView(id) {
      FA.state.view = id;
      $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === id));
      $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + id));
      document.body.classList.toggle('cmd-mode', id === 'command');
      const v = FA.views[id];
      if (v) {
        if (!mounted[id] && v.mount) { v.mount(document.getElementById(({ network: 'networkRoot', data: 'dataRoot', lab: 'labRoot', gov: 'govRoot', impact: 'impactRoot' })[id] || ('view-' + id))); mounted[id] = true; }
        if (v.show) v.show();
      }
      FA.bus.emit('view', id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    loadScenario(id, seed, opts) {
      const S = FA.state;
      S.scenarioId = id; S.seed = seed || S.seed;
      S.inst = FA.data.generate(id, S.seed);
      const res = FA.engine.buildAll(S.inst);
      S.plans = res.plans; S.rec = res.rec; S.viewPlan = res.rec;
      S.active = 'baseline'; S.generated = false; S.approved = null; S.selected = null; S.replans = [];
      S.t = (opts && opts.t != null) ? opts.t : 300;
      FA.audit.add('SCENARIO', 'system', 'Loaded scenario "' + S.inst.scenario.name + '" (seed ' + S.seed + '): ' + S.inst.arrivals.length + ' arrivals, ' + S.inst.departures.length + ' departures');
      FA.bus.emit('scenario', S);
      FA.bus.emit('tick', S.t);
    },

    /** Controller asks FalconAero for recovery plans (plans are pre-computed; this reveals them with the pipeline animation). */
    generate() {
      const S = FA.state;
      S.generated = true;
      const p = S.plans[S.rec];
      FA.audit.add('AI_RECOMMEND', 'FalconAero', 'Generated 3 recovery plans in ' + Math.round(Object.values(S.plans).reduce((a, x) => a + x.ms, 0)) + ' ms; recommended "' + p.cfg.name + '" (score ' + p.kpi.scores.overall.toFixed(1) + ')', { rec: S.rec });
      FA.bus.emit('generated', S);
    },

    approve(planId, actor) {
      const S = FA.state;
      S.active = planId; S.viewPlan = planId;
      S.approved = { planId, by: actor || 'ATC Supervisor (demo)', at: S.t };
      const p = S.plans[planId];
      const override = planId !== S.rec;
      FA.audit.add(override ? 'HUMAN_OVERRIDE' : 'HUMAN_APPROVE', S.approved.by, (override ? 'Selected alternative plan "' : 'Approved recommended plan "') + p.cfg.name + '"', { planId, kpi: { avgDelay: +p.kpi.avgDelayAll.toFixed(1), diversions: p.kpi.diversions, conflicts: p.kpi.conflicts } });
      FA.ui.toast(override ? 'Alternative plan approved' : 'Plan approved', p.cfg.name + ' is now driving the operational picture. Instructions issued by controllers, not by AI.', 'green');
      FA.bus.emit('approved', S);
      FA.bus.emit('tick', S.t);
    },

    reject(reason) {
      const S = FA.state;
      FA.audit.add('HUMAN_REJECT', 'ATC Supervisor (demo)', 'Rejected AI plans — ' + (reason || 'controller judgement'), null);
      S.generated = false; S.active = 'baseline'; S.approved = null;
      FA.ui.toast('Plans rejected', 'Feedback logged for model review. Operations continue under current procedures.', 'amber');
      FA.bus.emit('generated', S);
      FA.bus.emit('tick', S.t);
    },

    /** Live disruption → re-plan every option instantly, keep the human decision state. */
    replan(reason, icon) {
      const S = FA.state;
      const before = S.plans[S.active];
      const t0 = performance.now();
      const res = FA.engine.buildAll(S.inst);
      const ms = performance.now() - t0;
      if (S.active === 'custom') { S.active = res.rec; if (S.approved) S.approved.planId = res.rec; }
      S.plans = res.plans; S.rec = res.rec;
      if (!S.plans[S.viewPlan]) S.viewPlan = res.rec;
      const after = S.plans[S.active];
      const changes = [];
      after.alloc.forEach((a) => {
        const b = before.allocById.get(a.id);
        if (b && b.stand !== a.stand) changes.push({ id: a.id, from: b.stand, to: a.stand, alts: (a.alts || []).slice(0, 2).map((x) => x.stand) });
      });
      after.divs.forEach((d) => { if (!before.divById.get(d.id)) changes.push({ id: d.id, from: '—', to: '↗' + d.alt, alts: [] }); });
      const stranded = S.active === 'baseline' ? after.conflicts.filter((c) => c.type === 'stand').length - before.conflicts.filter((c) => c.type === 'stand').length : 0;
      const rp = { t: S.t, reason, icon: icon || '🔧', ms, changes, stranded, planId: S.active };
      (S.replans = S.replans || []).push(rp);
      FA.audit.add('REPLAN', 'FalconAero', reason + ' → re-planned all options in ' + Math.round(ms) + ' ms (' + changes.length + ' changes to active plan)');
      FA.bus.emit('replan', rp);
      FA.bus.emit('tick', S.t);
      return rp;
    },

    toggleStand(id) {
      const S = FA.state, st = S.inst.stands.find((x) => x.id === id);
      if (!st) return;
      const t = Math.max(300, Math.round(S.t));
      const ev = S.inst.events.find((e) => e.type === 'standOutage' && e.user && e.stands[0] === id);
      if (ev) {
        st.outOfService = false; st.outage = null;
        S.inst.events = S.inst.events.filter((e) => e !== ev);
        return FA.app.replan('Stand ' + id + ' back in service', '✅');
      }
      st.outOfService = true; st.outage = { start: t, end: 600 };
      S.inst.events = S.inst.events.concat([{ type: 'standOutage', stands: [id], start: t, end: 600, user: true }]);
      return FA.app.replan('Stand ' + id + ' unavailable', '🔧');
    },

    toggleRunway() {
      const S = FA.state, t = Math.max(300, Math.round(S.t));
      const ev = S.inst.events.find((e) => e.type === 'rwyClosure' && e.user && t >= e.start && t < e.end);
      if (ev) { ev.end = t; return FA.app.replan('Runway 12L/30R re-opened', '✅'); }
      S.inst.events = S.inst.events.concat([{ type: 'rwyClosure', rwy: 'N', start: t, end: t + 45, user: true }]);
      return FA.app.replan('Runway 12L/30R closed for 45 min', '⛔');
    },

    select(flightId) {
      FA.state.selected = flightId;
      FA.bus.emit('select', flightId);
    },

    setTime(t) { FA.state.t = Math.max(300, Math.min(510, t)); FA.bus.emit('tick', FA.state.t); },
    play(on) { FA.state.playing = on == null ? !FA.state.playing : on; FA.bus.emit('play', FA.state.playing); }
  };

  /* ---------- clock loop ---------- */
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const S = FA.state;
    if (S.playing && S.inst) {
      S.t += (dt * S.speed) / 60;
      if (S.t >= 510) { S.t = 510; S.playing = false; FA.bus.emit('play', false); }
      FA.bus.emit('tick', S.t);
    }
    requestAnimationFrame(loop);
  }

  /* ---------- boot ---------- */
  function boot() {
    $$('#tabs button').forEach((b) => b.addEventListener('click', () => FA.app.setView(b.dataset.view)));
    $('#modalX').addEventListener('click', FA.ui.closeModal);
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') FA.ui.closeModal(); });
    FA.bus.on('tick', (t) => { $('#clock').textContent = FA.data.fmt(t); });
    Object.keys(FA.views).forEach((id) => { if (FA.views[id].init) FA.views[id].init(); });
    const hash = (location.hash || '').replace('#', '');
    FA.app.loadScenario(FA.state.scenarioId, FA.state.seed);
    FA.app.setView(FA.views[hash] ? hash : 'command');
    requestAnimationFrame(loop);
    if (/demo/.test(location.search) && FA.demo) setTimeout(() => FA.demo.start(), 600);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.FA);
