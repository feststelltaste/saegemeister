/* Sägemeister – Oberfläche, Live-Modus, Speicherung */
(function () {
  'use strict';
  const S = window.Saege, G = window.SaegeSvg;
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const fmt = S.fmt;
  const KEY = 'saegemeister.v1';
  const clone = o => JSON.parse(JSON.stringify(o));
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  let inp, plan, checks = {}, sig = '', liveIdx = 0, wakeLock = null, tab = 'plan', openGfx = {};

  /* ---------- Speicherung / Link ---------- */
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ inp, checks, sig })); } catch (e) { /* privater Modus */ }
  }
  function load() {
    let st = null;
    try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { st = null; }
    let fromHash = null;
    try {
      const m = /[#&]p=([^&]+)/.exec(location.hash);
      if (m) fromHash = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]).replace(/-/g, '+').replace(/_/g, '/')))));
    } catch (e) { fromHash = null; }
    inp = Object.assign(clone(S.DEFAULTS), fromHash || (st && st.inp) || {});
    if (!Array.isArray(inp.items)) inp.items = clone(S.DEFAULTS.items);
    if (st) { checks = st.checks || {}; sig = st.sig || ''; }
  }
  function shareUrl() {
    const b = btoa(unescape(encodeURIComponent(JSON.stringify(inp)))).replace(/\+/g, '-').replace(/\//g, '_');
    return location.href.split('#')[0] + '#p=' + encodeURIComponent(b);
  }
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function copyLink() {
    const url = shareUrl();
    const done = () => toast('Link kopiert – auf dem Smartphone öffnen ✓');
    const fallback = () => {
      const ta = el('textarea'); ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta);
      ta.select(); try { document.execCommand('copy'); done(); } catch (e) { window.prompt('Link kopieren:', url); } ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fallback); else fallback();
    history.replaceState(null, '', url);
  }

  /* ---------- Eingabe-Bausteine ---------- */
  function roundTo(v, dec) { const f = Math.pow(10, dec); return Math.round(v * f) / f; }
  function field(parent, obj, key, c, onChange) {
    const wrap = el('div', 'fld'); if (c.cls) wrap.className += ' ' + c.cls;
    const lab = el('label', null, esc(c.label)); wrap.appendChild(lab);
    const stp = el('div', 'stp');
    const minus = el('button', null, '−'), plus = el('button', null, '+');
    minus.type = plus.type = 'button'; minus.setAttribute('aria-label', c.label + ' verringern'); plus.setAttribute('aria-label', c.label + ' erhöhen');
    const val = el('div', 'val'), input = el('input');
    input.type = 'number'; input.inputMode = 'decimal'; input.step = 'any'; input.value = obj[key];
    input.setAttribute('aria-label', c.label);
    val.appendChild(input); val.appendChild(el('span', 'unit', c.unit || ''));
    stp.appendChild(minus); stp.appendChild(val); stp.appendChild(plus); wrap.appendChild(stp);
    const dec = c.dec == null ? 0 : c.dec;
    const set = v => {
      if (!isFinite(v)) return;
      if (c.min != null) v = Math.max(c.min, v);
      if (c.max != null) v = Math.min(c.max, v);
      obj[key] = roundTo(v, dec); input.value = obj[key]; markChips(); onChange();
    };
    minus.addEventListener('click', () => set(roundTo((Number(obj[key]) || 0) - c.step, dec)));
    plus.addEventListener('click', () => set(roundTo((Number(obj[key]) || 0) + c.step, dec)));
    input.addEventListener('input', () => {
      const v = parseFloat(String(input.value).replace(',', '.'));
      if (isFinite(v)) { obj[key] = v; markChips(); onChange(); }
    });
    input.addEventListener('blur', () => { input.value = obj[key]; });
    input.addEventListener('focus', () => setTimeout(() => input.select && input.select(), 0));
    let chips = [];
    function markChips() { chips.forEach(b => b.classList.toggle('on', Number(b.dataset.v) === Number(obj[key]))); }
    if (c.chips) {
      const cw = el('div', 'chips');
      c.chips.forEach(v => {
        const b = el('button', 'chip', String(v).replace('.', ',')); b.type = 'button'; b.dataset.v = v;
        b.addEventListener('click', () => set(v)); cw.appendChild(b); chips.push(b);
      });
      wrap.appendChild(cw); markChips();
    }
    parent.appendChild(wrap);
    return { wrap, set, refresh() { input.value = obj[key]; markChips(); } };
  }
  function select(parent, label, options, value, onChange) {
    const wrap = el('div', 'fld'); wrap.appendChild(el('label', null, esc(label)));
    const sel = el('select');
    options.forEach(o => { const op = el('option', null, esc(o.name)); op.value = o.id; sel.appendChild(op); });
    sel.value = value; sel.addEventListener('change', () => onChange(sel.value));
    wrap.appendChild(sel); parent.appendChild(wrap);
    return { wrap, sel };
  }
  function checkbox(parent, label, checked, onChange, cls) {
    const l = el('label', 'chk' + (cls ? ' ' + cls : '')), c = el('input'); c.type = 'checkbox'; c.checked = checked;
    c.addEventListener('change', () => onChange(c.checked));
    l.appendChild(c); l.appendChild(el('span', null, label)); parent.appendChild(l);
    return c;
  }

  /* ---------- Formular aufbauen ---------- */
  let ui = {};
  function buildStamm() {
    const box = $('#fStamm'); box.innerHTML = '';
    ui.dmid = field(box, inp, 'dmid', { label: 'Mittendurchmesser', unit: 'cm', step: 1, min: 5, max: 200, dec: 1, chips: [20, 30, 40, 50, 60] }, upd);
    ui.taper = field(box, inp, 'taper', { label: 'Abholzigkeit', unit: 'cm/m', step: 0.5, min: 0, max: 10, dec: 1, chips: [0, 0.5, 1, 1.5, 2] }, upd);
    ui.dtop = field(box, inp, 'dtop', { label: 'Zopfdurchmesser (dünnes Ende)', unit: 'cm', step: 1, min: 5, max: 200, dec: 1 }, upd);
    ui.dbutt = field(box, inp, 'dbutt', { label: 'Fußdurchmesser (dickes Ende)', unit: 'cm', step: 1, min: 5, max: 250, dec: 1 }, upd);
    ui.len = field(box, inp, 'len', { label: 'Stammlänge', unit: 'm', step: 0.1, min: 0.5, max: 20, dec: 2, chips: [3, 4, 5, 6] }, upd);
    const f = select(box, 'Wuchsform', [{ id: 'gerade', name: 'Gerade' }, { id: 'krumm', name: 'Leicht krumm / abholzig gebogen' }], inp.form, v => { inp.form = v; syncVis(); upd(); });
    ui.form = f;
    ui.pfeil = field(box, inp, 'pfeil', { label: 'Krümmung (Pfeilhöhe)', unit: 'cm', step: 1, min: 0, max: 30, dec: 0, chips: [1, 2, 4, 6] }, upd);
    syncVis();
  }
  function syncVis() {
    const mid = inp.mode !== 'ends';
    ui.dmid.wrap.hidden = ui.taper.wrap.hidden = !mid;
    ui.dtop.wrap.hidden = ui.dbutt.wrap.hidden = mid;
    ui.pfeil.wrap.hidden = inp.form !== 'krumm';
    document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === (mid ? 'mid' : 'ends')));
  }
  function buildSaw() {
    const box = $('#fSaw'); box.innerHTML = '';
    select(box, 'Holzart', S.SPECIES.map(s => ({ id: s.id, name: s.name + ' (' + s.typ + ')' })), inp.species, v => {
      inp.species = v; inp.alt = S.speciesOf(v).spannung; altBox.checked = inp.alt; upd();
    });
    select(box, 'Sägetyp', S.SAWS, inp.saw, v => {
      inp.saw = v; inp.kerf = S.SAWS.find(s => s.id === v).kerf; ui.kerf.refresh(); upd();
    });
    ui.kerf = field(box, inp, 'kerf', { label: 'Schnittfugenbreite', unit: 'mm', step: 0.1, min: 0, max: 15, dec: 1, chips: [1.5, 2.0, 2.5, 3.0] }, upd);
    select(box, 'Einschnitt-Strategie', S.STRATEGIES, inp.strategy, v => { inp.strategy = v; upd(); });
    select(box, 'Höhenausgleich (Zopf anheben)', S.LEVELS, inp.level, v => { inp.level = v; upd(); });
    const altBox = checkbox(box, 'Wechselschnitt (häufiger 180° wenden – bei Spannungsholz)', !!inp.alt, v => { inp.alt = v; upd(); });
    ui.alt = altBox;
  }
  const T_CHIPS = [24, 30, 50, 100, 150], W_CHIPS = [80, 100, 150, 200, 250], L_CHIPS = [3000, 4000, 5000, 6000];
  function buildItems() {
    const box = $('#items'); box.innerHTML = '';
    inp.items.forEach((it, i) => {
      const card = el('div', 'item');
      const head = el('div', 'item-head');
      const title = el('b', null, '');
      head.appendChild(title);
      const del = el('button', 'del', '✕'); del.type = 'button'; del.setAttribute('aria-label', 'Position ' + (i + 1) + ' löschen');
      del.addEventListener('click', () => { inp.items.splice(i, 1); buildItems(); upd(); });
      head.appendChild(del); card.appendChild(head);
      const grid = el('div', 'item-grid'); card.appendChild(grid);
      const refreshTitle = () => {
        const q = S.cleanItems({ items: [it] })[0];
        title.innerHTML = '<span class="swatch" style="background:' + G.colorOf(i) + '"></span>Pos. ' + (i + 1) + (q ? ' – ' + S.kindName(it.t, it.w) : '');
      };
      const ch = () => { refreshTitle(); upd(); };
      field(grid, it, 't', { label: 'Dicke', unit: 'mm', step: 1, min: 1, max: 500, dec: 0, chips: T_CHIPS }, ch);
      field(grid, it, 'w', { label: 'Breite', unit: 'mm', step: 5, min: 1, max: 800, dec: 0, chips: W_CHIPS }, ch);
      field(grid, it, 'l', { label: 'Länge', unit: 'mm', step: 100, min: 0, max: 20000, dec: 0, chips: L_CHIPS }, ch);
      field(grid, it, 'q', { label: 'Menge', unit: 'Stk', step: 1, min: 0, max: 500, dec: 0 }, ch);
      checkbox(card, 'Seitenware (aus Schwarten-Segment)', !!it.side, v => { it.side = v; upd(); });
      refreshTitle();
      box.appendChild(card);
    });
    if (!inp.items.length) box.appendChild(el('p', 'hint', 'Noch keine Position – bitte hinzufügen.'));
  }

  /* ---------- Berechnung & Ergebnis ---------- */
  let flowDirty = true;
  function upd() {
    plan = S.buildPlan(inp);
    const stepSig = plan.valid ? plan.steps.map(s => s.title + '|' + s.sub).join('~') : '';
    if (stepSig !== sig) {
      if (Object.keys(checks).length && sig) toast('Plan geändert – Häkchen zurückgesetzt');
      checks = {}; sig = stepSig; openGfx = {};
    }
    renderResults(); flowDirty = true;
    if (tab === 'flow') renderFlow();
    save();
  }
  const m3 = v => fmt(v, 3) + ' m³';
  function renderResults() {
    const box = $('#results');
    if (!plan.valid) { box.innerHTML = plan.warnings.map(w => '<div class="msg err">' + esc(w.msg) + '</div>').join(''); return; }
    const r = plan.res, g = plan.g;
    let h = '<div class="tiles">';
    h += '<div class="tile main"><small>Ertrag / Ausbeute</small><b>' + fmt(r.yield, 1) + ' %</b><em> ' + m3(r.vSawn) + ' aus ' + m3(r.vRound) + '</em></div>';
    h += '<div class="tile"><small>Rundholz</small><b>' + fmt(r.vRound, 3) + '</b><em>m³ (Fm)</em></div>';
    h += '<div class="tile"><small>Schnittholz</small><b>' + fmt(r.vSawn, 3) + '</b><em>m³</em></div>';
    h += '<div class="tile"><small>Schnittfuge / Sägemehl</small><b>' + fmt(r.vKerf, 3) + '</b><em>m³ · ' + fmt(r.kerfShare, 1) + ' %</em></div>';
    h += '<div class="tile"><small>Sonstiger Verlust</small><b>' + fmt(r.vOther, 3) + '</b><em>m³ · ' + fmt(r.otherShare, 1) + ' %</em></div>';
    h += '<div class="tile"><small>Hölzer gesamt</small><b>' + r.pieces + '</b><em>Stück · ' + r.cuts + ' Schnitte</em></div>';
    h += '<div class="tile"><small>Höhenausgleich (Zopf)</small><b>' + fmt(r.liftSel, 0) + ' mm</b><em>A ' + fmt(r.lift.A, 0) + ' · B ' + fmt(r.lift.B, 0) + ' mm</em></div>';
    h += '</div>';
    const pk = Math.max(0, r.yield), pf = Math.max(0, r.kerfShare), po = Math.max(0, 100 - pk - pf);
    h += '<div class="split" aria-hidden="true"><div style="width:' + pk + '%;background:#0B7A33"></div><div style="width:' + pf + '%;background:#111"></div><div style="width:' + po + '%;background:#FF5A00"></div></div>';
    h += '<div class="split-leg"><span>■ Schnittholz ' + fmt(pk, 1) + ' %</span><span>■ Fuge ' + fmt(pf, 1) + ' %</span><span>■ Schwarte/Reste/Schwund ' + fmt(po, 1) + ' %</span></div>';
    const bad = plan.warnings.filter(w => w.lvl === 'err').length;
    h += '<div class="msgs">';
    if (!bad) h += '<div class="msg ok">✓ Plausibilitäts-Check: Muster passt geometrisch (am Zopf) und vom Volumen her in den Stamm.</div>';
    plan.warnings.forEach(w => { h += '<div class="msg ' + w.lvl + '">' + (w.lvl === 'err' ? '⛔ ' : w.lvl === 'warn' ? '⚠️ ' : 'ℹ️ ') + esc(w.msg) + '</div>'; });
    h += '</div>';
    const sp = plan.sp;
    h += '<table class="kv">';
    h += '<tr><td>Einschnitt-Strategie</td><td>' + esc(plan.stratName.replace(/ \(.*/, '')) + '</td></tr>';
    h += '<tr><td>Zopf / Mitte / Fuß ⌀</td><td>' + fmt(g.dtop / 10, 1) + ' / ' + fmt(g.dmid / 10, 1) + ' / ' + fmt(g.dbutt / 10, 1) + ' cm</td></tr>';
    h += '<tr><td>Abholzigkeit</td><td>' + fmt(g.taperPerM, 2) + ' cm/m</td></tr>';
    h += '<tr><td>Modell / Stapel (B × H)</td><td>' + (plan.strat === 'scharf' ? '– × ' : fmt(plan.model.Wm, 0) + ' × ') + fmt(plan.model.Hm, 0) + ' mm</td></tr>';
    h += '<tr><td>Übermaß ' + esc(sp.name) + ' (ca. ' + fmt(sp.uebermass, 1).replace(',0', '') + ' %)</td><td>' + plan.items.slice(0, 3).map(i => i.t + '→+' + fmt(i.t * sp.uebermass / 100, 1) + ' mm').join(' · ') + '</td></tr>';
    if (sp.spannung) h += '<tr><td>Spannungen</td><td>Wechselschnitt empfohlen</td></tr>';
    h += '</table>';
    box.innerHTML = h;
  }

  /* ---------- Ablauf ---------- */
  function doneOps() {
    const set = new Set();
    plan.steps.forEach(s => { if (s.kind === 'cut' && checks[s.id]) set.add(s.op); });
    return set;
  }
  function firstOpen() { const i = plan.steps.findIndex(s => !checks[s.id]); return i < 0 ? plan.steps.length : i; }
  function progress() {
    const cuts = plan.steps.filter(s => s.kind === 'cut'), dc = cuts.filter(s => checks[s.id]).length;
    const ds = plan.steps.filter(s => checks[s.id]).length;
    return { cuts: cuts.length, dc, steps: plan.steps.length, ds };
  }
  function renderLegend() {
    let h = '';
    plan.items.forEach(i => { h += '<span><span class="swatch" style="background:' + G.colorOf(i.idx) + '"></span>Pos. ' + (i.idx + 1) + ': ' + i.t + '×' + i.w + ' · ' + i.q + ' Stk' + (i.side ? ' (Seite)' : '') + '</span>'; });
    $('#legend').innerHTML = h + '<span><span class="swatch" style="background:#B9AE98"></span>Schwarte/Rest</span>';
  }
  function renderFlow() {
    flowDirty = false;
    const box = $('#steps');
    if (!plan.valid) { box.innerHTML = '<div class="card"><div class="msg err">Bitte zuerst gültige Stammmaße eingeben.</div></div>'; $('#overview').innerHTML = ''; return; }
    const cur = firstOpen();
    $('#overview').innerHTML = G.overviewSvg(plan, { done: doneOps(), current: plan.steps[cur] && plan.steps[cur].kind === 'cut' ? plan.steps[cur].op : -1 });
    renderLegend();
    const p = progress();
    $('#progText').textContent = p.dc >= p.cuts && p.cuts ? 'Alle ' + p.cuts + ' Schnitte erledigt ✓' : 'Schnitt ' + Math.min(p.dc + 1, p.cuts) + ' von ' + p.cuts + ' – ' + p.dc + ' erledigt';
    $('#progBar').style.width = (p.steps ? p.ds / p.steps * 100 : 0) + '%';
    let html = '', lastPhase = '';
    plan.steps.forEach((s, i) => {
      if (s.phase !== lastPhase) { html += '<div class="phase">' + esc(s.phase) + '</div>'; lastPhase = s.phase; }
      const done = !!checks[s.id], isCur = i === cur, open = openGfx[s.id] != null ? openGfx[s.id] : isCur;
      html += '<div class="step' + (done ? ' done' : '') + (isCur ? ' current' : '') + (s.important ? ' important' : '') + '" data-i="' + i + '" id="st-' + s.id + '">' +
        '<div class="st-main"><button type="button" class="tick" data-tick="' + s.id + '" aria-label="' + (done ? 'Erledigt – zurücknehmen' : 'Als erledigt abhaken') + '">✓</button>' +
        '<div><div class="st-title">' + esc(s.title) + '</div><div class="st-sub">' + esc(s.sub) + '</div></div></div>' +
        (s.kind !== 'cut' ? '<div class="st-text">' + esc(s.text) + '</div>' : '') +
        '<button type="button" class="st-toggle" data-gfx="' + s.id + '">' + (open ? 'Grafik ausblenden' : 'Grafik anzeigen') + '</button>' +
        (open ? '<div class="st-gfx">' + G.stepSvg(plan, s, { done: doneOps() }) + '</div>' : '') + '</div>';
    });
    box.innerHTML = html;
  }
  $('#steps').addEventListener('click', e => {
    const t = e.target.closest('[data-tick]'), g = e.target.closest('[data-gfx]');
    if (t) {
      const id = t.dataset.tick; checks[id] = !checks[id]; save();
      renderFlow();
      if (checks[id]) { const c = $('.step.current'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    } else if (g) {
      const id = g.dataset.gfx, i = plan.steps.findIndex(s => s.id === id), cur = firstOpen();
      const open = openGfx[id] != null ? openGfx[id] : i === cur;
      openGfx[id] = !open; renderFlow();
    }
  });
  function resetAll() {
    if (!confirm('Alle Häkchen zurücksetzen und mit dem nächsten Stamm beginnen?')) return;
    checks = {}; openGfx = {}; liveIdx = 0; save(); renderFlow(); if (!$('#live').hidden) renderLive(); toast('Einschnitt zurückgesetzt – nächster Stamm');
    window.scrollTo({ top: 0 });
  }

  /* ---------- Live-Modus ---------- */
  async function lockOn() {
    try { if ('wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) { wakeLock = null; }
  }
  function lockOff() { try { if (wakeLock) wakeLock.release(); } catch (e) { /* egal */ } wakeLock = null; }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !$('#live').hidden && !wakeLock) lockOn(); });

  function openLive() {
    if (!plan.valid) { toast('Bitte zuerst gültige Stammmaße eingeben'); return; }
    liveIdx = firstOpen(); if (liveIdx >= plan.steps.length) liveIdx = plan.steps.length - 1;
    $('#live').hidden = false; document.body.style.overflow = 'hidden';
    renderLive(); lockOn();
  }
  function closeLive() { $('#live').hidden = true; document.body.style.overflow = ''; lockOff(); flowDirty = true; if (tab === 'flow') renderFlow(); setTab(tab === 'live' ? 'flow' : tab); }
  function renderLive() {
    const p = progress(), s = plan.steps[liveIdx];
    const isDone = s.kind === 'done';
    $('#lvMeta').textContent = (isDone ? 'Fertig' : 'Schritt ' + (liveIdx + 1) + ' von ' + plan.steps.length) + ' · ' + p.dc + '/' + p.cuts + ' Schnitte' + (wakeLock ? ' · ☀ an' : '');
    $('#lvProg').style.width = (p.steps ? p.ds / p.steps * 100 : 0) + '%';
    const t = $('#lvTitle');
    t.className = s.important ? 'warn' : '';
    t.innerHTML = s.kind === 'cut' ? 'Schnitt ' + s.cutNo + ': Skala auf <em>' + s.h + ' mm</em> stellen' : esc(s.title);
    $('#lvSub').textContent = s.sub;
    const done = !!checks[s.id];
    $('#lvGfx').innerHTML = G.stepSvg(plan, s, { done: doneOps() });
    const nx = $('#lvNext');
    if (isDone) nx.textContent = '↺ Einschnitt zurücksetzen (Nächster Stamm)';
    else nx.textContent = done ? '→ Weiter' : '✓ Schnitt / Schritt erledigt → Nächster Schritt';
    $('#lvBack').disabled = liveIdx === 0;
    $('#lvBack').style.opacity = liveIdx === 0 ? .4 : 1;
  }
  function liveNext() {
    const s = plan.steps[liveIdx];
    if (s.kind === 'done') { checks = {}; openGfx = {}; liveIdx = 0; save(); renderLive(); toast('Zurückgesetzt – nächster Stamm'); return; }
    checks[s.id] = true; save();
    liveIdx = Math.min(plan.steps.length - 1, liveIdx + 1);
    if (checks[plan.steps[liveIdx].id]) { const f = firstOpen(); liveIdx = Math.min(f, plan.steps.length - 1); }
    if (plan.steps[liveIdx].kind === 'done') checks[plan.steps[liveIdx].id] = true;
    renderLive();
    if (navigator.vibrate) try { navigator.vibrate(30); } catch (e) { /* ignorieren */ }
  }
  function liveBack() {
    if (liveIdx === 0) return;
    liveIdx--; delete checks[plan.steps[liveIdx].id];
    const dn = plan.steps.find(s => s.kind === 'done'); if (dn) delete checks[dn.id];
    save(); renderLive();
  }

  /* ---------- Tabs ---------- */
  function setTab(t) {
    if (t === 'live') { openLive(); return; }
    tab = t;
    $('#view-plan').hidden = t !== 'plan'; $('#view-flow').hidden = t !== 'flow';
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    if (t === 'flow' && (flowDirty || true)) renderFlow();
    window.scrollTo({ top: 0 });
  }

  /* ---------- PDF-Datenblatt ---------- */
  function buildPrint() {
    if (!plan.valid) return false;
    const g = plan.g, r = plan.res, sp = plan.sp, d = new Date();
    let h = '<div class="pr"><h1>SÄGEMEISTER – Säge-Datenblatt</h1><p>' + d.toLocaleDateString('de-DE') + ' · ' + esc(plan.stratName) + '</p>';
    h += '<h2>Stamm &amp; Säge</h2><table><tr><td>Zopf / Mitte / Fuß ⌀</td><td>' + fmt(g.dtop / 10, 1) + ' / ' + fmt(g.dmid / 10, 1) + ' / ' + fmt(g.dbutt / 10, 1) + ' cm</td><td>Länge</td><td>' + fmt(g.L / 1000, 2) + ' m</td></tr>' +
      '<tr><td>Holzart</td><td>' + esc(sp.name) + '</td><td>Schnittfuge</td><td>' + fmt(plan.k, 1) + ' mm</td></tr>' +
      '<tr><td>Höhenausgleich</td><td>Fall ' + inp.level + ': ' + fmt(plan.liftSel, 0) + ' mm</td><td>Wuchsform</td><td>' + (inp.form === 'krumm' ? 'krumm (' + inp.pfeil + ' cm)' : 'gerade') + '</td></tr></table>';
    h += '<h2>Ergebnis</h2><table><tr><td>Rundholz</td><td>' + m3(r.vRound) + '</td><td>Schnittholz</td><td>' + m3(r.vSawn) + '</td></tr>' +
      '<tr><td>Ausbeute</td><td><b>' + fmt(r.yield, 1) + ' %</b></td><td>Schnittfuge/Sägemehl</td><td>' + m3(r.vKerf) + '</td></tr>' +
      '<tr><td>Sonstiger Verlust</td><td>' + m3(r.vOther) + '</td><td>Hölzer gesamt</td><td>' + r.pieces + ' Stk</td></tr></table>';
    h += '<h2>Schnittmuster</h2><table><tr><th>Pos.</th><th>Dicke</th><th>Breite</th><th>Länge</th><th>Menge</th><th>Typ</th></tr>';
    plan.items.forEach(i => { h += '<tr><td>' + (i.idx + 1) + '</td><td>' + i.t + '</td><td>' + i.w + '</td><td>' + i.l + '</td><td>' + i.q + '</td><td>' + (i.side ? 'Seitenware' : 'Hauptware') + '</td></tr>'; });
    h += '</table>';
    plan.warnings.filter(w => w.lvl !== 'info').forEach(w => { h += '<p>⚠ ' + esc(w.msg) + '</p>'; });
    h += '<h2>Gesamt-Schnittbild</h2><div class="ov">' + G.overviewSvg(plan, {}) + '</div>';
    h += '<h2>Einschnitt-Ablauf (zum Abhaken)</h2><div class="grid">';
    let last = '';
    plan.steps.forEach(s => {
      if (s.phase !== last) { h += '<div class="ph">' + esc(s.phase) + '</div>'; last = s.phase; }
      if (s.kind === 'done') { h += '<div class="pstep"><div class="t"><span class="box"></span>' + esc(s.title) + '</div></div>'; return; }
      h += '<div class="pstep"><div class="t"><span class="box"></span>' + esc(s.title) + '</div><div>' + esc(s.sub) + '</div>' + G.stepSvg(plan, s, {}) + '</div>';
    });
    h += '</div><p style="font-size:9pt">Berechnet aus den Eingaben (Querschnitt am Zopfende, Rundholzvolumen nach Huber). Ergebnisse je nach realer Wuchsform am Stamm anpassen.</p></div>';
    $('#printSheet').innerHTML = h;
    return true;
  }

  /* ---------- Start ---------- */
  function init() {
    load();
    buildStamm(); buildSaw(); buildItems();
    document.querySelectorAll('#modeSeg button').forEach(b => b.addEventListener('click', () => { inp.mode = b.dataset.mode; syncVis(); upd(); }));
    $('#addItem').addEventListener('click', () => {
      const last = inp.items[inp.items.length - 1];
      inp.items.push({ t: last ? last.t : 24, w: last ? last.w : 150, l: last ? last.l : Math.round(inp.len * 1000), q: 1, side: false });
      buildItems(); upd();
      const cards = document.querySelectorAll('.item'); if (cards.length) cards[cards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    $('#btnCopy').addEventListener('click', copyLink);
    $('#btnPdf').addEventListener('click', () => { if (buildPrint()) window.print(); else toast('Bitte zuerst gültige Stammmaße eingeben'); });
    window.addEventListener('beforeprint', buildPrint);
    $('#btnLive').addEventListener('click', openLive);
    $('#btnReset').addEventListener('click', resetAll);
    $('#lvClose').addEventListener('click', closeLive);
    $('#lvNext').addEventListener('click', liveNext);
    $('#lvBack').addEventListener('click', liveBack);
    upd();
    window.__saege = { get plan() { return plan; }, get inp() { return inp; }, upd, setTab, openLive };
  }
  init();
})();
