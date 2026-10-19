const assert = require('assert');
const S = require('../calc.js');
const clone = o => JSON.parse(JSON.stringify(o));
const base0 = () => { const o = clone(S.DEFAULTS); o.fill = { on: false }; return o; };
let fails = 0;
function t(name, fn) { try { fn(); console.log('ok  -', name); } catch (e) { fails++; console.log('FAIL-', name, '\n', e.message); } }

t('Geometrie Mittendurchmesser', () => {
  const g = S.geometry(S.DEFAULTS);
  assert.strictEqual(g.dtop, 380); assert.strictEqual(g.dbutt, 420);
  assert.ok(Math.abs(g.vRound - Math.PI / 4 * 0.16 * 4) < 1e-9);
  assert.strictEqual(g.lift.A, 20); assert.strictEqual(g.lift.B, 40);
});
t('Geometrie Zopf/Fuß', () => {
  const g = S.geometry(Object.assign(base0(), { mode: 'ends', dtop: 30, dbutt: 40, len: 5 }));
  assert.strictEqual(g.dmid, 350); assert.strictEqual(g.lift.A, 50);
});
for (const strat of ['scharf', 'prisma', 'vier', 'auto']) {
  t('Plan ' + strat, () => {
    const inp = base0(); inp.strategy = strat;
    if (strat === 'vier') inp.items = [{ t: 100, w: 100, l: 4000, q: 2, side: false }, { t: 24, w: 80, l: 4000, q: 2, side: true }];
    const p = S.buildPlan(inp);
    assert.ok(p.valid);
    console.log('   ', p.strat, 'cuts', p.ops.length, 'yield', p.res.yield.toFixed(1), 'kerf', p.res.vKerf.toFixed(4), 'other', p.res.vOther.toFixed(3));
    console.log('   ', p.steps.map(s => s.kind === 'cut' ? 'C' + s.h : s.kind[0].toUpperCase()).join(' '));
    console.log('   warn:', p.warnings.map(w => w.msg).join(' | '));
    assert.ok(p.res.vOther > 0);
  });
}
t('Zu großes Muster -> Warnung', () => {
  const inp = base0(); inp.items = [{ t: 100, w: 400, l: 4000, q: 6, side: false }];
  const p = S.buildPlan(inp);
  assert.ok(p.warnings.some(w => w.lvl === 'err'));
});
t('Scharfschnitt Höhen: erste Schnitthöhe', () => {
  const inp = base0(); inp.strategy = 'scharf'; inp.items = [{ t: 50, w: 100, l: 4000, q: 3, side: false }];
  const p = S.buildPlan(inp);
  // Hm = 3*50+2*2 = 154 -> d1 = 77; h = 20 + 77 + 190 = 287
  assert.strictEqual(p.ops[0].h, 287);
  assert.strictEqual(p.ops[1].h, Math.round(287 - 50 - 2));
});
t('Wechselschnitt dreht öfter', () => {
  const inp = base0(); inp.strategy = 'scharf'; inp.alt = true; inp.items = [{ t: 30, w: 100, l: 4000, q: 6, side: false }];
  const p = S.buildPlan(inp);
  assert.ok(p.steps.filter(s => s.kind === 'turn').length >= 3);
});
t('Füllware füllt auf und erhöht Ausbeute', () => {
  const inp = base0(); inp.fill = { on: true, auto: true, t: 30, w: 50, l: 0 };
  const p = S.buildPlan(inp);
  const b = S.buildPlan(base0());
  console.log('   fill', p.fill.n, b.res.yield.toFixed(1), '->', p.res.yield.toFixed(1));
  assert.ok(p.fill.n > 0); assert.ok(p.res.yield > b.res.yield);
  assert.ok(!p.warnings.some(w => w.lvl === 'err'));
});
t('Zu viele Bretter -> Fehler mit Position, maxQty', () => {
  const inp = base0(); inp.strategy = 'scharf'; inp.items = [{ t: 50, w: 100, l: 4000, q: 20, side: false }];
  const p = S.buildPlan(inp);
  assert.ok(p.warnings.some(w => w.lvl === 'err'));
  const m = S.maxQty(inp, 0);
  console.log('   max', m);
  assert.ok(m > 0 && m < 20);
  inp.items[0].q = m; assert.ok(!S.buildPlan(inp).warnings.some(w => w.lvl === 'err'));
});
t('Scharfschnitt: bis Mitte, dann einmal wenden (Stamm unten noch rund)', () => {
  const inp = base0(); inp.strategy = 'scharf'; inp.alt = false; inp.items = [{ t: 30, w: 100, l: 4000, q: 6, side: false }];
  const p = S.buildPlan(inp);
  const turns = p.steps.filter(s => s.kind === 'turn');
  assert.strictEqual(turns.length, 1); assert.strictEqual(turns[0].angle, 180);
  const idx = p.steps.findIndex(s => s.kind === 'turn');
  const before = p.steps.slice(0, idx).filter(s => s.kind === 'cut').length;
  assert.ok(before >= 3 && before <= 5, 'Schnitte vor dem Wenden: ' + before);
  assert.ok(p.steps.some(s => s.kind === 'wedge'));
});
t('4-Seiten: Kantholzstapel läuft durch (flach auf Bett)', () => {
  const inp = base0(); inp.strategy = 'vier'; inp.alt = false; inp.items = [{ t: 50, w: 100, l: 4000, q: 4, side: false }];
  const p = S.buildPlan(inp); assert.strictEqual(p.stackMode, 'seq');
});
t('Dachlatten-Optimum: automatisch beste Größe, Anzahl stimmt mit Ops überein', () => {
  const inp = base0(); inp.strategy = 'prisma'; inp.fill = { on: true, auto: true, t: 30, w: 50, l: 0 };
  const p = S.buildPlan(inp);
  const maxN = Math.max.apply(null, p.fill.tried.map(x => x.n));
  assert.strictEqual(p.fill.n, maxN);
  const sum = p.ops.reduce((a, o) => a + (o.fillN || 0), 0);
  assert.strictEqual(sum, p.fill.n);
  assert.ok(p.items.some(i => i.fill && i.q === p.fill.n));
  assert.ok(!p.warnings.some(w => w.lvl === 'err'));
});
process.exit(fails ? 1 : 0);
