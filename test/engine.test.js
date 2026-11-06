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
    assert.ok(r.blocks.length > 0 && (r.panels.length > 0 || r.tiles), p.name);
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

test('turning a stick turns its accent; every other row can turn too', () => {
  const d = engine.newDesign('Turns');
  d.pattern = 'stripes';
  d.strips = d.strips.map((s, i) => ({ ...s, species: 'sp_walnut', rot: i % 2 ? 90 : 0 }));
  d.accent = { ...engine.DEFAULT_ACCENT, enabled: true, offset: 0, species: 'sp_purpleheart' };
  const n = engine.normalizeDesign(d);
  assert.equal(n.strips[1].rot, 90);
  assert.equal(n.strips[0].rot, undefined);
  const r = engine.compute(n, species.defaults());
  const bbox = (poly) => {
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  };
  const row0 = r.blocks.filter((b) => b.row === 0);
  // At 60 degrees a centred line is steep; turned 90 degrees it lies flatter.
  const [w0, h0] = bbox(row0[0].accent.poly);
  const [w1, h1] = bbox(row0[1].accent.poly);
  assert.ok(h0 > w0 && w1 > h1);
  assert.equal(r.warnings.length, 0);
  n.rowTurn = true;
  assert.equal(engine.compute(n, species.defaults()).rows[1].flip, true);
});

test('checkerboard turning: turned squares alternate in both directions', () => {
  const d = engine.newDesign('Checker turns');
  d.pattern = 'stripes';
  d.rowTurn = true;
  d.strips = d.strips.map((s, i) => ({ ...s, species: 'sp_walnut', rot: i % 2 ? 90 : 0 }));
  d.accent = { ...engine.DEFAULT_ACCENT, enabled: true, offset: 0, species: 'sp_purpleheart' };
  const r = engine.compute(engine.normalizeDesign(d), species.defaults());
  const steep = (b) => {
    const xs = b.accent.poly.map((p) => p[0]);
    const ys = b.accent.poly.map((p) => p[1]);
    return Math.max(...ys) - Math.min(...ys) > Math.max(...xs) - Math.min(...xs);
  };
  const at = (row, col) => steep(r.blocks.filter((b) => b.row === row)[col]);
  assert.notEqual(at(0, 0), at(0, 1));
  assert.notEqual(at(0, 0), at(1, 0));
  assert.equal(at(0, 0), at(1, 1));
});

test('grain defaults to matched and blocks know their stick', () => {
  const d = engine.normalizeDesign(engine.newDesign('Grain'));
  assert.equal(d.grain, 'matched');
  const r = engine.compute(d, species.defaults());
  assert.equal(r.grain, 'matched');
  const b = r.blocks.find((x) => x.row === 1);
  assert.equal(b.flip, true);
  assert.match(b.stick, /^A:\d$/);
  assert.equal(engine.normalizeDesign({ ...d, grain: 'random' }).grain, 'random');
});

test('build steps cover every stage, with accent steps only when needed', () => {
  const { planner, presets } = require('./load');
  const prefs = { units: 'in', precision: 16 };
  const plain = engine.newDesign('Plain');
  let steps = planner.steps(plain, engine.compute(plain, species.defaults()), species.defaults(), prefs);
  assert.deepEqual(steps.map((s) => s.key), ['mill', 'rip', 'glue1-A', 'plane', 'crosscut', 'layout', 'glue2', 'trim', 'finish']);
  assert.match(steps[4].body, /10 × 1\/8" = 1-1\/4"/);
  for (const p of presets.PRESETS) {
    const d = presets.make(p, engine.DEFAULT_SETTINGS);
    steps = planner.steps(d, engine.compute(d, species.defaults()), species.defaults(), prefs);
    assert.equal(steps.some((s) => s.key === 'accent-glue'), !!d.accent.enabled, p.name);
  }
});

