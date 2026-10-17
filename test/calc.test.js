const assert = require('assert');
const S = require('../calc.js');
const clone = o => JSON.parse(JSON.stringify(o));
let fails = 0;
function t(name, fn) { try { fn(); console.log('ok  -', name); } catch (e) { fails++; console.log('FAIL-', name, '\n', e.message); } }

t('Geometrie Mittendurchmesser', () => {
  const g = S.geometry(S.DEFAULTS);
  assert.strictEqual(g.dtop, 380); assert.strictEqual(g.dbutt, 420);
  assert.ok(Math.abs(g.vRound - Math.PI / 4 * 0.16 * 4) < 1e-9);
  assert.strictEqual(g.lift.A, 20); assert.strictEqual(g.lift.B, 40);
});
t('Geometrie Zopf/Fuß', () => {
  const g = S.geometry(Object.assign(clone(S.DEFAULTS), { mode: 'ends', dtop: 30, dbutt: 40, len: 5 }));
  assert.strictEqual(g.dmid, 350); assert.strictEqual(g.lift.A, 50);
});
for (const strat of ['scharf', 'prisma', 'vier', 'auto']) {
  t('Plan ' + strat, () => {
    const inp = clone(S.DEFAULTS); inp.strategy = strat;
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
  const inp = clone(S.DEFAULTS); inp.items = [{ t: 100, w: 400, l: 4000, q: 6, side: false }];
  const p = S.buildPlan(inp);
  assert.ok(p.warnings.some(w => w.lvl === 'err'));
});
t('Scharfschnitt Höhen: erste Schnitthöhe', () => {
  const inp = clone(S.DEFAULTS); inp.strategy = 'scharf'; inp.items = [{ t: 50, w: 100, l: 4000, q: 3, side: false }];
  const p = S.buildPlan(inp);
  // Hm = 3*50+2*2 = 154 -> d1 = 77; h = 20 + 77 + 190 = 287
  assert.strictEqual(p.ops[0].h, 287);
  assert.strictEqual(p.ops[1].h, Math.round(287 - 50 - 2));
});
t('Wechselschnitt dreht öfter', () => {
  const inp = clone(S.DEFAULTS); inp.strategy = 'scharf'; inp.alt = true; inp.items = [{ t: 30, w: 100, l: 4000, q: 6, side: false }];
  const p = S.buildPlan(inp);
  assert.ok(p.steps.filter(s => s.kind === 'turn').length >= 3);
});
process.exit(fails ? 1 : 0);
