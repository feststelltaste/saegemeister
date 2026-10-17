/* Sägemeister – Berechnung & Einschnittplan (reine Logik, keine DOM-Zugriffe)
 *
 * Koordinaten: Stammquerschnitt (Zopfende) in mm, Mittelpunkt (Markröhre) = (0,0), x rechts, y oben.
 * Jeder Schnitt ist eine Ebene mit Normale n (zeigt zur Säge / nach "oben" in der aktuellen Lage)
 * und Abstand d: Der verbleibende Stamm liegt bei p·n <= d, die Schnittfuge bei d..d+kerf,
 * das abgetrennte Stück bei p·n >= d+kerf.
 */
(function (root) {
  'use strict';
  const PI = Math.PI;

  const SPECIES = [
    { id: 'fichte', name: 'Fichte', typ: 'Nadelholz', uebermass: 4.0, spannung: false },
    { id: 'tanne', name: 'Tanne', typ: 'Nadelholz', uebermass: 4.0, spannung: false },
    { id: 'kiefer', name: 'Kiefer', typ: 'Nadelholz', uebermass: 4.5, spannung: false },
    { id: 'laerche', name: 'Lärche', typ: 'Nadelholz', uebermass: 4.5, spannung: false },
    { id: 'douglasie', name: 'Douglasie', typ: 'Nadelholz', uebermass: 4.0, spannung: false },
    { id: 'buche', name: 'Buche', typ: 'Laubholz', uebermass: 8.0, spannung: true },
    { id: 'eiche', name: 'Eiche', typ: 'Laubholz', uebermass: 6.5, spannung: true },
    { id: 'esche', name: 'Esche', typ: 'Laubholz', uebermass: 6.5, spannung: true },
    { id: 'ahorn', name: 'Ahorn', typ: 'Laubholz', uebermass: 7.0, spannung: false },
    { id: 'birke', name: 'Birke', typ: 'Laubholz', uebermass: 7.0, spannung: true },
    { id: 'robinie', name: 'Robinie', typ: 'Laubholz', uebermass: 5.5, spannung: true },
    { id: 'kirsche', name: 'Kirsche', typ: 'Laubholz', uebermass: 6.0, spannung: false },
    { id: 'erle', name: 'Erle', typ: 'Laubholz', uebermass: 6.0, spannung: false },
    { id: 'pappel', name: 'Pappel', typ: 'Laubholz', uebermass: 5.5, spannung: false },
    { id: 'nuss', name: 'Nussbaum', typ: 'Laubholz', uebermass: 6.0, spannung: false }
  ];

  const SAWS = [
    { id: 'duenn', name: 'Blockbandsäge – Dünnschnitt', kerf: 2.0 },
    { id: 'breit', name: 'Blockbandsäge – Breitband', kerf: 3.0 },
    { id: 'gatter', name: 'Gattersäge (Vergleich)', kerf: 3.5 },
    { id: 'kreis', name: 'Blockkreissäge (Vergleich)', kerf: 4.5 },
    { id: 'kette', name: 'Kettensägen-Mühle (Vergleich)', kerf: 8.0 }
  ];

  const STRATEGIES = [
    { id: 'auto', name: 'Automatisch ableiten' },
    { id: 'scharf', name: 'Scharfschnitt (ohne Drehen, Blockware)' },
    { id: 'prisma', name: 'Prismen-/Modelschnitt (2 Seiten, 90°, auftrennen)' },
    { id: 'vier', name: '4-Seiten-Einschnitt (Kantholz & Balken)' }
  ];

  const LEVELS = [
    { id: 'A', name: 'A: Markröhre parallel zum Bett (Standard)' },
    { id: 'B', name: 'B: Rindenparalleler Schnitt' },
    { id: 'C', name: 'C: Kein Ausgleich (zylindrischer Stamm)' }
  ];

  const DEFAULTS = {
    mode: 'mid', dmid: 40, taper: 1, dtop: 38, dbutt: 42, len: 4,
    form: 'gerade', pfeil: 2, species: 'fichte', saw: 'duenn', kerf: 2.0,
    strategy: 'auto', level: 'A', alt: false,
    items: [
      { t: 50, w: 200, l: 4000, q: 2, side: false },
      { t: 24, w: 150, l: 4000, q: 4, side: false },
      { t: 24, w: 80, l: 4000, q: 2, side: true }
    ]
  };

  /* ---------- Geometrie-Helfer ---------- */
  function circlePoly(r, N) {
    const a = [];
    for (let i = 0; i < N; i++) { const t = 2 * PI * i / N; a.push([r * Math.cos(t), r * Math.sin(t)]); }
    return a;
  }
  function clipHalf(poly, nx, ny, c, keepGE) {
    const out = [], n = poly.length;
    if (!n) return out;
    const s = keepGE ? 1 : -1;
    const f = p => (nx * p[0] + ny * p[1] - c) * s;
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n], fa = f(a), fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) {
        const t = fa / (fa - fb);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  }
  function area(poly) {
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s) / 2;
  }
  function centroid(poly) {
    let x = 0, y = 0;
    poly.forEach(p => { x += p[0]; y += p[1]; });
    return [x / poly.length, y / poly.length];
  }
  function minDot(poly, n) {
    let m = Infinity;
    poly.forEach(p => { m = Math.min(m, n[0] * p[0] + n[1] * p[1]); });
    return m;
  }
  function extentAlong(poly, v) {
    let lo = Infinity, hi = -Infinity;
    poly.forEach(p => { const d = v[0] * p[0] + v[1] * p[1]; lo = Math.min(lo, d); hi = Math.max(hi, d); });
    return poly.length ? hi - lo : 0;
  }
  const rot = (n, p) => [p[0] * n[1] - p[1] * n[0], p[0] * n[0] + p[1] * n[1]]; // n -> nach oben

  /* ---------- Hilfsfunktionen ---------- */
  function num(v, def) { v = Number(v); return isFinite(v) ? v : def; }
  function fmt(v, dec) { return (dec == null ? String(v) : Number(v).toFixed(dec)).replace('.', ','); }
  function kindName(t, w) {
    if (t >= 80 && w <= 3 * t) return 'Kantholz';
    if (t >= 40) return 'Bohle';
    if (w <= 60) return 'Latte';
    return 'Brett';
  }
  function speciesOf(id) { return SPECIES.find(s => s.id === id) || SPECIES[0]; }

  function geometry(inp) {
    const L = num(inp.len, 0) * 1000;
    let dtop, dbutt, swapped = false;
    if (inp.mode === 'ends') {
      dtop = num(inp.dtop, 0) * 10; dbutt = num(inp.dbutt, 0) * 10;
    } else {
      const half = Math.max(0, num(inp.taper, 0)) * 10 * num(inp.len, 0) / 2;
      dtop = num(inp.dmid, 0) * 10 - half; dbutt = num(inp.dmid, 0) * 10 + half;
    }
    if (dtop > dbutt) { const x = dtop; dtop = dbutt; dbutt = x; swapped = true; }
    const dmid = (dtop + dbutt) / 2, delta = dbutt - dtop;
    return {
      L, dtop, dbutt, dmid, delta, swapped,
      taperPerM: L > 0 ? delta / 10 / (L / 1000) : 0,
      lift: { A: delta / 2, B: delta, C: 0 },
      vRound: PI / 4 * Math.pow(dmid / 1000, 2) * (L / 1000)
    };
  }

  function cleanItems(inp) {
    const out = [];
    (inp.items || []).forEach((it, idx) => {
      const t = num(it.t, 0), w = num(it.w, 0), l = num(it.l, 0), q = Math.floor(num(it.q, 0));
      if (t > 0 && w > 0 && q > 0) out.push({ idx, t, w, l, q, side: !!it.side });
    });
    return out;
  }

  function resolveStrategy(inp, items) {
    if (inp.strategy && inp.strategy !== 'auto') return inp.strategy;
    if (!items.length) return 'scharf';
    if (items.some(i => i.t >= 60 && i.w <= 2.5 * i.t && !i.side)) return 'vier';
    const mains = items.filter(i => !i.side);
    const ws = mains.map(i => i.w);
    if (mains.length > 1 && Math.max.apply(null, ws) - Math.min.apply(null, ws) <= 5) return 'prisma';
    if (items.some(i => i.side)) return 'prisma';
    return 'scharf';
  }

  /* ---------- Schnittplan ---------- */
  function planOps(strat, mains, sides, k, rFit, alt) {
    const ops = [];
    const sideQ = sides.slice();
    let faceNo = 0;
    const Hm = mains.reduce((s, b) => s + b.t, 0) + Math.max(0, mains.length - 1) * k;
    const Wm = mains.reduce((m, b) => Math.max(m, b.w), 0);

    // Fläche anschneiden: optional Seitenware, dann Schwarte/Flächenschnitt bei Abstand dFlat
    function face(n, dFlat, capW) {
      faceNo++;
      const placed = [];
      let lo = dFlat + k;
      for (let i = 0; i < sideQ.length;) {
        const s = sideQ[i], hi = lo + s.t;
        const chord = Math.min(capW, 2 * Math.sqrt(Math.max(0, rFit * rFit - hi * hi)));
        if (hi < rFit && s.w <= chord + 0.01) { placed.push({ s, lo, hi }); lo = hi + k; sideQ.splice(i, 1); } else i++;
      }
      const topFace = placed.length ? placed[placed.length - 1].hi : dFlat;
      if (!placed.length || topFace + k < rFit - 2) {
        ops.push({ n, d: topFace, kind: 'slab', face: faceNo, flat: !placed.length });
      }
      for (let i = placed.length - 1; i >= 0; i--) {
        const p = placed[i];
        ops.push({ n, d: p.lo - k, kind: 'side', face: faceNo, flat: i === 0, item: p.s.idx, t: p.s.t, w: p.s.w });
      }
    }

    // Stapel auftrennen entlang Achse u (Brett 1 liegt oben = größte Koordinate)
    function stack(u, withSlabs) {
      const pcs = [];
      if (withSlabs) pcs.push({ type: 'slab', lo: Hm / 2 + k, hi: Infinity });
      let hi = Hm / 2;
      mains.forEach(b => { pcs.push({ type: 'main', lo: hi - b.t, hi, b }); hi = hi - b.t - k; });
      if (withSlabs) pcs.push({ type: 'slab', lo: -Infinity, hi: -Hm / 2 - k });
      let i = 0, j = pcs.length - 1, sign = 1, chunk = 0;
      while (i < j) {
        if (alt && chunk >= 2) { sign = -sign; chunk = 0; }
        let p, n, d;
        if (sign > 0) { p = pcs[i++]; n = [u[0], u[1]]; d = p.lo - k; }
        else { p = pcs[j--]; n = [-u[0], -u[1]]; d = -p.hi - k; }
        const op = { n, d, kind: p.type };
        if (p.type === 'main') { op.item = p.b.idx; op.t = p.b.t; op.w = p.b.w; }
        ops.push(op);
        chunk++;
      }
      return pcs[i];
    }

    let rest = null;
    if (strat === 'scharf') {
      rest = stack([0, 1], true);
    } else if (strat === 'prisma') {
      face([0, 1], Wm / 2, Infinity);
      face([0, -1], Wm / 2, Infinity);
      rest = stack([1, 0], true);
    } else { // vier
      face([0, 1], Wm / 2, Infinity);
      face([0, -1], Wm / 2, Infinity);
      face([1, 0], Hm / 2, Wm);
      face([-1, 0], Hm / 2, Wm);
      rest = stack([-1, 0], false);
    }
    return { ops, rest, sideLeft: sideQ, Hm, Wm };
  }

  function simulate(ops, R, k) {
    let rem = circlePoly(R, 240);
    const res = [];
    ops.forEach(op => {
      const n = op.n;
      const piece = clipHalf(rem, n[0], n[1], op.d + k, true);
      const kerfP = clipHalf(clipHalf(rem, n[0], n[1], op.d, true), n[0], n[1], op.d + k, false);
      const after = clipHalf(rem, n[0], n[1], op.d, false);
      res.push({ before: rem, piece, kerfP, after, m: minDot(rem, n) });
      rem = after;
    });
    return { res, rest: rem };
  }

  function buildPlan(inp) {
    const warn = [];
    const g = geometry(inp);
    const plan = { inp, g, warnings: warn, ops: [], steps: [], valid: false };
    const k = Math.max(0, num(inp.kerf, 0));
    const items = cleanItems(inp);
    const sp = speciesOf(inp.species);
    plan.sp = sp; plan.items = items; plan.k = k;

    if (!(g.dtop > 0) || !(g.L > 0)) { warn.push({ lvl: 'err', msg: 'Bitte gültige Stammmaße (Durchmesser > 0, Länge > 0) eingeben.' }); return plan; }
    if (g.swapped) warn.push({ lvl: 'warn', msg: 'Zopf war dicker als Fuß – Werte wurden getauscht.' });

    const strat = resolveStrategy(inp, items);
    plan.strat = strat;
    plan.stratName = (STRATEGIES.find(s => s.id === strat) || {}).name;

    let mains = [], sides = [];
    items.forEach(it => {
      for (let i = 0; i < it.q; i++) {
        const b = { idx: it.idx, t: it.t, w: it.w };
        (it.side && strat !== 'scharf' ? sides : mains).push(b);
      }
    });
    if (!mains.length) { mains = sides; sides = []; }

    const r = g.dtop / 2;
    const pfeil = inp.form === 'krumm' ? Math.max(0, num(inp.pfeil, 0)) * 10 : 0;
    const rEff = Math.max(1, (g.dtop - pfeil) / 2);
    plan.rEff = rEff;
    const alt = !!inp.alt;

    const pl = planOps(strat, mains, sides, k, rEff, alt);
    plan.model = { Hm: pl.Hm, Wm: pl.Wm };
    const liftSel = g.lift[inp.level] != null ? g.lift[inp.level] : g.lift.A;
    plan.liftSel = liftSel;

    // Zeichen-/Skalensimulation am Zopf
    const sim = simulate(pl.ops, r, k);
    let lifted = true, prevN = null;
    pl.ops.forEach((op, i) => {
      if (prevN && (prevN[0] !== op.n[0] || prevN[1] !== op.n[1])) lifted = false;
      prevN = op.n;
      const s = sim.res[i];
      op.i = i; op.lifted = lifted;
      op.before = s.before; op.piece = s.piece; op.kerfP = s.kerfP; op.after = s.after;
      op.hExact = op.d - s.m + (lifted ? liftSel : 0);
      op.h = Math.round(op.hExact);
      op.pieceArea = area(s.piece);
    });
    plan.ops = pl.ops;
    plan.leftover = sim.rest;
    plan.rest = pl.rest;

    // Plausibilität am (ggf. um die Krümmung verkleinerten) Zopfende
    const chk = rEff === r ? sim : simulate(pl.ops, rEff, k);
    pl.ops.forEach((op, i) => {
      if (op.item == null) return;
      const v = [-op.n[1], op.n[0]], have = extentAlong(chk.res[i].piece, v);
      if (have < op.w - 0.5) {
        warn.push({ lvl: 'err', msg: 'Position ' + (op.item + 1) + ' (' + op.t + '×' + op.w + ' mm) passt am Zopfende nicht in den Stamm – dort sind nur ca. ' + Math.floor(have) + ' mm Breite möglich.' });
      }
    });
    if (pl.rest && pl.rest.type === 'main') {
      const b = pl.rest.b, lastN = pl.ops.length ? pl.ops[pl.ops.length - 1].n : [0, 1];
      const v = [-lastN[1], lastN[0]], have = extentAlong(chk.rest, v);
      if (have < b.w - 0.5 && pl.ops.length) {
        warn.push({ lvl: 'err', msg: 'Position ' + (b.idx + 1) + ' (' + b.t + '×' + b.w + ' mm) – das letzte Teil passt am Zopfende nicht in den Stamm (nur ca. ' + Math.floor(have) + ' mm Breite).' });
      }
    }
    if (pl.sideLeft.length) {
      const cnt = {};
      pl.sideLeft.forEach(s => { cnt[s.idx] = (cnt[s.idx] || 0) + 1; });
      Object.keys(cnt).forEach(i => {
        warn.push({ lvl: 'warn', msg: 'Seitenware Position ' + (Number(i) + 1) + ': ' + cnt[i] + ' Stück lassen sich nicht aus den Schwarten-Segmenten schneiden – Menge reduzieren oder als Hauptware führen.' });
      });
    }
    if (pl.ops.some(o => o.pieceArea < 1 && o.kind !== 'slab')) {
      warn.push({ lvl: 'err', msg: 'Mindestens ein Schnitt liegt außerhalb des Stamms – Schnittmuster ist zu groß für den Zopfdurchmesser.' });
    }
    if (pl.Hm > 2 * rEff) warn.push({ lvl: 'err', msg: 'Stapelhöhe ' + fmt(pl.Hm, 0) + ' mm ist größer als der Zopfdurchmesser (' + fmt(2 * rEff, 0) + ' mm nutzbar).' });
    if (strat !== 'scharf' && pl.Wm > 2 * rEff) warn.push({ lvl: 'err', msg: 'Modellbreite ' + fmt(pl.Wm, 0) + ' mm ist größer als der Zopfdurchmesser.' });
    if (strat === 'vier' && Math.hypot(pl.Wm, pl.Hm) > 2 * rEff) {
      warn.push({ lvl: 'err', msg: 'Der Kantholz-Querschnitt ' + fmt(pl.Wm, 0) + '×' + fmt(pl.Hm, 0) + ' mm (Diagonale ' + fmt(Math.hypot(pl.Wm, pl.Hm), 0) + ' mm) passt nicht scharfkantig in den Zopf (' + fmt(2 * rEff, 0) + ' mm).' });
    }
    if (pl.ops.some(o => o.h < 0)) warn.push({ lvl: 'err', msg: 'Ein Schnitt läge unterhalb des Sägebetts (Skalenwert < 0).' });
    items.forEach(it => {
      if (it.l > g.L + 1) warn.push({ lvl: 'warn', msg: 'Position ' + (it.idx + 1) + ': Länge ' + it.l + ' mm ist größer als die Stammlänge (' + fmt(g.L, 0) + ' mm).' });
      if (it.l <= 0) warn.push({ lvl: 'warn', msg: 'Position ' + (it.idx + 1) + ': Länge fehlt – Volumen wird mit 0 gerechnet.' });
    });
    if (inp.level === 'C' && g.delta > 10) warn.push({ lvl: 'warn', msg: 'Stamm ist konisch (' + fmt(g.delta / 10, 1) + ' cm Differenz) – ohne Höhenausgleich werden die Bretter am Zopf schmaler/keilig.' });
    if (inp.level === 'B') warn.push({ lvl: 'info', msg: 'Rindenparalleler Schnitt: Zopf wird um den vollen Durchmesserunterschied angehoben. Plan und Grafik gelten für den Zopfquerschnitt.' });
    if (pfeil > 0) warn.push({ lvl: 'info', msg: 'Krummer Stamm: Nutzdurchmesser am Zopf um ' + fmt(pfeil / 10, 1) + ' cm reduziert gerechnet. Bogen seitlich bzw. nach oben auflegen.' });

    // Volumen
    const vSawn = items.reduce((s, i) => s + i.t * i.w * i.l * i.q / 1e9, 0);
    const pieces = items.reduce((s, i) => s + i.q, 0);
    let kerfArea = 0;
    const simMid = simulate(pl.ops, g.dmid / 2, k);
    simMid.res.forEach(s => { kerfArea += area(s.kerfP); });
    const vKerf = kerfArea * g.L / 1e9;
    const vOther = g.vRound - vSawn - vKerf;
    plan.res = {
      vRound: g.vRound, vSawn, vKerf, vOther, pieces,
      yield: g.vRound > 0 ? vSawn / g.vRound * 100 : 0,
      kerfShare: g.vRound > 0 ? vKerf / g.vRound * 100 : 0,
      otherShare: g.vRound > 0 ? vOther / g.vRound * 100 : 0,
      cuts: pl.ops.length, lift: g.lift, liftSel
    };
    if (vSawn > g.vRound) warn.push({ lvl: 'err', msg: 'Schnittholzvolumen (' + fmt(vSawn, 3) + ' m³) ist größer als das Rundholzvolumen (' + fmt(g.vRound, 3) + ' m³).' });
    else if (vOther < 0) warn.push({ lvl: 'err', msg: 'Schnittholz + Schnittfugen (' + fmt(vSawn + vKerf, 3) + ' m³) übersteigen das Rundholzvolumen – so nicht aus dem Stamm zu schneiden.' });
    else if (g.vRound > 0 && vSawn / g.vRound > 0.7) warn.push({ lvl: 'warn', msg: 'Ausbeute über 70 % – bei Blockbandsägen kaum erreichbar, bitte Maße prüfen.' });
    if (!items.length) warn.push({ lvl: 'info', msg: 'Noch keine Position im Schnittmuster – bitte Schnitthölzer hinzufügen.' });

    plan.valid = true;
    plan.steps = buildSteps(plan);
    plan.cutTotal = plan.steps.filter(s => s.kind === 'cut').length;
    return plan;
  }

  /* ---------- Arbeitsschritte ---------- */
  function opLabel(plan, op) {
    if (op.kind === 'slab') return op.face && !op.flat ? 'Schwarte abnehmen' : (op.face ? 'Schwarte abnehmen → Seite ' + op.face + ' flach' : 'Schwarte abnehmen');
    const nm = op.kind === 'side' ? 'Seitenware' : kindName(op.t, op.w);
    return nm + ' ' + op.t + ' × ' + op.w + ' mm abnehmen';
  }

  function buildSteps(plan) {
    const steps = [], ops = plan.ops, g = plan.g, inp = plan.inp, sp = plan.sp;
    const lift = plan.liftSel;
    const hasLift = lift >= 0.5;
    const tension = sp.spannung;
    const first = ops[0];
    const push = s => { s.id = 'S' + steps.length; steps.push(s); return s; };

    push({
      kind: 'setup', phase: 'Schritt 1 – Auflegen & Ausrichten', op: 0,
      title: 'Stamm auflegen & ausrichten',
      sub: 'Seitenstützen setzen, Spannklaue anlegen',
      text: 'Stamm mit dem Fuß (dickes Ende) am Anschlag auf die Querträger legen. Seitenstützen (Anschlagwinkel) links setzen, Stamm anlegen und mit der Spannklaue rechts fixieren – Klaue unterhalb der tiefsten Schnittlinie ansetzen.' +
        (inp.form === 'krumm' ? ' Krümmung (Bogen) seitlich oder nach oben legen und besonders fest spannen.' : '')
    });

    let lvlTitle, lvlSub;
    if (inp.level === 'C' || !hasLift) { lvlTitle = 'Stamm flach auflegen – kein Ausgleich'; lvlSub = 'Stamm ist (nahezu) zylindrisch'; }
    else if (inp.level === 'B') { lvlTitle = 'Zopfende um ' + fmt(lift, 0) + ' mm anheben'; lvlSub = 'Fall B: voller Durchmesserunterschied (Rinde parallel)'; }
    else { lvlTitle = 'Zopfende um ' + fmt(lift, 0) + ' mm anheben'; lvlSub = 'Fall A: halber Durchmesserunterschied (Markröhre parallel)'; }
    push({
      kind: 'level', phase: 'Schritt 2 – In Waage bringen', op: 0, title: lvlTitle, sub: lvlSub,
      text: 'Fall A (Standard, Markröhre parallel zum Bett): Zopf um (' + fmt(g.dbutt / 10, 1) + ' − ' + fmt(g.dtop / 10, 1) + ') / 2 = ' + fmt(g.lift.A, 0) + ' mm anheben. ' +
        'Fall B (rindenparalleler Schnitt): Zopf um den vollen Unterschied = ' + fmt(g.lift.B, 0) + ' mm anheben. ' +
        'Fall C (zylindrischer Stamm): flach auflegen, kein Ausgleich. Gewählt: ' + inp.level + '.'
    });

    let cutNo = 0, firstTurn = true, prev = null;
    ops.forEach((op, i) => {
      if (prev && (prev.n[0] !== op.n[0] || prev.n[1] !== op.n[1])) {
        const dot = prev.n[0] * op.n[0] + prev.n[1] * op.n[1];
        const angle = dot < -0.5 ? 180 : 90;
        const withWedge = firstTurn && hasLift;
        push({
          kind: 'turn', phase: 'Schritt 4 – Stamm drehen', op: i, angle,
          title: 'Stamm ' + angle + '° drehen' + (withWedge ? ' & Keil raus!' : ''),
          sub: angle === 180 ? 'Flache Seite nach unten auf das Sägebett' : 'Flache Seite rechtwinklig an die Seitenstütze',
          text: (angle === 180
            ? 'Stamm um 180° wenden: die frisch gesägte Fläche liegt jetzt unten plan auf den Querträgern.'
            : 'Stamm um 90° drehen: die flache Seite muss exakt im rechten Winkel an den hochgeklappten Seitenstützen anliegen.') +
            ' Spannklaue unterhalb der nächsten Schnittlinie neu ansetzen.' +
            (tension ? ' ⚡ ' + sp.name + ' ist spannungsreich: häufiger wenden (Wechselschnitt), damit das Sägeblatt nicht klemmt.' : '')
        });
        if (withWedge) {
          push({
            kind: 'wedge', phase: 'Schritt 4 – Stamm drehen', op: i, important: true,
            title: '⚠️ Höhenausgleich abgesenkt / Keil entfernt!',
            sub: 'Schnittfläche muss plan auf den Querträgern aufliegen',
            text: 'Unterlegkeil bzw. Heber unter dem Zopf komplett absenken oder entfernen – sonst liegt die Fläche nicht plan und die Schnitte werden keilig.'
          });
        }
        if (firstTurn) firstTurn = false;
      }
      cutNo++;
      let phase;
      if (plan.strat === 'scharf') phase = 'Schritt 3 – Einschnitt von oben nach unten';
      else if (op.face === 1) phase = 'Schritt 3 – Erster Anschnitt (Seite 1)';
      else if (op.face) phase = 'Schritt 5 – Seite ' + op.face + ' & Seitenware';
      else phase = 'Schritt 6 – Model auftrennen';
      push({
        kind: 'cut', phase, op: i, cutNo, h: op.h,
        title: 'Schnitt ' + cutNo + ': Skala auf ' + op.h + ' mm stellen',
        sub: opLabel(plan, op),
        text: opLabel(plan, op) + ' – Skala ' + op.h + ' mm ab Sägebett (Schnittfuge ' + fmt(plan.k, 1) + ' mm eingerechnet).'
      });
      prev = op;
    });

    push({
      kind: 'done', phase: 'Fertig', op: ops.length, title: 'Hölzer entnehmen & stapeln',
      sub: 'Einschnitt abgeschlossen', text: 'Bretter und Kanthölzer entnehmen, Reste (Schwarten) entsorgen. Danach Einschnitt zurücksetzen für den nächsten Stamm.'
    });
    return steps;
  }

  const api = {
    SPECIES, SAWS, STRATEGIES, LEVELS, DEFAULTS,
    geometry, buildPlan, cleanItems, resolveStrategy, speciesOf, kindName, fmt, num,
    circlePoly, clipHalf, area, centroid, minDot, extentAlong, rot
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Saege = Object.assign(root.Saege || {}, api);
})(typeof self !== 'undefined' ? self : this);
