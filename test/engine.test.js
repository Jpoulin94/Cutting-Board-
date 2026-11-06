const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, species } = require('./load');

const IN = 25.4;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

function checker(overrides = {}) {
  const d = engine.newDesign('Test');
  d.pattern = 'checker';
  return Object.assign(d, overrides);
}

test('worked example: 8 x 10 checkerboard of 1-1/2" squares', () => {
  const r = engine.compute(checker(), species.defaults());
  near(r.board.width, 12 * IN, 'width');
  near(r.board.length, 15 * IN, 'length');
  near(r.board.thickness, 1.5 * IN, 'thickness');
  assert.equal(r.panels.length, 1);
  const p = r.panels[0];
  assert.equal(p.slices, 10);
  assert.equal(p.cuts, 10);
  near(p.sliceLength, 1.75 * IN, 'slice');
  near(p.crossKerf, 1.25 * IN, 'crosscut kerf');
  near(p.length, 19.75 * IN, 'panel length');
  near(p.milled, (1.5 + 1 / 16) * IN, 'milled thickness');
  // Outer strips are ripped 1/4" wider for edge trim.
  near(p.strips[0].rip, 1.75 * IN, 'outer strip');
  near(p.strips[1].rip, 1.5 * IN, 'inner strip');
});

test('the kerf example: 16 cuts at 1/8" lose 2"', () => {
  const r = engine.compute(checker({ rows: 16 }), species.defaults());
  assert.equal(r.total.cuts, 16);
  near(r.total.crossKerf, 2 * IN, 'kerf lost');
});

test('lumber: stock width includes one kerf per rip, rough size from milled thickness', () => {
  const r = engine.compute(checker(), species.defaults());
  const maple = r.lumber.find((l) => l.species === 'sp_maple');
  // 3 strips at 1-1/2" + one outer strip at 1-3/4", each plus 1/8" kerf.
  near(maple.pieces[0].width, 6.75 * IN, 'maple stock width');
  assert.equal(maple.pieces[0].rough.quarters, 8);
  near(maple.bf, (2 * 6.75 * 19.75) / 144, 'board feet');
  near(maple.bfBuy, maple.bf * 1.15, 'with waste');
  assert.equal(maple.cost, null);
});

test('cost uses the price per board foot', () => {
  const list = species.defaults();
  list.find((s) => s.id === 'sp_walnut').price = 12;
  const r = engine.compute(checker(), list);
  const walnut = r.lumber.find((l) => l.species === 'sp_walnut');
  near(walnut.cost, walnut.bfBuy * 12, 'cost');
  assert.deepEqual(r.total.unpriced, ['Hard maple']);
});

test('checkerboard alternates colours in both directions', () => {
  const r = engine.compute(checker(), species.defaults());
  const at = (row, col) => r.blocks.filter((b) => b.row === row)[col].species;
  assert.notEqual(at(0, 0), at(0, 1));
  assert.notEqual(at(0, 0), at(1, 0));
  assert.equal(at(0, 0), at(1, 1));
});

test('odd checkerboard uses two panels and still alternates', () => {
  const d = checker({ strips: engine.alternate(7, 'sp_maple', 'sp_walnut', 1.5 * IN) });
  const r = engine.compute(d, species.defaults());
  assert.equal(r.panels.length, 2);
  assert.equal(r.panels[0].slices + r.panels[1].slices, 10);
  const at = (row, col) => r.blocks.filter((b) => b.row === row)[col].species;
  for (let c = 0; c < 7; c++) assert.notEqual(at(0, c), at(1, c));
});

test('stripes keep every row the same', () => {
  const r = engine.compute(checker({ pattern: 'stripes' }), species.defaults());
  const row = (i) => r.blocks.filter((b) => b.row === i).map((b) => b.species).join();
  assert.equal(row(0), row(1));
});

test('brick shifts every other row and trims the overhang', () => {
  const r = engine.compute(checker({ pattern: 'brick', brickShift: 0.5 }), species.defaults());
  near(r.shift, 0.75 * IN, 'shift');
  near(r.board.width, 11.25 * IN, 'finished width');
  const row0 = r.blocks.filter((b) => b.row === 0);
  const row1 = r.blocks.filter((b) => b.row === 1);
  near(row1[row1.length - 1].w, 0.75 * IN, 'cut block at the other edge');
  near(row0[0].w, 0.75 * IN, 'cut block at the edge');
});