test('strip fitter hits the width and keeps the pattern', () => {
  const sp = species.defaults();
  const { presets } = require('./load');
  const opts = engine.fitOptions(checker(), sp, { width: 12 * IN, length: 15 * IN });
  assert.ok(opts.length >= 2);
  for (const o of opts) {
    assert.ok(Math.abs(o.board.width - 12 * IN) <= o.n * (IN / 32) + 1e-6, `width for ${o.n} strips`);
    o.design.strips.forEach((s, i) => assert.equal(s.species, i % 2 ? 'sp_walnut' : 'sp_maple'));
    near(o.design.rowDepth, o.stripWidth, 'squares stay square');
  }
  assert.equal(opts.filter((o) => o.best).length, 1);
  // A one-off layout like a centre stripe only scales; it never repeats.
  const centre = engine.normalizeDesign(presets.make(presets.PRESETS.find((p) => /Centre stripe/.test(p.name)), engine.DEFAULT_SETTINGS));
  const c = engine.fitOptions(centre, sp, { width: 14 * IN, length: 16 * IN });
  assert.equal(c.length, 1);
  assert.equal(c[0].n, centre.strips.length);
  // Brick counts its shift.
  const brick = engine.normalizeDesign({ ...checker(), pattern: 'brick' });
  for (const o of engine.fitOptions(brick, sp, { width: 12 * IN, length: 15 * IN })) assert.ok(Math.abs(o.board.width - 12 * IN) < 0.25 * IN, `brick ${o.n}`);
});

test('edge details are kept and cleaned up', () => {
  const d = engine.normalizeDesign({ ...engine.newDesign('x'), details: { groove: true, bevel: 12.7, handles: 'holes' } });
  assert.equal(d.details.groove, true);
  assert.equal(d.details.bevel, 12.7);
  assert.equal(d.details.handles, 'holes');
  near(d.details.grooveInset, 0.75 * IN, 'default inset');
  assert.equal(engine.normalizeDesign({ ...d, details: { handles: 'nope' } }).details.handles, 'none');
  assert.equal(engine.compute(d, species.defaults()).details.groove, true);
});

test('honeycomb and 3D cubes cover the board and count their sticks', () => {
  const sp = species.defaults();
  const { planner, presets } = require('./load');
  const areaOf = (poly) => Math.abs(poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  for (const pattern of ['honeycomb', 'cubes']) {
    const d = engine.normalizeDesign({ ...engine.newDesign('t'), pattern });
    const r = engine.compute(d, sp);
    near(r.board.width, 12 * IN, `${pattern} width`);
    const covered = r.blocks.reduce((a, b) => a + areaOf(b.poly), 0);
    assert.ok(Math.abs(covered / (r.board.width * r.board.length) - 1) < 1e-6, `${pattern} covers the board`);
    assert.equal(r.lumber.reduce((a, l) => a + l.sticks, 0), r.tiles.sticks);
    // Sticks are cut from long rips; enough of them for every short stick.
    for (const l of r.lumber) assert.ok(l.long * r.tiles.perRip >= l.sticks);
    // Slice length is board thickness + flattening; each stick also has end trim and one kerf.
    near(r.tiles.stickLength, d.settings.endTrim + (d.thickness + d.settings.flatten + d.settings.kerfCross), `${pattern} stick length`);
    const keys = planner.steps(d, r, sp, { units: 'in', precision: 16 }).map((s) => s.key);
    assert.deepEqual(keys, ['mill', 'sticks', 'cut', 'log', 'slice', 'trim', 'finish']);
  }
  // Every diamond side matches the size, and hexagons are regular.
  const cubes = engine.compute(engine.normalizeDesign({ ...engine.newDesign('c'), pattern: 'cubes' }), sp);
  const pc = cubes.tiles.pieces[0].poly;
  for (let i = 0; i < 4; i++) near(Math.hypot(pc[i][0] - pc[(i + 1) % 4][0], pc[i][1] - pc[(i + 1) % 4][1]), IN, 'diamond side');
  // Three-wood honeycomb: no two neighbours alike.
  const hc = engine.compute(engine.normalizeDesign({ ...engine.newDesign('h'), pattern: 'honeycomb' }), sp).tiles.pieces;
  const cen = (p) => [p.poly.reduce((a, q) => a + q[0], 0) / 6, p.poly.reduce((a, q) => a + q[1], 0) / 6];
  for (const a of hc) for (const b of hc) {
    if (a === b) continue;
    const [ax, ay] = cen(a);
    const [bx, by] = cen(b);
    if (Math.hypot(ax - bx, ay - by) < IN * Math.sqrt(3) * 1.01) assert.notEqual(a.species, b.species);
  }
  // Every stock design computes.
  for (const p of presets.PRESETS) {
    const r = engine.compute(presets.make(p, engine.DEFAULT_SETTINGS), sp);
    assert.ok(r.board.width > 0 && r.lumber.length > 0, p.name);
  }
});
