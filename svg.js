/* Sägemeister – dynamisch erzeugte SVG-Grafiken (maßstabsgetreu aus dem Einschnittplan) */
(function (root) {
  'use strict';
  const S = typeof require !== 'undefined' && typeof module !== 'undefined' ? require('./calc.js') : root.Saege;
  const rot = S.rot;
  const ORANGE = '#FF5A00', INK = '#111', WOOD = '#EBCB8B', BARK = '#5A3B1A';
  const PAL = ['#FF9A3C', '#FFD23F', '#7EC8E3', '#9BD79B', '#E59BE9', '#F4A6A6', '#C4B5FD', '#A7E0D0'];
  let UID = 0;

  const r1 = v => Math.round(v * 10) / 10;
  const P = a => a.map(p => r1(p[0]) + ',' + r1(p[1])).join(' ');
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const color = idx => PAL[idx % PAL.length];

  function head(u, vb, label) {
    return '<svg class="gfx" xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" role="img" aria-label="' + esc(label) + '">' +
      '<defs><pattern id="' + u + 'h" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="7" height="7" fill="#fff"/><line x1="0" y1="0" x2="0" y2="7" stroke="#888" stroke-width="2.5"/></pattern>' +
      '<pattern id="' + u + 'o" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="7" height="7" fill="#FFE2CC"/><line x1="0" y1="0" x2="0" y2="7" stroke="' + ORANGE + '" stroke-width="2.5"/></pattern></defs>' +
      '<rect width="100%" height="100%" fill="#fff"/>';
  }
  function text(x, y, s, o) {
    o = o || {};
    return '<text x="' + r1(x) + '" y="' + r1(y) + '" font-size="' + (o.size || 12) + '" font-weight="' + (o.weight || 800) +
      '" fill="' + (o.fill || INK) + '" text-anchor="' + (o.anchor || 'start') + '"' +
      (o.halo ? ' stroke="#fff" stroke-width="4" paint-order="stroke" stroke-linejoin="round"' : '') + '>' + esc(s) + '</text>';
  }
  function bboxCenter(poly) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    poly.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
  }
  // Füllware-Brett in einzelne Latten (Breite P, Schnittfuge kr) zerlegen – Polygone im Stamm-Koordinatensystem
  function strips(poly, op, kr) {
    if (!op || !(op.fillN > 1)) return [poly];
    const v = [-op.n[1], op.n[0]], P = op.fillP, W = op.fillN * P + (op.fillN - 1) * kr, out = [];
    for (let i = 0; i < op.fillN; i++) {
      const lo = -W / 2 + i * (P + kr);
      const a = S.clipHalf(poly, v[0], v[1], lo, true), b = S.clipHalf(a, v[0], v[1], lo + P, false);
      if (b.length > 2) out.push(b);
    }
    return out;
  }
  // Brett mit Soll-Breite w: Kern (Sollbreite) + Besäumstreifen links/rechts (wird später abgesägt)
  function edgeSplit(poly, op) {
    if (!op || op.item == null || op.kind === 'fill' || !(op.wFull - op.w > 2)) return null;
    const v = [-op.n[1], op.n[0]], h = op.w / 2;
    return {
      core: S.clipHalf(S.clipHalf(poly, v[0], v[1], -h, true), v[0], v[1], h, false),
      sides: [S.clipHalf(poly, v[0], v[1], -h, false), S.clipHalf(poly, v[0], v[1], h, true)]
    };
  }
  function xAt(poly, y) { // [min,max] x der Fläche auf Höhe y (nur Bildschirm-Koordinaten, y nach oben)
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if ((a[1] <= y && b[1] >= y) || (b[1] <= y && a[1] >= y)) {
        const t = a[1] === b[1] ? 0 : (y - a[1]) / (b[1] - a[1]), x = a[0] + (b[0] - a[0]) * t;
        lo = Math.min(lo, x); hi = Math.max(hi, x);
      }
    }
    return lo === Infinity ? null : [lo, hi];
  }

  /* ---------- Querschnitt in aktueller Lage auf dem Sägebett ---------- */
  function crossSvg(plan, o) {
    o = o || {};
    const ops = plan.ops, u = 'g' + (++UID) + '-';
    const baseY = 322;
    let out = head(u, '0 0 360 360', o.caption || 'Stammquerschnitt');
    if (!ops.length) return out + text(180, 180, 'Kein Schnitt geplant', { anchor: 'middle', size: 16 }) + '</svg>';

    const i = Math.min(o.opIdx || 0, ops.length), atEnd = i >= ops.length;
    const op = atEnd ? ops[ops.length - 1] : ops[i];
    const n = op.n;
    const before = atEnd ? plan.leftover : ops[i].before;
    const liftv = !atEnd && ops[i].lifted ? plan.liftSel : 0;
    const Q = before.map(p => rot(n, p));
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    Q.forEach(p => { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); });
    const m = miny, htop = maxy - m + liftv, xc = (minx + maxx) / 2;
    const s = Math.min(274 / Math.max(htop, 1), 232 / Math.max(maxx - minx, 1));
    // Nach 90°-Drehung liegt die flache Seite an der Seitenstütze (links): ggf. spiegeln
    let j0 = i; while (j0 > 0 && ops[j0 - 1].n[0] === n[0] && ops[j0 - 1].n[1] === n[1]) j0--;
    let mir = 1;
    if (j0 > 0 && !atEnd) { const pn = ops[j0 - 1].n; if (Math.abs(pn[0] * n[0] + pn[1] * n[1]) < 0.5 && rot(n, pn)[0] > 0) mir = -1; }
    const X = x => 150 + mir * (x - xc) * s;
    const Yh = h => baseY - h * s;                 // Höhe über Bett (mm)
    const Y = y => Yh(y - m + liftv);              // y' in Bildschirmlage
    const TP = pt => { const q = rot(n, pt); return [X(q[0]), Y(q[1])]; };
    const hAt = h => h + m - liftv;                // Höhe -> y'

    // Schnitte dieser Lage (aufeinanderfolgend, gleiche Normale)
    const pass = [];
    for (let j = i; j < ops.length && ops[j].n[0] === n[0] && ops[j].n[1] === n[1]; j++) pass.push(ops[j]);
    const minCut = pass.length ? Math.min.apply(null, pass.map(p => p.hExact)) : htop * 0.4;

    // Sägebett
    out += '<rect x="0" y="' + baseY + '" width="360" height="38" fill="#222"/><rect x="0" y="' + baseY + '" width="360" height="4" fill="' + ORANGE + '"/>';
    for (let x = 14; x < 360; x += 56) out += '<rect x="' + x + '" y="' + (baseY + 10) + '" width="30" height="8" fill="#555"/>';
    out += text(8, baseY + 32, 'SÄGEBETT', { size: 11, fill: '#fff' });

    // Keil / Heber
    const log = Q.map(p => [X(p[0]), Y(p[1])]);
    if (liftv >= 0.5) {
      const low = Q.filter(p => p[1] - m < 1);
      const wx = X(low.length ? low.reduce((a, p) => a + p[0], 0) / low.length : 0);
      const wh = Math.max(7, liftv * s);
      out += '<polygon points="' + P([[wx - 38, baseY], [wx + 38, baseY], [wx + 30, baseY - wh], [wx - 30, baseY - wh]]) + '" fill="' + ORANGE + '" stroke="' + INK + '" stroke-width="2"/>';
      if (o.labels) out += text(wx + 42, baseY - 4, 'Keil +' + Math.round(liftv) + ' mm', { size: 11 });
    }

    // Seitenstütze links
    const fh = Math.min(htop * 0.5, 70 / s), xl = xAt(Q.map(p => [X(p[0]), baseY - (p[1] - m + liftv) * s]), baseY - Math.max(fh * 0.6, liftv + 8) * s);
    const fx = (xl ? xl[0] : X(minx)) - 12;
    out += '<rect x="' + r1(fx) + '" y="' + r1(Yh(fh)) + '" width="11" height="' + r1(baseY - Yh(fh)) + '" fill="' + INK + '"/>' +
      '<rect x="' + r1(fx) + '" y="' + r1(Yh(fh)) + '" width="11" height="5" fill="' + ORANGE + '"/>';
    if (o.labels) out += text(Math.max(2, fx - 4), baseY + 15, 'Stütze', { size: 11, fill: '#fff' });

    // Spannklaue rechts (unterhalb der tiefsten Schnittlinie dieser Lage)
    let hc = Math.max(10, Math.min(htop * 0.3, minCut - 40));
    if (hc < liftv + 12) hc = liftv + 12;
    const pxy = Q.map(p => [X(p[0]), baseY - (p[1] - m + liftv) * s]);
    const xr = xAt(pxy, baseY - hc * s), cx = xr ? xr[1] : X(maxx), cy = Yh(hc);
    out += '<rect x="' + r1(cx + 1) + '" y="' + r1(cy - 7) + '" width="40" height="14" fill="' + INK + '"/>' +
      '<rect x="' + r1(cx + 38) + '" y="' + r1(cy - 7) + '" width="11" height="' + r1(baseY - cy + 7) + '" fill="' + INK + '"/>' +
      '<rect x="' + r1(cx - 2) + '" y="' + r1(cy - 13) + '" width="9" height="26" fill="' + ORANGE + '" stroke="' + INK + '" stroke-width="1.5"/>';
    if (o.labels) out += text(Math.min(cx + 30, 250), baseY + 15, 'Spannklaue', { size: 11, fill: '#fff' });

    // Stammquerschnitt (aktueller Rest)
    out += '<clipPath id="' + u + 'c"><polygon points="' + P(log) + '"/></clipPath>';
    out += '<polygon points="' + P(log) + '" fill="' + WOOD + '" stroke="' + INK + '" stroke-width="2.5"/>';
    const O = TP([0, 0]), r = plan.g.dtop / 2 * s;
    out += '<g clip-path="url(#' + u + 'c)">';
    [0.28, 0.52, 0.76].forEach(f => { out += '<circle cx="' + r1(O[0]) + '" cy="' + r1(O[1]) + '" r="' + r1(r * f) + '" fill="none" stroke="#C99B52" stroke-width="1.2"/>'; });
    out += '<circle cx="' + r1(O[0]) + '" cy="' + r1(O[1]) + '" r="' + r1(r) + '" fill="none" stroke="' + BARK + '" stroke-width="7"/></g>';
    out += '<circle cx="' + r1(O[0]) + '" cy="' + r1(O[1]) + '" r="4" fill="' + BARK + '"/>';

    if (!atEnd && plan.rest && plan.rest.type === 'slab' && plan.leftover.length > 2) {
      const lp = plan.leftover.map(TP);
      out += '<polygon points="' + P(lp) + '" fill="url(#' + u + 'h)" fill-opacity=".85" stroke="#555" stroke-width="1.2"/>';
      const lb = bboxCenter(lp);
      if (lb.w > 60 && lb.h > 12) out += text(lb.cx, lb.cy + 4, 'Schwarte', { size: 10, anchor: 'middle', halo: true, fill: '#444' });
    }
    // Folge-Stücke (Vorschau) + aktuelles Stück
    for (let j = i; j < ops.length; j++) {
      const pc = ops[j].piece;
      if (pc.length < 3) continue;
      const poly = pc.map(TP);
      const isSlab = ops[j].kind === 'slab';
      if (isSlab && !(j === i && !o.muted)) {
        out += '<polygon points="' + P(poly) + '" fill="url(#' + u + 'h)" fill-opacity=".85" stroke="#555" stroke-width="1.2"/>';
        const b = bboxCenter(poly);
        if (b.w > 60 && b.h > 12) out += text(b.cx, b.cy + 4, 'Schwarte', { size: 10, anchor: 'middle', halo: true, fill: '#444' });
      } else if (o.muted) {
        out += '<polygon points="' + P(poly) + '" fill="#8A8A8A" fill-opacity=".05" stroke="#6a6a6a" stroke-width="1" stroke-dasharray="3 3"/>';
      } else if (j === i) {
        out += '<polygon points="' + P(poly) + '" fill="url(#' + u + 'o)" stroke="' + ORANGE + '" stroke-width="3"/>';
        if (ops[j].kind === 'fill' && ops[j].fillN > 1) strips(pc, ops[j], plan.k).forEach(sp => { out += '<polygon points="' + P(sp.map(TP)) + '" fill="none" stroke="' + INK + '" stroke-width="1.5"/>'; });
      } else if (ops[j].kind === 'fill') {
        strips(pc, ops[j], plan.k).forEach(sp => { out += '<polygon points="' + P(sp.map(TP)) + '" fill="' + color(ops[j].item) + '" fill-opacity=".6" stroke="' + INK + '" stroke-width="1"/>'; });
        const b = bboxCenter(poly);
        if (b.w > 30 && b.h > 11) out += text(b.cx, b.cy + 4, ops[j].fillN + '×', { size: 11, anchor: 'middle', halo: true });
      } else if (ops[j].item != null) {
        out += '<polygon points="' + P(poly) + '" fill="' + color(ops[j].item) + '" fill-opacity=".55" stroke="' + INK + '" stroke-width="1" stroke-dasharray="4 3"/>';
        const eg = edgeSplit(pc, ops[j]);
        if (eg) eg.sides.forEach(sp => { if (sp.length > 2) out += '<polygon points="' + P(sp.map(TP)) + '" fill="url(#' + u + 'h)" fill-opacity=".9" stroke="#555" stroke-width="1"/>'; });
        const b = bboxCenter(eg && eg.core.length > 2 ? eg.core.map(TP) : poly);
        if (b.w > 40 && b.h > 11) out += text(b.cx, b.cy + 4, ops[j].t + '×' + ops[j].w, { size: 10, anchor: 'middle', halo: true });
      } else if (ops[j].kind === 'schwart') {
        out += '<polygon points="' + P(poly) + '" fill="#D8C79B" fill-opacity=".8" stroke="#555" stroke-width="1" stroke-dasharray="4 3"/>';
      } else {
        out += '<polygon points="' + P(poly) + '" fill="none" stroke="#777" stroke-width="1" stroke-dasharray="2 3"/>';
      }
    }

    // Flache Seite hervorheben (nach dem Drehen)
    if (o.face != null && ops[o.face]) {
      const fo = ops[o.face], seg = fo.after.filter(p => Math.abs(fo.n[0] * p[0] + fo.n[1] * p[1] - fo.d) < 0.05).map(TP);
      if (seg.length >= 2) {
        seg.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const a = seg[0], b = seg[seg.length - 1];
        out += '<line x1="' + r1(a[0]) + '" y1="' + r1(a[1]) + '" x2="' + r1(b[0]) + '" y2="' + r1(b[1]) + '" stroke="' + ORANGE + '" stroke-width="7" stroke-linecap="round"/>';
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const downward = Math.abs(a[1] - baseY) < 6 && Math.abs(b[1] - baseY) < 6;
        out += text(mid[0], downward ? mid[1] - 8 : mid[1] + 18, 'flache Seite', { size: 13, anchor: 'middle', halo: true, fill: '#B83C00' });
      }
    }

    // Schnittlinien (Skala) – nur wenn es gerade um Schnitte geht
    if (!o.muted) out += '<line x1="300" y1="' + r1(baseY) + '" x2="300" y2="30" stroke="' + INK + '" stroke-width="3"/>';
    let lastY = 1e9;
    if (!o.muted) pass.slice().reverse().forEach(p => {
      if (p === op && !atEnd && p === ops[i]) return;
      const y = Yh(p.hExact);
      out += '<line x1="' + r1(X(minx) - 12) + '" y1="' + r1(y) + '" x2="300" y2="' + r1(y) + '" stroke="' + INK + '" stroke-width="1.5" stroke-dasharray="6 4"/>';
      if (Math.abs(y - lastY) > 13) { out += text(306, y + 4, p.h, { size: 12 }); lastY = y; }
    });
    if (!atEnd && pass.length && !o.muted) {
      const y = Yh(ops[i].hExact), big = ops[i].h >= 1000 ? 17 : 22;
      out += '<line x1="' + r1(X(minx) - 14) + '" y1="' + r1(y) + '" x2="302" y2="' + r1(y) + '" stroke="' + ORANGE + '" stroke-width="5"/>' +
        '<polygon points="' + P([[X(minx) - 22, y], [X(minx) - 12, y - 8], [X(minx) - 12, y + 8]]) + '" fill="' + ORANGE + '"/>' +
        '<rect x="303" y="' + r1(y - 16) + '" width="55" height="32" rx="4" fill="' + ORANGE + '" stroke="' + INK + '" stroke-width="2"/>' +
        text(330.5, y + 7, ops[i].h, { size: big, anchor: 'middle' });
    }

    // Drehpfeil
    if (o.angle) {
      const rr = Math.max(...Q.map(p => Math.hypot(p[0], p[1]))) * s + 14, span = o.angle === 180 ? 160 : 90;
      const a0 = (90 + span / 2) * Math.PI / 180, a1 = (90 - span / 2) * Math.PI / 180;
      const pt = a => [O[0] + rr * Math.cos(a), O[1] - rr * Math.sin(a)];
      const sP = pt(a0), eP = pt(a1), tg = [Math.sin(a1), Math.cos(a1)], nr = [Math.cos(a1), -Math.sin(a1)];
      out += '<path d="M' + r1(sP[0]) + ' ' + r1(sP[1]) + ' A' + r1(rr) + ' ' + r1(rr) + ' 0 0 1 ' + r1(eP[0]) + ' ' + r1(eP[1]) + '" fill="none" stroke="' + ORANGE + '" stroke-width="7" stroke-linecap="round"/>';
      out += '<polygon points="' + P([[eP[0] + tg[0] * 16, eP[1] + tg[1] * 16], [eP[0] + nr[0] * 11, eP[1] + nr[1] * 11], [eP[0] - nr[0] * 11, eP[1] - nr[1] * 11]]) + '" fill="' + ORANGE + '"/>';
      out += text(Math.min(330, O[0] + rr * 0.95), Math.max(60, O[1] - rr * 0.75), o.angle + '°', { size: 34, anchor: 'middle', halo: true, fill: '#B83C00' });
    }

    if (o.banner) {
      out += '<rect x="0" y="0" width="360" height="40" fill="#B00020"/>' + text(180, 27, o.banner, { size: 17, anchor: 'middle', fill: '#fff' });
    } else if (o.caption) {
      out += text(8, 20, o.caption, { size: 15 });
    }
    return out + '</svg>';
  }

  /* ---------- Gesamt-Schnittbild ---------- */
  function overviewSvg(plan, o) {
    o = o || {};
    const done = o.done || new Set(), cur = o.current;
    const u = 'g' + (++UID) + '-', g = plan.g;
    let out = head(u, '0 0 360 360', 'Gesamt-Schnittbild');
    const s = 150 / (g.dbutt / 2), cx = 180, cy = 186;
    const T = p => [cx + p[0] * s, cy - p[1] * s];
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r1(g.dbutt / 2 * s) + '" fill="#F6EBD3" stroke="' + INK + '" stroke-width="2" stroke-dasharray="7 5"/>';
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r1(g.dtop / 2 * s) + '" fill="' + WOOD + '" stroke="' + BARK + '" stroke-width="5"/>';
    const b0 = bboxCenter;
    const piece = (poly, op, isDone, isCur) => {
      if (poly.length < 3) return '';
      const q = poly.map(T);
      let fill = '#B9AE98';
      if (op && op.item != null) fill = color(op.item);
      if (op && op.kind === 'schwart') fill = '#D8C79B';
      let svg = '<polygon points="' + P(q) + '" fill="' + fill + '" stroke="' + INK + '" stroke-width="1.2"/>';
      if (op && op.kind === 'fill' && op.fillN > 1) strips(poly, op, plan.k).forEach(sp => { svg += '<polygon points="' + P(sp.map(T)) + '" fill="' + fill + '" stroke="' + INK + '" stroke-width="1.4"/>'; });
      if (isDone) svg += '<polygon points="' + P(q) + '" fill="url(#' + u + 'h)" fill-opacity=".8" stroke="#666" stroke-width="1"/>';
      else if (op && op.kind === 'schwart') { if (b0(q).w > 40) svg += text(b0(q).cx, b0(q).cy + 4, 'Schw.-Brett', { size: 9, anchor: 'middle', halo: true }); }
      else if (!op || op.item == null) svg += '<polygon points="' + P(q) + '" fill="url(#' + u + 'h)" fill-opacity=".45"/>';
      if (isCur) svg += '<polygon points="' + P(q) + '" fill="none" stroke="' + ORANGE + '" stroke-width="5" stroke-linejoin="round"/>';
      const eg = isDone ? null : edgeSplit(poly, op);
      if (eg) eg.sides.forEach(sp => { if (sp.length > 2) svg += '<polygon points="' + P(sp.map(T)) + '" fill="url(#' + u + 'h)" fill-opacity=".9" stroke="#555" stroke-width="1"/>'; });
      const b = bboxCenter(eg && eg.core.length > 2 ? eg.core.map(T) : q);
      if (op && op.kind === 'fill' && b.w > 22 && b.h > 9) svg += text(b.cx, b.cy + 4, op.fillN + '×', { size: 11, anchor: 'middle', halo: true });
      else if (op && op.item != null && b.w > 38 && b.h > 11) svg += text(b.cx, b.cy + 4, op.t + '×' + op.w, { size: 10, anchor: 'middle', halo: true });
      if (isDone && b.w > 14 && b.h > 10) svg += text(b.cx, b.cy + 5, '✓', { size: 16, anchor: 'middle', halo: true, fill: '#006B2D' });
      return svg;
    };
    plan.ops.forEach((op, i) => { out += piece(op.piece, op, done.has(i), cur === i); });
    const rest = plan.rest;
    if (plan.leftover.length > 2) {
      const ro = rest && rest.type === 'main' ? { item: rest.b.idx, t: rest.b.t, w: rest.b.w } : null;
      if (rest && rest.type === 'fill') out += '<!-- Rest: Füllware -->';
      out += piece(plan.leftover, ro, done.size >= plan.ops.length && ro != null, false);
    }
    plan.ops.forEach(op => {
      if (op.kerfP.length > 2) out += '<polygon points="' + P(op.kerfP.map(T)) + '" fill="' + INK + '" stroke="' + INK + '" stroke-width=".8"/>';
    });
    out += text(8, 18, 'Zopf ⌀ ' + S.fmt(g.dtop / 10, 1) + ' cm (voll)', { size: 13 });
    out += text(8, 36, 'Fuß ⌀ ' + S.fmt(g.dbutt / 10, 1) + ' cm (gestrichelt)', { size: 13 });
    if (plan.fill && plan.fill.n) out += text(8, 352, 'Latten ' + plan.fill.t + '×' + plan.fill.w + ': ' + plan.fill.n + ' Stk', { size: 14, fill: '#B83C00' });
    out += text(352, 352, 'Fuge schwarz · maßstäblich', { size: 10, anchor: 'end', weight: 700 });
    return out + '</svg>';
  }

  /* ---------- Seitenansicht: Höhenausgleich ---------- */
  function sideSvg(plan) {
    const u = 'g' + (++UID) + '-', g = plan.g, lift = plan.liftSel;
    let out = head(u, '0 0 360 250', 'Seitenansicht Höhenausgleich');
    const tall = Math.max(g.dbutt, lift + g.dtop), s = 130 / tall, baseY = 208, x0 = 34, x1 = 282;
    const yBb = baseY, yBt = baseY - g.dbutt * s, yZb = baseY - lift * s, yZt = baseY - (lift + g.dtop) * s;
    out += '<rect x="0" y="' + baseY + '" width="360" height="42" fill="#222"/><rect x="0" y="' + baseY + '" width="360" height="4" fill="' + ORANGE + '"/>';
    out += text(8, baseY + 22, 'SÄGEBETT', { size: 11, fill: '#fff' }) + text(352, baseY + 36, 'Länge nicht maßstäblich gestaucht', { size: 10, fill: '#fff', anchor: 'end', weight: 700 });
    // Keil unter dem Zopf
    const bl = x => yBb + (yZb - yBb) * (x - x0) / (x1 - x0);
    if (lift >= 0.5) {
      out += '<polygon points="' + P([[x1 - 52, baseY], [x1, baseY], [x1, bl(x1)], [x1 - 52, bl(x1 - 52)]]) + '" fill="' + ORANGE + '" stroke="' + INK + '" stroke-width="2.5"/>';
      out += text(x1 - 26, baseY - 4, 'Keil', { size: 11, anchor: 'middle' });
    }
    // waagerechte Referenz
    const refY = plan.inp.level === 'B' ? yBt : (yBb + yBt) / 2;
    if (plan.inp.level !== 'C') {
      out += '<line x1="' + (x0 - 14) + '" y1="' + r1(refY) + '" x2="' + (x1 + 12) + '" y2="' + r1(refY) + '" stroke="#0057B8" stroke-width="2" stroke-dasharray="8 4"/>';
      out += text(x0 - 12, refY - 5, plan.inp.level === 'B' ? 'Rinde oben waagerecht' : 'Markröhre waagerecht', { size: 10, fill: '#0057B8' });
    }
    // Stamm
    out += '<polygon points="' + P([[x0, yBb], [x1, yZb], [x1, yZt], [x0, yBt]]) + '" fill="' + WOOD + '" stroke="' + BARK + '" stroke-width="4" stroke-linejoin="round"/>';
    out += '<line x1="' + x0 + '" y1="' + r1((yBb + yBt) / 2) + '" x2="' + x1 + '" y2="' + r1((yZb + yZt) / 2) + '" stroke="' + BARK + '" stroke-width="2.5" stroke-dasharray="3 5"/>';
    out += '<ellipse cx="' + x0 + '" cy="' + r1((yBb + yBt) / 2) + '" rx="' + r1(Math.max(5, g.dbutt * s * 0.07)) + '" ry="' + r1(g.dbutt * s / 2) + '" fill="#D9B070" stroke="' + BARK + '" stroke-width="3"/>';
    // Beschriftung
    out += text(x0, Math.min(yBt, yZt) - 22, 'Fuß ⌀ ' + S.fmt(g.dbutt / 10, 1) + ' cm', { size: 14 });
    out += text(x1 + 6, Math.min(yBt, yZt) - 22, 'Zopf ⌀ ' + S.fmt(g.dtop / 10, 1) + ' cm', { size: 14, anchor: 'end' });
    // Sägeband = erster Schnitt
    if (plan.ops.length) {
      const hy = baseY - plan.ops[0].hExact * s;
      if (hy > 22) out += '<line x1="' + (x0 - 14) + '" y1="' + r1(hy) + '" x2="' + (x1 + 12) + '" y2="' + r1(hy) + '" stroke="' + ORANGE + '" stroke-width="4"/>' + text(x1 + 14, hy + 4, 'Band', { size: 11, fill: '#B83C00' });
    }
    // Bemaßung Hebemaß
    const dx = 330;
    if (lift >= 0.5) {
      const top = baseY - lift * s;
      out += '<line x1="' + dx + '" y1="' + baseY + '" x2="' + dx + '" y2="' + r1(top) + '" stroke="' + INK + '" stroke-width="3"/>' +
        '<polygon points="' + P([[dx, top], [dx - 6, top + 12], [dx + 6, top + 12]]) + '" fill="' + INK + '"/>' +
        '<polygon points="' + P([[dx, baseY], [dx - 6, baseY - 12], [dx + 6, baseY - 12]]) + '" fill="' + INK + '"/>';
      out += '<rect x="' + (dx - 36) + '" y="' + r1(Math.min(top - 4, baseY - 40) - 34) + '" width="72" height="34" rx="4" fill="' + ORANGE + '" stroke="' + INK + '" stroke-width="2"/>' +
        text(dx, Math.min(top - 4, baseY - 40) - 11, Math.round(lift) + ' mm', { size: 20, anchor: 'middle' });
    } else {
      out += text(dx, baseY - 12, 'kein Ausgleich', { size: 12, anchor: 'end', weight: 800 }).replace('x="330"', 'x="352"');
    }
    return out + '</svg>';
  }

  /* ---------- Grafik zu einem Arbeitsschritt ---------- */
  function stepSvg(plan, step, o) {
    o = o || {};
    switch (step.kind) {
      case 'setup': return crossSvg(plan, { opIdx: 0, labels: true, muted: true, caption: 'Auflegen auf dem Sägebett' });
      case 'level': return sideSvg(plan);
      case 'turn': return crossSvg(plan, { opIdx: step.op, angle: step.angle, face: step.op - 1, labels: true, muted: true, caption: 'Nach dem Drehen' });
      case 'wedge': return crossSvg(plan, { opIdx: step.op, banner: 'KEIL ENTFERNEN – Fläche liegt plan', labels: true, muted: true });
      case 'cut': {
        return crossSvg(plan, { opIdx: step.op, caption: 'Schnitt ' + step.cutNo + ' von ' + plan.cutTotal });
      }
      default: return overviewSvg(plan, { done: o.done });
    }
  }

  const api = { crossSvg, overviewSvg, sideSvg, stepSvg, colorOf: color };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SaegeSvg = api;
})(typeof self !== 'undefined' ? self : this);