test('plaid stacks rows from panels of different thickness', () => {
  const d = checker({ pattern: 'plaid' });
  const r = engine.compute(d, species.defaults());
  assert.equal(r.panels.length, 2);
  const A = r.panels.find((p) => p.id === 'pA');
  const B = r.panels.find((p) => p.id === 'pB');
  assert.equal(A.slices, 6);
  assert.equal(B.slices, 3);
  near(r.board.length, (6 * 1.5 + 3 * 0.75) * IN, 'length');
  near(B.milled, (0.75 + 1 / 16) * IN, 'B milled');
  assert.equal(r.lumber.find((l) => l.species === 'sp_cherry').pieces[0].rough.quarters, 4);
});

test('a different crosscut blade changes only the crosscut kerf', () => {
  const d = checker();
  d.settings.kerfCross = 3 / 32 * IN;
  const r = engine.compute(d, species.defaults());
  near(r.total.crossKerf, 10 * 3 / 32 * IN, 'cross');
  near(r.total.ripKerf, 8 / 8 * IN, 'rip');
});

test('rough sizes', () => {
  assert.equal(engine.roughFor(0.75 * IN).quarters, 4);
  assert.equal(engine.roughFor(1.0 * IN).quarters, 5);
  assert.equal(engine.roughFor(1.5625 * IN).quarters, 8);
  assert.equal(engine.roughFor(3 * IN).quarters, 16);
  assert.ok(engine.roughFor(4 * IN).laminate);
});

test('normalizeDesign repairs bad input', () => {
  const d = engine.normalizeDesign({ name: 'x', pattern: 'nope', rows: -3, strips: [{ width: -1 }], rowPlan: [{ panel: 'missing' }] });
  assert.equal(d.pattern, 'checker');
  assert.equal(d.rows, 10);
  assert.equal(d.strips[0].width, IN);
  assert.equal(d.rowPlan.length, 1);
  assert.throws(() => engine.normalizeDesign(null));
});

test('every stock design builds a board with a cut list', () => {
  const { presets } = require('./load');
  for (const p of presets.PRESETS) {
    const d = presets.make(p, engine.DEFAULT_SETTINGS);
    const r = engine.compute(d, species.defaults());
    assert.ok(r.board.width > 0 && r.board.length > 0, p.name);
    assert.ok(r.blocks.length > 0 && r.panels.length > 0, p.name);
    assert.deepEqual(r.warnings.filter((w) => w.includes('different widths')), [], `${p.name} panels differ in width`);
    assert.equal(d.pattern, p.design.pattern, p.name);
  }
});

test('angled accent: band area, lumber and kerf', () => {
  const d = engine.newDesign('Accent');
  d.accent = { ...engine.DEFAULT_ACCENT, enabled: true, angle: 60, offset: 0.2 };
  const r = engine.compute(d, species.defaults());
  const withAccent = r.blocks.filter((b) => b.accent);
  assert.equal(withAccent.length, r.blocks.length);
  // Contrasting wood by default.
  const b = r.blocks.find((x) => x.species === 'sp_maple');
  assert.equal(b.accent.species, 'sp_walnut');
  // Band area = thickness x chord (the line doesn't reach a corner here).
  const area = (poly) => Math.abs(poly.reduce((s, [x, y], i) => { const [x2, y2] = poly[(i + 1) % poly.length]; return s + x * y2 - x2 * y; }, 0)) / 2;
  const chord = engine.chord(1.5 * IN, 1.5 * IN, d.accent);
  assert.ok(Math.abs(area(b.accent.poly) / (chord * IN / 8) - 1) < 0.03, 'band area');
  // A 1/8" accent fills a 1/8" kerf exactly, so strip sizes don't change.
  near(r.panels[0].strips[1].rip, 1.5 * IN, 'rip unchanged');
  assert.equal(r.total.angleRips, 8);
  const walnut = r.lumber.find((l) => l.species === 'sp_walnut');
  const acc = walnut.rips.find((x) => x.accent);
  assert.equal(acc.count, 4);
  near(acc.width, IN / 8, 'accent strip thickness');
});

test('a thinner accent starts the sticks oversize', () => {
  const d = engine.newDesign('Accent');
  d.accent = { ...engine.DEFAULT_ACCENT, enabled: true, angle: 90, offset: 0, thickness: IN / 16 };
  const r = engine.compute(d, species.defaults());
  near(r.panels[0].strips[1].rip, (1.5 + 1 / 16) * IN, 'extra width for a vertical line');
});

test('accent only on one wood, alternating direction', () => {
  const d = engine.newDesign('Accent');
  d.accent = { ...engine.DEFAULT_ACCENT, enabled: true, on: 'sp_maple', alternate: true, species: 'sp_padauk' };
  const r = engine.compute(d, species.defaults());
  assert.ok(r.blocks.filter((b) => b.species === 'sp_walnut').every((b) => !b.accent));
  assert.ok(r.blocks.filter((b) => b.species === 'sp_maple').every((b) => b.accent && b.accent.species === 'sp_padauk'));
  assert.equal(r.total.angleRips, 4);
});
